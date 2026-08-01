/**
 * 기부자 기본정보 (로그인 대체).
 *
 * 서버는 상태를 갖지 않으므로 브라우저에 보관한다. 이 값은 챗봇이 물어볼 항목을
 * 줄이는 데 쓰이고, 서명자 정보의 기본값이 된다.
 */

const KEY = "qsight.profile";

export const EMPTY_PROFILE = { name: "", email: "", phone: "" };

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { ...EMPTY_PROFILE, ...parsed };
  } catch {
    return null;
  }
}

export function saveProfile(profile) {
  localStorage.setItem(KEY, JSON.stringify(profile));
}

export function clearProfile() {
  localStorage.removeItem(KEY);
}

/** 이름·이메일·전화번호가 모두 채워졌는가 */
export function isComplete(profile) {
  return Boolean(profile?.name?.trim() && profile?.email?.trim() && profile?.phone?.trim());
}

/**
 * 계약 항목 스키마에서 기본정보로 채울 수 있는 항목을 찾는다.
 *
 * 항목 key를 코드에 박아두지 않기 위해 key와 label을 함께 보고 판단한다.
 * 짚이는 항목이 없으면 그냥 비워두고 챗봇이 평소대로 물어본다.
 */
const MATCHERS = [
  { field: "email", test: /email|메일/i },
  { field: "phone", test: /phone|tel|mobile|contact|연락처|전화|휴대/i },
  { field: "name", test: /name|성명|이름/i },
];

export function profileValues(fields = [], profile) {
  if (!profile) return {};
  const values = {};

  for (const field of fields) {
    // 자유 입력 항목에만 채운다 (select/check/number에 기본정보를 넣을 일은 없다)
    if (field.type !== "text" && field.type !== "textarea") continue;

    const haystack = `${field.key} ${field.label}`;
    const match = MATCHERS.find((m) => m.test.test(haystack));
    const value = match && profile[match.field];
    if (value?.trim()) values[field.key] = value.trim();
  }

  return values;
}
