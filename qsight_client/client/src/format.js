/**
 * 계약 항목 값 표시 포맷.
 *
 * 확인 화면은 LLM을 쓰지 않는다. 챗봇이 수집해 정규화까지 끝낸 values를
 * 스키마(fields)의 type에 맞춰 그대로 사람이 읽기 좋은 문자열로 바꿔 보여줄 뿐이다.
 */

/** 받침 유무. 한글이 아니면 판단하지 않는다(호출부에서 조사 없는 표현으로 우회). */
function endsWithHangul(label = "") {
  const code = label.trim().slice(-1).charCodeAt(0);
  return !Number.isNaN(code) && code >= 0xac00 && code <= 0xd7a3;
}

function hasFinalConsonant(label = "") {
  return (label.trim().slice(-1).charCodeAt(0) - 0xac00) % 28 !== 0;
}

/** 주격/주제 조사(은/는). 한글로 끝나지 않으면 조사를 붙이지 않는다. */
export function withTopicParticle(text = "") {
  if (!endsWithHangul(text)) return text;
  return `${text}${hasFinalConsonant(text) ? "은" : "는"}`;
}

/**
 * 항목 하나를 묻는 문장. 스키마에 있는 정보(label, type, options)만으로 만든다.
 * LLM을 쓰지 않으므로 스키마에 없는 질문이나 설명이 섞일 여지가 없다.
 */
export function askQuestion(field) {
  if (!field) return "";

  if (field.type === "check") {
    return `${field.label}에 동의하시나요? (동의 / 동의하지 않음)`;
  }

  // 라벨이 한글로 끝나지 않으면(예: "개인정보(필수)") 조사 대신 "항목을"로 우회한다
  const subject = endsWithHangul(field.label)
    ? `${field.label}${hasFinalConsonant(field.label) ? "을" : "를"}`
    : `${field.label} 항목을`;

  switch (field.type) {
    case "select":
      return `${subject} 알려주시겠어요? (${(field.options || []).join(" / ")} 중에서 선택해주세요)`;
    case "date":
      return `${subject} 알려주시겠어요? (예: 2026-08-01)`;
    default:
      return `${subject} 알려주시겠어요?`;
  }
}

/**
 * 챗봇이 사용자에게 보여줄 문장.
 *
 * 역할은 딱 하나 — 받은 정보에 필요한 항목이 빠짐없이 들어왔는지 확인하고,
 * 빠진 항목 하나를 묻는 것. 그 밖의 질문이나 설명은 붙이지 않는다.
 */
export function buildAssistantMessage({
  fields = [],
  missing = [],
  captured = [],
  rejected = [],
  unclear = [],
  understoodNothing = false,
}) {
  const labelOf = (key) => fields.find((f) => f.key === key)?.label;
  const parts = [];

  const capturedLabels = captured.map(labelOf).filter(Boolean);
  if (capturedLabels.length > 0) {
    parts.push(`${capturedLabels.join(", ")} 확인했어요.`);
  }

  const rejectedLabels = rejected.map(labelOf).filter(Boolean);
  if (rejectedLabels.length > 0) {
    parts.push(`${rejectedLabels.join(", ")} 항목은 형식에 맞지 않아 기록하지 못했어요.`);
  }

  // 애매하게 말한 항목은 사용자의 표현을 그대로 인용해 되묻는다.
  // 값을 짐작해서 채우는 대신 확인을 받는 쪽이 항상 낫다.
  const askedBack = unclear.find((u) => missing.some((m) => m.key === u.key)) || unclear[0];
  if (askedBack) {
    const field = fields.find((f) => f.key === askedBack.key) || askedBack;
    parts.push(`"${askedBack.said}"라고 하셨는데, 정확히 어떻게 기록할지 몰라서요.`);
    parts.push(askQuestion(field));
    return parts.join(" ");
  }

  if (understoodNothing && missing.length > 0) {
    parts.push("말씀해주신 내용에서 필요한 항목을 찾지 못했어요.");
  }

  if (missing.length === 0) {
    // 아래 안내 박스가 다음 단계를 안내하므로 여기서는 상태만 알린다
    parts.push("필요한 항목이 모두 확인됐어요.");
  } else {
    parts.push(askQuestion(missing[0]));
  }

  return parts.join(" ");
}

export function isFilled(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return true;
  return String(value).trim() !== "";
}

/** 항목 하나의 표시 문자열. 값이 없으면 null을 돌려준다(화면에서 "미입력"으로 처리). */
export function formatValue(field, value) {
  if (!isFilled(value)) return null;

  switch (field.type) {
    case "check":
      return value ? "동의함" : "동의하지 않음";
    case "number":
      return Number(value).toLocaleString("ko-KR");
    case "date":
      return String(value);
    default:
      return String(value);
  }
}

/** 확인 화면에 뿌릴 행 목록. 필수 항목을 먼저, 선택 항목을 뒤에 놓는다. */
export function toSummaryRows(fields = [], values = {}) {
  const rows = fields.map((field) => ({
    key: field.key,
    label: field.label,
    required: Boolean(field.required),
    text: formatValue(field, values[field.key]),
  }));

  return [...rows.filter((r) => r.required), ...rows.filter((r) => !r.required)];
}
