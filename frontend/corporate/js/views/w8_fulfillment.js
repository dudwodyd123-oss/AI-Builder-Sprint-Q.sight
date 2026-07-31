// W8 이행 관리 · 증빙 매칭 — 증빙 업로드 → 금액·날짜 추출 → 회차 자동 매칭

import { api } from '../api.js';
import { badge, esc, modal, num, toast, won } from '../ui.js';

export const TITLE = '이행 관리';
export const SCREEN = 'W8';

export async function render(root, ctx) {
  const data = await api.get('/api/fulfillment');
  const s = data.summary;

  ctx.setActions(`
    <span class="chip" style="cursor:default">${esc(s.month.replace('-', '.'))}</span>
    <button class="btn coral" id="upload">증빙 올리기</button>
    <input type="file" id="proof" accept=".pdf,.png,.jpg,.jpeg" hidden>`);

  root.innerHTML = `
    <div class="grid grid-4">
      ${statCard('이번 달 예정', s.scheduled, '건', '')}
      ${statCard('확인 완료', s.confirmed, '건', `자동 매칭 ${s.auto_matched}`, 'success')}
      ${statCard('지연', s.delayed, '건', s.longest_delay_days ? `최장 ${s.longest_delay_days}일` : '', 'error')}
      ${statCard('처리율', s.scheduled ? Math.round((s.confirmed / s.scheduled) * 100) : 0, '%', '이번 달 기준')}
    </div>

    <div class="card">
      <div class="card-h"><h2>회차별 이행</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${data.rows.length}건</span></div>
      <div class="t-wrap">
        <table>
          <thead><tr>
            <th>기부자 · 회차</th><th>대상 사업</th><th>예정일</th>
            <th class="num">금액</th><th>증빙</th><th style="width:110px">상태</th><th style="width:80px"></th>
          </tr></thead>
          <tbody id="rows">
            ${data.rows.length ? data.rows.map(rowHtml).join('')
              : '<tr><td colspan="7"><div class="empty">표시할 회차가 없습니다</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="note">
      업로드한 증빙에서 금액·날짜를 읽어 회차에 자동으로 붙입니다.
      후보가 여러 개거나 맞는 회차를 찾지 못하면, 이행 대기 회차 목록에서 직접 고릅니다.
    </div>`;

  root.querySelector('#rows').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-doc]');
    if (btn) ctx.navigate(`/donations/${btn.dataset.doc}`);
  });

  const input = ctx.actionsEl.querySelector('#proof');
  ctx.actionsEl.querySelector('#upload').onclick = () => input.click();
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    toast(`${file.name} 읽는 중…`);
    try {
      const res = await api.upload('/api/fulfillment/upload', file);
      openMatchModal(res, ctx);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      input.value = '';
    }
  };
}

function statCard(label, value, unit, note, tone = '') {
  return `
    <div class="card kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${num(value)}<small>${esc(unit)}</small></div>
      <div class="delta ${tone === 'success' ? 'up' : tone === 'error' ? 'down' : ''}">
        <span class="n">${esc(note || '')}</span></div>
    </div>`;
}

function rowHtml(r) {
  return `
    <tr>
      <td class="strong">${esc(r.label)}</td>
      <td class="muted">${esc(r.program_name || '—')}</td>
      <td class="muted nowrap">${esc(r.due_date)}</td>
      <td class="num">${r.amount ? won(r.amount) : '<span class="muted">—</span>'}</td>
      <td class="muted">${esc(r.proof_kind || '—')}</td>
      <td>${badge(r.status, r.tone)}</td>
      <td class="right"><button class="btn sm ghost" data-doc="${esc(r.document_id)}">상세</button></td>
    </tr>`;
}

function candidateHtml(c, i, checked) {
  return `
    <label class="field-pill" style="cursor:pointer"
           data-search="${esc(`${c.donor} ${c.program_name || ''}`)}">
      <input type="radio" name="cand" value="${i}" ${checked ? 'checked' : ''}>
      <span>${esc(c.donor)} · ${c.no}회차</span>
      <span class="t">예정 ${esc(c.due_date)}
        · ${c.amount ? won(c.amount) : '금액 없음'}${c.status ? ` · ${esc(c.status)}` : ''}</span>
    </label>`;
}

function openMatchModal(res, ctx) {
  const ex = res.extracted || {};
  const candidates = res.candidates || [];
  const matched = res.matched;
  // 금액·날짜가 맞는 후보가 없으면 이행 대기 회차 전체를 놓고 직접 고른다.
  const manual = !candidates.length;
  const options = manual ? (res.open_installments || []) : candidates;

  const body = `
    <div class="flex" style="margin-bottom:14px">
      <span class="strong">${esc(res.filename)}</span>
      <span class="spacer"></span>
      ${res.fallback ? badge('규칙 기반 추출', 'warning') : badge('Upstage 추출', 'teal')}
    </div>

    <table style="margin-bottom:18px">
      <tbody>
        <tr><td class="muted" style="width:110px">금액</td>
            <td class="strong">${ex.amount ? won(ex.amount) : '읽지 못함'}</td></tr>
        <tr><td class="muted">입금일</td><td>${esc(ex.paid_date || '읽지 못함')}</td></tr>
        <tr><td class="muted">입금자</td><td>${esc(ex.payer_name || '—')}</td></tr>
        <tr><td class="muted">문서 종류</td><td>${esc(ex.document_kind || '—')}</td></tr>
      </tbody>
    </table>

    <div class="flex" style="margin-bottom:8px">
      <span class="strong">${manual ? '이행 대기 회차' : '매칭 후보'}</span>
      <span class="spacer"></span>
      <span class="muted" style="font-size:12px">${options.length}건</span>
    </div>
    ${manual && options.length ? `
      <div class="note" style="margin:0 0 10px">
        금액·날짜가 맞는 회차를 찾지 못했습니다. 아래 목록에서 직접 골라주세요.</div>
      <input id="cand-q" placeholder="기부자 · 사업 검색"
             style="border:1px solid var(--line);border-radius:6px;padding:7px 10px;width:100%;margin-bottom:8px">`
    : ''}
    ${options.length ? `
      <div class="flex-col" id="cand-list" style="gap:7px;max-height:260px;overflow:auto">
        ${options.map((c, i) => candidateHtml(c, i, !manual && (
          matched ? c.document_id === matched.document_id && c.no === matched.no : i === 0
        ))).join('')}
      </div>`
    : '<div class="empty">이행 대기 중인 회차가 없습니다. 약정 상세에서 확인해주세요.</div>'}

    <div class="note" style="margin-top:14px">${esc(res.message)}</div>`;

  modal({
    title: '증빙 매칭',
    body,
    footer: `<button class="btn" data-close>취소</button>
             <button class="btn primary" id="confirm" ${options.length ? '' : 'disabled'}>이행 확정</button>`,
    onMount: (bg, close) => {
      const q = bg.querySelector('#cand-q');
      if (q) {
        q.oninput = () => {
          const needle = q.value.trim();
          bg.querySelectorAll('#cand-list label').forEach((el) => {
            el.hidden = Boolean(needle) && !el.dataset.search.includes(needle);
          });
        };
      }

      bg.querySelector('#confirm')?.addEventListener('click', async (e) => {
        const picked = bg.querySelector('input[name=cand]:checked');
        if (!picked) return toast('회차를 선택해주세요.', 'error');
        const c = options[Number(picked.value)];
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '기록 중…';
        try {
          const out = await api.post('/api/fulfillment/confirm', {
            document_id: c.document_id,
            no: c.no,
            paid_date: ex.paid_date || c.due_date,
            proof: {
              document_kind: ex.document_kind || '영수증',
              matched_by: res.auto ? 'auto' : 'manual',
            },
          });
          toast(out.message);
          close();
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '이행 확정';
        }
      });
    },
  });
}
