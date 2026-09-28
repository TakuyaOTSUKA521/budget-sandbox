import { getNetWorth, getRollupBalances, getNetWorthDaily, getMonthlyFlow, getDailyDeltas, listLines } from '../packages/core/reports.js';
import { supabase, memoKey } from '../lib/supabase.js';
import { esc, yen, monthStart } from '../lib/format.js';
import { loadAllNodesWithPaths, computeSpendingDestinations } from '../lib/nodes.js';
import { root, state, pref, render } from '../state.js';
import { SPEND_PERIODS, periodRange } from '../components/periodSelector.js';
import { maskNodeYen, nodeHideToggleButton, netWorthToggleButton, toggleNetWorthHidden } from '../components/maskToggle.js';
import { renderTxRow, attachTxRowActions } from '../components/txRow.js';

export async function renderDashboardPage() {
  const nodes = await loadAllNodesWithPaths();
  const balances = await getRollupBalances(supabase);
  const balanceByNodeId = new Map(balances.map((b) => [b.node_id, b.balance]));

  const [netWorth, dailyNetWorth, monthlyFlow, recentLines] = await Promise.all([
    getNetWorth(supabase),
    getNetWorthDaily(supabase),
    getMonthlyFlow(supabase, monthStart()),
    listLines(supabase, { ascending: false, limit: 5 }, memoKey)
  ]);

  const trendPoints = dailyNetWorth.slice(-30);
  const trendMin = Math.min(0, ...trendPoints.map((p) => Number(p.net_worth)));
  const trendMax = Math.max(1, ...trendPoints.map((p) => Number(p.net_worth)));
  const trendBars = trendPoints
    .map((p) => {
      const pct = Math.max(4, Math.round(((Number(p.net_worth) - trendMin) / (trendMax - trendMin || 1)) * 100));
      return `<div style="height:${pct}%" title="${p.occurred_on}: ${yen(p.net_worth)}"></div>`;
    })
    .join('');

  const spendPeriod = state.spendPeriod ?? 'month';
  const { from: spendFrom, to: spendTo } = periodRange(spendPeriod);
  const spendDeltas = await getDailyDeltas(supabase, { from: spendFrom, to: spendTo, flowTotalsOnly: true });
  const periodBalanceByNodeId = new Map();
  spendDeltas.forEach((d) => {
    periodBalanceByNodeId.set(d.node_id, (periodBalanceByNodeId.get(d.node_id) ?? 0) + Number(d.delta));
  });

  const spendingDestinations = computeSpendingDestinations(nodes, periodBalanceByNodeId).slice(0, 5);
  const maxSpend = Math.max(...spendingDestinations.map((n) => Number(periodBalanceByNodeId.get(n.id))), 1);
  const topSpendRows = spendingDestinations
    .map((n) => {
      const amount = Number(periodBalanceByNodeId.get(n.id));
      const pct = Math.max(4, Math.round((amount / maxSpend) * 100));
      return `
        <div class="row">
          <span style="flex:0 0 auto;min-width:118px;">${esc(n.name)}</span>
          <span class="progress-track"><span class="progress-fill" style="width:${pct}%"></span></span>
          <span class="mono" style="min-width:74px;text-align:right;">${maskNodeYen(n.id, amount)}</span>
          ${nodeHideToggleButton(n.id)}
        </div>
      `;
    })
    .join('') || '<p style="font-size:13px;color:var(--faint);">この期間の記録がありません</p>';

  const spendPeriodSelect = `
    <select id="spend-period-select" style="width:auto;padding:5px 8px;font-size:11.5px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);">
      ${Object.entries(SPEND_PERIODS).map(([value, label]) => `<option value="${value}" ${spendPeriod === value ? 'selected' : ''}>${label}</option>`).join('')}
    </select>
  `;

  const recentRows = recentLines.map((l) => renderTxRow(l)).join('') || '<p style="font-size:13px;color:var(--faint);">まだ記録がありません</p>';

  const today = new Date();
  const monthLabel = `${today.getFullYear()}年${today.getMonth() + 1}月`;
  const rangeLabel = `${today.getMonth() + 1}月1日 – ${today.getMonth() + 1}月${today.getDate()}日の集計`;

  return `
    <div class="stack">
      <div class="card-head">
        <div>
          <h1>${monthLabel}</h1>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted);">${rangeLabel}</p>
        </div>
        <button class="btn-primary" style="width:auto;" data-nav="record">記録する</button>
      </div>

      <div class="grid-fit">
        <div class="card">
          <div class="stat-label" style="display:flex;align-items:center;justify-content:space-between;">純資産${netWorthToggleButton()}</div>
          <div class="stat-value mono">${pref.netWorthHidden ? '••••••' : yen(netWorth.net_worth)}</div>
        </div>
        <div class="card">
          <div class="stat-label">今月の支出</div>
          <div class="stat-value mono neg">${yen(monthlyFlow.spend)}</div>
        </div>
        <div class="card">
          <div class="stat-label">今月の収入</div>
          <div class="stat-value mono pos">${yen(monthlyFlow.income)}</div>
        </div>
      </div>

      <div class="grid-fit-320">
        <section class="card">
          <div class="card-head">
            <h2>純資産の推移</h2>
            <span style="font-size:11.5px;color:var(--faint);">直近 ${trendPoints.length} 日</span>
          </div>
          <div class="trend-bars">${trendBars || ''}</div>
          ${trendPoints.length ? `
            <div class="trend-axis">
              <span>${trendPoints[0].occurred_on}</span>
              <span>${trendPoints[Math.floor(trendPoints.length / 2)].occurred_on}</span>
              <span>${trendPoints[trendPoints.length - 1].occurred_on}</span>
            </div>
          ` : ''}
        </section>

        <section class="card">
          <div class="card-head">
            <h2>消費相手 上位</h2>
            <div style="display:flex;gap:6px;align-items:center;">
              ${spendPeriodSelect}
              <button class="btn" style="width:auto;padding:5px 11px;font-size:11.5px;" data-nav="nodes">ノード一覧</button>
            </div>
          </div>
          <div style="margin-top:10px;">${topSpendRows}</div>
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <h2>最近の記録</h2>
          <a href="#" data-nav="tx">すべて見る</a>
        </div>
        <div style="margin-top:8px;">${recentRows}</div>
      </section>
    </div>
  `;
}

export function wireDashboard() {
  attachTxRowActions(root);
  document.getElementById('spend-period-select').addEventListener('change', (e) => {
    state.spendPeriod = e.target.value;
    render();
  });
  document.getElementById('net-worth-hide-btn').addEventListener('click', toggleNetWorthHidden);
}
