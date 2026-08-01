/**
 * 계약 항목 스키마(②의 fields) 기반 값 처리 유틸.
 *
 * 질문 목록을 코드에 하드코딩하지 않기 위해, "무엇을 물어봐야 하는가"는 전부
 * 이 파일의 함수가 fields 배열에서 계산한다. 기관이 서식을 바꾸면 자동으로 따라간다.
 */

/** 값이 비어 있는가 (false는 "체크 안 함"이라는 유효한 값이므로 비어있지 않다) */
export function isEmptyValue(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "boolean") return false;
  if (typeof value === "number") return Number.isNaN(value);
  return String(value).trim() === "";
}

/** 남은 항목 = fields 중 required=true 이면서 아직 값이 없는 것 */
export function missingFields(fields = [], values = {}) {
  return fields.filter((f) => f.required && isEmptyValue(values[f.key]));
}

// 아라비아 숫자와 한국어 수 표현. 이 중 하나도 없는 문장에서 나온 숫자는 지어낸 값이다.
const NUMERIC_HINT =
  /[0-9]|[영공일이삼사오육륙칠팔구십백천만억조반]|한|두|세|네|다섯|여섯|일곱|여덟|아홉|열|스물|서른|마흔|쉰|예순|일흔|여든|아흔/;

/**
 * 이 문장에서 숫자를 뽑아내는 것이 말이 되는가.
 *
 * "내년까지", "당분간", "좀 많이" 같은 말에는 근거가 될 수 (數)가 없다.
 * LLM이 그럴듯한 숫자를 만들어내도 여기서 걸러낸다. 프롬프트로는 보장되지 않는 부분이라
 * 코드로 한 번 더 막는다.
 */
export function hasNumericBasis(text = "") {
  return NUMERIC_HINT.test(String(text));
}

/** "3만원" → 30000, "12개월" → 12 */
function parseNumberLike(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.replace(/[,\s]/g, "");
  if (!text) return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return parseKoreanNumber(text);
}

function parseKoreanNumber(text) {
  for (const [unit, mul] of [["억", 1e8], ["만", 1e4], ["천", 1e3], ["백", 1e2]]) {
    const idx = text.indexOf(unit);
    if (idx > 0) {
      const head = parseKoreanNumber(text.slice(0, idx));
      if (head === null) return null;
      const tail = parseKoreanNumber(text.slice(idx + unit.length));
      return head * mul + (tail || 0);
    }
  }
  const m = text.match(/^\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

const TRUTHY = ["true", "y", "yes", "예", "네", "동의", "동의함", "확인", "o", "ㅇ", "1"];
const FALSY = ["false", "n", "no", "아니오", "아니요", "비동의", "미동의", "동의하지않음", "x", "0"];

function parseCheckLike(raw) {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw !== "string") return null;
  const text = raw.trim().toLowerCase().replace(/\s/g, "");
  if (TRUTHY.includes(text)) return true;
  if (FALSY.includes(text)) return false;
  return null;
}

/** options 안의 값으로만 정규화. 매칭 실패 시 null (→ 값을 버리고 다시 질문) */
function normalizeSelect(raw, options = []) {
  if (isEmptyValue(raw) || !Array.isArray(options) || options.length === 0) return null;
  const text = String(raw).trim();
  const exact = options.find((o) => String(o) === text);
  if (exact !== undefined) return exact;
  const loose = options.find(
    (o) => String(o).replace(/\s/g, "").toLowerCase() === text.replace(/\s/g, "").toLowerCase()
  );
  return loose !== undefined ? loose : null;
}

function normalizeDate(raw) {
  if (isEmptyValue(raw)) return null;
  const text = String(raw).trim().replace(/[./]/g, "-");
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

/**
 * 스키마에 정의된 key만 남기고, type별 규칙에 맞게 값을 정규화한다.
 * 정규화에 실패한 값은 넣지 않는다 → missingFields가 다시 잡아내서 챗봇이 재질문한다.
 */
export function sanitizeValues(fields = [], values = {}) {
  const clean = {};
  for (const field of fields) {
    const raw = values?.[field.key];
    if (isEmptyValue(raw) && typeof raw !== "boolean") continue;

    switch (field.type) {
      case "number": {
        const n = parseNumberLike(raw);
        if (n !== null) clean[field.key] = n;
        break;
      }
      case "select": {
        const v = normalizeSelect(raw, field.options);
        if (v !== null) clean[field.key] = v;
        break;
      }
      case "check": {
        const v = parseCheckLike(raw);
        if (v !== null) clean[field.key] = v;
        break;
      }
      case "date": {
        const v = normalizeDate(raw);
        if (v !== null) clean[field.key] = v;
        break;
      }
      default:
        clean[field.key] = String(raw).trim();
    }
  }
  return clean;
}

/**
 * ③이 400으로 돌려주는 detail은 항목 *label* 목록이라 key로 되돌려야 재질문할 수 있다.
 * 예: "아직 비어 있는 항목이 있습니다: 연락처, 납부 주기" → ["contact", "frequency"]
 */
export function keysFromDetail(fields = [], detail = "") {
  if (!detail) return [];
  const text = String(detail);
  return fields.filter((f) => f.label && text.includes(f.label)).map((f) => f.key);
}
