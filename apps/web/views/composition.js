import { getRollupBalances, getCumulativeForNodes } from '../packages/core/reports.js';
import { supabase } from '../lib/supabase.js';
import { esc, yen } from '../lib/format.js';
import { loadAllNodesWithPaths } from '../lib/nodes.js';
import { state, render } from '../state.js';
import { SPEND_PERIODS, periodRange } from '../components/periodSelector.js';
import { isNodeHidden, maskNodeYen, nodeHideToggleButton } from '../components/maskToggle.js';

const CHART_COLORS = ['#2f7fa8', '#a95742', '#6d7fa3', '#c9974a', '#4d8f8a', '#7d6fa3', '#3c5163', '#5f8f6e'];

// No chart library - one <path> arc per entry, share of `total` in radians,
// drawn as a ring (outer radius r, punched out down to holeR). A lone
// 100%-share entry is clamped just under a full turn so the arc command
// still gets two distinct endpoints to draw between. Each slice carries a
// native <title> (same pattern as the bar charts) so hovering it shows the
// node's masked amount and its share of `total`.
function renderDonutChart(entries, total, size = 132) {
  if (!total) return '';
  const r = size / 2;
  const holeR = r * 0.6;
  const cx = r, cy = r;
  const point = (radius, angle) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];

  let angle = -Math.PI / 2;
  const paths = entries.map((e, i) => {
    const sweep = Math.min((e.amount / total) * Math.PI * 2, Math.PI * 2 - 0.001);
    const start = angle;
    const end = angle + sweep;
    angle = end;
    const large = sweep > Math.PI ? 1 : 0;
    const [x1, y1] = point(r, start);
    const [x2, y2] = point(r, end);
    const [ix2, iy2] = point(holeR, end);
    const [ix1, iy1] = point(holeR, start);
    const d = `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${holeR} ${holeR} 0 ${large} 0 ${ix1} ${iy1} Z`;
    const pct = (e.amount / total) * 100;
    const tooltip = `${esc(e.node.name)}: ${maskNodeYen(e.node.id, e.amount)} (${pct.toFixed(1)}%)`;
    return `<path class="donut-slice" d="${d}" fill="${CHART_COLORS[(e.colorIndex ?? i) % CHART_COLORS.length]}"><title>${tooltip}</title></path>`;
  }).join('');

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex:0 0 auto;">${paths}</svg>`;
}

// One 支出/収入/資産/負債 breakdown card: entries usually carry a positive
// `amount`, but an asset/liability entry may be <= 0 (e.g. a node that went
// negative) - see renderAnalysisPage. `total` sums every entry as-is so it
// always matches v_net_worth; only the donut excludes non-positive entries
// (a negative slice can't be drawn), keeping them in the legend instead.
// No aggregation here - `amount` was summed from view rows by the caller.
// `subtitle` states this section's display rule (period-scoped vs. current
// balance) right under its heading - see DESIGN.md's 構成比解析 note on why
// asset/liability totals don't move with the period selector.
function compositionSection(title, entries, subtitle = '') {
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  if (!entries.length) {
    return `
      <section class="card">
        <h2 style="margin-bottom:4px;">${title}</h2>
        ${subtitle ? `<p class="card-note" style="margin-top:0;">${subtitle}</p>` : ''}
        <p style="font-size:13px;color:var(--faint);margin-top:8px;">記録がありません</p>
      </section>
    `;
  }

  // A hidden node's amount would otherwise leak through total − visible
  // entries, so the total masks along with it (same rule the legend rows
  // already follow via maskNodeYen/nodeHideToggleButton).
  const anyHidden = entries.some((e) => isNodeHidden(e.node.id));
  const totalLabel = anyHidden ? '••••••' : yen(total);

  const indexedEntries = entries.map((e, i) => ({ ...e, colorIndex: i }));
  const chartEntries = indexedEntries.filter((e) => e.amount > 0);
  const chartTotal = chartEntries.reduce((sum, e) => sum + e.amount, 0);

  const legendRows = indexedEntries.map((e) => {
    const pct = total ? (e.amount / total) * 100 : 0;
    return `
      <div class="row">
        <span class="chart-swatch" style="background:${e.amount > 0 ? CHART_COLORS[e.colorIndex % CHART_COLORS.length] : 'transparent'};"></span>
        <span style="flex:1;min-width:0;">${esc(e.node.name)}</span>
        <span class="mono" style="min-width:74px;text-align:right;">${maskNodeYen(e.node.id, e.amount)}</span>
        <span style="min-width:46px;text-align:right;font-size:11.5px;color:var(--muted);">${pct.toFixed(1)}%</span>
        ${nodeHideToggleButton(e.node.id)}
      </div>
    `;
  }).join('');

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h2 style="margin-bottom:4px;">${title}</h2>
          ${subtitle ? `<p class="card-note" style="margin:0;">${subtitle}</p>` : ''}
        </div>
        <span class="mono" style="font-size:20px;font-weight:700;">${totalLabel}</span>
      </div>
      <div style="display:flex;gap:18px;align-items:center;flex-wrap:wrap;margin-top:10px;">
        ${renderDonutChart(chartEntries, chartTotal)}
        <div style="flex:1;min-width:200px;">${legendRows}</div>
      </div>
    </section>
  `;
}

// 構成比は「収支」(期間で絞り込む支出/収入)と「資産」(常に現在残高の資産/負債)
// の2ビューに分ける。期間セレクタは収支ビューにだけ出す - 資産側の数値は期間に
// よって変わらないので、同じ画面に並べるとセレクタが効いているように誤読される。
// state.analysisView は go() でリセットされ、ヘッダの「構成比」からは常に収支で開く。
export async function renderAnalysisPage() {
  const view = state.analysisView ?? 'flow';
  const nodes = await loadAllNodesWithPaths();

  const viewToggle = `
    <div class="view-toggle">
      <button type="button" id="analysis-view-flow-btn" class="btn${view === 'flow' ? ' selected' : ''}">収支</button>
      <button type="button" id="analysis-view-balance-btn" class="btn${view === 'balance' ? ' selected' : ''}">資産</button>
    </div>
  `;

  let controls = '';
  let note = '';
  let sections = '';

  if (view === 'flow') {
    const rootFlowNodes = nodes.filter((n) => n.node_type === 'flow' && !n.parent_id && !n.exclude_from_flow_totals);
    const period = state.analysisPeriod ?? 'month';
    const { from, to } = periodRange(period);

    const flowRows = await getCumulativeForNodes(supabase, rootFlowNodes.map((n) => n.id), { from, to });
    const deltaByNodeId = new Map();
    // flow_daily_delta, not daily_delta: lines flagged 集計から除外 stay out of 収支.
    flowRows.forEach((r) => deltaByNodeId.set(r.node_id, (deltaByNodeId.get(r.node_id) ?? 0) + Number(r.flow_daily_delta)));

    const spendEntries = rootFlowNodes
      .map((n) => ({ node: n, amount: deltaByNodeId.get(n.id) ?? 0 }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount);
    const incomeEntries = rootFlowNodes
      .map((n) => ({ node: n, amount: -(deltaByNodeId.get(n.id) ?? 0) }))
      .filter((e) => e.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    controls = `
      <select id="analysis-period-select" style="width:auto;padding:5px 8px;font-size:11.5px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);">
        ${Object.entries(SPEND_PERIODS).map(([value, label]) => `<option value="${value}" ${period === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    `;
    note = '対象はルート直下の支出・収入ノードのみ(子ノードの内訳は合算)。「収支の集計から除外」設定のノード(初期残高など)は含みません。';
    sections = `
      ${compositionSection('支出構成比', spendEntries, `${SPEND_PERIODS[period]}の増減`)}
      ${compositionSection('収入構成比', incomeEntries, `${SPEND_PERIODS[period]}の増減`)}
    `;
  } else {
    const rootAssetNodes = nodes.filter((n) => n.node_type === 'asset' && !n.parent_id);
    const rootLiabilityNodes = nodes.filter((n) => n.node_type === 'liability' && !n.parent_id);

    const balances = await getRollupBalances(supabase);
    const balanceByNodeId = new Map(balances.map((b) => [b.node_id, Number(b.balance)]));

    // Kept even when amount <= 0 (e.g. an asset node that has gone negative,
    // or a liability node that has gone positive) so this section's total
    // still matches v_net_worth exactly - compositionSection excludes these
    // from the donut but keeps them in the legend and the total.
    const assetEntries = rootAssetNodes
      .map((n) => ({ node: n, amount: balanceByNodeId.get(n.id) ?? 0 }))
      .sort((a, b) => b.amount - a.amount);
    const liabilityEntries = rootLiabilityNodes
      .map((n) => ({ node: n, amount: -(balanceByNodeId.get(n.id) ?? 0) }))
      .sort((a, b) => b.amount - a.amount);

    note = '対象はルート直下の資産・負債ノードのみ(子ノードの内訳は合算)。常に現在の残高を表示します。';
    sections = `
      ${compositionSection('純資産構成比（資産）', assetEntries, '現在の残高')}
      ${liabilityEntries.length ? compositionSection('純資産構成比（負債）', liabilityEntries, '現在の残高') : ''}
    `;
  }

  return `
    <button type="button" class="back-link" data-go-back>← 戻る</button>
    <div style="display:flex;justify-content:center;margin-bottom:12px;">
      ${viewToggle}
    </div>
    <div class="card-head">
      <h1>構成比</h1>
      ${controls}
    </div>
    <p style="margin:6px 0 0;font-size:11.5px;color:var(--faint);line-height:1.7;">
      ${note}
      円グラフにカーソルを合わせると、そのノードの金額と割合を表示します。
    </p>
    <div class="grid-fit-320" style="margin-top:12px;">
      ${sections}
    </div>
  `;
}

export function wireAnalysisPage() {
  document.getElementById('analysis-view-flow-btn').addEventListener('click', () => {
    state.analysisView = 'flow';
    render();
  });
  document.getElementById('analysis-view-balance-btn').addEventListener('click', () => {
    state.analysisView = 'balance';
    render();
  });
  document.getElementById('analysis-period-select')?.addEventListener('change', (e) => {
    state.analysisPeriod = e.target.value;
    render();
  });
}
