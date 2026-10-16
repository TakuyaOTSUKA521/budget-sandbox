import { listLines } from '../packages/core/reports.js';
import { supabase, memoKey } from '../lib/supabase.js';
import { esc, yen } from '../lib/format.js';
import { loadAllNodesWithPaths } from '../lib/nodes.js';
import {
  state, cache, nodesById, linesById, txListOffset, txListDone, setTxListOffset, setTxListDone,
  invalidateTxCache, render
} from '../state.js';
import { periodRange } from '../components/periodSelector.js';
import { periodSegment, wirePeriodSegment } from '../components/periodSegment.js';
import { attachTxRowActions } from '../components/txRow.js';

const TX_PAGE_SIZE = 20;
// supabase/config.toml の max_rows。これ以上は1回の select で返らないので分けて取る
const TX_LOAD_ALL_PAGE_SIZE = 1000;

export async function fetchTxPage(reset) {
  if (reset) {
    cache.txListRows = [];
    setTxListOffset(0);
    setTxListDone(false);
  }
  const { from, to } = periodRange(cache.txPeriod);
  const page = await listLines(supabase, { ascending: false, limit: TX_PAGE_SIZE, offset: txListOffset, from, to }, memoKey);
  cache.txListRows = cache.txListRows.concat(page);
  setTxListOffset(txListOffset + page.length);
  if (page.length < TX_PAGE_SIZE) setTxListDone(true);
}

// memo は暗号化して保存しているのでサーバー側では検索できない
// (DESIGN.md「memo 暗号化の脅威モデル」)。検索中は選択期間の残りを
// すべて読み込み、クライアント側で絞り込む。
let loadAllPromise = null;

function loadAllTxRows() {
  if (txListDone) return Promise.resolve();
  if (!loadAllPromise) {
    loadAllPromise = (async () => {
      // 期間変更・書き込みによる無効化や「さらに読み込む」で配列が差し替わったら、
      // 取得結果は古いので捨てる(差し替え後の render() で取り直す)
      const rowsRef = cache.txListRows;
      const { from, to } = periodRange(cache.txPeriod);
      let rest = [];
      let offset = txListOffset;
      for (;;) {
        const page = await listLines(supabase, { ascending: false, limit: TX_LOAD_ALL_PAGE_SIZE, offset, from, to }, memoKey);
        rest = rest.concat(page);
        offset += page.length;
        if (page.length < TX_LOAD_ALL_PAGE_SIZE) break;
      }
      if (cache.txListRows !== rowsRef) return;
      cache.txListRows = rowsRef.concat(rest);
      setTxListOffset(offset);
      setTxListDone(true);
    })().finally(() => { loadAllPromise = null; });
  }
  return loadAllPromise;
}

function filterTxRows(rows, search) {
  if (!search) return rows;
  return rows.filter((l) =>
    (l.from_name ?? '').toLowerCase().includes(search) ||
    (l.to_name ?? '').toLowerCase().includes(search) ||
    (l.memo ?? '').toLowerCase().includes(search));
}

// 支出/収入/振替 の3分類のみ(DESIGN.md 4.仕訳パターン参照)。asset/liability間の
// 振替・立て替え返済も、flow↔flow(給与の控除など、どちらの端点も口座を
// 動かさない行)も、細分化すると煩雑になるだけなので一括で「振替」に含める。
// 参照するノードがアーカイブ済みで nodesById に無い場合も同じ扱いになる。
const TX_CLASS_META = {
  spend: { label: '支出', color: 'var(--negative)' },
  income: { label: '収入', color: 'var(--accent)' },
  transfer: { label: '振替', color: 'var(--secondary)' }
};

function isNetWorthType(nodeType) {
  return nodeType === 'asset' || nodeType === 'liability';
}

function classifyLine(l) {
  const fromType = nodesById.get(l.from_node)?.node_type;
  const toType = nodesById.get(l.to_node)?.node_type;
  if (isNetWorthType(fromType) && toType === 'flow') return 'spend';
  if (fromType === 'flow' && isNetWorthType(toType)) return 'income';
  return 'transfer';
}

function buildTxRows(rows) {
  rows.forEach((l) => linesById.set(l.id, l));
  return rows
    .map((l) => {
      const meta = TX_CLASS_META[classifyLine(l)];
      return `
      <div class="tx-table-row" data-line-id="${l.id}" role="button" tabindex="0">
        <span class="mono" style="color:var(--muted);font-size:12.5px;"><span class="tx-type-dot" style="background:${meta.color};" title="${meta.label}"></span>${l.occurred_on}</span>
        <span>${esc(l.from_name)}</span>
        <span>${esc(l.to_name)}</span>
        <span style="font-size:12.5px;color:var(--faint);">${esc(l.memo ?? '')}</span>
        <span class="mono" style="text-align:right;color:${meta.color};">${yen(l.amount)}</span>
        <span class="chev" aria-hidden="true">›</span>
      </div>
    `;
    })
    .join('') || '<p style="padding:16px 0;font-size:13px;color:var(--faint);">該当する記録がありません</p>';
}

function txListCountText() {
  return `${cache.txListRows.length} 件`;
}

function txListFooterHtml() {
  if (txListDone) return '<span style="font-size:12px;color:var(--faint);">すべて読み込みました</span>';
  if (loadAllPromise) return '<span style="font-size:12px;color:var(--faint);">検索のため全件を読み込み中…</span>';
  return '<button id="load-more-btn" class="btn">さらに読み込む</button>';
}

export async function renderTxListPage() {
  // Node types (from/to) drive the 支出/収入/振替 classification below - not
  // needed for anything else on this page, but loadAllNodesWithPaths also
  // (re)populates the nodesById cache other pages already rely on.
  await loadAllNodesWithPaths();

  const period = cache.txPeriod;
  const search = (state.txSearch ?? '').trim().toLowerCase();
  const filtered = filterTxRows(cache.txListRows, search);

  return `
    <div class="stack" style="gap:14px;">
      <div class="page-head">
        <div style="display:flex;align-items:baseline;gap:12px;">
          <h1>取引一覧</h1>
          <span id="tx-list-count" class="page-meta">${txListCountText()}</span>
        </div>
        <input id="tx-search" class="toolbar-search" type="text" placeholder="メモ・ノードで検索" value="${esc(state.txSearch ?? '')}">
      </div>
      <div class="toolbar">
        <div class="legend" style="margin:0;">
          <span><span class="swatch" style="background:var(--negative);"></span>支出</span>
          <span><span class="swatch" style="background:var(--accent);"></span>収入</span>
          <span><span class="swatch" style="background:var(--secondary);"></span>振替</span>
        </div>
        <div class="toolbar-end toolbar-fixed-width">${periodSegment('tx-period', period)}</div>
      </div>

      <section class="card" style="padding-top:8px;">
        <div class="tx-table-head">
          <span>日付</span><span>出どころ</span><span>行き先</span><span>メモ</span><span style="text-align:right;">金額</span><span></span>
        </div>
        <div id="tx-rows">${buildTxRows(filtered)}</div>
        <div id="tx-list-footer" style="display:flex;justify-content:center;padding:16px 0 10px;">${txListFooterHtml()}</div>
      </section>
    </div>
  `;
}

export function wireTxList() {
  attachTxRowActions(document.getElementById('tx-rows'));

  document.getElementById('tx-search').addEventListener('input', (e) => {
    state.txSearch = e.target.value;
    renderTxRowsInPlace();
    searchAllIfNeeded();
  });

  wirePeriodSegment('tx-period', async (value) => {
    cache.txPeriod = value;
    invalidateTxCache();
    await render();
  });

  wireLoadMore();
  // 検索語を残したまま期間変更・書き込み後の再描画が来た場合も全件を対象にする
  searchAllIfNeeded();
}

function wireLoadMore() {
  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      await fetchTxPage(false);
      render();
    });
  }
}

async function searchAllIfNeeded() {
  if (txListDone || !(state.txSearch ?? '').trim()) return;
  const pending = loadAllTxRows();
  renderTxFooterInPlace();
  try {
    await pending;
  } catch (err) {
    console.error(err);
  }
  // 読み込み中に別画面へ移っていたら何もしない
  if (!document.getElementById('tx-rows')) return;
  renderTxRowsInPlace();
  renderTxFooterInPlace();
}

function renderTxFooterInPlace() {
  const footerEl = document.getElementById('tx-list-footer');
  if (!footerEl) return;
  footerEl.innerHTML = txListFooterHtml();
  document.getElementById('tx-list-count').textContent = txListCountText();
  wireLoadMore();
}

function renderTxRowsInPlace() {
  const search = (state.txSearch ?? '').trim().toLowerCase();
  const rowsEl = document.getElementById('tx-rows');
  rowsEl.innerHTML = buildTxRows(filterTxRows(cache.txListRows, search));
  attachTxRowActions(rowsEl);
}
