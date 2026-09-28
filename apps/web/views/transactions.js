import { listLines } from '../packages/core/reports.js';
import { supabase, memoKey } from '../lib/supabase.js';
import { esc, yen } from '../lib/format.js';
import { loadAllNodesWithPaths } from '../lib/nodes.js';
import {
  state, cache, nodesById, linesById, txListOffset, txListDone, setTxListOffset, setTxListDone,
  invalidateTxCache, render
} from '../state.js';
import { SPEND_PERIODS, periodRange } from '../components/periodSelector.js';
import { attachTxRowActions } from '../components/txRow.js';

const TX_PAGE_SIZE = 20;

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
      <div class="tx-table-row">
        <span class="mono" style="color:var(--muted);font-size:12.5px;"><span class="tx-type-dot" style="background:${meta.color};" title="${meta.label}"></span>${l.occurred_on}</span>
        <span>${esc(l.from_name)}</span>
        <span>${esc(l.to_name)}</span>
        <span style="font-size:12.5px;color:var(--faint);">${esc(l.memo ?? '')}</span>
        <span class="mono" style="text-align:right;color:${meta.color};">${yen(l.amount)}</span>
        <span style="display:flex;gap:4px;justify-content:flex-end;">
          <button type="button" class="btn-sm tx-edit" data-id="${l.id}">編集</button>
          <button type="button" class="btn-sm danger tx-delete" data-id="${l.id}">削除</button>
        </span>
      </div>
    `;
    })
    .join('') || '<p style="padding:16px 0;font-size:13px;color:var(--faint);">該当する記録がありません</p>';
}

export async function renderTxListPage() {
  // Node types (from/to) drive the 支出/収入/振替 classification below - not
  // needed for anything else on this page, but loadAllNodesWithPaths also
  // (re)populates the nodesById cache other pages already rely on.
  await loadAllNodesWithPaths();

  const period = cache.txPeriod;
  const search = (state.txSearch ?? '').trim().toLowerCase();
  const filtered = filterTxRows(cache.txListRows, search);
  const total = cache.txListRows.length;

  const periodSelect = `
    <select id="tx-period-select" style="width:auto;padding:5px 8px;font-size:11.5px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);">
      ${Object.entries(SPEND_PERIODS).map(([value, label]) => `<option value="${value}" ${period === value ? 'selected' : ''}>${label}</option>`).join('')}
    </select>
  `;

  return `
    <section class="card">
      <div class="card-head">
        <div>
          <h1>取引一覧</h1>
          <p style="margin:2px 0 0;font-size:12.5px;color:var(--muted);">読み込み済み ${total} 件・${SPEND_PERIODS[period]}</p>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
          ${periodSelect}
          <input id="tx-search" type="text" placeholder="メモ・ノードで検索" value="${esc(state.txSearch ?? '')}" style="padding:8px 11px;font-size:13px;border:1px solid var(--input-border);border-radius:8px;background:var(--input-bg);min-width:180px;">
        </div>
      </div>
      <div class="legend" style="margin-top:8px;">
        <span><span class="swatch" style="background:var(--negative);"></span>支出</span>
        <span><span class="swatch" style="background:var(--accent);"></span>収入</span>
        <span><span class="swatch" style="background:var(--secondary);"></span>振替</span>
      </div>

      <div style="margin-top:12px;">
        <div class="tx-table-head">
          <span>日付</span><span>出どころ</span><span>行き先</span><span>メモ</span><span style="text-align:right;">金額</span><span></span>
        </div>
        <div id="tx-rows">${buildTxRows(filtered)}</div>
        <div style="display:flex;justify-content:center;padding:16px 0 18px;">
          ${txListDone ? '<span style="font-size:12px;color:var(--faint);">すべて読み込みました</span>' : '<button id="load-more-btn" class="btn">さらに読み込む</button>'}
        </div>
      </div>
    </section>
  `;
}

export function wireTxList() {
  attachTxRowActions(document.getElementById('tx-rows'));

  document.getElementById('tx-search').addEventListener('input', (e) => {
    state.txSearch = e.target.value;
    renderTxRowsInPlace();
  });

  document.getElementById('tx-period-select').addEventListener('change', async (e) => {
    cache.txPeriod = e.target.value;
    invalidateTxCache();
    await render();
  });

  const loadMoreBtn = document.getElementById('load-more-btn');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', async () => {
      await fetchTxPage(false);
      render();
    });
  }
}

function renderTxRowsInPlace() {
  const search = (state.txSearch ?? '').trim().toLowerCase();
  const rowsEl = document.getElementById('tx-rows');
  rowsEl.innerHTML = buildTxRows(filterTxRows(cache.txListRows, search));
  attachTxRowActions(rowsEl);
}
