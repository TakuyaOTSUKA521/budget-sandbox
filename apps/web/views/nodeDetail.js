import { getDescendantIds } from '../packages/core/nodes.js';
import { getCumulative, getLinesForNodes } from '../packages/core/reports.js';
import { supabase, memoKey } from '../lib/supabase.js';
import { esc, yen } from '../lib/format.js';
import { state, pref, nodesById, chartData, setChartData, render } from '../state.js';
import { isNodeHidden, maskNodeYen, nodeHideToggleButton } from '../components/maskToggle.js';
import { excludedBadge } from '../components/txRow.js';
import { renderBarChartAxis, mountBarChart } from '../components/barChart.js';

export async function renderDetailPage() {
  const nodeId = state.detailNodeId;
  const label = nodesById.get(nodeId)?.path ?? state.detailName ?? nodeId;

  const descendantIds = await getDescendantIds(supabase, nodeId);
  const [cumulative, lines] = await Promise.all([
    getCumulative(supabase, nodeId),
    getLinesForNodes(supabase, descendantIds, memoKey)
  ]);
  setChartData(cumulative);

  const latestBalance = cumulative.length ? cumulative[cumulative.length - 1].cumulative_balance : 0;
  const valueKey = pref.chartMode === 'cumulative' ? 'cumulative_balance' : 'daily_delta';
  const chartTitle = pref.chartMode === 'cumulative' ? '残高推移（累積・日次）' : '増減（1日あたり）';

  const detailRows = lines.map((l) => `
    <div class="row">
      <span class="row-date mono">${l.occurred_on}</span>
      <span class="row-main">${esc(l.from_name)} → ${esc(l.to_name)}${excludedBadge(l)}${l.memo ? ` <span class="row-memo">${esc(l.memo)}</span>` : ''}</span>
      <span class="mono">${yen(l.amount)}</span>
    </div>
  `).join('') || '<p style="font-size:13px;color:var(--faint);">記録がありません</p>';

  return `
    <div class="breadcrumb"><a href="#" data-nav="nodes">ノード一覧</a><span>/</span><span>${esc(label)}</span></div>
    <div class="grid-fit-320">
      <section class="card">
        <div class="card-head">
          <h1>${esc(label)}</h1>
          <div style="display:flex;gap:8px;align-items:center;">
            ${nodeHideToggleButton(nodeId)}
            <button type="button" class="btn" style="width:auto;" data-open-manager="${esc(nodeId)}">編集</button>
          </div>
        </div>
        <div class="stat-value mono">${maskNodeYen(nodeId, latestBalance)}</div>
        <p style="margin:0 0 18px;font-size:12px;color:var(--muted);">子孫を含む累計・全期間</p>

        <div class="chart-toggle">
          <button type="button" id="chart-mode-cumulative" class="btn${pref.chartMode === 'cumulative' ? ' selected' : ''}" style="${pref.chartMode === 'cumulative' ? 'background:var(--text);color:var(--card);' : ''}">累積推移</button>
          <button type="button" id="chart-mode-daily" class="btn${pref.chartMode === 'daily' ? ' selected' : ''}" style="${pref.chartMode === 'daily' ? 'background:var(--text);color:var(--card);' : ''}">1日あたり推移</button>
        </div>
        <div style="font-size:11.5px;color:var(--faint);margin:12px 0 6px;">${chartTitle}</div>
        ${renderBarChartAxis(chartData, valueKey, isNodeHidden(nodeId))}
        <div class="legend">
          <span><span class="swatch" style="background:var(--accent);"></span>支出（プラス）</span>
          <span><span class="swatch" style="background:var(--secondary);"></span>返金・収入</span>
        </div>
      </section>

      <section class="card">
        <h2>内訳</h2>
        <p style="margin:2px 0 8px;font-size:12px;color:var(--muted);">このノードと子孫の記録</p>
        <div id="detail-lines">${detailRows}</div>
      </section>
    </div>
  `;
}

export function wireDetailPage() {
  const valueKey = pref.chartMode === 'cumulative' ? 'cumulative_balance' : 'daily_delta';
  mountBarChart(chartData, valueKey, isNodeHidden(state.detailNodeId));

  document.getElementById('chart-mode-cumulative').addEventListener('click', () => {
    pref.chartMode = 'cumulative';
    localStorage.setItem('kakeibo:chartMode', pref.chartMode);
    render();
  });
  document.getElementById('chart-mode-daily').addEventListener('click', () => {
    pref.chartMode = 'daily';
    localStorage.setItem('kakeibo:chartMode', pref.chartMode);
    render();
  });
}
