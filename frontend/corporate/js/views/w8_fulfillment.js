// W8 이행 관리 — 모금 사업 → 기부자 → 회차 3단 드릴다운
//
// 회차를 한 줄로 늘어놓으면 사업이 여러 개일 때 뒤섞여서 "이 사업이 어떻게
// 돌아가나"를 볼 수 없다. 대신 카드에 지연 건수를 얹어, 사업을 하나씩 열어보지
// 않고도 손댈 곳이 보이게 했다. 월말에 밀린 것만 훑는 길은 '지연 전체 보기'로 둔다.

import { api } from '../api.js';
import { badge, esc, modal, num, toast, won } from '../ui.js';

export const TITLE = '이행 관리';
export const SCREEN = 'W8';

export async function render(root, ctx) {
  const programId = ctx.search.get('program');
  const documentId = ctx.search.get('agreement');

  if (documentId) return renderAgreement(root, ctx, documentId);
  if (programId) return renderProgram(root, ctx, programId);
  if (ctx.search.get('view') === 'overdue') return renderOverdue(root, ctx);
  return renderPrograms(root, ctx);
}

// ── 1단계: 모금 사업 카드 ──────────────────────────────────
async function renderPrograms(root, ctx) {
  const data = await api.get('/api/fulfillment');
  const s = data.summary;

  ctx.setTitle('이행 관리');
  ctx.setActions(`
    <span class="chip" style="cursor:default">${esc(s.month.replace('-', '.'))}</span>
    ${s.delayed ? `<a class="btn" href="#/fulfillment?view=overdue">지연 전체 보기 ${s.delayed}</a>` : ''}
    <button class="btn coral" id="upload">증빙 올리기</button>
    <input type="file" id="proof" accept=".pdf,.png,.jpg,.jpeg" multiple hidden>`);

  root.innerHTML = `
    <div class="grid grid-4">
      ${statCard('이번 달 예정', s.scheduled, '건', '')}
      ${statCard('확인 완료', s.confirmed, '건', `자동 매칭 ${s.auto_matched}`, 'success')}
      ${statCard('지연', s.delayed, '건', s.longest_delay_days ? `최장 ${s.longest_delay_days}일` : '', 'error')}
      ${statCard('처리율', s.scheduled ? Math.round((s.confirmed / s.scheduled) * 100) : 0, '%', '이번 달 기준')}
    </div>

    <div class="card">
      <div class="card-h"><h2>모금 사업</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">사업을 눌러 기부자별 이행을 확인하세요</span></div>
      <div class="card-b">
        ${data.programs.length ? `<div class="grid grid-3" style="gap:14px">
          ${data.programs.map(programCard).join('')}
        </div>` : '<div class="empty">이행을 따라갈 약정이 아직 없습니다</div>'}
      </div>
    </div>

    <div class="note">
      영수증은 여러 장을 한 번에 올릴 수 있습니다. 자동 매칭 결과를 확인한 뒤 확정합니다.
    </div>`;

  root.addEventListener('click', (e) => {
    const card = e.target.closest('[data-program]');
    if (card) ctx.navigate(`/fulfillment?program=${encodeURIComponent(card.dataset.program)}`);
  });

  bindUpload(ctx);
}

function programCard(p) {
  const tone = p.overdue ? 'error' : p.scheduled ? 'warning' : 'success';
  return `
    <div class="card" data-program="${esc(p.program_id)}"
         style="cursor:pointer;box-shadow:none;${p.archived ? 'opacity:.6' : ''}">
      <div class="card-b">
        <div class="flex" style="margin-bottom:10px">
          <span class="strong">${esc(p.name)}</span>
          ${p.archived ? badge('보관됨', 'muted') : ''}
          <span class="spacer"></span>
          ${p.overdue ? badge(`지연 ${p.overdue}`, 'error') : badge('정상', 'success')}
        </div>
        <div class="flex" style="gap:18px;font-size:12.5px">
          <span><span class="muted">기부자</span> <b>${num(p.donor_count)}</b></span>
          <span><span class="muted">이번 달</span> <b>${num(p.scheduled)}</b></span>
          <span><span class="muted">확인</span> <b>${num(p.confirmed)}</b></span>
        </div>
        ${p.overdue ? `<div class="muted" style="font-size:11.5px;margin-top:8px;color:var(--error)">
          최장 ${p.longest_delay_days}일 지연</div>` : ''}
      </div>
      <span class="badge ${tone}" style="display:none"></span>
    </div>`;
}

// ── 2단계: 사업별 기부자 ───────────────────────────────────
async function renderProgram(root, ctx, programId) {
  const data = await api.get(`/api/fulfillment/programs/${encodeURIComponent(programId)}`);

  ctx.setTitle(`이행 관리 · ${data.program.name}`);
  ctx.setActions(`
    <a class="btn" href="#/fulfillment">사업 목록</a>
    <button class="btn coral" id="upload">증빙 올리기</button>
    <input type="file" id="proof" accept=".pdf,.png,.jpg,.jpeg" multiple hidden>`);

  root.innerHTML = `
    <div class="card">
      <div class="card-h"><h2>${esc(data.program.name)} · 참여 기부자</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${data.rows.length}명</span></div>
      <div class="t-wrap">
        <table>
          <thead><tr>
            <th>기부자</th><th>유형</th><th class="num">금액</th>
            <th>이행</th><th>다음 예정</th><th style="width:110px">상태</th><th style="width:70px"></th>
          </tr></thead>
          <tbody>
            ${data.rows.length ? data.rows.map(donorRow).join('')
              : '<tr><td colspan="7"><div class="empty">참여한 기부자가 없습니다</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  root.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-doc]');
    if (tr) ctx.navigate(`/fulfillment?agreement=${encodeURIComponent(tr.dataset.doc)}`);
  });

  bindUpload(ctx);
}

function donorRow(r) {
  return `
    <tr data-doc="${esc(r.document_id)}" class="clickable">
      <td class="strong">${esc(r.donor)}</td>
      <td class="muted">${esc(r.type)}</td>
      <td class="num">${r.amount ? won(r.amount) : '<span class="muted">—</span>'}</td>
      <td class="muted">${r.installments_paid} / ${r.installments_total}회차</td>
      <td class="muted nowrap">${esc(r.next_due || '—')}</td>
      <td>${r.overdue ? badge(`지연 ${r.overdue}건`, 'error') : badge('정상', 'success')}</td>
      <td class="right"><span class="muted">›</span></td>
    </tr>`;
}

// ── 3단계: 기부자별 회차 ───────────────────────────────────
async function renderAgreement(root, ctx, documentId) {
  const data = await api.get(`/api/fulfillment/agreements/${encodeURIComponent(documentId)}`);

  ctx.setTitle(`${data.donor} · 회차별 이행`);
  ctx.setActions(`
    <a class="btn" href="#/fulfillment?program=${encodeURIComponent(data.program_id || '')}">기부자 목록</a>
    <a class="btn" href="#/donations/${encodeURIComponent(documentId)}">약정 상세</a>
    <button class="btn coral" id="upload">증빙 올리기</button>
    <input type="file" id="proof" accept=".pdf,.png,.jpg,.jpeg" multiple hidden>`);

  root.innerHTML = `
    <div class="card">
      <div class="card-h">
        <h2>${esc(data.donor)}</h2>
        <span class="muted" style="font-size:12.5px">
          ${esc(data.program_name || '')} · ${esc(data.type)}
          ${data.amount ? ` · ${won(data.amount)}${data.frequency === '월' ? ' / 월' : ''}` : ''}</span>
      </div>
      <div class="t-wrap">
        <table>
          <thead><tr><th style="width:70px">회차</th><th>예정일</th><th>이행일</th>
            <th class="num">금액</th><th>증빙</th><th style="width:110px">상태</th></tr></thead>
          <tbody>
            ${data.rows.map((i) => `
              <tr>
                <td class="strong">${i.no}회차</td>
                <td class="muted nowrap">${esc(i.due_date)}</td>
                <td class="muted nowrap">${esc(i.paid_date || '—')}</td>
                <td class="num">${i.amount ? won(i.amount) : '<span class="muted">—</span>'}</td>
                <td class="muted">${esc(i.proof_kind || '—')}</td>
                <td>${badge(i.status, i.tone)}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  bindUpload(ctx);
}

// ── 지연 전체 보기 ─────────────────────────────────────────
async function renderOverdue(root, ctx) {
  const data = await api.get('/api/fulfillment/overdue');

  ctx.setTitle('지연된 회차');
  ctx.setActions(`
    <a class="btn" href="#/fulfillment">사업 목록</a>
    <button class="btn coral" id="upload">증빙 올리기</button>
    <input type="file" id="proof" accept=".pdf,.png,.jpg,.jpeg" multiple hidden>`);

  root.innerHTML = `
    <div class="card">
      <div class="card-h"><h2>지연된 회차</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${data.rows.length}건 · 오래된 순</span></div>
      <div class="t-wrap">
        <table>
          <thead><tr><th>기부자</th><th>대상 사업</th><th>회차</th><th>예정일</th>
            <th class="num">금액</th><th style="width:110px">지연</th></tr></thead>
          <tbody>
            ${data.rows.length ? data.rows.map((r) => `
              <tr data-doc="${esc(r.document_id)}" class="clickable">
                <td class="strong">${esc(r.donor)}</td>
                <td class="muted">${esc(r.program_name || '—')}</td>
                <td class="muted">${r.no}회차</td>
                <td class="muted nowrap">${esc(r.due_date)}</td>
                <td class="num">${r.amount ? won(r.amount) : '<span class="muted">—</span>'}</td>
                <td>${badge(`${r.delay_days}일`, 'error')}</td>
              </tr>`).join('')
              : '<tr><td colspan="6"><div class="empty">밀린 회차가 없습니다</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  root.addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-doc]');
    if (tr) ctx.navigate(`/fulfillment?agreement=${encodeURIComponent(tr.dataset.doc)}`);
  });

  bindUpload(ctx);
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

// ── 증빙 업로드 (여러 장) ──────────────────────────────────
function bindUpload(ctx) {
  const input = ctx.actionsEl.querySelector('#proof');
  const btn = ctx.actionsEl.querySelector('#upload');
  if (!input || !btn) return;

  btn.onclick = () => input.click();
  input.onchange = async () => {
    const files = [...input.files];
    if (!files.length) return;

    btn.disabled = true;
    btn.textContent = `읽는 중… (${files.length}장)`;
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append('files', f));
      const res = await fetch('/api/fulfillment/upload-batch', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json()).detail || `${res.status}`);
      openBatchModal(await res.json(), ctx);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      input.value = '';
      btn.disabled = false;
      btn.textContent = '증빙 올리기';
    }
  };
}

const STATE = {
  auto: { label: '자동 매칭', tone: 'success' },
  ambiguous: { label: '후보 여럿', tone: 'warning' },
  none: { label: '못 찾음', tone: 'error' },
  error: { label: '읽기 실패', tone: 'error' },
};

function openBatchModal(res, ctx) {
  const rows = res.results.map((r, i) => {
    const meta = STATE[r.state] || STATE.none;
    const target = r.matched || (r.candidates || [])[0];
    const options = r.state === 'ambiguous' ? r.candidates
                  : r.state === 'none' ? (res.open_installments || []) : [];

    return `
      <tr data-i="${i}">
        <td><input type="checkbox" class="pick" ${r.state === 'auto' ? 'checked' : ''}
                   ${target || options.length ? '' : 'disabled'}></td>
        <td class="strong" style="font-size:12.5px">${esc(r.filename)}</td>
        <td class="muted nowrap" style="font-size:12px">
          ${r.extracted?.amount ? won(r.extracted.amount) : '금액 ?'}<br>
          ${esc(r.extracted?.paid_date || '날짜 ?')}
        </td>
        <td>
          ${options.length ? `
            <select class="pick-target" style="border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:12px;width:100%">
              ${options.map((c) => `<option value="${esc(c.document_id)}|${c.no}">
                ${esc(c.donor)} · ${c.no}회차 · ${esc(c.due_date)}</option>`).join('')}
            </select>`
          : target ? `<span style="font-size:12.5px">${esc(target.donor)} · ${target.no}회차
              <span class="muted">(${esc(target.due_date)})</span></span>`
          : `<span class="muted" style="font-size:12.5px">${esc(r.message || '매칭할 회차를 찾지 못했습니다')}</span>`}
        </td>
        <td>${badge(meta.label, meta.tone)}</td>
      </tr>`;
  }).join('');

  modal({
    title: `증빙 ${res.results.length}장 확인`,
    body: `
      <div class="flex" style="margin-bottom:12px;flex-wrap:wrap">
        ${badge(`자동 매칭 ${res.counts.auto}`, 'success')}
        ${res.counts.ambiguous ? badge(`후보 여럿 ${res.counts.ambiguous}`, 'warning') : ''}
        ${res.counts.none ? badge(`못 찾음 ${res.counts.none}`, 'error') : ''}
        ${res.counts.error ? badge(`읽기 실패 ${res.counts.error}`, 'error') : ''}
      </div>
      <p class="muted" style="font-size:12.5px;margin-bottom:12px">
        체크한 항목만 확정됩니다. 후보가 여럿이면 직접 골라주세요.
      </p>
      <div style="max-height:380px;overflow:auto">
        <table>
          <thead><tr>
            <th style="width:32px"><input type="checkbox" id="pick-all"></th>
            <th>파일</th><th style="width:110px">읽은 값</th><th>붙일 회차</th><th style="width:90px">상태</th>
          </tr></thead>
          <tbody id="batch-rows">${rows}</tbody>
        </table>
      </div>`,
    footer: `<button class="btn" data-close>취소</button>
             <button class="btn primary" id="confirm-batch">선택 항목 확정</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#pick-all').onchange = (e) => {
        bg.querySelectorAll('.pick:not(:disabled)').forEach((c) => { c.checked = e.target.checked; });
      };

      bg.querySelector('#confirm-batch').onclick = async (e) => {
        const items = [];
        bg.querySelectorAll('#batch-rows tr').forEach((tr) => {
          if (!tr.querySelector('.pick')?.checked) return;
          const r = res.results[Number(tr.dataset.i)];
          const sel = tr.querySelector('.pick-target');
          let documentId; let no;
          if (sel) { [documentId, no] = sel.value.split('|'); } else if (r.matched) {
            documentId = r.matched.document_id; no = r.matched.no;
          } else return;

          items.push({
            document_id: documentId,
            no: Number(no),
            paid_date: r.extracted?.paid_date || new Date().toISOString().slice(0, 10),
            proof: { document_kind: r.extracted?.document_kind || '영수증',
                     matched_by: r.state === 'auto' ? 'auto' : 'manual' },
          });
        });

        if (!items.length) return toast('확정할 항목을 선택해주세요.', 'error');

        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '기록 중…';
        try {
          const out = await api.post('/api/fulfillment/confirm-batch', { items });
          toast(out.message, out.failed.length ? 'error' : '');
          out.failed.forEach((f) => toast(`${f.no}회차: ${f.error}`, 'error'));
          close();
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '선택 항목 확정';
        }
      };
    },
  });
}
