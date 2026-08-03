// W7 모금 사업 상세 — 사업 정보 · 신청서 양식 · 기부 현황
//
// 목록에서 사업 이름을 눌렀을 때 나오는 화면이다. 여기서 유산기부 서식을
// 연결할 수 있다. 서식이 없는 사업은 유산기부를 받지 않는다(기본 서식으로
// 대신하면 유산기부자에게 회차 금액·납부 주기를 묻게 된다).

import { api } from '../api.js';
import { badge, esc, modal, num, pct, progressBar, toast, won } from '../ui.js';

export const TITLE = '모금 사업 상세';

const METHODS = ['정기', '일시', '봉사', '유산'];

const FORM_LABEL = {
  default: { title: '기본 신청서 양식', note: '정기 · 일시 · 봉사 기부에 쓰입니다' },
  legacy: { title: '유산기부 신청서 양식', note: '연결하지 않으면 유산기부를 받지 않습니다' },
};

export async function render(root, ctx) {
  const { programId } = ctx.params;
  const [data, templates] = await Promise.all([
    api.get(`/api/programs/${encodeURIComponent(programId)}`),
    api.get('/api/templates'),
  ]);

  const p = data.program;
  const g = data.progress;
  const archived = p.status === 'archived';

  ctx.setTitle(p.name);
  // 보관은 기부자 화면에서만 감추는 것이고, 삭제는 사업 자체를 없앤다.
  // 성격이 달라 버튼을 나란히 두되 삭제는 약정이 없을 때만 통한다.
  ctx.setActions(`
    <a class="btn" href="#/programs">목록</a>
    <button class="btn" id="edit">사업 수정</button>
    <button class="btn" id="archive" data-next="${archived ? 'active' : 'archived'}">
      ${archived ? '다시 진행' : '보관'}
    </button>
    <button class="btn ghost" id="delete">삭제</button>`);

  root.innerHTML = `
    <div class="grid grid-4">
      ${statCard('달성률', pct(g.rate), archived ? 'muted' : g.rate >= 70 ? 'success' : g.rate >= 30 ? 'warning' : 'error')}
      ${statCard('모금액', won(g.raised_amount))}
      ${statCard('참여 기부자', `${num(g.donor_count)}명`)}
      ${statCard('약정', `${num(data.donations.length)}건`)}
    </div>

    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-h"><h2>사업 정보</h2><span class="spacer"></span>
          ${archived ? badge('보관됨', 'muted') : badge('진행 중', 'success')}</div>
        <div class="card-b">
          <p style="margin-bottom:14px;line-height:1.7">
            ${p.description ? esc(p.description) : '<span class="muted">사업 설명이 없습니다</span>'}
          </p>
          <div class="flex" style="margin-bottom:12px">
            <div style="flex:1">${progressBar(g.rate, g.rate < 40)}</div>
            <span class="strong nowrap" style="font-size:12.5px">
              ${won(g.raised_amount)} / ${won(g.goal_amount)}</span>
          </div>
          <table><tbody>
            <tr><td class="muted" style="width:110px">모금 기간</td>
                <td>${esc(p.start_date)} ~ ${esc(p.end_date)}</td></tr>
            <tr><td class="muted">받는 방식</td>
                <td>${(p.methods || []).map((m) => badge(m, 'muted')).join(' ') || '—'}</td></tr>
            <tr><td class="muted">답례품</td>
                <td>${p.reward ? esc(p.reward) : '<span class="muted">—</span>'}</td></tr>
            <tr><td class="muted">약정된 금액</td>
                <td>${won(g.pledged_amount)} <span class="muted" style="font-size:12px">— 아직 들어오지 않은 몫 포함</span></td></tr>
          </tbody></table>
          <div class="flex" style="flex-wrap:wrap;margin-top:12px">
            ${(p.tags || []).map((t) => `<span class="chip tag" style="font-size:11.5px">${esc(t)}</span>`).join('')
              || '<span class="muted" style="font-size:12.5px">태그 없음</span>'}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>신청서 양식</h2></div>
        <div class="card-b">
          ${['default', 'legacy'].map((k) => formBlock(k, data.forms[k], templates.rows)).join('')}
          <div class="flex" style="margin-top:6px">
            <span class="spacer"></span>
            <button class="btn primary" id="save-forms">서식 연결 저장</button>
          </div>
          <div class="note" style="margin-top:12px">
            서식을 새로 만들거나 고치려면 <a href="#/templates/new">계약서 서식</a>에서
            올리고 편집한 뒤 여기서 연결하세요.
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><h2>기부 현황</h2><span class="spacer"></span>
        ${data.type_mix.map((m) => badge(`${m.label} ${m.count}`, 'muted')).join(' ')}</div>
      <div class="t-wrap">
        <table>
          <thead><tr>
            <th>기부자</th><th>유형</th><th class="num">금액</th>
            <th>다음 이행</th><th style="width:110px">상태</th><th style="width:100px">요청일</th>
          </tr></thead>
          <tbody id="rows">
            ${data.donations.length
              ? data.donations.map(rowHtml).join('')
              : '<tr><td colspan="6"><div class="empty">이 사업으로 맺은 약정이 아직 없습니다</div></td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#rows').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (tr) ctx.navigate(`/donations/${tr.dataset.id}`);
  });

  ctx.actionsEl.querySelector('#edit').onclick = () => openEdit(p, ctx);
  ctx.actionsEl.querySelector('#delete').onclick = () =>
    openDelete(p, data.donations.length, ctx);

  ctx.actionsEl.querySelector('#archive').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const res = await api.put(`/api/programs/${encodeURIComponent(programId)}/status`,
                                { status: btn.dataset.next });
      toast(res.message);
      ctx.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  };

  root.querySelector('#save-forms').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '저장 중…';
    try {
      await putProgram(programId, p, {
        template_id: root.querySelector('#tpl-default').value || null,
        legacy_template_id: root.querySelector('#tpl-legacy').value || null,
      });
      toast('서식 연결을 저장했습니다.');
      ctx.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '서식 연결 저장';
    }
  };
}

// PUT은 전체 항목을 받는다. 보내지 않은 값이 비워지므로 기존 값 위에 바꿀 것만 얹는다.
function putProgram(programId, p, overrides) {
  return api.put(`/api/programs/${encodeURIComponent(programId)}`, {
    name: p.name,
    goal_amount: p.goal_amount,
    start_date: p.start_date,
    end_date: p.end_date,
    methods: p.methods || [],
    reward: p.reward || '',
    description: p.description || '',
    tags: p.tags || [],
    template_id: p.template_id || null,
    legacy_template_id: p.legacy_template_id || null,
    ...overrides,
  });
}

function openEdit(p, ctx) {
  modal({
    title: '사업 수정',
    body: `
      <div class="field">
        <label for="e-name">사업명</label>
        <input id="e-name" value="${esc(p.name)}">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="e-goal">목표 금액</label>
          <input id="e-goal" type="number" min="0" step="100000" value="${p.goal_amount ?? ''}">
        </div>
        <div class="field">
          <label for="e-reward">답례품</label>
          <input id="e-reward" value="${esc(p.reward || '')}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="e-start">모금 시작</label>
          <input id="e-start" type="date" value="${esc(p.start_date || '')}">
        </div>
        <div class="field">
          <label for="e-end">모금 종료</label>
          <input id="e-end" type="date" value="${esc(p.end_date || '')}">
        </div>
      </div>
      <div class="field">
        <label>받는 방식</label>
        <div class="flex" style="flex-wrap:wrap">
          ${METHODS.map((m) => `
            <label class="chip" style="cursor:pointer">
              <input type="checkbox" class="e-method" value="${m}"
                     ${(p.methods || []).includes(m) ? 'checked' : ''}> ${m}
            </label>`).join('')}
        </div>
      </div>
      <div class="field">
        <label for="e-desc">사업 요약</label>
        <textarea id="e-desc" rows="3">${esc(p.description || '')}</textarea>
      </div>
      <div class="field">
        <label for="e-tags">태그 <span class="muted" style="font-weight:400">— 쉼표로 구분</span></label>
        <input id="e-tags" value="${esc((p.tags || []).join(', '))}">
      </div>
      <div class="note" style="margin:0">
        신청서 양식 연결은 이 창이 아니라 상세 화면의 <b>신청서 양식</b>에서 바꿉니다.
      </div>`,
    footer: `<button class="btn" data-close>취소</button>
             <button class="btn primary" id="save">저장</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#save').onclick = async (e) => {
        const name = bg.querySelector('#e-name').value.trim();
        const goal = Number(bg.querySelector('#e-goal').value);
        const methods = [...bg.querySelectorAll('.e-method:checked')].map((c) => c.value);
        if (!name) return toast('사업명을 입력해주세요.', 'error');
        if (!goal || goal <= 0) return toast('목표 금액을 입력해주세요.', 'error');
        if (!methods.length) return toast('받는 방식을 하나 이상 선택해주세요.', 'error');

        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '저장 중…';
        try {
          await putProgram(p.id, p, {
            name,
            goal_amount: goal,
            start_date: bg.querySelector('#e-start').value,
            end_date: bg.querySelector('#e-end').value,
            methods,
            reward: bg.querySelector('#e-reward').value.trim(),
            description: bg.querySelector('#e-desc').value.trim(),
            tags: bg.querySelector('#e-tags').value
              .split(',').map((s) => s.trim()).filter(Boolean),
          });
          toast('사업 정보를 저장했습니다.');
          close();
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '저장';
        }
      };
    },
  });
}

function openDelete(p, agreementCount, ctx) {
  // 약정이 있으면 서버가 막는다. 눌러보고 실패하는 대신 미리 이유를 보여준다.
  const blocked = agreementCount > 0;
  modal({
    title: `'${p.name}' 삭제`,
    body: blocked
      ? `<div class="note" style="margin:0">
           이 사업에는 <b>약정이 ${num(agreementCount)}건</b> 있어 삭제할 수 없습니다.
           지우면 그 약정들의 대상 사업이 사라져 대시보드·리포트 집계가 어긋납니다.<br><br>
           기부자 화면에서 감추고 싶으시면 <b>보관</b>을 이용해주세요.
           보관해도 이미 맺은 약정과 집계는 그대로 남습니다.
         </div>`
      : `<p style="margin:0 0 12px">이 사업을 완전히 삭제합니다. 되돌릴 수 없습니다.</p>
         <div class="note" style="margin:0">
           약정이 없는 사업이라 집계에는 영향이 없습니다.
           나중에 다시 쓸 수도 있다면 삭제 대신 <b>보관</b>을 권합니다.
         </div>`,
    footer: blocked
      ? '<button class="btn" data-close>닫기</button>'
      : `<button class="btn" data-close>취소</button>
         <button class="btn coral" id="do-delete">삭제</button>`,
    onMount: (bg, close) => {
      bg.querySelector('#do-delete')?.addEventListener('click', async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '삭제 중…';
        try {
          const res = await api.del(`/api/programs/${encodeURIComponent(p.id)}`);
          toast(res.message);
          close();
          ctx.navigate('/programs');
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = '삭제';
        }
      });
    },
  });
}

function formBlock(kind, form, templates) {
  const meta = FORM_LABEL[kind];
  const empty = kind === 'legacy' ? '유산기부 받지 않음' : '연결 안 함';
  return `
    <div style="margin-bottom:16px">
      <div class="flex" style="margin-bottom:6px">
        <span class="strong" style="font-size:13.5px">${meta.title}</span>
        <span class="spacer"></span>
        ${form.ready
          ? badge(`기부자 입력 ${form.donor_fields}개`, 'success')
          : badge('연결 안 됨', kind === 'legacy' ? 'muted' : 'error')}
      </div>
      <select id="tpl-${kind}"
              style="border:1px solid var(--line);border-radius:6px;padding:8px 10px;width:100%">
        <option value="">${empty}</option>
        ${templates.map((t) => `
          <option value="${esc(t.id)}" ${t.id === form.template_id ? 'selected' : ''}>
            ${esc(t.name)}${t.origin === 'demo' ? ' (기본 제공)' : ''}
          </option>`).join('')}
      </select>
      <div class="muted" style="font-size:11.5px;margin-top:5px">${meta.note}</div>
    </div>`;
}

function rowHtml(r) {
  const amount = r.amount ? `${won(r.amount)}${r.frequency === '월' ? ' / 월' : ''}` : '—';
  return `
    <tr data-id="${esc(r.id)}" class="clickable">
      <td class="strong">${esc(r.donor)}</td>
      <td>${esc(r.type)}</td>
      <td class="num">${amount}</td>
      <td class="muted">${esc(r.next_due || '—')}</td>
      <td>${badge(r.status, r.tone)}</td>
      <td class="muted">${esc(r.requested_at || '—')}</td>
    </tr>`;
}

function statCard(label, value, tone) {
  return `
    <div class="card kpi">
      <div class="label">${esc(label)}</div>
      <div style="font-size:19px;font-weight:800;margin-top:8px">
        ${tone ? badge(value, tone) : esc(value)}
      </div>
    </div>`;
}
