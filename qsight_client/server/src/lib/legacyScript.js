/**
 * 대본 조립기.
 *
 * LLM은 여기 관여하지 않는다. spec의 템플릿에 수집된 값을 끼워 넣는 결정론적 처리다.
 * "오늘은 ○년 ○월 ○일입니다" 한 줄이 빠지면 유언 전체가 무효가 되므로,
 * 법정 요건 문장을 확률적 생성에 맡기지 않는다. (계획서 §4)
 */

import { placeholdersOf, bequestTypeByLabel } from "./legacySpec.js";

/** "2026-07-31" → "2026년 7월 31일" (소리 내어 읽는 대본이므로 숫자를 그대로 두지 않는다) */
export function koreanDate(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(iso || "");
  return `${Number(m[1])}년 ${Number(m[2])}월 ${Number(m[3])}일`;
}

/** 서버 기준 오늘 (녹음 날짜는 녹음 당일 자동) */
export function todayISO(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

/** 대본에 넣을 표시 문자열. 날짜는 한국어로, 큰 수는 자릿수를 끊어서. */
function display(key, value, fields) {
  if (isEmpty(value)) return "";
  const field = fields.find((f) => f.key === key);
  if (field?.type === "date" || key === "record_date") return koreanDate(value);
  if (field?.type === "number" || typeof value === "number") {
    return Number(value).toLocaleString("ko-KR");
  }
  return String(value).trim();
}

/**
 * 재산 특정 문구. 선택된 방식의 phrase 템플릿에 그 방식의 하위 항목만 끼워 넣는다.
 * (예: "상속재산의 비율" + share_percent 10 → "상속재산의 10퍼센트")
 */
export function bequestPhrase(spec, values = {}) {
  const type = bequestTypeByLabel(spec, values.bequest_type);
  if (!type || type.redirect || !type.phrase) return "";
  const fields = Array.isArray(type.fields) ? type.fields : [];
  let text = type.phrase;
  for (const key of placeholdersOf(type.phrase)) {
    const shown = display(key, values[key], fields);
    if (!shown) return ""; // 하위 항목이 아직 안 채워졌으면 문구를 만들지 않는다
    text = text.replaceAll(`{{${key}}}`, shown);
  }
  return text;
}

/**
 * 대본 블록을 렌더링한다.
 *
 * @returns {{ blocks: Array, text: string, missing: string[] }}
 *   blocks: [{ index, speaker, requirement, editable, text, edited, incomplete, missing }]
 *   text:   실제로 읽게 될 대본 전문 (녹음 레코드에 그대로 저장한다)
 *   missing: 아직 값이 없어 빈칸으로 남은 플레이스홀더 key 목록
 */
export function renderScript(spec, { values = {}, context = {}, overrides = {}, fields = [] } = {}) {
  const auto = {
    ...(spec.auto || {}),
    record_date: context.recordDate || todayISO(),
    program_name: context.programName || "",
    witness_name: context.witnessName || "",
    bequest_phrase: bequestPhrase(spec, values),
  };
  const all = { ...values, ...auto };
  const allFields = [...fields, ...(spec.collect || [])];

  const blocks = [];
  const missing = new Set();

  (spec.script?.blocks || []).forEach((block, index) => {
    const omitKeys = block.omit_if_empty || [];
    if (omitKeys.some((k) => isEmpty(all[k]))) return; // 값이 없으면 이 문장은 통째로 뺀다

    const keys = placeholdersOf(block.text);
    const blank = keys.filter((k) => isEmpty(all[k]));
    blank.forEach((k) => missing.add(k));

    let text = block.text;
    for (const key of keys) {
      text = text.replaceAll(`{{${key}}}`, display(key, all[key], allFields) || `[${key}]`);
    }

    // 편집 가능한 블록만 사용자가 고친 문장으로 대체한다
    const override = block.editable ? overrides[String(index)] : undefined;
    const edited = typeof override === "string" && override.trim() !== "" && override.trim() !== text;

    blocks.push({
      index,
      speaker: block.speaker,
      requirement: block.requirement || null,
      editable: Boolean(block.editable),
      text: edited ? override.trim() : text,
      generated: text,
      edited,
      incomplete: blank.length > 0,
      missing: blank,
    });
  });

  const text = blocks.map((b) => b.text).join("\n");
  return { blocks, text, missing: [...missing] };
}
