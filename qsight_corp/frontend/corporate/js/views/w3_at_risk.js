// W3 관리가 필요한 기부자 — 연속 미이행 · 반복 감액 · 열람 후 미서명 · 만료 임박

import { api } from '../api.js';
import { esc, modal, toast } from '../ui.js';

export const TITLE = '관리가 필요한 기부자';

const RULE_LABELS = {
  consecutive_missed: { title: '연속 미이행', unit: '회', field: 'threshold', hint: '몇 회 연속 밀리면 알릴지' },
  repeated_decrease: { title: '반복 감액', unit: '회', field: 'threshold', hint: '감액 이력이 몇 번이면 알릴지' },
  viewed_not_signed: { title: '열람 후 미서명', unit: '일', field: 'days', hint: '열람 후 며칠이 지나면 알릴지' },
  expiring_soon: { title: '만료 임박', unit: '일', field: 'days', hint: '만료 며칠 전부터 알릴지' },
};

export async function render(root, ctx) {
  const data = await api.get('/api/donations/at-risk');

  ctx.setActions(`
    <a class="btn" href="#/donations">기부 현황</a>
    <button class="btn" id="rules">규칙 설정</button>`);
  ctx.actionsEl.querySelector('#rules').onclick = () => openRules(data.rules, ctx);

  root.innerHTML = `
    ${data.summary.length ? `<div class="flex" style="flex-wrap:wrap">
      ${data.summary.map((s) => `<span class="chip tag">${esc(s.label)} ${s.count}</span>`).join('')}
    </div>` : ''}

    <div class="card">
      <div class="card-b">
        ${data.rows.length
          ? data.rows.map(rowHtml).join('')
          : '<div class="empty">지금은 관리가 필요한 기부자가 없습니다</div>'}
      </div>
    </div>

    <div class="note">${esc(data.note)}</div>`;

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-act]');
    if (btn) return handleAction(btn, ctx);
    const row = e.target.closest('[data-doc]');
    if (row) ctx.navigate(`/donations/${row.dataset.doc}`);
  });
}

function rowHtml(r) {
  return `
    <div class="risk-row" data-doc="${esc(r.document_id)}" style="cursor:pointer">
      <div class="av ${esc(r.severity)}">${esc(r.donor.slice(0, 1))}</div>
      <div class="flex-col">
        <span class="who">${esc(r.donor)}
          <span class="badge ${esc(r.severity)}" style="margin-left:6px">${esc(r.rule_label)}</span>
        </span>
        <span class="why">${esc(r.reason)}${r.program_name ? ` · ${esc(r.program_name)}` : ''}</span>
      </div>
      <span class="spacer"></span>
      <button class="btn sm" data-act="${esc(r.action)}"
              data-doc="${esc(r.document_id)}" data-donor="${esc(r.donor)}"
              data-phone="${esc(r.phone || '')}">${esc(r.action)}</button>
    </div>`;
}

async function handleAction(btn, ctx) {
  const { act, doc, donor, phone } = btn.dataset;

  if (act === '리마인드') {
    btn.disabled = true;
    try {
      const res = await api.post('/api/donations/remind', { document_ids: [doc] });
      toast(res.message);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
    return;
  }

  if (act === '연락하기') {
    modal({
      title: `${donor} 연락하기`,
      body: `
        <p class="muted" style="margin-bottom:14px">
          연락처는 서명 시 기부자가 입력한 값입니다. 통화 후 메모를 남겨두면 다음 담당자가 이어받기 쉽습니다.
        </p>
        <div class="field"><label>연락처</label>
          <input value="${esc(phone || '미등록')}" readonly></div>
        <div class="field"><label>상담 메모</label>
          <textarea rows="4" placeholder="예: 이번 달만 건너뛰고 다음 달부터 재개하기로 함"></textarea></div>`,
      footer: `<button class="btn" data-close>닫기</button>
               <button class="btn primary" data-close>메모 저장</button>`,
    });
    return;
  }

  if (act === '갱신 제안') {
    modal({
      title: `${donor} 갱신 제안`,
      body: `
        <p class="muted" style="margin-bottom:14px">
          기존 약정과 같은 조건으로 재서명 문서를 보냅니다. 금액·기간을 바꾸려면
          약정 상세에서 부속합의서로 진행하세요.
        </p>
        <div class="note">보내기 전에 약정 상세에서 이행 이력을 한 번 확인하는 것을 권합니다.</div>`,
      footer: `<button class="btn" data-close>닫기</button>
               <button class="btn primary" id="go-detail">약정 상세 열기</button>`,
      onMount: (bg, close) => {
        bg.querySelector('#go-detail').onclick = () => { close(); ctx.navigate(`/donations/${doc}`); };
      },
    });
  }
}

function openRules(rules, ctx) {
  const body = Object.entries(RULE_LABELS).map(([key, meta]) => {
    const rule = rules[key] || {};
    return `
      <div class="field">
        <label>
          <input type="checkbox" data-enabled="${key}" ${rule.enabled ? 'checked' : ''}>
          ${meta.title}
        </label>
        <div class="row">
          <input type="number" min="1" data-value="${key}" value="${rule[meta.field] ?? 1}" style="width:110px">
          <span class="muted" style="align-self:center;font-size:12.5px">${meta.unit} — ${meta.hint}</span>
        </div>
      </div>`;
  }).join('');

  modal({
    title: '위험 판정 규칙 설정',
    body,
    footer: `<button class="btn" data-close>취소</button>
             <button class="btn primary" id="save-rules">저장</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#save-rules').onclick = async () => {
        const patch = {};
        Object.entries(RULE_LABELS).forEach(([key, meta]) => {
          patch[key] = {
            enabled: bg.querySelector(`[data-enabled="${key}"]`).checked,
            [meta.field]: Number(bg.querySelector(`[data-value="${key}"]`).value) || 1,
          };
        });
        try {
          await api.put('/api/donations/at-risk/rules', { rules: patch });
          toast('규칙을 저장했습니다.');
          close();
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      };
    },
  });
}
