/**
 * 내가 만든 유산기부 등록 id 목록.
 *
 * 로그인이 없으므로 서버는 "누구의 등록인가"를 모른다. 브라우저가 자기 id를 들고 있다가
 * 마이페이지에서 그 id들로만 조회한다. 기본정보(profile.js)와 같은 방식이다.
 */

const KEY = "qsight.legacy.ids";

export function loadLegacyIds() {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function rememberLegacyId(id) {
  if (!id) return;
  const ids = loadLegacyIds();
  if (ids.includes(id)) return;
  localStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, 50)));
}

/**
 * 이 등록이 지금 어느 단계인가. 레코드만 보고 판단한다.
 * (마이페이지 목록과 "이어서 하기" 안내가 같은 기준을 쓰도록 한곳에 둔다)
 */
export function legacyStage(pledge) {
  const checked = (pledge.checklist || []).filter((c) => c.checked).length;
  const total = (pledge.checklist || []).length;
  if (total > 0 && checked === total) return { label: "확인 완료", cls: "badge-success", to: "done" };
  if (pledge.recording) return { label: "녹음 확인 필요", cls: "badge-pending", to: "review" };
  if (pledge.witness) return { label: "녹음 대기", cls: "badge-pending", to: "record" };
  return { label: "증인 등록 필요", cls: "badge-muted", to: "witness" };
}

/** 다시 진행해 대체된 등록은 목록에서 뺀다 (같은 건이 두 번 보이지 않게) */
export function activePledges(pledges = []) {
  return pledges.filter((p) => !p.supersededBy);
}

/**
 * 아직 끝내지 않은 등록. **기부 의사 등록(서명)까지 마친 것만** 대상이다.
 *
 * 서명 전에 그만둔 건은 기업용에 아무것도 남지 않았으므로 새로 시작해도 중복이 아니다.
 * 반대로 서명까지 마친 건을 두고 처음부터 다시 시작하면 같은 사람의 약정이 두 건 생긴다.
 */
export function unfinishedPledges(pledges = []) {
  return activePledges(pledges).filter(
    (p) => p.agreementId && legacyStage(p).to !== "done"
  );
}
