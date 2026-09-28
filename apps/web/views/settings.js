import { getLeafNodes, listNodesWithPaths } from '../packages/core/nodes.js';
import { listLines } from '../packages/core/reports.js';
import { supabase, memoKey } from '../lib/supabase.js';
import { esc } from '../lib/format.js';
import { NODE_TYPE_META } from '../lib/nodes.js';
import {
  session, pref, cache, setSession, setNodesById, setLinesById, setChartData, setTxListOffset, setTxListDone, go
} from '../state.js';

export function renderSettingsPage() {
  const defaultFrom = localStorage.getItem('kakeibo:defaultFromNodeId') ?? '';

  return `
    <button type="button" class="back-link" data-go-back>← 戻る</button>
    <div class="grid-fit-300">
      <section class="card">
        <h1 style="margin-bottom:16px;">アカウント</h1>
        <div class="stack" style="gap:14px;">
          <label class="field">メールアドレス<input type="email" value="${esc(session?.user?.email ?? '')}" disabled></label>
        </div>
      </section>

      <section class="card">
        <h2 style="margin-bottom:10px;">表示</h2>
        <div class="row">
          <div><div>通貨</div><div style="font-size:11.5px;color:var(--faint);">金額の表示形式</div></div>
          <span class="btn" style="width:auto;cursor:default;">JPY ¥</span>
        </div>
        <div class="row">
          <div><div>月の開始日</div><div style="font-size:11.5px;color:var(--faint);">集計の区切り</div></div>
          <span class="btn" style="width:auto;cursor:default;">1 日</span>
        </div>
        <div class="row">
          <div><div>既定の出どころ</div><div style="font-size:11.5px;color:var(--faint);">記録画面の初期値(この端末のみ)</div></div>
          <select id="default-from-select" style="width:auto;padding:5px 10px;font-size:12.5px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);"></select>
        </div>
        <div class="row">
          <div><div>グラフの既定表示</div><div style="font-size:11.5px;color:var(--faint);">ノード詳細(この端末のみ)</div></div>
          <select id="default-chart-select" style="width:auto;padding:5px 10px;font-size:12.5px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);">
            <option value="cumulative" ${pref.chartMode === 'cumulative' ? 'selected' : ''}>累積推移</option>
            <option value="daily" ${pref.chartMode === 'daily' ? 'selected' : ''}>1日あたり推移</option>
          </select>
        </div>
      </section>

      <section class="card">
        <h2 style="margin-bottom:10px;">データ</h2>
        <div class="stack" style="gap:8px;align-items:flex-start;">
          <button id="csv-export-btn" class="btn">取引をCSVで書き出す</button>
          <button id="node-csv-export-btn" class="btn">ノード構成をCSVで書き出す</button>
          <button id="settings-logout-btn" class="btn-danger-outline">ログアウト</button>
        </div>
        <p style="margin:16px 0 0;font-size:11.5px;color:var(--faint);line-height:1.7;">記録は Supabase に保存され、memoは端末上で暗号化されます。</p>
      </section>
    </div>
  `;
}

export async function wireSettingsPage() {
  const leaves = await getLeafNodes(supabase);
  const currentDefault = localStorage.getItem('kakeibo:defaultFromNodeId') ?? '';
  const fromSelect = document.getElementById('default-from-select');
  fromSelect.innerHTML = leaves.map((n) => `<option value="${n.id}" ${n.id === currentDefault ? 'selected' : ''}>${esc(n.name)}</option>`).join('');
  fromSelect.addEventListener('change', (e) => localStorage.setItem('kakeibo:defaultFromNodeId', e.target.value));

  document.getElementById('default-chart-select').addEventListener('change', (e) => {
    pref.chartMode = e.target.value;
    localStorage.setItem('kakeibo:chartMode', pref.chartMode);
  });

  document.getElementById('csv-export-btn').addEventListener('click', handleExportCsv);
  document.getElementById('node-csv-export-btn').addEventListener('click', handleExportNodesCsv);

  document.getElementById('settings-logout-btn').addEventListener('click', handleLogout);
}

// Shared CSV download plumbing for the 設定 page's export buttons below.
// Encoding only - no aggregation - so it stays in apps/web rather than
// packages/core.
function csvEscape(value) {
  let s = String(value ?? '');
  // Neutralize spreadsheet formula injection: Excel/Sheets treat a field
  // starting with = + - @ (or a leading tab/CR) as a formula to evaluate
  // when the CSV is opened. memo and node names are free text the account
  // owner can type anything into, so this can't be assumed safe.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, header, rows) {
  const csv = [header, ...rows]
    .map((cols) => cols.map(csvEscape).join(','))
    .join('\r\n');

  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Exports every active line (v_lines, all pages) as a CSV file.
async function handleExportCsv() {
  const btn = document.getElementById('csv-export-btn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '書き出し中…';
  try {
    const rows = [];
    const pageSize = 500;
    for (let offset = 0; ; offset += pageSize) {
      const page = await listLines(supabase, { ascending: true, limit: pageSize, offset }, memoKey);
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    const header = ['日付', '出どころ', '行き先', '金額', 'メモ'];
    downloadCsv(
      `kakeibo_${new Date().toISOString().slice(0, 10)}.csv`,
      header,
      rows.map((l) => [l.occurred_on, l.from_name, l.to_name, l.amount, l.memo])
    );
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// Exports every node (including archived) with its hierarchy path and
// node_type classification - a snapshot of the node tree, not a balance
// report (see summary.js / reports.js for balances). Rows are grouped by
// 分類 then sorted by path so parent/child rows land next to each other.
async function handleExportNodesCsv() {
  const btn = document.getElementById('node-csv-export-btn');
  const originalLabel = btn.textContent;
  btn.disabled = true;
  btn.textContent = '書き出し中…';
  try {
    const nodes = await listNodesWithPaths(supabase, { includeArchived: true });
    const nameById = new Map(nodes.map((n) => [n.id, n.name]));
    const typeOrder = { asset: 0, liability: 1, flow: 2 };
    const sorted = [...nodes].sort((a, b) =>
      typeOrder[a.node_type] - typeOrder[b.node_type] || a.path.localeCompare(b.path)
    );

    const header = ['分類', '階層パス', 'ノード名', '親ノード', '収支から除外', 'アーカイブ済み'];
    downloadCsv(
      `kakeibo_nodes_${new Date().toISOString().slice(0, 10)}.csv`,
      header,
      sorted.map((n) => [
        NODE_TYPE_META[n.node_type].label,
        n.path,
        n.name,
        n.parent_id ? nameById.get(n.parent_id) ?? '' : '',
        n.exclude_from_flow_totals ? '○' : '',
        n.is_archived ? '○' : ''
      ])
    );
  } finally {
    btn.disabled = false;
    btn.textContent = originalLabel;
  }
}

// On a shared device, a second person could reopen this same browser tab
// after a logout without a full page reload - these module-level caches
// (decrypted memo, amounts, balance history included) would otherwise still
// sit in memory even though the UI has moved back to the login page.
async function handleLogout() {
  await supabase.auth.signOut();
  setSession(null);
  setNodesById(new Map());
  setLinesById(new Map());
  setChartData([]);
  cache.txListRows = [];
  setTxListOffset(0);
  setTxListDone(false);
  cache.txPeriod = 'all';
  go('login');
}
