// W6 템플릿 편집 · 서명란 배치 — 추출 항목을 데이터 라벨로 배치하고 templateId를 확보한다

import { api } from '../api.js';
import { badge, esc, modal, toast } from '../ui.js';

export const TITLE = '템플릿 편집 · 서명란 배치';
export const SCREEN = 'W6';

export async function render(root, ctx) {
  const { templateId } = ctx.params;
  const source = await loadSource(templateId);

  // 배치 좌표는 캔버스 기준 백분율로 들고 있다가 저장 시 함께 보낸다.
  // 기존 템플릿은 좌표가 없으므로 겹치지 않게 계단식 기본값을 준다.
  let slot = 0;
  const fields = source.fields.map((f, i) => {
    const placed = f.placed ?? false;
    const field = { ...f, key: f.key || `field_${i + 1}`, placed, x: f.x, y: f.y };
    if (placed && (field.x == null || field.y == null)) {
      Object.assign(field, defaultSpot(f.type, slot));
      slot += 1;
    }
    return field;
  });

  ctx.setTitle(source.name);
  ctx.setActions(`
    <a class="btn" href="#/templates/new">서식 업로드</a>
    <button class="btn" id="preview">미리보기</button>
    <button class="btn primary" id="save">저장</button>`);

  root.innerHTML = `
    <div class="grid grid-3-2">
      <div class="card" id="editor-card">
        <div class="card-h"><h2 id="editor-title">문서 미리보기</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px" id="editor-hint">항목을 끌어다 놓으세요</span></div>
        <div class="card-b" id="editor-body">
          <div class="canvas" id="canvas">
            <div style="max-width:62%;display:flex;flex-direction:column;gap:9px;pointer-events:none">
              <div class="ln w60" style="height:9px;background:var(--line-soft);border-radius:3px"></div>
              <div class="ln" style="height:9px;background:var(--line-soft);border-radius:3px"></div>
              <div class="ln w80" style="height:9px;background:var(--line-soft);border-radius:3px;width:80%"></div>
              <div class="ln w40" style="height:9px;background:var(--line-soft);border-radius:3px;width:40%"></div>
            </div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>템플릿 설정</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px" id="placed-count"></span></div>
        <div class="card-b">
          <div class="field">
            <label for="tpl-title">템플릿 제목</label>
            <input id="tpl-title" value="${esc(source.name)}">
          </div>
          <div class="field-row">
            <div class="field">
              <label for="signer-name">서명 참여자 이름</label>
              <input id="signer-name" placeholder="예: 문경민">
            </div>
            <div class="field">
              <label for="signer-email">서명 참여자 이메일</label>
              <input id="signer-email" type="email" placeholder="signer@example.com">
            </div>
          </div>

          <label style="font-size:12.5px;color:var(--ink-2);font-weight:600;display:block;margin:4px 0 8px">
            배치할 항목 · 데이터 라벨
          </label>
          <div class="flex-col" id="field-list" style="gap:7px;max-height:300px;overflow:auto"></div>
          <div class="note" style="margin-top:14px" id="editor-note">
            저장하면 모두싸인 임베디드 초안을 만들고, 받은 편집 화면을 왼쪽에 띄웁니다.
            서명란 최종 배치는 그 화면에서 확정됩니다.
          </div>
        </div>
      </div>
    </div>`;

  const canvas = root.querySelector('#canvas');
  const list = root.querySelector('#field-list');

  function paint() {
    // 캔버스에 배치된 항목
    canvas.querySelectorAll('.placed-field').forEach((n) => n.remove());
    fields.filter((f) => f.placed).forEach((f) => {
      const chip = document.createElement('div');
      chip.className = `placed-field ${f.type === 'sign' ? 'sign' : ''}`;
      chip.textContent = f.label;
      chip.style.left = `${f.x}%`;
      chip.style.top = `${f.y}%`;
      chip.dataset.key = f.key;
      canvas.appendChild(chip);
    });

    // 오른쪽 목록 — 서명 요청 때 값이 치환될 데이터 라벨을 함께 보여준다.
    list.innerHTML = fields.map((f) => `
      <div class="field-pill ${f.placed ? 'placed' : ''}">
        <div class="flex-col" style="gap:2px;min-width:0">
          <span>${esc(f.label)}</span>
          <span class="muted" style="font-size:11px;font-family:ui-monospace,monospace">
            {{${esc(f.key)}}} · ${esc(f.assignee)}</span>
        </div>
        <span class="spacer"></span>
        ${f.placed ? badge('배치됨', 'success') : badge('미배치', 'muted')}
        <button class="btn sm" data-toggle="${esc(f.key)}">${f.placed ? '해제' : '배치'}</button>
      </div>`).join('');

    root.querySelector('#placed-count').textContent =
      `${fields.filter((f) => f.placed).length} / ${fields.length} 배치됨`;
  }

  list.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-toggle]');
    if (!btn) return;
    const f = fields.find((x) => x.key === btn.dataset.toggle);
    if (f.placed) {
      f.placed = false;
    } else {
      f.placed = true;
      Object.assign(f, defaultSpot(f.type, fields.filter((x) => x.placed).length - 1));
    }
    paint();
  });

  // 캔버스 드래그
  let dragging = null;
  canvas.addEventListener('pointerdown', (e) => {
    const chip = e.target.closest('.placed-field');
    if (!chip) return;
    dragging = { chip, field: fields.find((f) => f.key === chip.dataset.key) };
    chip.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const box = canvas.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * 100;
    const y = ((e.clientY - box.top) / box.height) * 100;
    dragging.field.x = Math.min(88, Math.max(0, x - 4));
    dragging.field.y = Math.min(92, Math.max(0, y - 2));
    dragging.chip.style.left = `${dragging.field.x}%`;
    dragging.chip.style.top = `${dragging.field.y}%`;
  });
  canvas.addEventListener('pointerup', () => { dragging = null; });

  ctx.actionsEl.querySelector('#preview').onclick = () => {
    modal({
      title: `${source.name} — 미리보기`,
      body: `
        <p class="muted" style="margin-bottom:12px">기부자가 서명할 때 보게 될 항목 순서입니다.</p>
        <table><thead><tr><th>항목</th><th>유형</th><th>작성자</th><th>배치</th></tr></thead>
        <tbody>${fields.map((f) => `
          <tr><td>${esc(f.label)}</td><td class="muted">${esc(f.type)}</td>
              <td class="muted">${esc(f.assignee)}</td>
              <td>${f.placed ? badge('배치됨', 'success') : badge('미배치', 'muted')}</td></tr>`).join('')}
        </tbody></table>`,
      footer: '<button class="btn" data-close>닫기</button>',
    });
  };

  ctx.actionsEl.querySelector('#save').onclick = async (e) => {
    const btn = e.currentTarget;
    const placed = fields.filter((f) => f.placed);
    if (!placed.length) return toast('배치된 항목이 없습니다.', 'error');
    if (!placed.some((f) => f.type === 'sign')) return toast('서명란을 최소 1개 배치해주세요.', 'error');

    const title = root.querySelector('#tpl-title').value.trim();
    if (!title) return toast('템플릿 제목을 입력해주세요.', 'error');

    const signerName = root.querySelector('#signer-name').value.trim();
    const signerEmail = root.querySelector('#signer-email').value.trim();

    btn.disabled = true;
    btn.textContent = '저장 중…';
    try {
      const res = await api.post('/api/templates/save', {
        name: title,
        fields: placed,
        source_id: source.source_id || null,
        participants: signerName
          ? [{ role: '기부자', name: signerName, email: signerEmail }]
          : [],
      });
      toast(res.message);
      showEmbeddedEditor(root, res.template, res.needs_link);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = '저장';
    }
  };

  paint();
}

// W5에서 넘어온 항목은 일단 전부 배치해 두고 담당자가 위치만 조정하게 한다.
// 빈 캔버스에서 11개를 하나씩 올리게 하면 실제로 아무도 안 쓴다.
function fromExtraction(fields) {
  return (fields || []).map((f) => ({ ...f, placed: true }));
}

// 저장 후 모두싸인이 준 임베디드 편집 화면으로 왼쪽 패널을 교체한다.
// embedded_url이 없으면(데모 모드) 배치 캔버스를 그대로 두고 안내만 바꾼다.
function showEmbeddedEditor(root, template, needsLink) {
  const note = root.querySelector('#editor-note');

  if (!template.embedded_url) {
    note.innerHTML = `저장했습니다. templateId <code>${esc(template.id)}</code><br>
      모두싸인 API 키를 넣으면 이 자리에 실제 서명란 배치 화면이 열립니다.`;
    return;
  }

  root.querySelector('#editor-title').textContent = '모두싸인 서명란 배치';
  root.querySelector('#editor-hint').textContent =
    template.expiry ? `초안 만료 ${template.expiry.slice(11, 16)}` : '초안 편집 중';
  root.querySelector('#editor-body').innerHTML = `
    <iframe src="${esc(template.embedded_url)}" title="모두싸인 템플릿 편집기"
            referrerpolicy="no-referrer"
            style="width:100%;height:520px;border:1px solid var(--line);border-radius:6px;background:#fff"></iframe>`;

  if (!needsLink) {
    note.innerHTML = `초안 ID <code>${esc(template.id)}</code>`;
    return;
  }

  // 모두싸인은 편집기 저장 완료를 알려주지 않는다. 담당자가 눌러주면 그때 찾는다.
  note.innerHTML = `
    <div class="flex">
      <div class="flex-col" style="gap:2px">
        <span class="strong" style="color:var(--ink)">배치를 마치면 눌러주세요</span>
        <span>편집기에서 저장한 뒤 눌러야 templateId가 연결됩니다.</span>
      </div>
      <span class="spacer"></span>
      <button class="btn primary" id="link-template">템플릿 연결</button>
    </div>`;

  note.querySelector('#link-template').onclick = async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '찾는 중…';
    try {
      const res = await api.post(`/api/templates/${encodeURIComponent(template.id)}/link`);
      toast(res.message, res.linked ? '' : 'error');
      if (res.linked) {
        note.innerHTML = `연결 완료 · templateId <code>${esc(res.template_id)}</code><br>
          이제 모금 사업에서 이 템플릿을 고를 수 있습니다.`;
      } else {
        btn.disabled = false;
        btn.textContent = '다시 확인';
      }
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '템플릿 연결';
    }
  };
}

// 이미 놓인 항목과 겹치지 않게 계단식으로 초기 위치를 잡는다.
function defaultSpot(type, index) {
  // 서명란은 문서 아래쪽에 세로로 쌓는다.
  if (type === 'sign') return { x: 56, y: 62 + (index % 3) * 11 };
  return { x: 8 + (index % 2) * 46, y: 8 + Math.floor(index / 2) * 11 };
}

async function loadSource(id) {
  // W5에서 넘어온 경우 sessionStorage에 추출 결과가 들어 있다.
  const cached = sessionStorage.getItem('qsight:extraction');
  if (cached) {
    const data = JSON.parse(cached);
    if (data.id === id) {
      sessionStorage.removeItem('qsight:extraction');
      return { name: data.form_title, fields: fromExtraction(data.fields), source_id: data.id };
    }
  }

  if (id.startsWith('ext_')) {
    const data = await api.get(`/api/templates/extractions/${encodeURIComponent(id)}`);
    return { name: data.form_title, fields: fromExtraction(data.fields), source_id: data.id };
  }

  const { rows } = await api.get('/api/templates');
  const template = rows.find((t) => t.id === id);
  if (!template) throw new Error(`템플릿을 찾을 수 없습니다: ${id}`);
  return {
    name: template.name,
    fields: (template.fields || []).map((f) => ({ ...f, placed: true })),
    source_id: null,
  };
}
