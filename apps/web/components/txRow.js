import { esc, yen } from '../lib/format.js';
import { linesById } from '../state.js';

// Marks a line flagged lines.exclude_from_flow_totals - it still moves every
// balance, so the row stays in each list; only 収支 totals leave it out.
export const excludedBadge = (l) => (l.exclude_from_flow_totals ? '<span class="badge-excluded" title="収支の集計・構成比から除外されています(残高には含まれます)">集計外</span>' : '');

// 列は「日付 | 出どころ → 行き先 | メモ | 金額 | ›」(取引一覧と同じ並び)。
// 行にボタンを置かず、行全体のタップで取引の編集シートを開く(data-line-id。
// クリックは index.html が root で一括して受ける - 取引一覧の行の差し替えにも効くように)。
export function renderTxRow(l) {
  linesById.set(l.id, l);
  return `
    <div class="tx-row" data-line-id="${l.id}" role="button" tabindex="0">
      <span class="row-date mono">${l.occurred_on}</span>
      <span class="tx-row-nodes">${esc(l.from_name)} → ${esc(l.to_name)}${excludedBadge(l)}</span>
      <span class="tx-row-memo">${esc(l.memo ?? '')}</span>
      <span class="mono" style="text-align:right;">${yen(l.amount)}</span>
      <span class="chev" aria-hidden="true">›</span>
    </div>
  `;
}
