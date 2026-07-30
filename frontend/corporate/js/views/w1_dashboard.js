// W1 대시보드 — KPI 4종 · 월별 신규 약정 · 기부 유형 분포 · 향후 6개월 예상 수입 · 사업별 달성률

import { api } from '../api.js';
import { barChart, donutChart, donutLegend, esc, num, progressBar, toast, won } from '../ui.js';

export const TITLE = '대시보드';
export const SCREEN = 'W1';

export async function render(root, ctx) {
  const data = await api.get('/api/dashboard');

  ctx.setActions(`
    <span class="chip" style="cursor:default">${esc(data.as_of.replace('-', '.'))}</span>
    <button class="btn" id="export">내보내기</button>`);
  ctx.actionsEl.querySelector('#export').onclick = () => exportCsv(data);

  root.innerHTML = `
    <div class="grid grid-4">
      ${data.kpis.map(kpiCard).join('')}
    </div>

    <div class="grid grid-3-2">
      <div class="card">
        <div class="card-h"><h2>월별 신규 약정</h2><span class="spacer"></span>
          <span class="muted" style="font-size:12px">최근 6개월</span></div>
        <div class="card-b">${barChart(data.monthly_new, { height: 150 })}</div>
      </div>

      <div class="card">
        <div class="card-h"><h2>기부 유형</h2></div>
        <div class="card-b">
          <div class="donut-wrap">
            ${donutChart(data.type_mix)}
            ${donutLegend(data.type_mix)}
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h">
        <h2>향후 6개월 예상 수입</h2>
        <span class="spacer"></span>
        <span class="badge ${data.forecast.drop_pct == null ? 'muted' : data.forecast.drop_pct < 0 ? 'coral' : 'teal'}">${esc(data.forecast.headline)}</span>
      </div>
      <div class="card-b">
        ${barChart(data.forecast.series, { height: 150, valueKey: 'amount', highlightLast: true })}
        <div class="note" style="margin-top:14px">
          만료 예정 약정을 빼고 계산한 금액입니다. 갱신 제안은
          <a href="#/donations/at-risk">관리가 필요한 기부자</a>에서 이어서 처리할 수 있습니다.
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-h"><h2>사업별 달성률</h2></div>
      <div class="card-b">
        <table>
          <thead><tr>
            <th>모금 사업</th><th class="num">목표</th><th class="num">모금액</th>
            <th class="num">참여</th><th style="width:200px">달성률</th>
          </tr></thead>
          <tbody>
            ${data.program_progress.map((p) => `
              <tr>
                <td class="strong">${esc(p.name)}</td>
                <td class="num muted">${won(p.goal_amount)}</td>
                <td class="num">${won(p.raised_amount)}</td>
                <td class="num muted">${num(p.donor_count)}명</td>
                <td>
                  <div class="flex">
                    <div style="flex:1">${progressBar(p.rate, p.rate < 40)}</div>
                    <span class="strong nowrap" style="width:44px;text-align:right">${p.rate}%</span>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function kpiCard(k) {
  const delta = k.delta
    ? `<div class="delta ${k.delta_tone || ''}">${esc(k.delta)}<span class="n">${esc(k.note || '')}</span></div>`
    : `<div class="delta"><span class="n">${esc(k.note || '')}</span></div>`;
  return `
    <div class="card kpi">
      <div class="label">${esc(k.label)}</div>
      <div class="value">${num(k.value)}<small>${esc(k.unit)}</small></div>
      ${delta}
    </div>`;
}

function exportCsv(data) {
  const lines = [['구분', '항목', '값'].join(',')];
  data.kpis.forEach((k) => lines.push(['KPI', k.label, `${k.value}${k.unit}`].join(',')));
  data.monthly_new.forEach((m) => lines.push(['월별 신규 약정', m.month, m.count].join(',')));
  data.type_mix.forEach((t) => lines.push(['기부 유형', t.type, t.count].join(',')));
  data.forecast.series.forEach((f) => lines.push(['예상 수입', f.month, f.amount].join(',')));
  data.program_progress.forEach((p) => lines.push(['사업별 달성률', p.name, `${p.rate}%`].join(',')));

  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `qsight-dashboard-${data.as_of}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('대시보드를 CSV로 내보냈습니다.');
}
