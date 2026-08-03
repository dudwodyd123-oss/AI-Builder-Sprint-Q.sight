/**
 * 내가 신청한 문화유산 후원 id 목록.
 *
 * 로그인이 없으므로 서버는 "누구의 신청인가"를 모른다. 브라우저가 자기 id를 들고 있다가
 * 마이페이지에서 그 id들로만 조회한다. (legacyLocal.js와 같은 방식 — src/legacyLocal.js 참고)
 */

const KEY = "qsight.heritage.ids";

export function loadHeritageIds() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberHeritageId(id) {
  if (!id) return;
  const ids = loadHeritageIds();
  if (ids.includes(id)) return;
  localStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, 50)));
}
