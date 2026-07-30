// W9 리포트 발행 — 분기 후원 리포트, 발행 이력, 기부금영수증 대상 집계

import { api } from '../api.js';
import { badge, esc, modal, num, toast, won } from '../ui.js';

export const TITLE = '리포트 발행';
export const SCREEN = 'W9';

export async function render(root, ctx) {
  const year = Number(ctx.search.get('year')) || undefined;
  const quarter = Number(ctx.search.get('quarter')) || undefined;
  const qs = new URLSearchParams();
  if (year) qs.set('year', year);
  if (quarter) qs.set('quarter', quarter);

  const data = await api.get(`/api/reports${qs.toString() ? `?${qs}` : ''}`);
  const draft = data.draft;

  ctx.setActions(`
    <select id="period" style="border:1px solid var(--line);border-radius:6px;padding:6px 10px">
      ${periodOptions(draft)}
    </select>
    <button class="btn coral" id="publish">새 리포트 발행</button>`);

  ctx.actionsEl.querySelector('#period').onchange = (e) => {
    const [y, q] = e.target.value.split('-');
    ctx.navigate(`/reports?year=${y}&quarter=${q}`);
  };

  root.innerHTML = `
    <div class="report-hero">
      <h3>${esc(draft.title)}</h3>
      <p>${esc(draft.subtitle)} · ${esc(draft.period.start)} ~ ${esc(draft.period.end)}</p>
      <div class="stats">
        ${draft.stats.map((s) => `
          <div>
            <div class="v">${num(s.value)}<small>${esc(s.unit)}</small></div>
            <div class="l">${esc(s.label)}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-h"><h2>발행 이력</h2></div>
        <div class="card-b">
          ${data.history.length ? data.history.map((h) => `
            <div class="flex" style="padding:11px 0;border-bottom:1px solid var(--line-soft)">
              <div class="flex-col">
                <span class="strong">${esc(h.title)}</span>
                <span class="muted" style="font-size:12px">수신 ${num(h.recipient_count)}명 ·
                  ${esc((h.published_at || '').slice(0, 10))}</span>
              </div>
              <span class="spacer"></span>
              ${badge(h.status, 'navy')}
            </div>`).join('')
          : '<div class="empty">아직 발행한 리포트가 없습니다</div>'}

          <div class="flex" style="padding:11px 0">
            <div class="flex-col">
              <span class="strong">기부금영수증 발급 대상 (연말)</span>
              <span class="muted" style="font-size:12px">
                ${num(data.receipts.count)}명 · ${won(data.receipts.total_amount)}
              </span>
            </div>
            <span class="spacer"></span>
            <button class="btn sm" id="receipts">대상 보기</button>
            ${badge(data.receipts.status, 'muted')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>사업별 모금</h2></div>
        <div class="card-b">
          ${draft.by_program.length ? `<table><tbody>
            ${draft.by_program.map((p) => `
              <tr><td>${esc(p.name)}</td><td class="num strong">${won(p.amount)}</td></tr>`).join('')}
          </tbody></table>` : '<div class="empty">이 분기에 들어온 후원금이 없습니다</div>'}

          ${data.renewal_candidates.length ? `
            <div class="note" style="margin-top:14px">
              60일 안에 만료되는 성실 이행 약정 ${data.renewal_candidates.length}건 —
              리포트와 함께 갱신 안내를 보내면 좋습니다.
            </div>` : ''}
        </div>
      </div>
    </div>

    <div class="note">
      리포트는 기관 템플릿에 약정 집계를 채워 만듭니다. 실제 발송(이메일·알림톡)은 기관 채널 연동 후 붙습니다.
    </div>`;

  root.querySelector('#receipts').onclick = () => openReceipts(data.receipts);

  ctx.actionsEl.querySelector('#publish').onclick = () => {
    modal({
      title: `${draft.title} 발행`,
      body: `
        <p class="muted" style="margin-bottom:14px">
          수신 대상 ${num(draft.recipient_count)}명에게 발행합니다. 발행 후에는 이력에 남습니다.
        </p>
        <table><tbody>
          ${draft.stats.map((s) => `
            <tr><td class="muted" style="width:120px">${esc(s.label)}</td>
                <td class="strong">${num(s.value)}${esc(s.unit)}</td></tr>`).join('')}
        </tbody></table>`,
      footer: `<button class="btn" data-close>취소</button>
               <button class="btn primary" id="do-publish">발행하기</button>`,
      onMount: (bg, close) => {
        bg.querySelector('#do-publish').onclick = async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '발행 중…';
          try {
            const res = await api.post('/api/reports/publish', {
              year: draft.year, quarter: draft.quarter,
            });
            toast(res.message);
            close();
            ctx.reload();
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = '발행하기';
          }
        };
      },
    });
  };
}

function periodOptions(draft) {
  const options = [];
  let { year, quarter } = draft;
  for (let i = 0; i < 6; i += 1) {
    options.push({ year, quarter });
    quarter -= 1;
    if (quarter === 0) { quarter = 4; year -= 1; }
  }
  return options.map((o) => `
    <option value="${o.year}-${o.quarter}" ${o.year === draft.year && o.quarter === draft.quarter ? 'selected' : ''}>
      ${o.year}년 ${o.quarter}분기
    </option>`).join('');
}

function openReceipts(receipts) {
  modal({
    title: `${receipts.year}년 기부금영수증 대상`,
    body: receipts.rows.length ? `
      <p class="muted" style="margin-bottom:12px">
        영수증 발급에 동의한 기부자 중 올해 실제 입금이 확인된 ${num(receipts.count)}명입니다.
      </p>
      <div style="max-height:380px;overflow:auto">
        <table><thead><tr><th>기부자</th><th class="num">연간 기부금</th></tr></thead>
        <tbody>${receipts.rows.map((r) => `
          <tr><td>${esc(r.donor)}</td><td class="num strong">${won(r.amount)}</td></tr>`).join('')}
        </tbody></table>
      </div>`
      : '<div class="empty">대상자가 없습니다</div>',
    footer: '<button class="btn" data-close>닫기</button>',
  });
}
