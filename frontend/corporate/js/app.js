// 기업용 웹 셸 — 해시 라우팅 + 사이드바 + 화면(W1~W9) 렌더링

import { api } from './api.js';
import { errorBox, loading, toast } from './ui.js';

import * as w1 from './views/w1_dashboard.js';
import * as w2 from './views/w2_donations.js';
import * as w3 from './views/w3_at_risk.js';
import * as w4 from './views/w4_detail.js';
import * as w5 from './views/w5_form_parse.js';
import * as w6 from './views/w6_template_editor.js';
import * as w7list from './views/w7_programs.js';
import * as w7 from './views/w7_program_new.js';
import * as w7detail from './views/w7_program_detail.js';
import * as w8 from './views/w8_fulfillment.js';
import * as w9 from './views/w9_reports.js';
import * as w10 from './views/w10_legacy.js';

// 사이드바 메뉴 → 어떤 화면이 어느 메뉴에 속하는지
const NAV = [
  { key: 'dashboard', label: '대시보드', href: '#/dashboard' },
  { key: 'donations', label: '기부 현황', href: '#/donations' },
  { key: 'fulfillment', label: '이행 관리', href: '#/fulfillment' },
  // 유산기부는 금액이 아니라 건수로 관리하고 사후에 수령을 기록해서 따로 둔다.
  { key: 'legacy', label: '유산 약정', href: '#/legacy' },
  // 서식은 사업에 연결해 쓰는 것이라 메뉴를 따로 두지 않는다.
  // 모금 사업 목록의 '계약서 서식 관리' 버튼으로 들어간다.
  { key: 'programs', label: '모금 사업', href: '#/programs' },
  { key: 'reports', label: '리포트', href: '#/reports' },
  { key: 'settings', label: '설정', href: '#/settings' },
];

// 경로 패턴 → 화면 모듈
// /programs/new 가 /programs/:id 보다 먼저 와야 한다(new를 id로 잡으면 안 된다).
const ROUTES = [
  { re: /^\/dashboard$/, view: w1, nav: 'dashboard' },
  { re: /^\/donations$/, view: w2, nav: 'donations' },
  { re: /^\/donations\/at-risk$/, view: w3, nav: 'donations' },
  { re: /^\/donations\/([\w-]+)$/, view: w4, nav: 'donations', params: ['documentId'] },
  { re: /^\/templates\/new$/, view: w5, nav: 'programs' },
  { re: /^\/templates\/([\w-]+)\/edit$/, view: w6, nav: 'programs', params: ['templateId'] },
  { re: /^\/programs$/, view: w7list, nav: 'programs' },
  { re: /^\/programs\/new$/, view: w7, nav: 'programs' },
  { re: /^\/programs\/([\w-]+)$/, view: w7detail, nav: 'programs', params: ['programId'] },
  { re: /^\/fulfillment$/, view: w8, nav: 'fulfillment' },
  { re: /^\/legacy$/, view: w10, nav: 'legacy' },
  { re: /^\/reports$/, view: w9, nav: 'reports' },
];

const app = document.getElementById('app');

function shell() {
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo">
          <b>Q.<em>sight</em></b>
          <span id="org-name">부산문화유산지킴이</span>
        </div>
        <nav class="nav" id="nav">
          ${NAV.map((n) => `<a href="${n.href}" data-nav="${n.key}">${n.label}</a>`).join('')}
        </nav>
        <div class="foot">
          담당자 <span id="org-manager">—</span><br>
          운영 권한
          <div style="margin-top:8px"><span class="env-pill" id="env-pill">확인 중</span></div>
        </div>
      </aside>
      <div class="main">
        <header class="topbar">
          <h1 id="page-title">—</h1>
          <span class="screen-tag" id="screen-tag"></span>
          <span class="spacer"></span>
          <div class="flex" id="page-actions"></div>
        </header>
        <div class="content" id="content"></div>
      </div>
    </div>`;
}

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/dashboard';
  const [path, query] = raw.split('?');
  const search = new URLSearchParams(query || '');
  for (const route of ROUTES) {
    const m = path.match(route.re);
    if (m) {
      const params = {};
      (route.params || []).forEach((name, i) => { params[name] = m[i + 1]; });
      return { route, params, search, path };
    }
  }
  return { route: null, params: {}, search, path };
}

function setActiveNav(key) {
  document.querySelectorAll('#nav a').forEach((a) => {
    a.classList.toggle('on', a.dataset.nav === key);
  });
}

let renderToken = 0;

async function render() {
  const { route, params, search, path } = parseHash();
  const content = document.getElementById('content');
  const titleEl = document.getElementById('page-title');
  const tagEl = document.getElementById('screen-tag');
  const actionsEl = document.getElementById('page-actions');

  if (!route) {
    setActiveNav(path === '/settings' ? 'settings' : '');
    titleEl.textContent = path === '/settings' ? '설정' : '페이지를 찾을 수 없습니다';
    tagEl.textContent = '';
    actionsEl.innerHTML = '';
    content.innerHTML = path === '/settings' ? settingsView() : errorBox(`알 수 없는 경로: ${path}`);
    if (path === '/settings') mountSettings();
    return;
  }

  const token = ++renderToken;
  setActiveNav(route.nav);
  titleEl.textContent = route.view.TITLE;
  tagEl.textContent = route.view.SCREEN;
  actionsEl.innerHTML = '';
  content.innerHTML = loading();

  const ctx = {
    params,
    search,
    navigate: (to) => { location.hash = to; },
    setActions: (html) => { if (token === renderToken) actionsEl.innerHTML = html; },
    setTitle: (text) => { if (token === renderToken) titleEl.textContent = text; },
    actionsEl,
    reload: () => render(),
    toast,
  };

  try {
    await route.view.render(content, ctx);
  } catch (err) {
    if (token !== renderToken) return;
    content.innerHTML = errorBox(err.message);
  }
}

// ── 설정 화면(간단) ────────────────────────────────────
function settingsView() {
  return `
    <div class="card">
      <div class="card-h"><h2>연동 상태</h2></div>
      <div class="card-b" id="settings-body">확인 중…</div>
    </div>
    <div class="note">
      모두싸인 API 키는 서버의 <code>qsight/.env</code>에 두고, 브라우저로 내려보내지 않습니다.
      키가 비어 있으면 데모 데이터로 화면이 동작합니다.
    </div>`;
}

async function mountSettings() {
  const box = document.getElementById('settings-body');
  try {
    const h = await api.get('/api/health');
    box.innerHTML = `
      <table>
        <tbody>
          <tr><td style="width:160px" class="muted">기관</td><td class="strong">${h.org}</td></tr>
          <tr><td class="muted">모두싸인</td><td>${
            h.modusign === 'connected'
              ? '<span class="badge success">연결됨</span>'
              : '<span class="badge warning">데모 데이터</span> <span class="muted" style="font-size:12.5px">MODUSIGN_EMAIL / MODUSIGN_API_KEY 미설정</span>'
          }</td></tr>
          <tr><td class="muted">Upstage</td><td>${
            h.upstage === 'connected'
              ? '<span class="badge success">연결됨</span>'
              : '<span class="badge muted">미설정</span> <span class="muted" style="font-size:12.5px">문서 파싱은 규칙 기반 폴백으로 동작</span>'
          }</td></tr>
        </tbody>
      </table>`;
  } catch (err) {
    box.innerHTML = `<div class="empty">${err.message}</div>`;
  }
}

// ── 부팅 ────────────────────────────────────────────────
async function boot() {
  shell();
  window.addEventListener('hashchange', render);
  await render();

  try {
    const h = await api.get('/api/health');
    document.getElementById('org-name').textContent = h.org;
    document.getElementById('org-manager').textContent = h.manager || '—';
    const pill = document.getElementById('env-pill');
    const live = h.modusign === 'connected';
    pill.textContent = live ? '모두싸인 연결됨' : '데모 데이터';
    pill.classList.toggle('live', live);
  } catch {
    document.getElementById('env-pill').textContent = '서버 연결 실패';
  }
}

boot();
