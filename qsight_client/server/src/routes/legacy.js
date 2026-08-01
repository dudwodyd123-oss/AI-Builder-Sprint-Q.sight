import { Router, raw } from "express";
import { upstageToolCall } from "../lib/upstage.js";
import { COLLECT_INFO_TOOL, buildExtractionMessages } from "../lib/prompts.js";
import { getLiveContractForm } from "../lib/corp.js";
import { missingFields, sanitizeValues, hasNumericBasis } from "../lib/fields.js";
import { loadLegacySpec, collectFields, chatFields, bequestTypeByLabel } from "../lib/legacySpec.js";
import { renderScript, bequestPhrase, todayISO } from "../lib/legacyScript.js";
import {
  createRecord,
  readRecord,
  updateRecord,
  saveRecording,
  openRecording,
  listRecords,
} from "../lib/legacyStore.js";

const router = Router();

/** 녹음 최대 길이(10분)에 여유를 둔 업로드 상한 */
const MAX_RECORDING = "40mb";

/**
 * 코드가 대신 채우는 항목을 채워 넣는다.
 *
 * 기관 유산 서식의 "특정 내용"은 개인용이 이미 만들고 있는 문구
 * ("상속재산의 10퍼센트")와 같은 것이라 다시 물어볼 이유가 없다.
 * 어떤 key에 무엇을 넣을지는 legacy-spec.json의 derived가 정한다.
 */
function applyDerived(spec, values) {
  const out = { ...values };
  for (const [key, source] of Object.entries(spec.derived || {})) {
    if (source !== "bequest_phrase") continue; // 지금은 이 하나뿐
    const phrase = bequestPhrase(spec, out);
    if (phrase) out[key] = phrase;
    else delete out[key];
  }
  return out;
}

/**
 * 저장할 값을 정리한다.
 *
 * spec에 있는 항목은 spec 기준으로 정규화하고, 그 밖의 key(= 기관 계약서 서식 항목)는
 * 그대로 둔다. 여기서 기관 서식을 다시 조회해 검사하면 저장할 때마다 기업용을 부르게 되고,
 * 어차피 기부 의사 등록(③) 직전에 개인용 서버가 최신 서식으로 한 번 더 검증한다.
 * (server/src/routes/agreements.js — 스키마 대조 + 필수 항목 재검증)
 */
function mergeValues(spec, base = {}, incoming = {}) {
  const merged = { ...base, ...incoming };
  const fields = collectFields(spec, merged);
  const clean = sanitizeValues(fields, merged);
  const known = new Set(fields.map((f) => f.key));
  for (const [key, value] of Object.entries(merged)) {
    if (!known.has(key) && value !== undefined) clean[key] = value;
  }
  // 파생 값은 저장할 때마다 다시 만든다 (비율을 고치면 "특정 내용"도 따라가야 한다)
  return applyDerived(spec, clean);
}

/** 화면에 내보낼 레코드 (내부 필드를 그대로 노출하지 않는다) */
function publicRecord(record) {
  return {
    id: record.id,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    specVersion: record.spec_version,
    programId: record.program_id,
    programName: record.program_name,
    consent: record.consent,
    values: record.values,
    agreementId: record.agreement_id,
    documentId: record.document_id || null,
    supersedes: record.supersedes || null,
    supersededBy: record.superseded_by || null,
    witness: record.witness,
    checklist: record.checklist,
    recording: record.recording
      ? {
          recordedAt: record.recording.recorded_at,
          bytes: record.recording.bytes,
          sha256: record.recording.sha256,
          durationMs: record.recording.duration_ms,
          mime: record.recording.mime,
        }
      : null,
    scriptRendered: record.script_rendered,
  };
}

/**
 * 레코드 + 지금 spec으로 렌더링한 대본.
 * spec이 바뀌었으면 사용자가 고쳐둔 문장은 버린다 (옛 문안에 얹힌 수정이라 신뢰할 수 없다).
 */
function withScript(spec, record, { programName } = {}) {
  const specChanged = Boolean(record.spec_version) && record.spec_version !== spec.version;
  const fields = collectFields(spec, record.values || {});
  const script = renderScript(spec, {
    values: record.values || {},
    fields,
    overrides: specChanged ? {} : record.script_overrides || {},
    context: {
      programName: programName || record.program_name,
      witnessName: record.witness?.name || "",
      recordDate: record.recording?.recorded_at?.slice(0, 10) || todayISO(),
    },
  });
  return { pledge: publicRecord(record), script, specVersion: spec.version, specChanged };
}

/** GET /api/legacy/spec — 법률 검토 대상 파일을 그대로 내려준다 */
router.get("/spec", (_req, res) => {
  const spec = loadLegacySpec();
  res.json({ spec });
});

/**
 * POST /api/legacy/chat — 유산기부 전용 챗봇.
 *
 * 일반 약정 챗봇(/api/chat)과 구조가 같다. 다른 것은 질문지의 출처뿐이다.
 * 질문지 = legacy-spec.json의 collect + 기관 계약서 서식(②)의 항목.
 * 기부 의사 등록(③)이 기관 서식을 요구하므로, 그 항목까지 여기서 함께 묻는다.
 * 재산 특정 방식이 정해지면 그 방식의 하위 항목도 질문지에 붙는다.
 */
router.post("/chat", async (req, res) => {
  try {
    const { programId, messages = [], values: incoming = {} } = req.body || {};
    if (!programId) return res.status(400).json({ error: "programId가 필요합니다." });
    if (!Array.isArray(messages)) return res.status(400).json({ error: "messages 배열이 필요합니다." });

    // 매 턴 ②를 조회한다. 보관된 사업이면 여기서 걸리고(일반 약정과 같은 규칙),
    // 기관이 대화 도중 서식을 바꿔도 그다음 질문부터 바로 반영된다.
    // 기부 유형을 legacy로 주므로 유산 서식이 온다 — 정기기부 항목(회차 금액·납부 주기·
    // 약정 기간)은 애초에 질문지에 들어오지 않는다.
    const form = await getLiveContractForm(programId, "legacy");
    if (!form.ready) {
      return res.status(409).json({
        error:
          form.note || "이 사업은 아직 유산기부 계약서 서식이 준비되지 않았습니다.",
        code: "LEGACY_FORM_NOT_READY",
      });
    }

    const spec = loadLegacySpec();
    let fields = chatFields(spec, incoming, form);
    let values = sanitizeValues(fields, incoming);
    const before = { ...values };

    let proposed = [];
    const unclear = [];
    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    if (lastUser?.content) {
      const args = await upstageToolCall(
        buildExtractionMessages({ fields, values, userMessage: lastUser.content }),
        COLLECT_INFO_TOOL
      );

      const parsed = { ...(args?.parsed_fields || {}) };
      const sources = args?.sources || {};
      const flagged = { ...(args?.unclear || {}) };

      // 숫자 항목은 근거가 된 표현에 수 표현이 있어야 한다 (지어낸 금액·비율 차단)
      for (const key of Object.keys(parsed)) {
        const field = fields.find((f) => f.key === key);
        if (field?.type !== "number") continue;
        const basis = sources[key] ?? lastUser.content;
        if (!hasNumericBasis(basis)) {
          delete parsed[key];
          if (!flagged[key]) flagged[key] = String(basis).trim();
        }
      }

      if (Object.keys(parsed).length > 0) {
        proposed = Object.keys(parsed).filter((k) => fields.some((f) => f.key === k));
        values = sanitizeValues(fields, { ...values, ...parsed });
      }

      // 재산 특정 방식이 이번 턴에 정해졌다면, 그 방식의 하위 항목을 질문지에 붙인다
      const nextFields = chatFields(spec, values, form);
      if (nextFields.length !== fields.length) {
        fields = nextFields;
        values = sanitizeValues(fields, values);
      }

      for (const [key, said] of Object.entries(flagged)) {
        const field = fields.find((f) => f.key === key);
        if (field && values[key] === undefined) {
          unclear.push({ key, label: field.label, said: String(said).trim() });
        }
      }
    }

    const captured = Object.keys(values).filter((k) => values[k] !== before[k]);
    const rejected = proposed.filter((k) => values[k] === undefined);

    // 기관 서식의 "특정 내용"처럼 코드가 대신 채우는 항목을 여기서 채운다.
    // (captured 계산 뒤에 둔다 — 사용자가 말한 것이 아니라 파생된 값이므로
    //  "○○ 확인했어요"에 끼면 안 된다)
    values = applyDerived(spec, values);

    // 보험금은 유언 경로가 아니라 수익자 변경 안내로 빠진다
    const type = bequestTypeByLabel(spec, values.bequest_type);
    const redirect = type?.redirect
      ? { kind: type.redirect, label: type.label, notice: type.redirect_notice }
      : null;

    const missing = redirect ? [] : missingFields(fields, values);

    res.json({
      values,
      fields,
      missing: missing.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
      captured,
      rejected,
      unclear,
      understoodNothing:
        Boolean(lastUser?.content) &&
        captured.length === 0 &&
        rejected.length === 0 &&
        unclear.length === 0,
      done: missing.length === 0,
      redirect,
      specVersion: spec.version,
      schemaVersion: form.schema_version,
      prefilled: form.prefilled_labels || [],
    });
  } catch (e) {
    console.error("[legacy:chat] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** POST /api/legacy/pledges — 고지 동의를 마친 시점에 등록을 만든다 */
router.post("/pledges", async (req, res) => {
  try {
    const spec = loadLegacySpec();
    const { programId, programName, consent = {}, values = {} } = req.body || {};
    if (!programId) return res.status(400).json({ error: "programId가 필요합니다." });

    // 필수 고지 동의가 빠지면 만들지 않는다
    const notAgreed = (spec.consent || []).filter((c) => c.required && consent[c.key] !== true);
    if (notAgreed.length > 0) {
      return res.status(400).json({
        error: "고지 사항에 모두 동의해야 진행할 수 있습니다.",
        code: "CONSENT_REQUIRED",
        missing: notAgreed.map((c) => c.key),
      });
    }

    const record = await createRecord({
      spec_version: spec.version,
      program_id: programId,
      program_name: programName || null,
      consent,
      values: mergeValues(spec, {}, values),
    });

    res.status(201).json(withScript(spec, record));
  } catch (e) {
    console.error("[legacy:create] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * POST /api/legacy/pledges/:id/redo — 녹음만 다시 한다.
 *
 * 녹음은 한 등록에 하나뿐이라(저장되면 잠긴다) 다시 녹음하려면 등록을 새로 만들어야 한다.
 * 그런데 실패한 것은 녹음이지 기부 의사가 아니다. **기부 의사 등록(서명)을 다시 하면
 * 기업용에 같은 사람의 약정이 두 건 쌓이므로**, 값·증인·대본 수정분과 함께
 * agreement_id / document_id를 그대로 물려받고 서명은 다시 하지 않는다.
 */
router.post("/pledges/:id/redo", async (req, res) => {
  try {
    const spec = loadLegacySpec();
    const prev = await readRecord(req.params.id);

    // 이미 다시 만든 적이 있으면 그 등록으로 안내한다 (또 만들지 않는다)
    if (prev.superseded_by) {
      return res.status(409).json({
        error: "이미 다시 진행 중인 등록이 있습니다.",
        code: "ALREADY_SUPERSEDED",
        pledgeId: prev.superseded_by,
      });
    }

    const next = await createRecord({
      spec_version: spec.version,
      program_id: prev.program_id,
      program_name: prev.program_name,
      consent: prev.consent,
      values: prev.values,
      script_overrides: prev.script_overrides,
      witness: prev.witness,
      agreement_id: prev.agreement_id,
      document_id: prev.document_id,
      supersedes: prev.id,
    });
    await updateRecord(prev.id, { superseded_by: next.id });

    res.status(201).json(withScript(spec, next));
  } catch (e) {
    console.error("[legacy:redo] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

router.get("/pledges/:id", async (req, res) => {
  try {
    const spec = loadLegacySpec();
    const record = await readRecord(req.params.id);
    res.json(withScript(spec, record));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * PATCH /api/legacy/pledges/:id
 * body: { values?, scriptOverrides?, witness?, checklist?, agreementId?, documentId? }
 *
 * 대본은 저장할 때마다 지금 spec으로 다시 렌더링해 돌려준다.
 * 화면이 보여주는 문장과 나중에 저장되는 문장이 갈라지지 않게 하기 위해서다.
 */
router.patch("/pledges/:id", async (req, res) => {
  try {
    const spec = loadLegacySpec();
    const record = await readRecord(req.params.id);
    const { values, scriptOverrides, witness, checklist, agreementId, documentId } = req.body || {};

    // 녹음이 끝난 뒤에는 "그때 읽은 내용"에 해당하는 것을 고칠 수 없다.
    // 자가 확인 결과와 등록 번호는 녹음 다음에 붙는 것이라 계속 받는다.
    if (record.recording && (values || scriptOverrides || witness)) {
      return res.status(409).json({
        error: "이미 녹음이 저장되어 대본과 증인 정보는 바꿀 수 없습니다. 다시 녹음하려면 처음부터 진행해주세요.",
        code: "ALREADY_RECORDED",
      });
    }

    const patch = {};

    if (values !== undefined) {
      patch.values = mergeValues(spec, record.values || {}, values);
    }

    if (scriptOverrides !== undefined) {
      // 편집 가능한 블록만 사용자 문장으로 덮을 수 있다 (법정 요건 문장은 손댈 수 없다)
      const editable = new Set(
        (spec.script?.blocks || []).map((b, i) => (b.editable ? String(i) : null)).filter(Boolean)
      );
      const clean = {};
      for (const [index, text] of Object.entries(scriptOverrides || {})) {
        if (!editable.has(String(index))) continue;
        const t = String(text || "").trim();
        if (t) clean[String(index)] = t;
      }
      patch.script_overrides = clean;
      patch.script_spec_version = spec.version;
    }

    if (witness !== undefined) {
      const name = String(witness?.name || "").trim();
      const eligibility = witness?.eligibility || {};
      if (!name) {
        return res.status(400).json({ error: "증인 성명이 필요합니다.", code: "WITNESS_NAME_REQUIRED" });
      }
      // 결격 문항은 셋 다 "예"여야 한다. 하나라도 아니면 증인이 될 수 없다.
      const failed = (spec.witness_eligibility?.questions || []).filter(
        (q) => eligibility[q.key] !== true
      );
      if (failed.length > 0) {
        return res.status(400).json({
          error: spec.witness_eligibility?.blocked_notice || "증인 자격을 확인해주세요.",
          code: "WITNESS_INELIGIBLE",
          failed: failed.map((q) => q.key),
        });
      }
      patch.witness = {
        name,
        contact: String(witness?.contact || "").trim() || null,
        eligibility,
        confirmed_at: new Date().toISOString(),
      };
    }

    if (checklist !== undefined) {
      patch.checklist = normalizeChecklist(spec, checklist);
    }

    if (agreementId !== undefined) {
      patch.agreement_id = String(agreementId || "").trim() || null;
    }

    // 완료 화면에서 서명된 약정서를 바로 보여주려면 모두싸인 문서 id가 필요하다.
    // ④(서명 상태 조회)는 이 값을 돌려주지 않으므로 등록할 때 받아 둔다.
    if (documentId !== undefined) {
      patch.document_id = String(documentId || "").trim() || null;
    }

    const next = await updateRecord(record.id, patch);
    res.json(withScript(spec, next));
  } catch (e) {
    console.error("[legacy:patch] error:", e.message);
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/**
 * 자가 확인 체크 목록을 spec 기준으로 다시 만든다.
 * 나중에 STT가 붙으면 source가 "stt"로, timecode가 채워질 자리다. (계획서 §8)
 */
function normalizeChecklist(spec, incoming = []) {
  const byKey = new Map((incoming || []).map((c) => [c.key, c]));
  return (spec.review_checklist || []).map((item) => {
    const got = byKey.get(item.key) || {};
    return {
      key: item.key,
      label: item.label,
      checked: got.checked === true,
      source: got.source === "stt" ? "stt" : "self",
      timecode: typeof got.timecode === "number" ? got.timecode : null,
    };
  });
}

/**
 * POST /api/legacy/pledges/:id/recording — 녹음 저장.
 *
 * 본문은 오디오 원본(raw). 파일 선택 input을 만들지 않기 위해(재생본·편집본 차단)
 * 브라우저의 MediaRecorder가 만든 Blob을 그대로 올린다.
 * 저장 시점에 그때 읽은 대본 전문과 spec 버전을 함께 남긴다.
 */
router.post(
  "/pledges/:id/recording",
  raw({ type: ["audio/*", "application/octet-stream"], limit: MAX_RECORDING }),
  async (req, res) => {
    try {
      const spec = loadLegacySpec();
      const record = await readRecord(req.params.id);
      if (record.recording) {
        return res.status(409).json({ error: "이미 녹음이 저장되어 있습니다.", code: "ALREADY_RECORDED" });
      }
      if (!record.witness?.name) {
        return res.status(400).json({ error: "증인을 먼저 등록해주세요.", code: "WITNESS_REQUIRED" });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "녹음 데이터가 비어 있습니다.", code: "EMPTY_RECORDING" });
      }

      const durationMs = Number(req.get("X-Duration-Ms")) || null;
      const mime = (req.get("Content-Type") || "audio/webm").split(";")[0];
      const recording = await saveRecording(record.id, req.body, { mime, durationMs });

      // 녹음 당일 날짜로 대본을 다시 렌더링해 "그때 읽은 문장"을 확정한다
      const rendered = renderScript(spec, {
        values: record.values || {},
        fields: collectFields(spec, record.values || {}),
        overrides: record.spec_version === spec.version ? record.script_overrides || {} : {},
        context: {
          programName: record.program_name,
          witnessName: record.witness?.name || "",
          recordDate: recording.recorded_at.slice(0, 10),
        },
      });

      const next = await updateRecord(record.id, {
        recording,
        script_rendered: rendered.text,
        script_spec_version: spec.version,
      });

      res.status(201).json(withScript(spec, next));
    } catch (e) {
      console.error("[legacy:recording] error:", e.message);
      res.status(e.status || 500).json({ error: e.message, code: e.code });
    }
  }
);

/** GET /api/legacy/pledges/:id/recording — 재생 스트림 */
router.get("/pledges/:id/recording", async (req, res) => {
  try {
    const record = await readRecord(req.params.id);
    const stream = await openRecording(record);
    if (!stream) return res.status(404).json({ error: "녹음 파일이 없습니다." });
    res.setHeader("Content-Type", record.recording.mime || "audio/webm");
    res.setHeader("Content-Length", record.recording.bytes);
    res.setHeader("Cache-Control", "no-store");
    stream.pipe(res);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** POST /api/legacy/pledges/lookup — 마이페이지용. 브라우저가 들고 있는 id 목록만 조회한다 */
router.post("/pledges/lookup", async (req, res) => {
  try {
    const records = await listRecords(req.body?.ids || []);
    res.json({ pledges: records.map(publicRecord) });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

export default router;
