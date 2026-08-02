// W9 후원 리포트 — 분기 집계 초안, 초안 이력, 기부금영수증 대상
//
// 아직 아무것도 발송하지 않는다. 그래서 '발행'이라는 말을 쓰지 않는다.
// 담당자가 보냈다고 오해하면 기부자에게 아무것도 못 보낸 채 넘어간다.

import { api } from '../api.js';
import { badge, esc, modal, num, toast, won } from '../ui.js';

export const TITLE = '후원 리포트';
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
    <button class="btn coral" id="publish">리포트 초안 만들기</button>`);

  ctx.actionsEl.querySelector('#period').onchange = (e) => {
    const [y, q] = e.target.value.split('-');
    ctx.navigate(`/reports?year=${y}&quarter=${q}`);
  };

  root.innerHTML = `
    <div class="report-hero">
      <h3>${esc(draft.title)} ${badge(draft.delivery.label, 'coral')}</h3>
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
        <div class="card-h"><h2>초안 이력</h2></div>
        <div class="card-b">
          ${data.history.length ? data.history.map((h) => `
            <div class="flex" style="padding:11px 0;border-bottom:1px solid var(--line-soft)">
              <div class="flex-col">
                <span class="strong">${esc(h.title)}</span>
                <span class="muted" style="font-size:12px">수신 대상 ${num(h.recipient_count)}명 ·
                  ${esc((h.created_at || '').slice(0, 10))} 작성</span>
              </div>
              <span class="spacer"></span>
              ${badge(h.status, 'warning')}
            </div>`).join('')
          : '<div class="empty">아직 만든 초안이 없습니다</div>'}

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
      <b style="color:var(--ink)">아직 기부자에게 아무것도 보내지 않습니다.</b>
      ${esc(draft.delivery.note)}
      초안을 만들면 수신 대상과 작성 시각만 이력에 남고, 상태는 <b>발송 대기</b>가 됩니다.<br>
      후원금·참여 기부자는 <b>이 분기에 실제로 들어온 돈</b>만 셉니다.
      유산기부는 사후 이행이라 여기서 빠지고, 유산 약정 화면에서 따로 관리합니다.
    </div>`;

  root.querySelector('#receipts').onclick = () => openReceipts(data.receipts);

  ctx.actionsEl.querySelector('#publish').onclick = () => {
    modal({
      title: `${draft.title} 초안 만들기`,
      body: `
        <div class="note" style="margin:0 0 14px">
          <b style="color:var(--ink)">발송하지 않습니다.</b>
          ${esc(draft.delivery.note)} 지금은 아래 숫자를 이력에 남기기만 합니다.
        </div>
        <table><tbody>
          ${draft.stats.map((s) => `
            <tr><td class="muted" style="width:120px">${esc(s.label)}</td>
                <td class="strong">${num(s.value)}${esc(s.unit)}</td></tr>`).join('')}
          <tr><td class="muted">수신 대상</td>
              <td class="strong">${num(draft.recipient_count)}명
                <span class="muted" style="font-size:12px">— 이 분기에 입금이 확인된 기부자</span></td></tr>
        </tbody></table>`,
      footer: `<button class="btn" data-close>취소</button>
               <button class="btn primary" id="do-publish">초안 만들기</button>`,
      onMount: (bg, close) => {
        bg.querySelector('#do-publish').onclick = async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          btn.textContent = '만드는 중…';
          try {
            const res = await api.post('/api/reports/draft', {
              year: draft.year, quarter: draft.quarter,
            });
            toast(res.message);
            close();
            ctx.reload();
          } catch (err) {
            toast(err.message, 'error');
            btn.disabled = false;
            btn.textContent = '초안 만들기';
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
