/**
 * legacy-spec.json 로더 · 검증 · 캐시.
 *
 * 법률 검토에 따라 바뀌는 것(대본 문안, 챗봇 질문, 결격 문항, 고지 문구)은 전부
 * config/legacy-spec.json에 있고, 코드는 그 파일을 읽어 화면을 그리기만 한다.
 *
 * 대신 "지워지면 유언이 통째로 무효가 되는 것"은 기동 시에 검증한다.
 * 누군가 문구를 다듬다가 "오늘은 ○년 ○월 ○일입니다" 한 줄을 지우면
 * 조용히 넘어가는 대신 서버가 뜨지 않아야 한다.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const SPEC_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "config",
  "legacy-spec.json"
);

/** 민법 제1067조 요건 — 대본에 반드시 있어야 하는 태그 */
export const REQUIREMENT_TAGS = ["donor_name", "date", "content", "witness_confirm", "witness_name"];

/** 챗봇이 묻지 않고 코드가 채우는 값 (대본 플레이스홀더로 쓸 수 있다) */
export const AUTO_KEYS = ["org_name", "program_name", "record_date", "bequest_phrase", "witness_name"];

const PLACEHOLDER = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function placeholdersOf(text = "") {
  return [...String(text).matchAll(PLACEHOLDER)].map((m) => m[1]);
}

function fail(message) {
  const err = new Error(`legacy-spec.json 검증 실패 — ${message}`);
  err.code = "LEGACY_SPEC_INVALID";
  throw err;
}

/** 재산 특정 방식 하나가 데리고 다니는 하위 항목 */
function typeFields(type) {
  return Array.isArray(type.fields) ? type.fields : [];
}

/**
 * 기동 시 검증. 하나라도 실패하면 서버 기동을 중단시킨다.
 * (계획서 §2-5)
 */
export function validateSpec(spec) {
  if (!spec || typeof spec !== "object") fail("파일을 객체로 읽을 수 없습니다.");
  if (!spec.version) fail("version이 없습니다.");

  const blocks = spec.script?.blocks;
  if (!Array.isArray(blocks) || blocks.length === 0) fail("script.blocks가 비어 있습니다.");

  // 1) 법정 요건 5종 태그가 모두 있는가
  const tags = blocks.map((b) => b.requirement).filter(Boolean);
  for (const tag of REQUIREMENT_TAGS) {
    if (!tags.includes(tag)) fail(`대본에 법정 요건 블록 "${tag}"가 없습니다.`);
  }
  const dupTag = tags.find((t, i) => tags.indexOf(t) !== i);
  if (dupTag) fail(`법정 요건 태그 "${dupTag}"가 중복입니다.`);
  const unknownTag = tags.find((t) => !REQUIREMENT_TAGS.includes(t));
  if (unknownTag) {
    fail(`알 수 없는 법정 요건 태그 "${unknownTag}". 태그가 늘어났다면 코드 수정이 필요합니다.`);
  }

  // 법정 요건 블록은 값이 비었다고 빠질 수 없다
  for (const b of blocks) {
    if (b.requirement && Array.isArray(b.omit_if_empty) && b.omit_if_empty.length > 0) {
      fail(`법정 요건 블록 "${b.requirement}"에는 omit_if_empty를 둘 수 없습니다.`);
    }
  }

  // 대본 화면이 문장 옆에 붙이는 요건 이름도 JSON에 있어야 한다 (화면에 문구를 박지 않기 위해)
  for (const tag of REQUIREMENT_TAGS) {
    if (!spec.requirement_labels?.[tag]) fail(`requirement_labels에 "${tag}" 이름이 없습니다.`);
  }

  // 2) review_checklist가 5종 태그와 1:1로 대응하는가
  const checkKeys = (spec.review_checklist || []).map((c) => c.key);
  if (checkKeys.length !== REQUIREMENT_TAGS.length) {
    fail(`review_checklist는 ${REQUIREMENT_TAGS.length}개여야 합니다 (지금 ${checkKeys.length}개).`);
  }
  for (const tag of REQUIREMENT_TAGS) {
    if (!checkKeys.includes(tag)) fail(`review_checklist에 "${tag}" 항목이 없습니다.`);
  }

  // 3) 대본 플레이스홀더가 전부 collect / 재산 하위 항목 / 자동 생성 값에 있는가
  const collectKeys = (spec.collect || []).map((f) => f.key);
  const bequestKeys = (spec.bequest_types || []).flatMap((t) => typeFields(t).map((f) => f.key));
  const known = new Set([...collectKeys, ...bequestKeys, ...AUTO_KEYS, ...Object.keys(spec.auto || {})]);

  for (const block of blocks) {
    for (const key of placeholdersOf(block.text)) {
      if (!known.has(key)) fail(`대본에 정의되지 않은 값 "{{${key}}}"이 있습니다.`);
    }
    for (const key of block.omit_if_empty || []) {
      if (!known.has(key)) fail(`omit_if_empty에 정의되지 않은 값 "${key}"이 있습니다.`);
    }
  }

  // 재산 특정 방식의 문구는 자기 하위 항목만 쓸 수 있다 (다른 방식의 항목을 끌어쓰면 빈칸이 된다)
  for (const type of spec.bequest_types || []) {
    if (type.redirect) continue;
    if (!type.phrase) fail(`재산 특정 방식 "${type.value}"에 phrase가 없습니다.`);
    const own = new Set(typeFields(type).map((f) => f.key));
    for (const key of placeholdersOf(type.phrase)) {
      if (!own.has(key)) fail(`"${type.value}"의 phrase가 자기 항목이 아닌 "{{${key}}}"를 씁니다.`);
    }
  }

  // 재산 특정 방식은 라벨로 구분되므로(챗봇 선택지) 라벨이 겹치면 안 된다
  const labels = (spec.bequest_types || []).map((t) => t.label);
  const dupLabel = labels.find((l, i) => labels.indexOf(l) !== i);
  if (dupLabel) fail(`재산 특정 방식 라벨 "${dupLabel}"이 중복입니다.`);

  return spec;
}

let cached = null;

/** 검증까지 끝난 spec. 실패하면 예외를 던진다 (index.js가 받아서 기동을 멈춘다) */
export function loadLegacySpec({ reload = false } = {}) {
  if (cached && !reload) return cached;
  let raw;
  try {
    raw = readFileSync(SPEC_PATH, "utf-8");
  } catch (e) {
    const err = new Error(`legacy-spec.json을 읽을 수 없습니다 (${SPEC_PATH})`);
    err.cause = e;
    throw err;
  }
  cached = validateSpec(JSON.parse(raw));
  return cached;
}

/** 라벨로 재산 특정 방식을 찾는다 (챗봇 select의 값이 라벨이기 때문) */
export function bequestTypeByLabel(spec, label) {
  if (!label) return null;
  return (spec.bequest_types || []).find((t) => t.label === label) || null;
}

/**
 * 지금 챗봇이 물어봐야 할 항목 목록.
 *
 * spec.collect가 기본이고, 재산 특정 방식이 정해지면 그 방식의 하위 항목이 뒤에 붙는다.
 * ("상속재산의 비율"을 고르면 그때부터 "비율(퍼센트)"를 묻는다)
 * 기존 챗봇과 같은 필드 스키마 모양이라 fields.js / prompts.js를 그대로 쓸 수 있다.
 */
export function collectFields(spec, values = {}) {
  const fields = (spec.collect || []).map((f) => {
    if (f.options_from !== "bequest_types") return { ...f };
    return {
      ...f,
      options: (spec.bequest_types || []).map((t) => t.label),
      options_from: undefined,
    };
  });

  const type = bequestTypeByLabel(spec, values.bequest_type);
  if (!type || type.redirect) return fields;
  return [...fields, ...typeFields(type)];
}

/**
 * 유산기부 챗봇의 최종 질문지 = spec의 항목 + 기관 계약서 서식(②)의 항목.
 *
 * 기부 의사 등록은 기존 약정 흐름(③)을 그대로 재사용하므로 기관 서식의 필수 항목도
 * 결국 누군가는 채워야 한다. 그것을 서명 화면에서 따로 입력받으면 "대화로 다 물어봤는데
 * 또 적으라고 한다"가 되므로, 챗봇이 처음부터 함께 묻는다.
 *
 * 같은 key는 한 항목으로 합친다. 형식은 기관 정의를 따르고(약정서가 그 형식을 요구한다)
 * 질문 순서와 부르는 이름은 대화에 맞춘 spec 쪽을 쓴다. (예: donor_name = 성함 / 기부자 성명)
 * 기관이 미리 채워둔 항목은 물을 필요가 없으므로 빠진다.
 */
export function chatFields(spec, values = {}, corpForm = null) {
  const legacyFields = collectFields(spec, values).map((f) => ({ ...f, origin: "legacy" }));
  if (!corpForm) return legacyFields;

  // 기관이 미리 채운 항목과, 코드가 대신 채우는 항목(derived)은 물어볼 이유가 없다
  const skip = new Set([...Object.keys(corpForm.prefilled || {}), ...Object.keys(spec.derived || {})]);
  const corpFields = (corpForm.fields || [])
    .filter((f) => !skip.has(f.key))
    .map((f) => ({ ...f, origin: "corp" }));

  const corpByKey = new Map(corpFields.map((f) => [f.key, f]));
  const legacyKeys = new Set(legacyFields.map((f) => f.key));

  return [
    ...legacyFields.map((f) => {
      const corp = corpByKey.get(f.key);
      if (!corp) return f;
      // 형식·필수 여부는 기관 정의를 따르고(약정서가 그 형식을 요구한다),
      // 이름과 선택지는 spec 쪽을 쓴다. 특히 선택지는 대본 조립과 직결되므로
      // spec이 이겨야 한다 — 예: "보험금"은 기관 서식에 없지만 개인용에서
      // 수익자 변경 안내로 빠지기 위해 선택지에 남아 있어야 한다.
      return {
        ...corp,
        label: f.label,
        profile: f.profile,
        options: f.options ?? corp.options,
        origin: "both",
      };
    }),
    ...corpFields.filter((f) => !legacyKeys.has(f.key)),
  ];
}
