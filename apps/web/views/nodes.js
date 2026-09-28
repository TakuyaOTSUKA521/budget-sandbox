import { listNodesWithPaths, archiveNode, unarchiveNode } from '../packages/core/nodes.js';
import { getRollupBalances, getCumulative, getCumulativeForNodes } from '../packages/core/reports.js';
import { supabase } from '../lib/supabase.js';
import { esc, yen } from '../lib/format.js';
import { NODE_TYPE_META, computeSpendingDestinations } from '../lib/nodes.js';
import { root, state, pref, go, render } from '../state.js';
import { SPEND_PERIODS, periodRange } from '../components/periodSelector.js';
import { maskNodeYen, nodeHideToggleButton } from '../components/maskToggle.js';
import { treeToggleCell, renderNodeTree } from '../components/collapsibleTree.js';

// Card view only: 'all' shows every node (leaf and intermediate/group), 'leaf'
// hides intermediate nodes so only the actual recording targets remain.
let nodeCardFilter = localStorage.getItem('kakeibo:nodeCardFilter') || 'all';
let showArchivedNodes = false;

// Archiving (is_archived) removes a node from the node list entirely - unlike
// the mask toggle (components/maskToggle.js), which only hides the amount. Meant for leaf nodes
// that turned out to have no practical use; restorable via 復元.
function nodeArchiveButton(nodeId) {
  return `<button type="button" class="node-hide-btn" data-node-archive-id="${nodeId}" title="このノードをアーカイブ(一覧から隠す)">📦</button>`;
}

async function handleArchiveNode(nodeId) {
  if (!confirm('このノードをアーカイブしますか？一覧から隠れます（記録は残ります）。')) return;
  await archiveNode(supabase, nodeId);
  await render();
}

async function handleUnarchiveNode(nodeId) {
  await unarchiveNode(supabase, nodeId);
  await render();
}

// ============================================================
// ノード一覧
// ============================================================

// Small inline line chart of a node's cumulative balance over time, for the
// card view. Just draws already-fetched v_cumulative points - no aggregation.
function renderSparkline(points, color, width = 100, height = 28) {
  if (points.length < 2) return `<div style="height:${height}px;"></div>`;

  const values = points.map((p) => Number(p.cumulative_balance));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);
  const coords = values
    .map((v, i) => `${(i * stepX).toFixed(1)},${(height - ((v - min) / range) * height).toFixed(1)}`)
    .join(' ');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" preserveAspectRatio="none" class="sparkline">
    <polyline points="${coords}" fill="none" stroke="${color}" stroke-width="1.5" vector-effect="non-scaling-stroke" />
  </svg>`;
}

const nodeRow = (balanceByNodeId, n, indent = 0, canArchive = false, hasChildren = false) => `
  <div class="row clickable" data-id="${n.id}" data-name="${esc(n.name)}" style="padding-left:${indent}px;">
    ${treeToggleCell(n.id, hasChildren)}
    <span class="${indent ? 'indent-name' : ''}" style="flex:1;">${esc(n.name)}</span>
    <span class="mono">${maskNodeYen(n.id, balanceByNodeId.get(n.id))}</span>
    ${nodeHideToggleButton(n.id)}
    ${canArchive ? nodeArchiveButton(n.id) : ''}
  </div>
`;

function nodeCard(n, balanceByNodeId, { showPath = true, maxAbs = 1, sparkline = null, canArchive = false, isLeaf = true } = {}) {
  const balance = Number(balanceByNodeId.get(n.id) ?? 0);
  const parentPath = showPath && n.path.includes(' > ') ? n.path.slice(0, n.path.lastIndexOf(' > ')) : '';
  const type = NODE_TYPE_META[n.node_type];
  const pct = Math.max(4, Math.round((Math.abs(balance) / maxAbs) * 100));
  return `
    <div class="node-card clickable${isLeaf ? '' : ' node-card--group'}" data-id="${n.id}" data-name="${esc(n.name)}" style="border-left-color:${type.color};">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <span style="display:flex;align-items:center;gap:5px;">
          <span class="badge" style="color:${type.color};">${type.label}</span>
          ${isLeaf ? '' : '<span class="badge-group">内訳(合計)</span>'}
        </span>
        <span style="display:flex;">
          ${nodeHideToggleButton(n.id)}
          ${canArchive ? nodeArchiveButton(n.id) : ''}
        </span>
      </div>
      ${parentPath ? `<span class="path">${esc(parentPath)}</span>` : ''}
      <span class="name">${esc(n.name)}</span>
      ${sparkline ? renderSparkline(sparkline, type.color) : ''}
      <span class="balance mono ${balance < 0 ? 'neg' : ''}">${maskNodeYen(n.id, balance)}</span>
      <span class="mini-bar-track"><span class="mini-bar-fill" style="width:${pct}%;background:${type.color};"></span></span>
    </div>
  `;
}

// Only a leaf node (no children) is safe to archive from here: hiding an
// intermediate node would orphan its children from the flow tree render.
function archivedRow(n) {
  return `
    <div class="row">
      <span style="flex:1;color:var(--faint);">${esc(n.name)}</span>
      <span style="font-size:11px;color:var(--faint);letter-spacing:0.03em;">${n.node_type}</span>
      <button type="button" class="btn-sm" data-node-unarchive-id="${n.id}">復元</button>
    </div>
  `;
}

export async function renderNodesPage() {
  const [allNodesRaw, balances] = await Promise.all([
    listNodesWithPaths(supabase, { includeArchived: true }),
    getRollupBalances(supabase)
  ]);
  const nodes = allNodesRaw.filter((n) => !n.is_archived);
  const archivedNodesList = allNodesRaw.filter((n) => n.is_archived);

  // 期間セレクタは flow ノードにだけ効く(構成比の収支/資産と同じ分け方):
  // 資産・負債は常に現在残高、支出・収入は選んだ期間の子孫込みの増減。
  // 全期間なら v_rollup_balances がそのまま累計なので追加の取得はしない。
  // 期間内の増減は構成比と同じく v_cumulative の daily_delta を合計するだけ。
  const period = state.nodesPeriod ?? 'all';
  const balanceByNodeId = new Map(balances.map((b) => [b.node_id, b.balance]));
  if (period !== 'all') {
    const { from, to } = periodRange(period);
    const flowIds = nodes.filter((n) => n.node_type === 'flow').map((n) => n.id);
    const flowRows = await getCumulativeForNodes(supabase, flowIds, { from, to });
    flowIds.forEach((id) => balanceByNodeId.set(id, 0));
    flowRows.forEach((r) => balanceByNodeId.set(r.node_id, balanceByNodeId.get(r.node_id) + Number(r.daily_delta)));
  }
  const flowAmountLabel = period === 'all' ? '子孫を含む累計' : `${SPEND_PERIODS[period]}の増減(子孫を含む)`;

  // Archiving is only offered for leaf nodes: hiding an intermediate node
  // would orphan its children from the flow tree / section it belongs to.
  const nonLeafIds = new Set(nodes.filter((n) => n.parent_id).map((n) => n.parent_id));
  const canArchive = (n) => !nonLeafIds.has(n.id);

  const archivedSection = showArchivedNodes ? `
    <section class="card">
      <h3>アーカイブ済み</h3>
      <p class="card-note">一覧・集計・入力候補には出てきません。記録は残っています。</p>
      ${archivedNodesList.map(archivedRow).join('') || '<p style="font-size:12.5px;color:var(--faint);">アーカイブ済みのノードはありません</p>'}
    </section>
  ` : '';

  const viewToggle = `
    <div class="view-toggle">
      <button type="button" id="view-list-btn" class="btn${pref.nodeViewMode === 'list' ? ' selected' : ''}">リスト</button>
      <button type="button" id="view-card-btn" class="btn${pref.nodeViewMode === 'card' ? ' selected' : ''}">カード</button>
    </div>
  `;

  const pageHead = (note) => `
    <div class="stack" style="gap:12px;">
      <div class="card-head">
        <div>
          <h1>ノード一覧</h1>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted);">${note}</p>
        </div>
        <button class="btn-primary" style="width:auto;" data-open-manager>ノードを作成</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;">
        <button type="button" id="toggle-archived-btn" class="btn">${showArchivedNodes ? 'アーカイブ済みを隠す' : 'アーカイブ済みを表示'}</button>
        ${viewToggle}
        <select id="nodes-period-select" style="width:auto;padding:5px 8px;font-size:11.5px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);">
          ${Object.entries(SPEND_PERIODS).map(([value, label]) => `<option value="${value}" ${period === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
  `;

  if (pref.nodeViewMode === 'card') {
    // Color already distinguishes 資産/負債/収支, so card view mixes every
    // node into one grid (biggest balance first) instead of boxed sections.
    let allNodes = [...nodes].sort((a, b) =>
      Math.abs(Number(balanceByNodeId.get(b.id) ?? 0)) - Math.abs(Number(balanceByNodeId.get(a.id) ?? 0))
    );
    if (nodeCardFilter === 'leaf') allNodes = allNodes.filter((n) => canArchive(n));

    const sparklines = await Promise.all(allNodes.map((n) => getCumulative(supabase, n.id)));
    const sparklineByNodeId = new Map(allNodes.map((n, i) => [n.id, sparklines[i]]));
    const maxAbs = Math.max(...allNodes.map((n) => Math.abs(Number(balanceByNodeId.get(n.id) ?? 0))), 1);

    const cardsHtml = allNodes
      .map((n) => nodeCard(n, balanceByNodeId, {
        maxAbs,
        sparkline: sparklineByNodeId.get(n.id),
        canArchive: canArchive(n),
        isLeaf: canArchive(n)
      }))
      .join('');

    const cardFilterToggle = `
      <div class="view-toggle">
        <button type="button" id="card-filter-all-btn" class="btn${nodeCardFilter === 'all' ? ' selected' : ''}">すべて</button>
        <button type="button" id="card-filter-leaf-btn" class="btn${nodeCardFilter === 'leaf' ? ' selected' : ''}">最下層のみ</button>
      </div>
    `;

    return `
      ${pageHead(`残高の推移(折れ線)・大きさ順に並んでいます。色は資産/負債/収支。子ノードを持つカードは破線で「内訳(合計)」と表示されます。金額は資産・負債が現在残高、収支が${flowAmountLabel}です。`)}
        <div style="display:flex;gap:8px;align-items:center;margin-top:-4px;">
          <span style="font-size:11.5px;color:var(--faint);">表示するノード</span>
          ${cardFilterToggle}
        </div>
        <div class="node-card-grid">${cardsHtml || '<p style="font-size:12.5px;color:var(--faint);">ノードがありません</p>'}</div>
        ${archivedSection}
      </div>
    `;
  }

  const byType = { asset: [], liability: [], flow: [] };
  nodes.forEach((n) => byType[n.node_type].push(n));

  // A single tree renderer for all three sections: a node's row shows its
  // own rollup total, and its children are hidden until expanded. That's
  // what keeps a parent's rollup and its descendants' individual amounts
  // from both sitting in the section at once looking like unrelated,
  // overlapping numbers (e.g. 立て替え and 立て替え > 友人A).
  const hierarchySection = (label, note, list, totalColor = '') => {
    const roots = list.filter((n) => !n.parent_id).sort((a, b) => a.name.localeCompare(b.name));
    const total = roots.reduce((sum, n) => sum + Number(balanceByNodeId.get(n.id) ?? 0), 0);
    const rows = renderNodeTree(list, (n, depth, hasChildren) => nodeRow(balanceByNodeId, n, depth * 16, canArchive(n), hasChildren));
    return `
      <section class="card">
        <div class="card-head">
          <h3>${label}</h3>
          <span class="mono" style="font-size:12.5px;${totalColor}">${yen(total)}</span>
        </div>
        <p class="card-note">${note}</p>
        ${rows || '<p style="font-size:12.5px;color:var(--faint);">ノードがありません</p>'}
      </section>
    `;
  };

  const spendingDestinations = computeSpendingDestinations(nodes, balanceByNodeId);
  const spendTotal = spendingDestinations.reduce((sum, n) => sum + Number(balanceByNodeId.get(n.id)), 0);
  const spendRows = spendingDestinations.map((n) => nodeRow(balanceByNodeId, n, 0, canArchive(n))).join('');

  return `
    ${pageHead(`資産・負債は現在残高、支出・収入は${flowAmountLabel}です(期間の選択は支出・収入にのみ効きます)。子を持つ行は▸で展開できます。`)}
      <div class="grid-fit-300">
        ${hierarchySection('資産', '財布・銀行・電子マネーなど', byType.asset)}
        ${hierarchySection('負債', '未払いのクレジット残など', byType.liability, 'color:var(--negative);')}
        <section class="card">
          <div class="card-head">
            <h3>消費相手（多い順）</h3>
            <span class="mono" style="font-size:12.5px;color:var(--negative);">${yen(spendTotal)}</span>
          </div>
          <p class="card-note">flow の葉ノード・${period === 'all' ? '残高' : `${SPEND_PERIODS[period]}の増減`}が正のもの</p>
          ${spendRows || '<p style="font-size:12.5px;color:var(--faint);">記録がありません</p>'}
        </section>
        ${hierarchySection('支出・収入（階層）', flowAmountLabel, byType.flow)}
        ${archivedSection}
      </div>
    </div>
  `;
}

export function wireNodesPage() {
  const listBtn = document.getElementById('view-list-btn');
  const cardBtn = document.getElementById('view-card-btn');
  listBtn.addEventListener('click', () => {
    pref.nodeViewMode = 'list';
    localStorage.setItem('kakeibo:nodeViewMode', pref.nodeViewMode);
    render();
  });
  cardBtn.addEventListener('click', () => {
    pref.nodeViewMode = 'card';
    localStorage.setItem('kakeibo:nodeViewMode', pref.nodeViewMode);
    render();
  });

  document.getElementById('toggle-archived-btn').addEventListener('click', () => {
    showArchivedNodes = !showArchivedNodes;
    render();
  });

  document.getElementById('nodes-period-select').addEventListener('change', (e) => {
    state.nodesPeriod = e.target.value;
    render();
  });

  const cardFilterAllBtn = document.getElementById('card-filter-all-btn');
  const cardFilterLeafBtn = document.getElementById('card-filter-leaf-btn');
  cardFilterAllBtn?.addEventListener('click', () => {
    nodeCardFilter = 'all';
    localStorage.setItem('kakeibo:nodeCardFilter', nodeCardFilter);
    render();
  });
  cardFilterLeafBtn?.addEventListener('click', () => {
    nodeCardFilter = 'leaf';
    localStorage.setItem('kakeibo:nodeCardFilter', nodeCardFilter);
    render();
  });

  root.querySelectorAll('[data-node-archive-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleArchiveNode(btn.dataset.nodeArchiveId);
    });
  });

  root.querySelectorAll('[data-node-unarchive-id]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleUnarchiveNode(btn.dataset.nodeUnarchiveId);
    });
  });

  root.querySelectorAll('.row.clickable, .node-card.clickable').forEach((el) => {
    el.addEventListener('click', () => go('detail', { detailNodeId: el.dataset.id, detailName: el.dataset.name }));
  });
}
