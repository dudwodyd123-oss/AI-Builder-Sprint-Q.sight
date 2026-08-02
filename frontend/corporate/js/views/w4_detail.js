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

  // 유산기부는 사후에 정해지므로 금액이 비어 있는 게 정상이다. 봉사와 이유가 다르다.
  const amountLine = donation.amount
    ? `${won(donation.amount)}${donation.frequency === '월' ? ' / 월' : donation.frequency === '연' ? ' / 년' : ''}`
    : d.is_legacy ? '금액은 사후 확정' : '금액 없음(봉사)';

  // 서명이 끝나야 약정서·감사 추적 PDF가 생긴다. 없으면 버튼을 눌러도 오류만 나므로 잠근다.
  const ready = (key) => (data.proof_pack.items.find((it) => it.key === key) || {}).available;
  const agreementReady = ready('agreement');
  const auditReady = ready('audit_trail');

  ctx.setTitle(`${doc.donor.name} · ${donation.type} ${amountLine}`);
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
                <span class="d">${esc((h.date || '').slice(5))}${h.time ? ` ${esc(h.time)}` : ''}</span>
                <span>${esc(h.event)}</span>
                ${badge(h.tag || '기록', TAG_TONE[h.tag] || 'muted')}
              </div>`).join('') : '<div class="empty">이력이 없습니다</div>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>약정 문서</h2><span class="spacer"></span>
          ${badge(d.status_label, d.tone)}</div>
        <div class="card-b">
          <div class="doc-preview" style="min-height:auto;gap:0">
            <div class="strong" style="font-size:14px;margin-bottom:12px">${esc(doc.title)}</div>
            <table>
              <tbody>
                <tr><td class="muted" style="width:88px">기부자</td>
                    <td>${esc(doc.donor.name)}</td></tr>
                <tr><td class="muted">요청일</td>
                    <td class="muted">${esc(doc.requested_at || '—')}</td></tr>
                <tr><td class="muted">서명 완료</td>
                    <td>${doc.completed_at
                          ? esc(doc.completed_at)
                          : '<span class="muted">아직 서명 전</span>'}</td></tr>
              </tbody>
            </table>
            <div class="flex-col" style="gap:6px;margin-top:12px">
              ${doc.participants.map((p) => `
                <div class="flex" style="font-size:12.5px">
                  <span>${esc(p.name || '참여자')}</span>
                  <span class="muted"> · ${esc(p.role || '기부자')}</span>
                  <span class="spacer"></span>
                  ${p.signed_at
                    ? badge(`서명 ${esc(p.signed_at.slice(0, 10))}`, 'success')
                    : badge(p.status === 'REJECTED' ? '거절' : '미서명',
                            p.status === 'REJECTED' ? 'error' : 'muted')}
                </div>`).join('')}
            </div>
          </div>

          <div class="flex" style="margin-top:14px;gap:8px">
            <button class="btn sm" data-file="agreement" ${agreementReady ? '' : 'disabled'}>
              약정서 원본 열기</button>
            <button class="btn sm" data-file="audit_trail" ${auditReady ? '' : 'disabled'}>
              감사 추적 인증서</button>
          </div>

          <div class="note" style="margin-top:12px">
            <b>감사 추적 인증서</b>는 누가 · 언제 · 어떤 기기와 IP로 문서를 열람하고 서명했는지
            모두싸인이 기록해 발급하는 별도 PDF입니다. 나중에 기부자가 “서명한 적 없다”고 할 때
            약정의 법적 효력을 증명하는 근거가 됩니다.
          </div>

          <div style="margin-top:14px" class="flex-col">
            ${data.proof_pack.items.map((it) => `
              <div class="flex" style="font-size:13px">
                <span>${esc(it.label)}</span><span class="spacer"></span>
                ${badge(it.available ? '포함' : '없음', it.available ? 'success' : 'muted')}
              </div>`).join('')}
          </div>

          <div id="live-status"></div>
        </div>
      </div>
    </div>

    ${d.is_legacy ? recordingCard(doc.legacy_recording) : ''}

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

  // 서버가 PDF를 그대로 내려주므로 클릭 즉시 새 탭을 연다.
  // 주소를 먼저 받아오고 나중에 여는 방식은 팝업 차단에 걸려 빈 탭만 남는다.
  root.querySelectorAll('[data-file]').forEach((btn) => {
    btn.onclick = () => window.open(
      `${API_BASE}/api/donations/${encodeURIComponent(documentId)}/file?kind=${btn.dataset.file}`,
      '_blank', 'noopener');
  });
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

// 유산 약정의 녹음유언 상태.
// 파일과 유언 내용은 기관에 없다(의도된 것). 재생 버튼을 만들지 말 것 —
// 생전에 기관이 유언 내용을 열람하면 부당한 영향력 행사 의혹의 빌미가 된다.
function recordingCard(rec) {
  if (!rec) {
    return `
      <div class="card">
        <div class="card-h"><h2>녹음유언</h2><span class="spacer"></span>
          ${badge('서명만', 'warning')}</div>
        <div class="card-b">
          <div class="note" style="margin:0">
            <b style="color:var(--ink)">아직 녹음유언이 없습니다.</b><br>
            유산기부 약정에 서명하셨지만, <b>서명만으로는 법적인 유언이 되지 않습니다</b>(민법 제1065조).
            기부자가 개인용 웹에서 녹음유언을 마치셔야 유증으로서 효력을 논할 수 있습니다.
            연락해서 안내해 주세요.
          </div>
        </div>
      </div>`;
  }

  const verified = rec.status === 'verified';
  const seconds = rec.duration_ms ? Math.round(rec.duration_ms / 1000) : null;
  return `
    <div class="card">
      <div class="card-h"><h2>녹음유언</h2><span class="spacer"></span>
        ${badge(verified ? '녹음 확인 완료' : '녹음 완료', verified ? 'success' : 'teal')}</div>
      <div class="card-b">
        <table><tbody>
          <tr><td class="muted" style="width:130px">녹음 시각</td>
              <td>${esc((rec.recorded_at || '').replace('T', ' ').slice(0, 19)) || '—'}</td></tr>
          <tr><td class="muted">길이</td>
              <td>${seconds != null ? `${num(seconds)}초` : '<span class="muted">—</span>'}</td></tr>
          <tr><td class="muted">증인</td>
              <td>${rec.has_witness
                    ? badge('등록됨', 'success')
                    : badge('없음', 'error')}
                <span class="muted" style="font-size:12px">
                  — 증인 신원은 기관이 보관하지 않습니다</span></td></tr>
          <tr><td class="muted">자가 확인</td>
              <td>${num(rec.checklist_passed)} / ${num(rec.checklist_total)}
                ${rec.checklist_total && rec.checklist_passed >= rec.checklist_total
                  ? badge('모두 확인', 'success') : badge('미완료', 'warning')}</td></tr>
          <tr><td class="muted">파일 지문</td>
              <td style="font-family:ui-monospace,monospace;font-size:11.5px;word-break:break-all">
                ${esc(rec.sha256 || '—')}</td></tr>
        </tbody></table>

        <div class="note" style="margin-top:14px">
          <b>파일 지문(SHA-256)</b>은 이 녹음이 나중에 바뀌지 않았음을 확인하는 값입니다.
          같은 파일이면 항상 같은 값이 나오므로, 사후에 제출된 녹음이 그때 그 녹음인지 대조할 수 있습니다.
        </div>
        <div class="note" style="margin-top:10px">
          <b style="color:var(--ink)">녹음 파일과 유언 내용은 기관에 보관하지 않습니다.</b>
          생전에 기관이 유언 내용을 열람하면 부당한 영향력 행사 의혹의 빌미가 됩니다.
          사후 집행 시점에 필요하면 그때 기부자 쪽에서 받습니다.
        </div>
      </div>
    </div>`;
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
