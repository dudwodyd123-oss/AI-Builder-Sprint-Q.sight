/**
 * 고향사랑기부 / 문화유산후원용 단순 챗봇 로직.
 *
 * routes/chat.js(정기후원·유산기부용)와 같은 설계 원칙을 따르되, 기관별 계약서
 * 스키마(corp.js의 getLiveContractForm)를 조회하지 않는다. 이 두 화면은 한 페이지짜리
 * 단순 신청서라 항목 구성이 고정돼 있고(금액/이름/연락처 등), 후원 대상은 화면에서
 * 카드를 눌러 고르는 것이라 챗봇이 수집할 필요가 없다.
 *
 * LLM은 여기서도 "사용자 메시지에서 값 추출" 한 가지에만 쓰인다(tool call, temperature 0).
 * 질문 문장과 완료 여부 판단은 그대로 fields.js/prompts.js(공용 유틸)에 맡긴다 —
 * chat.js와 동일한 유틸을 재사용하므로 사용자에게 나가는 문장이 화면마다 따로 놀지 않는다.
 */

import { upstageToolCall } from "./upstage.js";
import { COLLECT_INFO_TOOL, buildExtractionMessages } from "./prompts.js";
import { missingFields, sanitizeValues, hasNumericBasis } from "./fields.js";

/**
 * @param {Array} fields - 고정된 필드 스키마 (해당 라우트에서 하드코딩해서 넘긴다)
 * @param {Array} messages - 지금까지의 대화
 * @param {Object} incoming - 지금까지 모은 값
 */
export async function runSimpleChat({ fields = [], messages = [], values: incoming = {} }) {
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

    for (const [key, said] of Object.entries(flagged)) {
      const field = fields.find((f) => f.key === key);
      if (field && values[key] === undefined) {
        unclear.push({ key, label: field.label, said: String(said).trim() });
      }
    }
  }

  const captured = Object.keys(values).filter((k) => values[k] !== before[k]);
  const rejected = proposed.filter((k) => values[k] === undefined);
  const missing = missingFields(fields, values);

  return {
    values,
    missing: missing.map((f) => ({ key: f.key, label: f.label, type: f.type, options: f.options })),
    captured,
    rejected,
    unclear,
    understoodNothing:
      Boolean(lastUser?.content) && captured.length === 0 && rejected.length === 0 && unclear.length === 0,
    done: missing.length === 0,
    fields,
  };
}
