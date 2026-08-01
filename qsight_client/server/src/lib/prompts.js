/**
 * 챗봇 프롬프트.
 *
 * 질문 목록은 코드에 없다. 기업용 API ②가 준 계약 항목 스키마(fields)를 그대로
 * 체크리스트로 삼아 매 턴 프롬프트를 새로 조립한다. 기관이 서식을 바꾸면 질문도 따라 바뀐다.
 *
 * LLM이 하는 일은 "사용자 메시지에서 값 추출" 하나뿐이다(tool call, temperature 0).
 * 무엇이 비었는지 판단하는 것도, 사용자에게 보여줄 문장을 만드는 것도 코드가 한다.
 * 사용자에게 나가는 문장을 LLM이 쓰지 않으므로, 스키마에 없는 질문이나
 * 지어낸 설명이 화면에 나갈 수 없다.
 */

/** 추출 단계에서 쓰는 tool 스펙 (OpenAI function 규격) */
export const COLLECT_INFO_TOOL = {
  name: "collect_info",
  description: "사용자 메시지에서 새로 알아낸 항목 값과, 언급했지만 값이 확정되지 않은 항목",
  parameters: {
    type: "object",
    properties: {
      parsed_fields: {
        type: "object",
        description:
          "값이 하나로 확정되는 항목만 담는다. 사용자의 말에서 값을 단정할 수 없으면 여기 넣지 않는다.",
        additionalProperties: true,
      },
      sources: {
        type: "object",
        description:
          "parsed_fields의 각 key가 사용자 메시지의 어느 표현에서 나왔는지. 값은 메시지에 실제로 등장한 부분을 그대로 옮긴다. 예: {\"amount\": \"3만원씩\", \"term_months\": \"1년간\"}",
        additionalProperties: { type: "string" },
      },
      unclear: {
        type: "object",
        description:
          "사용자가 언급했지만 값을 하나로 확정할 수 없는 항목. key는 항목 key, 값은 사용자가 실제로 말한 표현 그대로. 예: {\"term_months\": \"내년까지\"}",
        additionalProperties: { type: "string" },
      },
    },
    required: ["parsed_fields", "sources"],
  },
};

function typeRule(field) {
  switch (field.type) {
    case "number":
      return '숫자만 뽑아 아라비아 숫자로 (예: "3만원" → 30000, "1년" → 12)';
    case "select":
      return `반드시 다음 중 하나: ${(field.options || []).join(" / ")}`;
    case "check":
      return "동의 여부를 true 또는 false로";
    case "date":
      return "YYYY-MM-DD 형식으로";
    case "textarea":
      return "자유 입력 (길어도 됨)";
    default:
      return "자유 입력";
  }
}

function fieldList(fields) {
  return fields
    .map((f) => `- ${f.key} (${f.label}) [${f.required ? "필수" : "선택"}] : ${typeRule(f)}`)
    .join("\n");
}

/** 1단계: 사용자 메시지에서 값 추출 (tool call 전용) */
export function buildExtractionMessages({ fields = [], values = {}, userMessage = "" }) {
  return [
    {
      role: "system",
      content: `너는 사용자와 대화하면서 정해진 항목의 정보를 수집하는 상담원이다.

규칙:
1. 반드시 collect_info tool을 호출해서 응답한다.
2. parsed_fields는 아래 수집 항목 목록에 있는 key만 사용한다. 목록에 없는 key는 만들지 않는다.
3. 이번 사용자 메시지에서 새로 알아낼 수 있는 정보만 채운다.
4. 이미 알고 있는 정보는 다시 채우지 않아도 된다.
5. 메시지에 없는 정보는 추측해서 지어내지 말고, 해당 key 자체를 생략한다.
6. 한 문장에 여러 항목이 섞여 있으면 빠짐없이 전부 추출한다.
   ("김민준이고 연락처는 010-1234-5678이에요" → donor_name과 contact 둘 다)
   조사가 붙어 있어도("김민준이고", "김민준입니다") 값으로 인식한다.
7. 선택지가 정해진 항목은 사용자의 말이 선택지 중 하나와 명확히 대응할 때만 채운다.
   대응하지 않으면 비슷해 보여도 임의로 고르지 말고 그 key를 생략한다.
   (선택지가 "월 / 연 / 일시"인데 사용자가 "분기마다"라고 말했다면 → 생략. "연"으로 바꾸지 않는다)
8. 사용자가 어떤 항목을 언급했지만 값이 하나로 확정되지 않으면, parsed_fields에 넣지 말고
   unclear에 넣는다. 값은 사용자가 실제로 말한 표현을 그대로 적는다.
   확정되지 않는다는 것은 "사람이 읽어도 숫자나 선택지 하나로 단정할 수 없다"는 뜻이다.

   확정 불가 예시 (반드시 unclear로):
   - "내년까지 낼게요"   → unclear: {"term_months": "내년까지"}   (몇 개월인지 단정 불가)
   - "가끔씩 낼게요"     → unclear: {"frequency": "가끔씩"}       (월/연/일시 중 무엇인지 단정 불가)
   - "좀 많이 낼게요"    → unclear: {"amount": "좀 많이"}         (금액을 단정 불가)
   - "당분간 계속이요"   → unclear: {"term_months": "당분간 계속"}

   확정 가능 예시 (parsed_fields로):
   - "1년간"     → term_months: 12
   - "매달"      → frequency: "월"
   - "3만원씩"   → amount: 30000

   추측해서 채우는 것보다 unclear로 두는 편이 항상 낫다. 확실하지 않으면 unclear에 넣어라.
9. parsed_fields에 넣은 항목은 sources에 그 값의 근거가 된 표현을 반드시 함께 적는다.
   메시지에 실제로 등장한 부분을 그대로 옮겨야 한다. 지어내면 안 된다.
   ("매달 3만원씩 내년까지" → sources: {"frequency": "매달", "amount": "3만원씩"},
    term_months는 "내년까지"라 확정 불가이므로 unclear로)`,
    },
    {
      role: "user",
      content: `[수집해야 하는 항목 목록]
${fieldList(fields)}

[현재까지 모은 정보]
${JSON.stringify(values, null, 2)}

[사용자의 새 메시지]
${userMessage}

위 메시지에서 새로 알아낼 수 있는 정보만 collect_info tool로 반환해라.`,
    },
  ];
}
