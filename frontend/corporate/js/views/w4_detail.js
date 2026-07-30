// W4 약정 상세 · 이력 — 진행 타임라인, 문서 미리보기, 증빙 팩 내려받기

import { API_BASE, api } from '../api.js';
import { badge, esc, num, toast, won } from '../ui.js';

export const TITLE = '약정 상세';
export const SCREEN = 'W4';

const TAG_TONE = {
  발송: 'muted', 열람: 'teal', 완료: 'success', 거절: 'error',
  자동: 'success', 지연: 'warning', 재서명: 'coral', 대기: 'muted',
};

export async function render(root, ctx) {
  const { documentId } = ctx.params;
  const data = await api.get(`/api/donations/${encodeURIComponent(documentId)}`);
  const doc = data.document;
  const d = doc.derived;
  const donation = doc.donation;

  const amountLine = donation.amount
    ? `${won(donation.amount)}${donation.frequency === '월' ? ' / 월' : donation.frequency === '연' ? ' / 년' : ''}`
    : '금액 없음(봉사)';

  ctx.setTitle(`${doc.donor.masked_name} · ${donation.type} ${amountLine}`);
  ctx.setActions(`
    <a class="btn" href="#/donations">목록</a>
    <button class="btn" id="refresh">실시간 상태 조회</button>
    <button class="btn coral" id="pack">증빙 팩 내려받기</button>`);
  ctx.actionsEl.querySelector('#pack').onclick = () => {
    api.download(`/api/donations/${encodeURIComponent(documentId)}/proof-pack`);
    toast('증빙 팩을 내려받습니다.');
  };
  ctx.actionsEl.querySelector('#refresh').onclick = (e) => checkLive(documentId, e.currentTarget, root);

  root.innerHTML = `
    <div class="grid grid-4">
      ${statCard('상태', d.board_status, d.tone)}
      ${statCard('약정 기간', `${d.start_date?.slice(2)} ~ ${d.end_date?.slice(2) || '—'}`)}
      ${statCard('이행률', d.fulfillment_rate == null ? '—' : `${d.fulfillment_rate}%`,
                 d.fulfillment_rate >= 90 ? 'success' : d.fulfillment_rate >= 70 ? 'warning' : 'error')}
      ${statCard('대상 사업', donation.program_name || '—')}
    </div>

    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-h"><h2>진행 이력</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px">${data.history.length}건</span></div>
        <div class="card-b">
          <div class="timeline">
            ${data.history.length ? data.history.map((h) => `
              <div class="row">
                <span class="d">${esc((h.date || '').slice(5))}</span>
                <span>${esc(h.event)}</span>
                ${badge(h.tag || '기록', TAG_TONE[h.tag] || 'muted')}
              </div>`).join('') : '<div class="empty">이력이 없습니다</div>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>약정 문서</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px">${esc(doc.title)}</span></div>
        <div class="card-b">
          <div class="doc-preview">
            <div class="ln w60"></div><div class="ln w90"></div><div class="ln w80"></div>
            <div class="ln w40"></div><div class="ln w90"></div><div class="ln w60"></div>
            <div class="sign-slot">서명 · 감사 추적</div>
          </div>

          <div class="flex" style="margin-top:14px">
            <span class="muted" style="font-size:12.5px">서명 완료 PDF에 감사 추적이 포함됩니다</span>
            <span class="spacer"></span>
            <button class="btn sm" id="open-doc">원본 열기</button>
          </div>

          <div style="margin-top:14px" class="flex-col">
            ${data.proof_pack.items.map((it) => `
              <div class="flex" style="font-size:13px">
                <span>${esc(it.label)}</span><span class="spacer"></span>
                ${badge(it.available ? '포함' : '연동 필요', it.available ? 'success' : 'muted')}
              </div>`).join('')}
          </div>

          <div id="live-status"></div>
        </div>
      </div>
    </div>

    ${doc.installments?.length ? `
    <div class="card">
      <div class="card-h"><h2>회차별 이행</h2><span class="spacer"></span>
        <a class="btn sm" href="#/fulfillment">이행 관리로</a></div>
      <div class="t-wrap">
        <table>
          <thead><tr><th style="width:64px">회차</th><th>예정일</th><th>이행일</th>
            <th class="num">금액</th><th>증빙</th><th style="width:100px">상태</th></tr></thead>
          <tbody>
            ${doc.installments.map((i) => `
              <tr>
                <td class="strong">${num(i.no)}회차</td>
                <td class="muted">${esc(i.due_date)}</td>
                <td class="muted">${esc(i.paid_date || '—')}</td>
                <td class="num">${i.amount ? won(i.amount) : '<span class="muted">—</span>'}</td>
                <td class="muted">${esc(i.proof_kind || (i.proof_id ? '영수증' : '—'))}</td>
                <td>${badge(i.status, i.status === '완료' ? 'success'
                                    : i.status === '미이행' ? 'error'
                                    : i.status === '대기' ? 'muted' : 'warning')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : ''}

    ${doc.amendment ? `
    <div class="note">
      감액 이력 · ${esc(doc.amendment.date)} ${won(doc.amendment.before_amount)} →
      ${won(doc.amendment.after_amount)} (${esc(doc.amendment.reason)}) — 부속합의서로 재서명 처리되었습니다.
    </div>` : ''}

    <div class="note">${esc(data.proof_pack.note)}${API_BASE ? ` · API: ${esc(API_BASE)}` : ''}</div>`;

  root.querySelector('#open-doc').onclick = () => openOriginal(documentId);
}

// 서명 완료 약정서 원본을 새 탭에서 연다.
// 모두싸인이 파일 대신 짧게 유효한 다운로드 URL을 줄 수도 있어 두 경우를 모두 받는다.
async function openOriginal(documentId) {
  const path = `/api/donations/${encodeURIComponent(documentId)}/file`;
  try {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error((await res.json()).detail || `${res.status}`);

    if (res.headers.get('content-type')?.includes('application/json')) {
      const { download_url: url } = await res.json();
      window.open(url, '_blank', 'noopener');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    toast(err.message, 'error');
  }
}

// 모두싸인에서 서명 상태를 다시 읽어온다(60초 캐시 우회).
async function checkLive(documentId, btn, root) {
  const box = root.querySelector('#live-status');
  btn.disabled = true;
  btn.textContent = '조회 중…';
  box.innerHTML = '';

  try {
    const s = await api.get(`/api/donations/${encodeURIComponent(documentId)}/refresh`);
    box.innerHTML = `
      <div class="note" style="margin-top:14px;border-style:solid">
        <div class="flex" style="margin-bottom:8px">
          <span class="strong" style="color:var(--ink)">현재 상태</span>
          ${badge(s.status_label, s.status === 'COMPLETED' ? 'success'
                 : s.status === 'REJECTED' ? 'error' : 'warning')}
          <span class="spacer"></span>
          <span style="font-size:11.5px">${esc(s.checked_at.replace('T', ' '))} 기준</span>
        </div>
        ${s.participants.map((p) => `
          <div class="flex" style="font-size:12.5px">
            <span>${esc(p.name || '참여자')}</span>
            <span class="spacer"></span>
            <span>${esc(p.signed_at ? `서명 ${p.signed_at.slice(0, 10)}`
                       : p.viewed_at ? `열람 ${p.viewed_at.slice(0, 10)}` : '미열람')}</span>
          </div>`).join('')}
        ${s.source === 'demo' ? '<div style="margin-top:8px">데모 데이터 기준입니다.</div>' : ''}
      </div>`;
    toast('모두싸인에서 최신 상태를 가져왔습니다.');
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '실시간 상태 조회';
  }
}

function statCard(label, value, tone) {
  return `
    <div class="card kpi">
      <div class="label">${esc(label)}</div>
      <div style="font-size:17px;font-weight:700;margin-top:8px">
        ${tone ? badge(value, tone) : esc(value)}
      </div>
    </div>`;
}
