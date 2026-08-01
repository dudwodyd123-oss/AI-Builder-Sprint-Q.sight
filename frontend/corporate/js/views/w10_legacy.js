// W10 유산기부 관리 — 등록 건수 · 사후 수령 기록
//
// 다른 화면과 달리 금액이 주인공이 아니다. 유산기부는 기부자 사망 후에야
// 금액이 정해지므로 그때까지는 건수만 센다. "무엇을 얼마나 남길지"는
// 사람이 읽는 문장이라 숫자로 다루지 않는다.

import { api } from '../api.js';
import { badge, esc, modal, num, toast, won } from '../ui.js';

export const TITLE = '유산기부 관리';
export const SCREEN = 'W10';

const TONE = {
  '수령 완료': 'success', '등록 완료': 'teal', '서명 대기': 'warning',
  '철회': 'muted', '서명 거절': 'error', '취소됨': 'muted',
};

export async function render(root, ctx) {
  const data = await api.get('/api/legacy');
  const s = data.summary;

  root.innerHTML = `
    <div class="grid grid-4">
      ${statCard('등록', s.registered, '건', `기부자 ${num(s.donor_count)}명 · 서명 완료 기준`)}
      ${statCard('서명 대기', s.pending, '건', '아직 서명 전입니다', s.pending ? 'warning' : '')}
      ${statCard('철회', s.revoked, '건', '기부자의 정당한 권리입니다')}
      ${statCard('수령 완료', s.received_count, '건', won(s.received_amount), 'success')}
    </div>

    ${data.duplicates.length ? `
    <div class="card">
      <div class="card-h"><h2>중복일 수 있는 등록</h2><span class="spacer"></span>
        ${badge(`${data.duplicates.length}건`, 'warning')}</div>
      <div class="card-b">
        <div class="flex-col" style="gap:7px">
          ${data.duplicates.map((d) => `
            <div class="field-pill">
              <span class="strong">${esc(d.donor)}</span>
              <span class="muted">· ${esc(d.program_name || '—')} 에 ${d.count}건</span>
            </div>`).join('')}
        </div>
        <div class="note" style="margin-top:12px">
          같은 분이 같은 사업에 여러 번 등록된 것으로 보입니다. 기기를 바꿔 다시 등록하면
          생길 수 있습니다. <b>자동으로 지우지 않으니</b> 확인 후 필요한 건만 남겨주세요.
        </div>
      </div>
    </div>` : ''}

    <div class="card">
      <div class="card-h"><h2>유산기부 약정</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${data.rows.length}건</span></div>
      <div class="t-wrap">
        <table>
          <thead><tr>
            <th>기부자</th><th>대상 사업</th><th>남기는 내용</th>
            <th class="num">수령 금액</th><th style="width:100px">상태</th><th style="width:150px"></th>
          </tr></thead>
          <tbody id="rows">
            ${data.rows.length ? data.rows.map(rowHtml).join('')
              : '<tr><td colspan="6"><div class="empty">등록된 유산기부 약정이 없습니다</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>

    <div class="note">${esc(data.note)}
      실제 입금은 기부자 사망 후이므로, 그때 이 화면에서 금액을 채워 넣습니다.
      <b>남기는 내용은 사람이 읽는 문장이라 금액으로 환산하지 않습니다.</b>
    </div>

    <div class="note">
      개인용 웹에서 녹음유언까지 마쳤는지는 <b>여기서 알 수 없습니다.</b>
      서명만 한 분과 녹음까지 마친 분은 법적으로 다른 상태라, 필요하면
      개인용 웹이 녹음 완료 사실만 알려주는 연동을 따로 붙여야 합니다.
    </div>`;

  root.querySelector('#rows').addEventListener('click', (e) => {
    const row = (id) => data.rows.find((r) => r.document_id === id);

    const detail = e.target.closest('[data-detail]');
    if (detail) return openDetail(row(detail.dataset.detail), ctx);

    const receipt = e.target.closest('[data-receipt]');
    if (receipt) return openReceipt(row(receipt.dataset.receipt), ctx);

    const revoke = e.target.closest('[data-revoke]');
    if (revoke) return openRevoke(row(revoke.dataset.revoke), ctx);
  });
}

function rowHtml(r) {
  const revoked = r.status === '철회';
  return `
    <tr${revoked ? ' style="opacity:.6"' : ''}>
      <td class="strong">${esc(r.donor)}
        <div class="muted" style="font-size:12px">${esc(r.contact || '—')}</div></td>
      <td class="muted">${esc(r.program_name || '—')}
        ${r.program_archived ? badge('보관된 사업', 'muted') : ''}</td>
      <td>${r.bequest_detail
            ? `${esc(r.bequest_detail)}${r.bequest_type
                ? `<div class="muted" style="font-size:12px">${esc(r.bequest_type)}</div>` : ''}`
            : '<span class="muted">—</span>'}</td>
      <td class="num">${r.received_amount ? won(r.received_amount) : '<span class="muted">—</span>'}</td>
      <td>${badge(r.status, TONE[r.status] || 'muted')}</td>
      <td class="right nowrap">
        <button class="btn sm ghost" data-detail="${esc(r.document_id)}">상세</button>
        <button class="btn sm" data-receipt="${esc(r.document_id)}">수령 기록</button>
      </td>
    </tr>`;
}

function openDetail(r, ctx) {
  modal({
    title: `${r.donor} · 유산기부`,
    body: `
      <table style="margin-bottom:14px"><tbody>
        <tr><td class="muted" style="width:100px">대상 사업</td>
            <td>${esc(r.program_name || '—')}
              ${r.program_archived ? badge('보관된 사업', 'muted') : ''}</td></tr>
        <tr><td class="muted">남기는 방식</td><td>${esc(r.bequest_type || '—')}</td></tr>
        <tr><td class="muted">남기는 내용</td><td class="strong">${esc(r.bequest_detail || '—')}</td></tr>
        <tr><td class="muted">용도 지정</td><td>${esc(r.purpose_note || '—')}</td></tr>
        <tr><td class="muted">조건</td><td>${esc(r.condition || '—')}</td></tr>
        <tr><td class="muted">유언집행자</td><td>${esc(r.executor || '—')}</td></tr>
        <tr><td class="muted">연락처</td><td>${esc(r.contact || '—')}</td></tr>
        <tr><td class="muted">등록일</td><td class="muted">${esc(r.requested_at || '—')}</td></tr>
        <tr><td class="muted">서명 완료</td><td class="muted">${esc(r.signed_at || '아직 서명 전')}</td></tr>
        ${r.received_amount ? `
        <tr><td class="muted">수령</td>
            <td class="strong">${won(r.received_amount)} · ${esc(r.received_date || '')}
              ${r.receipt_no ? `<div class="muted" style="font-size:12px">영수증 ${esc(r.receipt_no)}</div>` : ''}</td></tr>` : ''}
        ${r.revoked_at ? `
        <tr><td class="muted">철회</td>
            <td>${esc(r.revoked_at.replace('T', ' '))}
              ${r.revoke_reason ? `<div class="muted" style="font-size:12px">${esc(r.revoke_reason)}</div>` : ''}</td></tr>` : ''}
      </tbody></table>
      <div class="note" style="margin:0">
        기부자가 남긴 유언 내용(녹음·대본)은 기관이 보관하지 않습니다.
        생전에 기관이 유언 내용을 들여다보면 부당한 영향력 행사 의혹의 빌미가 됩니다.
      </div>`,
    footer: `
      <a class="btn" href="#/donations/${encodeURIComponent(r.document_id)}">약정 문서 보기</a>
      <span class="spacer"></span>
      <button class="btn" data-close>닫기</button>
      <button class="btn ${r.revoked_at ? '' : 'coral'}" id="revoke">
        ${r.revoked_at ? '철회 표시 해제' : '철회로 표시'}</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#revoke').onclick = () => { close(); openRevoke(r, ctx); };
    },
  });
}

function openReceipt(r, ctx) {
  if (r.status === '서명 대기') {
    return toast('아직 서명 전인 약정입니다. 서명이 끝난 뒤 기록해주세요.', 'error');
  }

  modal({
    title: `${r.donor} · 수령 기록`,
    body: `
      <div class="note" style="margin:0 0 14px">
        약정 내용: <b>${esc(r.bequest_detail || '—')}</b><br>
        비율이나 잔여재산으로 남긴 경우 실제 금액은 상속 절차가 끝나야 정해집니다.
      </div>
      <div class="field">
        <label for="rc-amount">실제 수령 금액</label>
        <input id="rc-amount" type="number" min="0" step="10000"
               value="${r.received_amount ?? ''}" placeholder="예: 50000000">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="rc-date">수령일</label>
          <input id="rc-date" type="date" value="${esc(r.received_date || '')}">
        </div>
        <div class="field">
          <label for="rc-no">기부금영수증 번호</label>
          <input id="rc-no" value="${esc(r.receipt_no || '')}" placeholder="선택">
        </div>
      </div>
      <div class="field">
        <label for="rc-note">메모</label>
        <input id="rc-note" value="${esc(r.note || '')}"
               placeholder="예: 유언집행자 통해 수령 · 영수증은 상속인 명의">
      </div>
      <div class="note" style="margin-top:4px">
        사망 후 유증은 유언 집행이라, 기부금영수증을 받는 쪽이 기부자 본인이 아니라
        상속인이나 유산재단일 수 있습니다. 메모에 남겨두세요.
      </div>`,
    footer: `<button class="btn" data-close>취소</button>
             <button class="btn primary" id="save">기록</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#save').onclick = async (e) => {
        const amount = Number(bg.querySelector('#rc-amount').value);
        if (!amount || amount <= 0) return toast('수령 금액을 입력해주세요.', 'error');

        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '기록 중…';
        try {
          const res = await api.post(
            `/api/legacy/${encodeURIComponent(r.document_id)}/receipt`, {
              amount,
              received_date: bg.querySelector('#rc-date').value || null,
              receipt_no: bg.querySelector('#rc-no').value,
              note: bg.querySelector('#rc-note').value,
            });
          toast(res.message);
          close();
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '기록';
        }
      };
    },
  });
}

function openRevoke(r, ctx) {
  const on = !r.revoked_at;
  modal({
    title: `${r.donor} · ${on ? '철회 표시' : '철회 표시 해제'}`,
    body: on
      ? `<div class="note" style="margin:0 0 14px">
           유언은 생전에 언제든 철회할 수 있습니다. <b>기부자의 정당한 권리이므로</b>
           실패로 기록하지 않고, 건수에서만 빼둡니다. 약정 문서는 그대로 남습니다.
         </div>
         <div class="field">
           <label for="rv-reason">사유 (선택)</label>
           <input id="rv-reason" placeholder="예: 본인 요청 · 유언 재작성">
         </div>`
      : '<p style="margin:0">철회 표시를 해제하면 다시 등록 건수에 포함됩니다.</p>',
    footer: `<button class="btn" data-close>취소</button>
             <button class="btn ${on ? 'coral' : 'primary'}" id="ok">
               ${on ? '철회로 표시' : '표시 해제'}</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#ok').onclick = async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const res = await api.post(
            `/api/legacy/${encodeURIComponent(r.document_id)}/revoke`,
            { revoked: on, reason: bg.querySelector('#rv-reason')?.value || '' });
          toast(res.message);
          close();
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
        }
      };
    },
  });
}

function statCard(label, value, unit, note, tone = '') {
  return `
    <div class="card kpi">
      <div class="label">${esc(label)}</div>
      <div class="value">${num(value)}<small>${esc(unit)}</small></div>
      <div class="delta ${tone === 'success' ? 'up' : tone === 'warning' ? 'down' : ''}">
        <span class="n">${esc(note || '')}</span></div>
    </div>`;
}
