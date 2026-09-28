// Cross-module state shared by every view/component (MAINTENANCE.md §1, §3).
// ES module imports are read-only live bindings, so a `let` exported here can
// be read anywhere but only reassigned from this file - hence the set*()
// functions below. Variables used by only one view live in that view's module.

export const root = document.getElementById('root');

export let session = null;
export function setSession(value) { session = value; }

export let state = { page: 'login', detailNodeId: null };
// pref.*: localStorageに永続する、端末ごとの表示設定 (MAINTENANCE.md §1)
export const pref = {
  chartMode: localStorage.getItem('kakeibo:chartMode') || 'cumulative',
  nodeViewMode: localStorage.getItem('kakeibo:nodeViewMode') || 'list',
  hiddenNodeIds: new Set(JSON.parse(localStorage.getItem('kakeibo:hiddenNodeIds') || '[]')),
  netWorthHidden: localStorage.getItem('kakeibo:netWorthHidden') === '1',
};
export let selectedToNode = null;
export function setSelectedToNode(value) { selectedToNode = value; }
// ui.*: 数クリック程度の操作中の状態 (MAINTENANCE.md §1)
// 記録: which of the two slots (出どころ/行き先) the shared candidate picker
// is currently showing, and the chosen 出どころ. ui.selectedFromNode
// intentionally persists across a successful submit (unlike selectedToNode)
// - see the comment in wireRecord's add-btn handler.
export const ui = {
  recordSlot: 'to',
  selectedFromNode: null,
  // The state.editLine object the slots were last seeded from, so a
  // re-render while editing (slot/chip clicks) keeps the user's picks
  // instead of resetting them to the original line's nodes.
  seededEditLine: null,
  // Form values as typed, carried across a re-render (consumed once) - every
  // render() rebuilds the whole DOM, so anything only in an <input> is lost
  // otherwise (captureFormDrafts). Set resetRecordForm/resetManagerForm
  // right before a render() that should start that form fresh instead.
  recordDraft: null,
  managerDraft: null,
  resetRecordForm: false,
  resetManagerForm: false,
  // ノード詳細グラフの横スクロール位置(右端=最新日から何日分戻っているか)。
  // 画面遷移(go)で0に戻し、切替・マスク等の再描画では保つ。
  chartScrollDaysFromRight: 0,
};
// Where 設定/構成比 (neither part of the nav-tab row) should return to when
// closed - the page that was active right before navigating to them.
let prevPage = 'record';
export let nodesById = new Map();
export function setNodesById(value) { nodesById = value; }
export let linesById = new Map();
export function setLinesById(value) { linesById = value; }
export let chartData = [];
export function setChartData(value) { chartData = value; }
// cache.*: サーバーから取得したデータの保持、明示的に無効化するまで (MAINTENANCE.md §1)
// Lives outside `state` (like pref.chartMode/ui.recordSlot) so cache.txPeriod stays in
// sync with cache.txListRows/txListOffset across a go() navigation - state.txSearch
// resets on every visit safely because it only filters already-fetched rows, but the
// period actually decides which rows got fetched, so resetting it without also
// invalidating the cache would leave the selector and the list disagreeing about
// what's shown.
export const cache = {
  txListRows: [],
  txPeriod: 'all',
};
export let txListOffset = 0;
export function setTxListOffset(value) { txListOffset = value; }
export let txListDone = false;
export function setTxListDone(value) { txListDone = value; }

// The tx-list page caches fetched rows client-side for pagination/search;
// any write must invalidate it so a stale (deleted/edited) row doesn't
// linger there until an unrelated reload.
export function invalidateTxCache() {
  cache.txListRows = [];
  txListOffset = 0;
  txListDone = false;
}

// render() itself lives in index.html (the router), which imports every view.
// Views call it through here instead of importing index.html, so the module
// graph stays acyclic: index.html → views/components → state.js.
let renderImpl = async () => {};
export function setRenderer(fn) { renderImpl = fn; }
export function render() { return renderImpl(); }

export function go(page, extra = {}) {
  // Fully replace state (not merge) so leftover transient state from a
  // previous visit - an in-progress edit, a pending hierarchy confirmation,
  // a search query - doesn't leak into an unrelated later visit to the page.
  prevPage = state.page;
  state = { page, ...extra };
  // Re-opening the same line for editing must start from its saved nodes.
  ui.seededEditLine = null;
  ui.resetRecordForm = true;
  ui.chartScrollDaysFromRight = 0;
  render();
  window.scrollTo(0, 0);
}

// 戻る for 設定/構成比 (see prevPage above) - falls back to 記録 in the one
// edge case where prevPage itself is settings (can't happen via normal nav,
// but a stale value shouldn't be able to bounce someone between two
// non-tab pages with no way out).
export function goBack() {
  go(prevPage === 'settings' || prevPage === 'analysis' ? 'record' : prevPage);
}
