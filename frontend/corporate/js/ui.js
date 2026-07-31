// 렌더링 유틸 — 문자열 템플릿으로 HTML을 만들고 이벤트는 위임으로 붙인다.

export const COLORS = {
  navy: '#1E3A5F',
  navySoft: '#5D7EA6',
  coral: '#F08A5D',
  teal: '#2BA89E',
  line: '#DDE3EB',
  lineSoft: '#EEF1F5',
  ink3: '#8A97AB',
};

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export const num = (n) => (n == null ? '-' : Number(n).toLocaleString('ko-KR'));
export const won = (n) => (n == null ? '-' : `${Number(n).toLocaleString('ko-KR')}원`);

export function badge(text, tone = 'muted') {
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

// ── 차트 ────────────────────────────────────────────────
export function barChart(items, { height = 130, highlightLast = false, valueKey = 'count', labelKey = 'label' } = {}) {
  if (!items.length) return '<div class="empty">데이터가 없습니다</div>';
  const max = Math.max(...items.map((d) => d[valueKey] || 0)) || 1;

  const bars = items.map((d, i) => {
    const hPct = ((d[valueKey] || 0) / max) * 100;
    const isLast = i === items.length - 1;
    const fill = highlightLast && isLast ? COLORS.coral : (isLast ? COLORS.navy : '#C9D4E1');
    return `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0">
        <div style="flex:1;width:100%;display:flex;align-items:flex-end;justify-content:center">
          <div title="${esc(d[labelKey])} ${num(d[valueKey])}"
               style="width:78%;height:${Math.max(hPct, 3)}%;background:${fill};border-radius:4px 4px 0 0"></div>
        </div>
        <span style="font-size:11px;color:var(--ink-3);white-space:nowrap">${esc(d[labelKey])}</span>
      </div>`;
  }).join('');

  return `<div style="display:flex;gap:10px;height:${height}px;align-items:stretch">${bars}</div>`;
}

export function donutChart(items, { size = 140, thickness = 26 } = {}) {
  const total = items.reduce((a, b) => a + (b.count || 0), 0);
  if (!total) return '<div class="empty">데이터가 없습니다</div>';

  const palette = [COLORS.navy, COLORS.teal, '#C9D4E1', COLORS.coral, COLORS.navySoft];
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  const rings = items.map((d, i) => {
    const frac = (d.count || 0) / total;
    const dash = `${c * frac} ${c * (1 - frac)}`;
    const seg = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="${palette[i % palette.length]}" stroke-width="${thickness}"
      stroke-dasharray="${dash}" stroke-dashoffset="${-offset}"
      transform="rotate(-90 ${size / 2} ${size / 2})"><title>${esc(d.type)} ${d.count}건</title></circle>`;
    offset += c * frac;
    return seg;
  }).join('');

  return `<svg class="chart" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${rings}
    <text x="${size / 2}" y="${size / 2 - 2}" text-anchor="middle" font-size="20" font-weight="800" fill="#1B2733">${total}</text>
    <text x="${size / 2}" y="${size / 2 + 15}" text-anchor="middle" font-size="11" fill="#8A97AB">건</text></svg>`;
}

export function donutLegend(items) {
  const palette = [COLORS.navy, COLORS.teal, '#C9D4E1', COLORS.coral, COLORS.navySoft];
  return `<div class="legend">${items.map((d, i) => `
    <div class="item">
      <span class="dot" style="background:${palette[i % palette.length]}"></span>
      <span>${esc(d.type)}</span>
      <span class="n">${d.count}건</span>
    </div>`).join('')}</div>`;
}

export function progressBar(rate, coral = false) {
  const v = Math.min(100, Math.max(0, Number(rate) || 0));
  // 0.3% 같은 값은 픽셀로 환산하면 사라진다. 들어온 돈이 있으면 최소한 보이게 한다.
  const width = v > 0 ? `max(3px, ${v}%)` : '0';
  return `<div class="progress ${coral ? 'coral' : ''}"><i style="width:${width}"></i></div>`;
}

// 모금 사업 메뉴 안에서 '사업 / 계약서 서식'을 오가는 전환 컨트롤.
// 서식은 사업에 연결해 쓰는 것이라 메뉴를 따로 두지 않고 여기서 넘나든다.
export function programSegment(current) {
  const tabs = [
    { key: 'programs', label: '모금 사업', href: '#/programs/new' },
    { key: 'templates', label: '계약서 서식', href: '#/templates/new' },
  ];
  return `<div class="segment">${tabs.map((t) => `
    <a href="${t.href}" class="${t.key === current ? 'on' : ''}">${t.label}</a>`).join('')}</div>`;
}

// 달성률 표시. 10% 이상은 정수, 그 미만은 소수 한 자리까지 보여준다.
export function pct(rate) {
  const v = Number(rate) || 0;
  return Number.isInteger(v) ? `${v}%` : `${v.toFixed(1)}%`;
}

// ── 피드백 ──────────────────────────────────────────────
let toastWrap;
export function toast(message, type = '') {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    document.body.appendChild(toastWrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  toastWrap.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

export function modal({ title, body, footer = '', onMount }) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="m-h"><h3>${esc(title)}</h3><span class="spacer"></span>
        <button class="btn ghost" data-close>닫기</button></div>
      <div class="m-b">${body}</div>
      ${footer ? `<div class="m-f">${footer}</div>` : ''}
    </div>`;
  const close = () => bg.remove();
  bg.addEventListener('click', (e) => {
    if (e.target === bg || e.target.hasAttribute('data-close')) close();
  });
  document.body.appendChild(bg);
  onMount?.(bg, close);
  return { root: bg, close };
}

export function loading(text = '불러오는 중…') {
  return `<div class="card"><div class="loading">${esc(text)}</div></div>`;
}

export function errorBox(message) {
  return `<div class="card"><div class="empty">
    <b>불러오지 못했습니다</b><br><span style="font-size:12.5px">${esc(message)}</span>
  </div></div>`;
}

// 업로드 드롭존 동작을 붙인다.
export function bindDropzone(zone, input, onFile) {
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('over');
    if (e.dataTransfer.files[0]) onFile(e.dataTransfer.files[0]);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) onFile(input.files[0]);
  });
}
