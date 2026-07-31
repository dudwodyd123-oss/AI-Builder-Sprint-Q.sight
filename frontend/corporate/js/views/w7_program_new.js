// W7 모금 사업 등록 — 공고문 자동 채우기 + 추천 태그

import { api } from '../api.js';
import { badge, esc, num, pct, progressBar, toast, won } from '../ui.js';

export const TITLE = '모금 사업 등록';
export const SCREEN = 'W7';

const METHODS = ['정기', '일시', '봉사', '유산'];

export async function render(root, ctx) {
  const [templates, programs] = await Promise.all([
    api.get('/api/templates'),
    api.get('/api/programs?with_progress=true'),
  ]);

  ctx.setActions(`
    <button class="btn" id="autofill">공고문 올려서 자동 채우기</button>
    <input type="file" id="notice" accept=".pdf,.png,.jpg,.jpeg,.hwp,.docx" hidden>`);

  root.innerHTML = `
    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-h"><h2>사업 정보</h2></div>
        <div class="card-b">
          <form id="form">
            <div class="field">
              <label for="f-name">사업명</label>
              <input id="f-name" name="name" placeholder="예: 금정산성 보존 지원" required>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="f-goal">목표 금액</label>
                <input id="f-goal" name="goal_amount" type="number" min="0" step="100000"
                       placeholder="30000000" required>
              </div>
              <div class="field">
                <label for="f-template">연결 템플릿</label>
                <select id="f-template" name="template_id">
                  ${templates.rows.map((t) => `<option value="${esc(t.id)}">${esc(t.name)}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="field-row">
              <div class="field">
                <label for="f-start">모금 시작</label>
                <input id="f-start" name="start_date" type="date" required>
              </div>
              <div class="field">
                <label for="f-end">모금 종료</label>
                <input id="f-end" name="end_date" type="date" required>
              </div>
            </div>

            <div class="field">
              <label>받는 방식</label>
              <div class="flex" style="flex-wrap:wrap">
                ${METHODS.map((m) => `
                  <label class="chip" style="cursor:pointer">
                    <input type="checkbox" name="methods" value="${m}" ${m === '정기' || m === '일시' ? 'checked' : ''}>
                    ${m}
                  </label>`).join('')}
              </div>
            </div>

            <div class="field">
              <label for="f-reward">답례품</label>
              <input id="f-reward" name="reward" placeholder="예: 금정산 트레킹 이용권 외 2건">
            </div>

            <div class="field">
              <label for="f-desc">사업 요약</label>
              <textarea id="f-desc" name="description" rows="3"
                        placeholder="기부자에게 보여줄 2~3문장 소개"></textarea>
            </div>

            <div class="field">
              <label>추천 태그 <span class="muted" style="font-weight:400">— 기부자 화면 매칭에 쓰입니다</span></label>
              <div class="flex" style="flex-wrap:wrap" id="tags">
                <span class="muted" style="font-size:12.5px">사업명을 입력하면 자동으로 제안됩니다</span>
              </div>
            </div>

            <div class="flex" style="margin-top:6px">
              <span class="spacer"></span>
              <button type="button" class="btn" id="reset">초기화</button>
              <button type="submit" class="btn primary">사업 등록</button>
            </div>
          </form>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>등록된 모금 사업</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px">
            진행 ${programs.rows.filter((p) => p.status !== 'archived').length} ·
            보관 ${programs.rows.filter((p) => p.status === 'archived').length}</span></div>
        <div class="card-b flex-col" style="gap:16px" id="program-list">
          ${programs.rows.map(programCard).join('')}
        </div>
      </div>
    </div>

    <div class="note">
      여기 태그가 기부자 화면의 추천 순서가 됩니다. 공고문을 올리면 사업명·목표액·기간·답례품이 자동으로 채워집니다.
    </div>`;

  const form = root.querySelector('#form');
  const tagsBox = root.querySelector('#tags');
  let tags = [];

  function paintTags() {
    tagsBox.innerHTML = tags.length
      ? tags.map((t) => `<span class="chip tag auto">${esc(t)}</span>`).join('')
      : '<span class="muted" style="font-size:12.5px">사업명을 입력하면 자동으로 제안됩니다</span>';
  }

  // 사업명/요약을 입력할 때마다 태그를 다시 제안한다(디바운스).
  let timer;
  const suggest = () => {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const text = `${form.name.value} ${form.description.value}`.trim();
      if (!text) { tags = []; return paintTags(); }
      try {
        const res = await api.post('/api/programs/suggest-tags', { text });
        tags = res.tags;
        paintTags();
      } catch { /* 태그 제안 실패는 등록을 막지 않는다 */ }
    }, 400);
  };
  form.name.addEventListener('input', suggest);
  form.description.addEventListener('input', suggest);

  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    const methods = [...form.querySelectorAll('input[name=methods]:checked')].map((c) => c.value);
    if (!methods.length) return toast('받는 방식을 하나 이상 선택해주세요.', 'error');

    btn.disabled = true;
    btn.textContent = '등록 중…';
    try {
      const res = await api.post('/api/programs', {
        name: form.name.value.trim(),
        goal_amount: Number(form.goal_amount.value),
        start_date: form.start_date.value,
        end_date: form.end_date.value,
        methods,
        reward: form.reward.value.trim(),
        template_id: form.template_id.value,
        description: form.description.value.trim(),
        tags,
      });
      toast(`'${res.program.name}' 사업을 등록했습니다.`);
      ctx.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '사업 등록';
    }
  };

  root.querySelector('#reset').onclick = () => { form.reset(); tags = []; paintTags(); };

  // 사업 보관 / 재개 — 보관하면 기부자 화면 목록에서 빠진다.
  root.querySelector('#program-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-archive]');
    if (!btn) return;
    btn.disabled = true;
    try {
      const res = await api.put(`/api/programs/${encodeURIComponent(btn.dataset.archive)}/status`,
                                { status: btn.dataset.next });
      toast(res.message);
      ctx.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  // 공고문 자동 채우기
  const noticeInput = ctx.actionsEl.querySelector('#notice');
  ctx.actionsEl.querySelector('#autofill').onclick = () => noticeInput.click();
  noticeInput.onchange = async () => {
    const file = noticeInput.files[0];
    if (!file) return;
    toast(`${file.name} 읽는 중…`);
    try {
      const res = await api.upload('/api/programs/parse-notice', file);
      const d = res.data || {};
      if (d.name) form.name.value = d.name;
      if (d.goal_amount) form.goal_amount.value = d.goal_amount;
      if (d.start_date) form.start_date.value = d.start_date;
      if (d.end_date) form.end_date.value = d.end_date;
      if (d.reward) form.reward.value = d.reward;
      if (d.description) form.description.value = d.description;
      if (d.methods?.length) {
        form.querySelectorAll('input[name=methods]').forEach((c) => {
          c.checked = d.methods.includes(c.value);
        });
      }
      tags = d.tags || [];
      paintTags();
      toast(res.fallback ? '규칙 기반으로 채웠습니다. 값을 확인해주세요.' : '공고문에서 값을 채웠습니다.');
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      noticeInput.value = '';
    }
  };

  paintTags();
}

function programCard(p) {
  const archived = p.status === 'archived';
  return `
    <div style="${archived ? 'opacity:.62' : ''}">
      <div class="flex">
        <span class="strong">${esc(p.name)}</span>
        ${archived ? badge('보관됨', 'muted') : ''}
        <span class="spacer"></span>
        <span class="muted" style="font-size:12px">${num(p.donor_count)}명 참여</span>
        <button class="btn sm" data-archive="${esc(p.id)}"
                data-next="${archived ? 'active' : 'archived'}">
          ${archived ? '다시 진행' : '보관'}
        </button>
      </div>
      <div class="flex" style="margin:7px 0 5px">
        <div style="flex:1">${progressBar(p.rate, p.rate < 40)}</div>
        <span class="strong nowrap" style="font-size:12.5px">${pct(p.rate)}</span>
      </div>
      <div class="muted" style="font-size:12px">
        ${won(p.raised_amount)} / ${won(p.goal_amount)} · ${esc(p.start_date)} ~ ${esc(p.end_date)}
      </div>
      <div class="flex" style="flex-wrap:wrap;margin-top:7px">
        ${(p.tags || []).map((t) => `<span class="chip tag" style="font-size:11.5px">${esc(t)}</span>`).join('')}
      </div>
    </div>`;
}
