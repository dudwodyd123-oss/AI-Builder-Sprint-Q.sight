// W6 계약서 서식 편집 — 어떤 항목을 받을지 정하고, 실제 PDF로 확인한 뒤 저장한다.
//
// 모두싸인 임베디드 편집기는 쓰지 않는다. 최종 계약서를 우리 서버가 직접 그리므로
// 서명란 좌표를 모두싸인에서 다시 잡을 필요가 없다(같은 일을 두 번 하게 된다).
// 서명자 이름·이메일도 여기서 받지 않는다. 기부자가 약정을 맺을 때 정해진다.

import { API_BASE, api } from '../api.js';
import { badge, esc, toast } from '../ui.js';

export const TITLE = '계약서 서식 편집';
export const SCREEN = 'W6';

const TYPE_LABEL = {
  text: '텍스트', number: '숫자', select: '선택', check: '체크',
  textarea: '긴 텍스트', date: '날짜', sign: '서명',
};
const TYPES = ['text', 'number', 'select', 'check', 'textarea', 'date', 'sign'];
const ASSIGNEES = ['기부자', '담당자', '입회인'];

// 값이 채워져 있으면 기관 몫이다. 챗봇은 이 항목을 묻지 않는다.
const isFilled = (f) => typeof f.value === 'boolean' || String(f.value ?? '').trim() !== '';

export async function render(root, ctx) {
  const { templateId } = ctx.params;
  const source = await loadSource(templateId);

  const fields = source.fields.map((f, i) => ({
    ...f,
    key: f.key || `field_${i + 1}`,
    assignee: f.assignee || '기부자',
    type: f.type || 'text',
    value: f.value ?? '',   // 기관이 미리 채우는 값. 비어 있으면 기부자가 채운다.
  }));

  ctx.setTitle(source.name);
  ctx.setActions(`
    <a class="btn" href="#/templates/new">서식 업로드</a>
    <button class="btn" id="preview">미리보기</button>
    <button class="btn primary" id="save">저장</button>`);

  root.innerHTML = `
    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-h"><h2>계약서 미리보기</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px" id="preview-hint">
            미리보기를 누르면 실제 계약서가 여기 표시됩니다</span></div>
        <div class="card-b" id="preview-body">
          <div class="dropzone" id="preview-empty" style="cursor:default">
            <b>아직 미리보기를 만들지 않았습니다</b>
            오른쪽에서 항목을 정한 뒤 상단 <b>미리보기</b>를 눌러주세요
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>서식 설정</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px" id="field-count"></span></div>
        <div class="card-b">
          <div class="field">
            <label for="tpl-name">서식 이름</label>
            <input id="tpl-name" value="${esc(source.name)}" placeholder="예: 정기기부 약정서">
          </div>

          <label style="font-size:12.5px;color:var(--ink-2);font-weight:600;display:block;margin:4px 0 8px">
            계약서에 넣을 항목
          </label>
          <div class="flex-col" id="field-list" style="gap:7px;max-height:360px;overflow:auto"></div>

          <button class="btn sm" id="add-field" style="margin-top:10px;width:100%">+ 항목 추가</button>

          <div class="note" style="margin-top:14px">
            <b style="color:var(--ink)">값을 미리 채운 항목은 챗봇이 묻지 않습니다.</b><br>
            후원기관명·담당 부서처럼 기관이 정하는 값은 여기 적어두세요.
            비워 둔 항목만 기부자가 개인용 웹에서 채웁니다.
          </div>
        </div>
      </div>
    </div>`;

  const list = root.querySelector('#field-list');
  const nameInput = root.querySelector('#tpl-name');

  function paint() {
    list.innerHTML = fields.map((f, i) => {
      const prefilled = isFilled(f);
      return `
      <div class="field-pill ${prefilled ? 'placed' : ''}" data-i="${i}"
           style="align-items:flex-start;flex-wrap:wrap;gap:6px">
        <input class="f-label" value="${esc(f.label || '')}" placeholder="항목 이름"
               style="flex:1 1 100%;border:1px solid var(--line);border-radius:6px;padding:6px 9px">
        <select class="f-type" style="border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:12px">
          ${TYPES.map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}
        </select>
        <select class="f-assignee" style="border:1px solid var(--line);border-radius:6px;padding:5px 7px;font-size:12px">
          ${ASSIGNEES.map((a) => `<option value="${a}" ${f.assignee === a ? 'selected' : ''}>${a}</option>`).join('')}
        </select>
        <span class="spacer"></span>
        <button class="btn sm ghost" data-move="${i}" title="위로">↑</button>
        <button class="btn sm ghost" data-remove="${i}" title="삭제">✕</button>
        ${f.type === 'sign' ? '' : `
          <input class="f-value" value="${esc(f.value ?? '')}"
                 placeholder="기관이 미리 채울 값 (비우면 기부자가 입력)"
                 style="flex:1 1 100%;border:1px solid ${prefilled ? '#9CC7AC' : 'var(--line)'};
                        border-radius:6px;padding:6px 9px;font-size:12.5px;
                        background:${prefilled ? '#F6FBF8' : '#fff'}">`}
      </div>`;
    }).join('');

    paintCount();
  }

  function paintCount() {
    const donor = fields.filter((f) => f.type !== 'sign' && f.assignee === '기부자' && !isFilled(f)).length;
    const pre = fields.filter((f) => f.type !== 'sign' && isFilled(f)).length;
    root.querySelector('#field-count').textContent =
      `기관이 채움 ${pre}개 · 기부자가 채울 ${donor}개`;
  }

  list.addEventListener('input', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const f = fields[Number(row.dataset.i)];
    if (e.target.matches('.f-label')) f.label = e.target.value;
    // 값 입력은 타이핑마다 다시 그리면 포커스가 튄다. 카운트만 갱신한다.
    if (e.target.matches('.f-value')) { f.value = e.target.value; paintCount(); }
  });

  list.addEventListener('change', (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const f = fields[Number(row.dataset.i)];
    if (e.target.matches('.f-type')) f.type = e.target.value;
    if (e.target.matches('.f-assignee')) f.assignee = e.target.value;
    paint();
  });

  list.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-remove]');
    if (rm) {
      fields.splice(Number(rm.dataset.remove), 1);
      return paint();
    }
    const up = e.target.closest('[data-move]');
    if (up) {
      const i = Number(up.dataset.move);
      if (i > 0) [fields[i - 1], fields[i]] = [fields[i], fields[i - 1]];
      paint();
    }
  });

  root.querySelector('#add-field').onclick = () => {
    fields.push({ key: `field_${Date.now()}`, label: '', type: 'text', assignee: '기부자', value: '' });
    paint();
  };

  // ── 미리보기: 모두싸인 편집기가 아니라 우리가 만드는 진짜 PDF ──
  ctx.actionsEl.querySelector('#preview').onclick = async (e) => {
    const btn = e.currentTarget;
    const usable = fields.filter((f) => (f.label || '').trim());
    if (!usable.length) return toast('항목 이름을 하나 이상 입력해주세요.', 'error');

    btn.disabled = true;
    btn.textContent = '만드는 중…';
    try {
      const res = await fetch(`${API_BASE}/api/templates/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nameInput.value.trim(), fields: usable }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || `${res.status}`);

      const url = URL.createObjectURL(await res.blob());
      root.querySelector('#preview-body').innerHTML = `
        <iframe src="${url}" title="계약서 미리보기"
                style="width:100%;height:560px;border:1px solid var(--line);border-radius:6px"></iframe>`;
      root.querySelector('#preview-hint').textContent = '예시 값으로 만든 실제 계약서입니다';
      setTimeout(() => URL.revokeObjectURL(url), 120_000);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '미리보기';
    }
  };

  ctx.actionsEl.querySelector('#save').onclick = async (e) => {
    const btn = e.currentTarget;
    const name = nameInput.value.trim();
    if (!name) return toast('서식 이름을 입력해주세요.', 'error');

    const usable = fields.filter((f) => (f.label || '').trim());
    if (!usable.length) return toast('항목을 하나 이상 입력해주세요.', 'error');
    if (!usable.some((f) => f.type !== 'sign' && f.assignee === '기부자' && !isFilled(f))) {
      return toast('기부자가 채울 항목이 최소 1개 필요합니다. 값을 미리 채우면 챗봇이 묻지 않습니다.', 'error');
    }

    btn.disabled = true;
    btn.textContent = '저장 중…';
    try {
      const res = await api.post('/api/templates/save', {
        name,
        fields: usable,
        source_id: source.source_id || null,
        template_id: source.template_id || null,
      });
      toast(res.message);
      // 저장하자마자 화면을 옮기면 안내가 묻힌다. 결과를 남겨두고 다음 행동을 고르게 한다.
      showSaved(root, res.template, usable, ctx);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '저장';
    }
  };

  paint();
}


// 저장 결과를 화면에 남긴다. 토스트만 띄우면 저장됐는지 확신이 안 선다.
function showSaved(root, template, fields, ctx) {
  const donor = fields.filter((f) => f.assignee === '기부자' && f.type !== 'sign').length;
  root.querySelector('#preview-hint').textContent = '저장 완료';
  root.querySelector('#preview-body').innerHTML = `
    <div class="card" style="border-color:#CFE0D6;background:#F6FBF8;box-shadow:none">
      <div class="card-b">
        <div class="flex" style="margin-bottom:10px">
          <span class="strong" style="font-size:16px">저장되었습니다</span>
          ${badge('서식 등록됨', 'success')}
        </div>
        <table style="margin-bottom:14px"><tbody>
          <tr><td class="muted" style="width:110px">서식 이름</td>
              <td class="strong">${esc(template.name)}</td></tr>
          <tr><td class="muted">서식 ID</td>
              <td style="font-family:ui-monospace,monospace;font-size:12.5px">${esc(template.id)}</td></tr>
          <tr><td class="muted">항목</td>
              <td>${fields.length}개 · 기부자가 채울 항목 ${donor}개</td></tr>
        </tbody></table>
        <div class="note" style="margin-bottom:14px">
          이제 <b>모금 사업 등록</b>에서 이 서식을 연결하면, 개인용 웹 챗봇이
          여기 정한 항목을 그대로 물어봅니다.
        </div>
        <div class="flex">
          <button class="btn" id="keep-editing">계속 편집</button>
          <span class="spacer"></span>
          <a class="btn" href="#/templates/new">서식 목록</a>
          <a class="btn primary" href="#/programs/new">모금 사업에 연결하기</a>
        </div>
      </div>
    </div>`;

  root.querySelector('#keep-editing').onclick = () => ctx.reload();
}


async function loadSource(id) {
  // W5에서 넘어온 경우 sessionStorage에 추출 결과가 들어 있다.
  const cached = sessionStorage.getItem('qsight:extraction');
  if (cached) {
    const data = JSON.parse(cached);
    if (data.id === id) {
      sessionStorage.removeItem('qsight:extraction');
      return { name: data.form_title, fields: data.fields, source_id: data.id, template_id: null };
    }
  }

  if (id.startsWith('ext_')) {
    const data = await api.get(`/api/templates/extractions/${encodeURIComponent(id)}`);
    return { name: data.form_title, fields: data.fields, source_id: data.id, template_id: null };
  }

  const { rows } = await api.get('/api/templates');
  const template = rows.find((t) => t.id === id);
  if (!template) throw new Error(`서식을 찾을 수 없습니다: ${id}`);
  return {
    name: template.name,
    fields: template.fields || [],
    source_id: template.source_id || null,
    template_id: template.id,
  };
}
