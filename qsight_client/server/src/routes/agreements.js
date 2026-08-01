import { Router } from "express";
import { getContractForm, getLiveContractForm, createAgreement, getAgreement } from "../lib/corp.js";
import { missingFields, sanitizeValues, keysFromDetail } from "../lib/fields.js";

const router = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 서식이 바뀌었을 때 다시 물어봐야 할 항목만 골라낸다 */
function changedFieldKeys(oldFields = [], newFields = []) {
  const oldByKey = new Map(oldFields.map((f) => [f.key, f]));
  const changed = [];
  for (const next of newFields) {
    const prev = oldByKey.get(next.key);
    if (!prev) {
      changed.push(next.key); // 새로 생긴 항목
      continue;
    }
    const sameOptions = JSON.stringify(prev.options ?? null) === JSON.stringify(next.options ?? null);
    if (prev.type !== next.type || prev.required !== next.required || !sameOptions) {
      changed.push(next.key);
    }
  }
  return changed;
}

/**
 * POST /api/agreements - ③ 약정 생성 (기업용 서버가 서명 요청 메일을 발송한다)
 * body: { programId, values, signer: { name, email }, schemaVersion, fields }
 *
 * ⚠️ 이 호출은 실제로 메일을 보내므로, 부르기 전에 세 가지를 확인한다.
 *   1) 서식(schema_version)이 대화 도중 바뀌지 않았는가
 *   2) 필수 항목이 전부 채워졌는가
 *   3) 서명자 이메일이 형식상 유효한가
 */
router.post("/", async (req, res) => {
  try {
    const {
      programId,
      values: incoming = {},
      signer = {},
      schemaVersion,
      fields: knownFields,
      // 기부 유형마다 기관 서식이 다르다. 값을 모을 때 쓴 서식으로 검증해야 하므로 그대로 넘긴다.
      donationType = "default",
    } = req.body || {};
    if (!programId) return res.status(400).json({ error: "programId가 필요합니다." });

    const signerName = String(signer.name || "").trim();
    const signerEmail = String(signer.email || "").trim();
    if (!signerName || !signerEmail) {
      return res.status(400).json({ error: "서명자 이름과 이메일이 필요합니다.", code: "SIGNER_REQUIRED" });
    }
    if (!EMAIL_RE.test(signerEmail)) {
      return res.status(400).json({ error: "서명자 이메일 형식이 올바르지 않습니다.", code: "SIGNER_EMAIL_INVALID" });
    }

    // 1) 메일 발송 직전에 스키마를 다시 조회해 대조한다 (보관된 사업이면 여기서 걸린다)
    const form = await getLiveContractForm(programId, donationType);
    if (!form.ready) {
      return res.status(409).json({
        error: form.note || "이 사업은 아직 계약서 서식이 준비되지 않았습니다.",
        code: "FORM_NOT_READY",
      });
    }

    const fields = form.fields || [];
    if (schemaVersion && form.schema_version !== schemaVersion) {
      const changedKeys = changedFieldKeys(knownFields || [], fields);
      return res.status(409).json({
        error: "계약서 서식이 변경되었습니다. 바뀐 항목만 다시 확인해주세요.",
        code: "SCHEMA_CHANGED",
        schemaVersion: form.schema_version,
        fields,
        changedKeys,
      });
    }

    // 2) 필수 항목 재검증 — 하나라도 비면 ③을 부르지 않는다
    //    기관이 미리 채운 항목은 ②의 fields에 없으므로 여기 검사 대상이 아니다.
    const values = sanitizeValues(fields, incoming);
    const missing = missingFields(fields, values);
    if (missing.length > 0) {
      return res.status(400).json({
        error: `아직 비어 있는 항목이 있습니다: ${missing.map((f) => f.label).join(", ")}`,
        code: "MISSING",
        missing: missing.map((f) => ({ key: f.key, label: f.label })),
      });
    }

    // 기관이 미리 채운 값을 그대로 되돌려준다. 기업용이 최종적으로 다시 덮어쓰므로
    // 기부자가 같은 key로 무엇을 보내도 기관 값이 이긴다.
    const result = await createAgreement({
      programId,
      values: { ...values, ...(form.prefilled || {}) },
      signer: { name: signerName, email: signerEmail },
      donationType,
    });

    res.status(201).json({
      agreementId: result.agreement_id,
      documentId: result.document_id,
      status: result.status,
      message: result.message,
      programName: form.program_name,
    });
  } catch (e) {
    console.error("[agreements:create] error:", e.message);

    // 기업용 400: detail에 빠진 항목이 label로 들어온다 → key로 되돌려 챗봇이 재질문할 수 있게 한다
    if (e.status === 400) {
      const detail = e.data?.detail || e.message;
      let missing = [];
      try {
        const form = await getContractForm(req.body?.programId, req.body?.donationType || "default");
        const keys = keysFromDetail(form.fields || [], detail);
        missing = (form.fields || [])
          .filter((f) => keys.includes(f.key))
          .map((f) => ({ key: f.key, label: f.label }));
      } catch {
        // 스키마 재조회 실패 시에는 메시지만 전달
      }
      // 항목 누락이 아닌 400(예: 모금 종료)은 재질문으로 되돌리면 안 된다
      if (missing.length === 0) {
        return res.status(400).json({ error: detail });
      }
      return res.status(400).json({ error: detail, code: "MISSING", missing });
    }

    if (e.status === 502) {
      return res.status(502).json({
        error: "서명 요청 메일 발송에 실패했습니다. 잠시 후 다시 시도해주세요.",
        code: "SEND_FAILED",
        detail: e.data?.detail,
      });
    }

    res.status(e.status || 500).json({ error: e.message, code: e.code });
  }
});

/** GET /api/agreements/:agreementId - ④ 서명 상태 조회 (폴링은 10초 이상 간격) */
router.get("/:agreementId", async (req, res) => {
  try {
    const data = await getAgreement(req.params.agreementId);
    res.json({
      agreementId: data.agreement_id,
      programName: data.program_name,
      status: data.status,
      signed: Boolean(data.signed),
      signedAt: data.signed_at,
      createdAt: data.created_at,
    });
  } catch (e) {
    console.error("[agreements:get] error:", e.message);
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
