import { getLeafNodes, getNodeSuggestions, searchNodes } from '../packages/core/nodes.js';
import { recordLine, reviseLine } from '../packages/core/lines.js';
import { listLines } from '../packages/core/reports.js';
import { supabase, memoKey } from '../lib/supabase.js';
import { esc, todayISODate } from '../lib/format.js';
import { NODE_TYPE_META } from '../lib/nodes.js';
import { root, state, ui, nodesById, selectedToNode, setSelectedToNode, invalidateTxCache, render } from '../state.js';
import { renderTxRow, attachTxRowActions } from '../components/txRow.js';

let editingLineId = null;
// Leaf-node ids valid as a line endpoint, refreshed on every renderRecordPage
// call; used by the search box to allow any node_type (asset/liability/flow)
// in either slot while still enforcing "記録先は葉ノードのみ" (DESIGN.md).
let recordLeafNodeIds = new Set();

export async function renderRecordPage() {
  // editingLineId/selectedToNode/ui.selectedFromNode/ui.recordSlot are plain
  // globals, not part of `state`, so they must be derived fresh from
  // state.editLine on every render - not just set when editing, or a fresh
  // (non-edit) visit to this page after an earlier edit session would keep
  // showing 更新 instead of 登録.
  const editLine = state.editLine ?? null;

  const [leafNodes, suggestions, todayLines] = await Promise.all([
    getLeafNodes(supabase),
    getNodeSuggestions(supabase, 8),
    listLines(supabase, { ascending: false, limit: 50 }, memoKey)
  ]);

  // Quick 出どころ chips default to asset/liability leaves (DESIGN.md UX方針:
  // "fromは財布か銀行かの2択がほとんど") - a fixed always-visible set, not a
  // frequency-ranked top-N, since a rarely-used account still deserves one tap.
  // This is only the default shortlist: the search box below (any slot) can
  // find and select a leaf node of ANY node_type, so a flow node (初期値,
  // ポイント還元, 運用損益, ...) can still be picked as 出どころ when needed.
  const fromCandidates = leafNodes
    .filter((n) => n.node_type === 'asset' || n.node_type === 'liability')
    .sort((a, b) => a.name.localeCompare(b.name));

  recordLeafNodeIds = new Set(leafNodes.map((n) => n.id));

  if (editLine) {
    editingLineId = editLine.id;
    if (ui.seededEditLine !== editLine) {
      ui.seededEditLine = editLine;
      ui.selectedFromNode = { id: editLine.from_node, name: editLine.from_name };
      setSelectedToNode({ id: editLine.to_node, path: editLine.to_name });
      ui.recordSlot = 'to';
    }
  } else {
    editingLineId = null;
    ui.seededEditLine = null;
    if (!ui.selectedFromNode) {
      // First visit this session: fall back to 設定's 既定の出どころ, else
      // just the first candidate. Once the user picks one, it persists
      // across renders/submits (see add-btn handler) instead of resetting.
      const storedDefaultId = localStorage.getItem('kakeibo:defaultFromNodeId');
      const fallback = fromCandidates.find((n) => n.id === storedDefaultId) ?? fromCandidates[0];
      ui.selectedFromNode = fallback ? { id: fallback.id, name: fallback.name } : null;
    }
  }

  const fromChips = fromCandidates
    .map((n) => {
      const selected = ui.selectedFromNode?.id === n.id;
      return `<button type="button" class="chip${selected ? ' selected' : ''}" data-slot="from" data-id="${n.id}" data-name="${esc(n.name)}">${esc(n.name)}</button>`;
    })
    .join('');

  const toChips = suggestions
    .map((s) => {
      const selected = selectedToNode?.id === s.node_id;
      return `<button type="button" class="chip${selected ? ' selected' : ''}" data-slot="to" data-id="${s.node_id}" data-path="${esc(s.path ?? '')}">${esc((s.path ?? s.node_id).split(' > ').pop())}</button>`;
    })
    .join('');

  const draft = ui.recordDraft;
  ui.recordDraft = null;
  const amountValue = draft?.amount ?? editLine?.amount ?? '';
  const occurredOnValue = draft?.occurredOn ?? editLine?.occurred_on ?? todayISODate();
  const memoValue = draft?.memo ?? editLine?.memo ?? '';

  // 集計から除外 only means something when one endpoint is a flow node (the DB
  // rejects it otherwise - see DESIGN.md 仕訳パターン「集計から除外する取引」),
  // so the checkbox is disabled, not hidden, until such a node is picked.
  const nodeTypeOf = (id) => leafNodes.find((n) => n.id === id)?.node_type ?? nodesById.get(id)?.node_type;
  const hasFlowEndpoint = [ui.selectedFromNode?.id, selectedToNode?.id].some((id) => id && nodeTypeOf(id) === 'flow');
  const excludeChecked = hasFlowEndpoint && (draft?.excludeFromFlowTotals ?? editLine?.exclude_from_flow_totals ?? false);

  const isFromSlot = ui.recordSlot === 'from';
  const fromLabel = ui.selectedFromNode ? esc(ui.selectedFromNode.name) : '未選択';
  const toLabel = selectedToNode ? esc((selectedToNode.path ?? selectedToNode.id).split(' > ').pop()) : '未選択';

  const todayISO = todayISODate();
  const todayRows = todayLines.filter((l) => l.occurred_on === todayISO).map((l) => renderTxRow(l)).join('')
    || '<p style="font-size:12px;color:var(--faint);">今日はまだありません</p>';

  return `
    <div class="grid-fit-320">
      <section class="card">
        <div class="card-head">
          <h1>記録</h1>
          <button type="button" class="btn" style="width:auto;" data-open-manager>ノードを追加</button>
        </div>
        <p style="margin:2px 0 20px;font-size:12.5px;color:var(--muted);">お金の出どころと行き先を選んで金額を入れます。</p>
        <div class="stack" style="gap:18px;">
          <div class="slot-row">
            <button type="button" class="slot-btn${isFromSlot ? ' active' : ''}" id="from-slot-btn">
              <span class="slot-label">出どころ</span>
              <span class="slot-value">${fromLabel}</span>
            </button>
            <div class="slot-arrow">→</div>
            <button type="button" class="slot-btn${isFromSlot ? '' : ' active'}" id="to-slot-btn">
              <span class="slot-label">行き先</span>
              <span class="slot-value">${toLabel}</span>
            </button>
          </div>

          <div class="candidate-box">
            <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px;">
              <span style="font-size:12px;font-weight:700;">${isFromSlot ? '出どころの候補' : '行き先の候補'}</span>
              <span style="font-size:11px;color:var(--faint);">${isFromSlot ? '資産・負債' : '使用頻度順'}</span>
            </div>
            <div class="chip-row" id="candidate-chips">${isFromSlot ? fromChips : toChips}</div>
            <input id="to-search" type="text" placeholder="${isFromSlot ? '出どころを検索（財布、銀行、初期値...）' : '行き先を検索（食費、マクドナルド...）'}">
            <div class="search-results" id="search-results"></div>
            <p style="margin:0;font-size:11px;color:var(--faint);line-height:1.6;">${isFromSlot ? 'すべてのノードから検索できます。選ぶと行き先の候補に切り替わります。' : 'すべてのノードから検索できます。'}</p>
          </div>

          <div class="grid-fit" style="grid-template-columns:1fr 1fr;">
            <label class="field">金額<input id="amount" type="number" placeholder="0" value="${esc(String(amountValue))}" style="font-size:18px;" class="mono"></label>
            <label class="field">日付<input id="occurred-on" type="date" value="${occurredOnValue}"></label>
          </div>

          <label class="field">メモ<input id="memo" type="text" placeholder="任意" value="${esc(memoValue)}"></label>

          <label class="field">
            <span style="display:flex;align-items:flex-start;gap:8px;font-weight:400;${hasFlowEndpoint ? '' : 'color:var(--faint);'}">
              <input type="checkbox" id="exclude-from-flow" style="flex:0 0 auto;margin-top:3px;" ${excludeChecked ? 'checked' : ''} ${hasFlowEndpoint ? '' : 'disabled'}>
              <span style="flex:1;">収支の集計・構成比から除外する
                <span style="display:block;font-size:11px;color:var(--faint);line-height:1.6;">${hasFlowEndpoint
                  ? '残高は明細どおり動きます。全額が自分の収支でない取引(代わりに払っただけ等)に使います。割り勘は自分の分と立て替えに分けて記録してください。'
                  : '出どころか行き先に支出・収入ノードを選ぶと指定できます(資産・負債どうしの取引はもともと収支に入りません)。'}</span>
              </span>
            </span>
          </label>

          <div style="display:flex;gap:8px;">
            <button id="add-btn" class="btn-primary" style="flex:1;">${editingLineId ? '更新' : '登録'}</button>
            <button id="cancel-edit-btn" type="button" class="btn" style="${editingLineId ? '' : 'display:none;'}">キャンセル</button>
          </div>
          <p id="add-error" style="color:var(--negative);font-size:12px;margin:0;"></p>
        </div>
      </section>

      <section class="card">
        <h2>今日の記録</h2>
        <p style="margin:2px 0 8px;font-size:12px;color:var(--muted);">登録するとここに追加されます。</p>
        <div id="today-tx">${todayRows}</div>
        <p style="margin:12px 0 0;font-size:12px;color:var(--faint);line-height:1.7;">候補は出どころ・行き先それぞれの使用頻度から並びます。</p>
      </section>
    </div>
  `;
}

// Shared by candidate-chip clicks and search-result clicks: routes the pick
// to whichever slot is focused. Picking 出どころ auto-advances to 行き先
// (the natural next step); picking 行き先 stays put since amount is next.
function selectRecordCandidate(node) {
  if (ui.recordSlot === 'from') {
    ui.selectedFromNode = node;
    ui.recordSlot = 'to';
  } else {
    setSelectedToNode(node);
  }
  render();
}

export function wireRecord() {
  attachTxRowActions(document.getElementById('today-tx'));

  document.getElementById('from-slot-btn').addEventListener('click', () => {
    ui.recordSlot = 'from';
    render();
  });
  document.getElementById('to-slot-btn').addEventListener('click', () => {
    ui.recordSlot = 'to';
    render();
  });

  root.querySelectorAll('#candidate-chips .chip').forEach((btn) => {
    btn.addEventListener('click', () => selectRecordCandidate({ id: btn.dataset.id, name: btn.dataset.name, path: btn.dataset.path }));
  });

  document.getElementById('to-search').addEventListener('input', async (e) => {
    const query = e.target.value.trim();
    const resultsEl = document.getElementById('search-results');
    if (!query) {
      resultsEl.innerHTML = '';
      return;
    }
    const results = await searchNodes(supabase, query);
    // Any node_type is a valid 出どころ/行き先 (asset/liability/flow can all
    // appear on either side of a line - see DESIGN.md 4.仕訳パターン, e.g.
    // 初期値(flow)→銀行(asset) or クレカ(liability)→立て替え(asset)) - only
    // leaf-ness is restricted, since only leaf nodes can be line endpoints.
    const filtered = results.filter((n) => recordLeafNodeIds.has(n.id));
    // Now that results can mix asset/liability/flow, tag each row with its
    // node_type so e.g. a flow "食費" and an asset "食費" aren't ambiguous.
    resultsEl.innerHTML = filtered.map((n) => `<div data-id="${n.id}" data-path="${esc(n.path)}" data-name="${esc(n.name)}"><span style="color:${NODE_TYPE_META[n.node_type].color};font-size:11px;margin-right:6px;">${NODE_TYPE_META[n.node_type].label}</span>${esc(n.path)}</div>`).join('');
    resultsEl.querySelectorAll('div').forEach((el) => {
      el.addEventListener('click', () => selectRecordCandidate({ id: el.dataset.id, name: el.dataset.name, path: el.dataset.path }));
    });
  });

  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    editingLineId = null;
    setSelectedToNode(null);
    ui.recordSlot = 'to';
    state.editLine = null;
    ui.resetRecordForm = true;
    render();
  });

  document.getElementById('add-btn').addEventListener('click', async () => {
    const errorEl = document.getElementById('add-error');
    errorEl.textContent = '';

    if (!ui.selectedFromNode) {
      errorEl.textContent = '出どころを選択してください';
      return;
    }
    if (!selectedToNode) {
      errorEl.textContent = '行き先を選択してください';
      return;
    }

    const fromNode = ui.selectedFromNode.id;
    const toNode = selectedToNode.id;
    const amount = Number(document.getElementById('amount').value);
    const memo = document.getElementById('memo').value;
    const occurredOn = document.getElementById('occurred-on').value;
    const excludeEl = document.getElementById('exclude-from-flow');
    const excludeFromFlowTotals = !excludeEl.disabled && excludeEl.checked;

    try {
      if (editingLineId) {
        await reviseLine(supabase, editingLineId, { occurredOn, fromNode, toNode, amount, memo, excludeFromFlowTotals }, memoKey);
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        await recordLine(supabase, { userId: user.id, occurredOn, fromNode, toNode, amount, memo, excludeFromFlowTotals }, memoKey);
      }
    } catch (error) {
      errorEl.textContent = error.message;
      return;
    }

    editingLineId = null;
    // ui.selectedFromNode intentionally survives - the next entry is very
    // often from the same source (DESIGN.md UX方針).
    setSelectedToNode(null);
    ui.recordSlot = 'to';
    state.editLine = null;
    ui.resetRecordForm = true;
    invalidateTxCache();
    render();
  });
}
