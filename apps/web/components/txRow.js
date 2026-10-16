import { esc, yen } from '../lib/format.js';
import { linesById, go } from '../state.js';

// Marks a line flagged lines.exclude_from_flow_totals - it still moves every
// balance, so the row stays in each list; only 収支 totals leave it out.
export const excludedBadge = (l) => (l.exclude_from_flow_totals ? '<span class="badge-excluded" title="収支の集計・構成比から除外されています(残高には含まれます)">集計外</span>' : '');

// 列は「日付 | 出どころ → 行き先 | メモ | 金額 | ›」(取引一覧と同じ並び)。
// 行にボタンを置かず、行全体のタップで編集に入る(attachTxRowActions)。
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

// Any element carrying data-line-id (this row, or 取引一覧's table rows)
// opens that line in the edit flow. Deleting lives in the edit form.
export function attachTxRowActions(container) {
  container.querySelectorAll('[data-line-id]').forEach((el) => {
    const open = () => go('record', { editLine: linesById.get(el.dataset.lineId) });
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open();
      }
    });
  });
}
