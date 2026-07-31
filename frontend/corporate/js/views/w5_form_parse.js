// W5 서식 업로드 · 항목 추출 — Document Parse + Information Extract

import { api } from '../api.js';
import { badge, bindDropzone, esc, toast } from '../ui.js';

export const TITLE = '서식 업로드 · 항목 추출';
export const SCREEN = 'W5';

const TYPE_LABEL = {
  text: '텍스트', number: '숫자', select: '선택', check: '체크',
  textarea: '긴 텍스트', date: '날짜', sign: '서명',
};

// 항목이 어디서 나왔는지. 추측한 숫자 대신 근거를 그대로 보여준다.
// (임의의 신뢰도 %를 띄우면 담당자가 검수를 건너뛰게 된다)
const SOURCE = {
  upstage: { label: '서식 원문', tone: 'success' },
  rule: { label: '규칙 매칭', tone: 'warning' },
  default: { label: '기본 서식', tone: 'error' },
  added: { label: '자동 보강', tone: 'teal' },
};

export async function render(root, ctx) {
  const templates = await api.get('/api/templates');

  ctx.setActions(`
    <a class="btn" href="#/programs/new">모금 사업 등록</a>`);

  root.innerHTML = `
    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-b">
          ${stepper(1)}
          <div class="dropzone" id="zone" style="margin-top:16px">
            <b>계약서 양식을 여기에 놓으세요</b>
            빈 서식을 스캔한 PDF · 이미지 (최대 20MB)
          </div>
          <input type="file" id="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff" hidden>
        </div>
      </div>

      <div class="card">
        <div class="card-h"><h2>진행 안내</h2></div>
        <div class="card-b">
          <div class="flex-col" id="log" style="gap:9px;max-height:190px;overflow:auto"></div>
        </div>
      </div>
    </div>

    <div id="result"></div>

    <div class="card">
      <div class="card-h"><h2>등록된 계약서 서식</h2><span class="spacer"></span>
        <span class="muted" style="font-size:12px">${templates.rows.length}개</span></div>
      <div class="card-b">
        <table>
          <thead><tr><th>서식</th><th>ID</th><th class="num">항목</th><th style="width:160px"></th></tr></thead>
          <tbody id="template-rows">
            ${templates.rows.map((t) => `
              <tr data-id="${esc(t.id)}">
                <td class="strong">${esc(t.name)}
                  ${t.origin === 'modusign' ? badge('모두싸인', 'muted') : ''}</td>
                <td class="muted" style="font-family:ui-monospace,monospace;font-size:12px">${esc(t.id)}</td>
                <td class="num muted">${(t.fields || []).length}개</td>
                <td class="right nowrap">
                  <a class="btn sm" href="#/templates/${encodeURIComponent(t.id)}/edit">편집</a>
                  ${t.deletable
                    ? `<button class="btn sm ghost" data-delete="${esc(t.id)}"
                               data-name="${esc(t.name)}">삭제</button>`
                    : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  root.querySelector('#template-rows').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    if (!confirm(`'${btn.dataset.name}' 서식을 삭제할까요?\n이 서식으로 맺은 기존 약정은 그대로 남습니다.`)) return;

    btn.disabled = true;
    try {
      const res = await api.del(`/api/templates/${encodeURIComponent(btn.dataset.delete)}`);
      toast(res.message);
      ctx.reload();
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  const zone = root.querySelector('#zone');
  const input = root.querySelector('#file');
  const result = root.querySelector('#result');
  const log = root.querySelector('#log');

  // 어떤 단계에서 무엇이 일어났는지 남긴다. 추출이 이상할 때 원인을 짚기 위한 기록이다.
  const say = (text, tone = '') => {
    const line = document.createElement('div');
    line.style.cssText = 'font-size:12.5px;line-height:1.55';
    line.innerHTML = tone === 'muted'
      ? `<span class="muted">${text}</span>`
      : text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  };

  say('기관에서 쓰는 <b>빈 계약서 양식</b>을 올려주세요. Document Parse로 구조를 읽고 Information Extract로 입력 항목을 뽑습니다.', 'muted');

  bindDropzone(zone, input, async (file) => {
    zone.innerHTML = `<b>${esc(file.name)}</b> 항목을 읽는 중…`;
    result.innerHTML = '';
    log.innerHTML = '';
    say(`📄 <b>${esc(file.name)}</b> (${Math.round(file.size / 1024).toLocaleString()}KB) 업로드`);
    say('문서 구조를 읽는 중…', 'muted');

    try {
      const data = await api.upload('/api/templates/parse', file);
      zone.innerHTML = `<b>${esc(file.name)}</b> 다른 파일로 바꾸려면 여기를 누르세요`;

      // 문서를 못 읽은 경우 — 항목을 지어내지 않고 이유를 그대로 알린다.
      if (data.readable === false) {
        say(`❌ <b>문서에서 글자를 읽지 못했습니다.</b>`);
        say(esc(data.reason || ''), 'muted');
        showUnreadable(result, data, ctx);
        return;
      }

      const words = data.quality?.words ?? 0;
      say(data.fallback
        ? `⚠️ Upstage를 쓰지 못해 <b>규칙 기반</b>으로 대체했습니다 (읽은 낱말 ${words}개)`
        : `✅ Upstage 추출 완료 (읽은 낱말 ${words}개)`);
      say(`총 <b>${data.field_count}개</b> 항목을 찾았습니다. 오른쪽 표에서 확인하고 고쳐주세요.`);
      showResult(result, data, ctx);
    } catch (err) {
      zone.innerHTML = '<b>업로드에 실패했습니다</b> 다시 시도해주세요';
      say(`❌ ${esc(err.message)}`);
      toast(err.message, 'error');
    }
  });
}

function stepper(step) {
  const steps = ['서식 올리기', '항목 확인', '서명란 배치', '완성'];
  return `<div class="stepper">${steps.map((s, i) => `
    <span class="s ${i + 1 <= step ? 'on' : ''}"><b>${i + 1}</b>${s}</span>
    ${i < steps.length - 1 ? '<span class="arw">→</span>' : ''}`).join('')}</div>`;
}

function showResult(root, data, ctx) {
  root.innerHTML = `
    <div class="card">
      <div class="card-b">${stepper(2)}</div>
    </div>

    <div class="card">
      <div class="card-h">
        <h2>찾아낸 입력 항목 ${data.field_count}개</h2>
        <span class="spacer"></span>
        ${data.fallback ? badge('규칙 기반 추출', 'warning') : badge('Upstage 추출', 'teal')}
      </div>
      <div class="card-b">
        <p class="muted" style="font-size:12.5px;margin-bottom:12px">
          추출이 틀린 항목은 여기서 바로 고치세요. 체크를 풀면 템플릿에 넣지 않습니다.
        </p>
        <div class="t-wrap">
          <table>
            <thead>
              <tr>
                <th style="width:34px"><input type="checkbox" id="use-all" checked aria-label="전체 포함"></th>
                <th>항목명</th><th style="width:130px">입력 형태</th><th style="width:120px">작성자</th>
                <th style="width:120px">출처</th>
              </tr>
            </thead>
            <tbody id="fields">
              ${data.fields.map((f, i) => fieldRow(f, i)).join('')}
            </tbody>
          </table>
        </div>
        <div class="flex" style="margin-top:18px">
          ${data.fallback ? `<span class="muted" style="font-size:12.5px">
            UPSTAGE_API_KEY를 설정하면 서식 원문에서 항목을 직접 추출합니다.</span>` : ''}
          <span class="spacer"></span>
          <span class="muted" style="font-size:12.5px" id="use-count"></span>
          <button class="btn" id="export">추출 결과 내보내기 (JSON)</button>
          <button class="btn primary" id="go-place">서명란 배치하러 가기</button>
        </div>
      </div>
    </div>`;

  const tbody = root.querySelector('#fields');
  const useAll = root.querySelector('#use-all');

  const included = () => data.fields.filter((f) => f.use !== false);

  function paintCount() {
    root.querySelector('#use-count').textContent = `${included().length} / ${data.fields.length}개 포함`;
  }

  // 표 안에서 바로 고친 값을 원본 배열에 반영한다.
  tbody.addEventListener('input', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const f = data.fields[Number(tr.dataset.i)];
    if (e.target.matches('.f-label')) f.label = e.target.value;
  });

  tbody.addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-i]');
    if (!tr) return;
    const f = data.fields[Number(tr.dataset.i)];
    if (e.target.matches('.f-use')) f.use = e.target.checked;
    if (e.target.matches('.f-type')) f.type = e.target.value;
    if (e.target.matches('.f-assignee')) f.assignee = e.target.value;
    paintCount();
  });

  useAll.onchange = () => {
    data.fields.forEach((f) => { f.use = useAll.checked; });
    tbody.querySelectorAll('.f-use').forEach((c) => { c.checked = useAll.checked; });
    paintCount();
  };

  root.querySelector('#export').onclick = () => {
    const payload = {
      form_title: data.form_title,
      source_file: data.filename,
      extracted_at: new Date().toISOString(),
      fields: included().map((f) => ({
        key: f.key, label: f.label, type: f.type, assignee: f.assignee,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `extracted_fields_${data.id}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('추출 결과를 JSON으로 내보냈습니다.');
  };

  root.querySelector('#go-place').onclick = () => {
    if (!included().length) return toast('포함할 항목이 없습니다.', 'error');
    // 항목은 서버(extraction id)에 남아 있고, 편집한 내용만 세션으로 넘긴다.
    // URL 쿼리로 넘기면 항목명이 브라우저 기록에 남는다.
    sessionStorage.setItem('qsight:extraction', JSON.stringify({ ...data, fields: included() }));
    ctx.navigate(`/templates/${encodeURIComponent(data.id)}/edit`);
  };

  paintCount();
}

// 문서를 못 읽었을 때. 추출 결과를 만들어내지 않고, 다음에 할 일만 제시한다.
function showUnreadable(root, data, ctx) {
  root.innerHTML = `
    <div class="card">
      <div class="card-b">${stepper(1)}</div>
    </div>

    <div class="card">
      <div class="card-h">
        <h2>${esc(data.filename)} — 항목을 뽑지 못했습니다</h2>
        <span class="spacer"></span>
        ${badge('읽기 실패', 'error')}
      </div>
      <div class="card-b">
        <p style="margin-bottom:14px">${esc(data.reason)}</p>

        <div class="note" style="margin-bottom:16px">
          <b style="color:var(--ink)">이미지·스캔본은 OCR이 필요합니다.</b><br>
          서버 <code>qsight/.env</code>에 <code>UPSTAGE_API_KEY</code>를 넣고 재시작하면
          스캔한 계약서도 글자를 읽어 항목을 뽑습니다.<br>
          키 없이 진행하려면 <b>텍스트가 살아 있는 PDF</b>(스캔이 아닌, 워드·한글에서 내보낸 PDF)를 올려주세요.
        </div>

        <div class="flex">
          <span class="muted" style="font-size:12.5px">
            문서에서 뽑은 항목이 아니라 <b>표준 기부 약정 서식</b>입니다. 직접 고쳐서 쓰세요.
          </span>
          <span class="spacer"></span>
          <button class="btn" id="use-default">기본 서식으로 시작</button>
        </div>
      </div>
    </div>`;

  root.querySelector('#use-default').onclick = () => {
    // 출처가 '기본 서식'으로 표시되므로 어디서 온 항목인지 표에서 계속 드러난다.
    showResult(root, { ...data, readable: true, fields: data.suggested_fields,
                       field_count: data.suggested_fields.length }, ctx);
    toast('기본 서식을 불러왔습니다. 항목을 문서에 맞게 고쳐주세요.');
  };
}

function fieldRow(f, i) {
  const types = ['text', 'number', 'select', 'check', 'textarea', 'date', 'sign'];
  const assignees = ['기부자', '담당자', '입회인'];
  return `
    <tr data-i="${i}">
      <td><input type="checkbox" class="f-use" ${f.use === false ? '' : 'checked'} aria-label="포함"></td>
      <td><input type="text" class="f-label" value="${esc(f.label)}"
                 style="border:1px solid var(--line);border-radius:6px;padding:6px 9px;width:100%"></td>
      <td><select class="f-type" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%">
        ${types.map((t) => `<option value="${t}" ${f.type === t ? 'selected' : ''}>${TYPE_LABEL[t]}</option>`).join('')}
      </select></td>
      <td><select class="f-assignee" style="border:1px solid var(--line);border-radius:6px;padding:6px 8px;width:100%">
        ${assignees.map((a) => `<option value="${a}" ${f.assignee === a ? 'selected' : ''}>${a}</option>`).join('')}
      </select></td>
      <td>${badge(SOURCE[f.source]?.label || '추출', SOURCE[f.source]?.tone || 'muted')}</td>
    </tr>`;
}
