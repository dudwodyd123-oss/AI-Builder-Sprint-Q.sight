import { Router } from "express";
import { upstageToolCall } from "../lib/upstage.js";
import { COLLECT_INFO_TOOL, buildExtractionMessages } from "../lib/prompts.js";
import { getLiveContractForm } from "../lib/corp.js";
import { missingFields, sanitizeValues, hasNumericBasis } from "../lib/fields.js";

const router = Router();

/**
 * POST /api/chat
 * body: { programId, messages: [{role, content}], values: {} }
 * res:  { values, missing, captured, rejected, done, fields, schemaVersion }
 *
 * LLM은 "사용자 메시지에서 값 추출" 한 가지에만 쓴다(tool call, temperature 0).
 * 무엇이 비었는지 판단하는 것도, 사용자에게 보여줄 문장을 만드는 것도 코드가 한다.
 * 덕분에 스키마에 없는 질문이나 지어낸 설명이 화면에 나갈 수 없다.
 *
 * 질문 목록은 하드코딩하지 않는다. 매 턴 ②를 조회해 최신 스키마를 체크리스트로 쓰므로,
 * 대화 도중에 기관이 서식을 바꿔도 그 다음 질문부터 바로 반영된다.
 */
router.post("/", async (req, res) => {
  try {
    const { programId, messages = [], values: incoming = {} } = req.body || {};
    if (!programId) {
      return res.status(400).json({ error: "programId가 필요합니다." });
    }
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages 배열이 필요합니다." });
    }

    const form = await getLiveContractForm(programId);
    if (!form.ready) {
      return res.status(409).json({
        error: form.note || "이 사업은 아직 계약서 서식이 준비되지 않았습니다.",
        code: "FORM_NOT_READY",
      });
    }

    const fields = form.fields || [];
    // 클라이언트가 보낸 값도 스키마 기준으로 한 번 걸러낸다 (스키마 밖 key / 잘못된 형식 제거)
    let values = sanitizeValues(fields, incoming);
    const before = { ...values };

    // 사용자의 마지막 메시지에서 값 추출
    let proposed = [];
    const unclear = []; // 언급했지만 값이 확정되지 않은 항목 { key, label, said }
    const lastUser = [...messages].reverse().find((m) => m.role === "user");

    if (lastUser?.content) {
      const args = await upstageToolCall(
        buildExtractionMessages({ fields, values, userMessage: lastUser.content }),
        COLLECT_INFO_TOOL
      );

      const parsed = { ...(args?.parsed_fields || {}) };
      const sources = args?.sources || {};
      const flagged = { ...(args?.unclear || {}) };

      // 숫자 항목은 그 값의 근거가 된 표현에 수 표현이 있어야 한다.
      // 문장 전체가 아니라 항목별 근거를 봐야 "매달 3만원씩 내년까지"에서
      // amount는 통과시키고 term_months("내년까지")만 걸러낼 수 있다.
      // ("내년까지" → 12 같은 추측을 프롬프트에 기대지 않고 코드로 막는다)
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
        // 정규화를 통과한 값만 반영된다 (options 밖의 값, 숫자가 아닌 number 등은 버려짐)
        values = sanitizeValues(fields, { ...values, ...parsed });
      }

      for (const [key, said] of Object.entries(flagged)) {
        const field = fields.find((f) => f.key === key);
        if (field && values[key] === undefined) {
          unclear.push({ key, label: field.label, said: String(said).trim() });
        }
      }
    }

    // 이번 턴에 새로 채워졌거나 값이 바뀐 항목
    const captured = Object.keys(values).filter((k) => values[k] !== before[k]);
    // LLM이 값을 제안했지만 형식·선택지에 맞지 않아 버려진 항목
    const rejected = proposed.filter((k) => values[k] === undefined);

    // 기관이 미리 채운 항목은 ②의 fields에서 이미 빠져 나오지만,
    // 혹시 같은 key가 겹쳐 오더라도 기부자에게 묻는 일이 없도록 한 번 더 걸러낸다.
    const prefilledKeys = Object.keys(form.prefilled || {});
    const missing = missingFields(fields, values).filter((f) => !prefilledKeys.includes(f.key));

    res.json({
      values,
      missing: missing.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type,
        options: f.options,
      })),
      captured,
      rejected,
      unclear,
      // 사용자가 말을 했는데 아무것도 알아듣지 못한 경우 (되물을 때 그 사실을 알려주기 위해)
      understoodNothing: Boolean(lastUser?.content) && captured.length === 0 && rejected.length === 0 && unclear.length === 0,
      done: missing.length === 0,
      fields,
      prefilled: form.prefilled_labels || [],
      schemaVersion: form.schema_version,
    });
  } catch (e) {
    console.error("[chat] error:", e.message);
    res.status(e.status || 500).json({
      error: e.message || "챗봇 응답 중 오류가 발생했습니다.",
      code: e.code,
    });
  }
});

export default router;
