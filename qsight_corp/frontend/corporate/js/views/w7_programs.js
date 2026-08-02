// W7 모금 사업 — 등록된 사업 목록.
//
// 이 화면은 목록이 먼저다. 등록 폼을 바로 띄우면 이미 있는 사업을 보러 온
// 담당자가 매번 폼을 지나쳐야 한다. 새로 만들 때만 '모금 사업 추가'로 들어간다.

import { api } from '../api.js';
import { badge, esc, num, pct, progressBar, won } from '../ui.js';

export const TITLE = '모금 사업';
export const SCREEN = 'W7';

export async function render(root, ctx) {
  const { rows } = await api.get('/api/programs?with_progress=true');
  const live = rows.filter((p) => p.status !== 'archived');
  const archived = rows.filter((p) => p.status === 'archived');

  ctx.setActions(`
    <a class="btn" href="#/templates/new">계약서 서식 관리</a>
    <a class="btn coral" href="#/programs/new">+ 모금 사업 추가</a>`);

  root.innerHTML = `
    <div class="card">
      <div class="card-h"><h2>진행 중</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${live.length}건</span></div>
      <div class="card-b">
        ${live.length
          ? `<div class="grid grid-2">${live.map(card).join('')}</div>`
          : `<div class="empty">
               <b>등록된 모금 사업이 없습니다</b><br>
               <span style="font-size:12.5px">오른쪽 위 <b>+ 모금 사업 추가</b>로 시작하세요</span>
             </div>`}
      </div>
    </div>

    ${archived.length ? `
    <div class="card">
      <div class="card-h"><h2>보관됨</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${archived.length}건 · 기부자 화면에서 보이지 않습니다</span></div>
      <div class="card-b">
        <div class="grid grid-2">${archived.map(card).join('')}</div>
      </div>
    </div>` : ''}

    <div class="note">
      사업 이름을 누르면 신청서 양식과 기부 현황을 볼 수 있습니다.
      유산기부를 받으려면 사업마다 <b>유산기부 서식</b>을 따로 연결해야 합니다.
    </div>`;

  root.addEventListener('click', (e) => {
    const open = e.target.closest('[data-open]');
    if (open) ctx.navigate(`/programs/${open.dataset.open}`);
  });
}

function card(p) {
  const archived = p.status === 'archived';
  return `
    <div class="card" data-open="${esc(p.id)}"
         style="cursor:pointer;box-shadow:none;border-color:var(--line)${archived ? ';opacity:.62' : ''}">
      <div class="card-b">
        <div class="flex" style="margin-bottom:8px">
          <span class="strong" style="font-size:15px">${esc(p.name)}</span>
          ${archived ? badge('보관됨', 'muted') : ''}
          ${p.legacy_template_id ? badge('유산기부', 'teal') : ''}
          <span class="spacer"></span>
          <span class="muted" style="font-size:12px">${num(p.donor_count)}명</span>
        </div>
        <div class="flex" style="margin-bottom:6px">
          <div style="flex:1">${progressBar(p.rate, p.rate < 40)}</div>
          <span class="strong nowrap" style="font-size:12.5px">${pct(p.rate)}</span>
        </div>
        <div class="muted" style="font-size:12px">
          ${won(p.raised_amount)} / ${won(p.goal_amount)}
        </div>
        <div class="muted" style="font-size:12px;margin-top:3px">
          ${esc(p.start_date)} ~ ${esc(p.end_date)}
        </div>
        <div class="flex" style="flex-wrap:wrap;margin-top:8px">
          ${(p.tags || []).slice(0, 4).map((t) =>
            `<span class="chip tag" style="font-size:11.5px">${esc(t)}</span>`).join('')}
        </div>
      </div>
    </div>`;
}
