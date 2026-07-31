// W2 기부 현황 · 일괄 리마인드 — 상태 필터, 다건 선택, 미서명자 일괄 재발송

import { api } from '../api.js';
import { badge, esc, toast, won } from '../ui.js';

export const TITLE = '기부 현황';
export const SCREEN = 'W2';

const FILTERS = [
  { key: 'all', label: '전체' },
  { key: 'pending', label: '서명 대기' },
  { key: 'delayed', label: '이행 지연' },
  { key: 'normal', label: '정상' },
];

export async function render(root, ctx) {
  const status = ctx.search.get('status') || 'all';
  const q = ctx.search.get('q') || '';
  const data = await api.get(`/api/donations?status=${encodeURIComponent(status)}&q=${encodeURIComponent(q)}`);
  const selected = new Set();

  ctx.setActions(`
    <input id="search" placeholder="기부자 · 사업 검색" value="${esc(q)}"
           style="border:1px solid var(--line);border-radius:6px;padding:6px 10px;width:180px">
    ${FILTERS.map((f) => `
      <a class="chip ${status === f.key ? 'on' : ''}" href="#/donations?status=${f.key}${q ? `&q=${encodeURIComponent(q)}` : ''}">
        ${f.label} ${data.counts[f.key] ?? 0}
      </a>`).join('')}
    <a class="btn" href="#/donations/at-risk">관리 필요</a>`);

  const search = ctx.actionsEl.querySelector('#search');
  search.onkeydown = (e) => {
    if (e.key === 'Enter') ctx.navigate(`/donations?status=${status}&q=${encodeURIComponent(search.value)}`);
  };

  root.innerHTML = `
    <div class="card">
      <div class="card-b" id="selbar-slot"></div>
      <div class="t-wrap">
        <table>
          <thead>
            <tr>
              <th style="width:34px"><input type="checkbox" id="check-all" aria-label="전체 선택"></th>
              <th>기부자</th><th>대상 사업</th><th>유형</th>
              <th class="num">금액</th><th>다음 이행</th><th style="width:110px">상태</th>
            </tr>
          </thead>
          <tbody id="rows">
            ${data.rows.length ? data.rows.map(rowHtml).join('')
              : '<tr><td colspan="7"><div class="empty">조건에 맞는 약정이 없습니다</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
    <div class="note">
      ${esc(data.hint)}${data.reminder_note ? ` · ${esc(data.reminder_note)}` : ''}
    </div>`;

  const slot = root.querySelector('#selbar-slot');
  const tbody = root.querySelector('#rows');
  const checkAll = root.querySelector('#check-all');

  function paintSelbar() {
    if (!selected.size) {
      slot.innerHTML = `<div class="note" style="margin:0">
        서명하지 않은 기부자를 선택하면 한 번에 리마인드를 보낼 수 있습니다.</div>`;
      return;
    }
    const pendingCount = [...selected].filter(
      (id) => data.rows.find((r) => r.id === id)?.is_pending_signature).length;
    slot.innerHTML = `
      <div class="selbar">
        <span class="cnt">${selected.size}건 선택됨</span>
        <span class="muted">서명하지 않은 기부자 ${pendingCount}명에게 한 번에 보냅니다</span>
        <span class="spacer"></span>
        <button class="btn" id="clear">선택 해제</button>
        <button class="btn primary" id="remind" ${pendingCount ? '' : 'disabled'}>서명 리마인드 보내기</button>
      </div>`;
    slot.querySelector('#clear').onclick = () => {
      selected.clear();
      tbody.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = false; });
      checkAll.checked = false;
      paintSelbar();
    };
    slot.querySelector('#remind').onclick = () => sendReminders();
  }

  async function sendReminders() {
    const ids = [...selected].filter(
      (id) => data.rows.find((r) => r.id === id)?.is_pending_signature);
    const btn = slot.querySelector('#remind');
    btn.disabled = true;
    btn.textContent = '보내는 중…';
    try {
      const res = await api.post('/api/donations/remind', { document_ids: ids });
      toast(res.message);
      ctx.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '서명 리마인드 보내기';
    }
  }

  tbody.addEventListener('change', (e) => {
    const cb = e.target.closest('input[type=checkbox]');
    if (!cb) return;
    cb.checked ? selected.add(cb.dataset.id) : selected.delete(cb.dataset.id);
    paintSelbar();
  });

  tbody.addEventListener('click', (e) => {
    if (e.target.closest('input')) return;
    const tr = e.target.closest('tr[data-id]');
    if (tr) ctx.navigate(`/donations/${tr.dataset.id}`);
  });

  checkAll.onchange = () => {
    selected.clear();
    tbody.querySelectorAll('input[type=checkbox]').forEach((c) => {
      c.checked = checkAll.checked;
      if (checkAll.checked) selected.add(c.dataset.id);
    });
    paintSelbar();
  };

  paintSelbar();
}

function rowHtml(r) {
  const amount = r.amount ? `${won(r.amount)}${r.frequency === '월' ? ' / 월' : ''}` : '—';
  return `
    <tr data-id="${esc(r.id)}" class="clickable">
      <td><input type="checkbox" data-id="${esc(r.id)}" aria-label="${esc(r.donor)} 선택"></td>
      <td class="strong">${esc(r.donor)}<div class="muted" style="font-size:12px">${esc(r.title)}</div></td>
      <td class="muted">${esc(r.program_name || '—')}</td>
      <td>${esc(r.type)}</td>
      <td class="num">${amount}</td>
      <td class="muted nowrap">${esc(r.next_due || '—')}</td>
      <td>${badge(r.status, r.tone)}</td>
    </tr>`;
}
