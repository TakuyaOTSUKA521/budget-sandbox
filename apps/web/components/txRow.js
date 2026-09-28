import { deleteLine } from '../packages/core/lines.js';
import { supabase } from '../lib/supabase.js';
import { esc, yen } from '../lib/format.js';
import { state, ui, linesById, setSelectedToNode, invalidateTxCache, go, render } from '../state.js';

// Marks a line flagged lines.exclude_from_flow_totals - it still moves every
// balance, so the row stays in each list; only 収支 totals leave it out.
export const excludedBadge = (l) => (l.exclude_from_flow_totals ? '<span class="badge-excluded" title="収支の集計・構成比から除外されています(残高には含まれます)">集計外</span>' : '');

export function renderTxRow(l) {
  linesById.set(l.id, l);
  return `
    <div class="row">
      <span class="row-date mono">${l.occurred_on}</span>
      <div class="row-main">
        <div>${esc(l.from_name)} → ${esc(l.to_name)}${excludedBadge(l)}</div>
        ${l.memo ? `<div class="row-memo">${esc(l.memo)}</div>` : ''}
      </div>
      <span class="mono">${yen(l.amount)}</span>
      <span class="row-actions">
        <button type="button" class="btn-sm tx-edit" data-id="${l.id}">編集</button>
        <button type="button" class="btn-sm danger tx-delete" data-id="${l.id}">削除</button>
      </span>
    </div>
  `;
}

export function attachTxRowActions(container) {
  container.querySelectorAll('.tx-edit').forEach((btn) => {
    btn.addEventListener('click', () => {
      const line = linesById.get(btn.dataset.id);
      go('record', { editLine: line });
    });
  });
  container.querySelectorAll('.tx-delete').forEach((btn) => {
    btn.addEventListener('click', () => handleDeleteLine(btn.dataset.id));
  });
}

async function handleDeleteLine(lineId) {
  if (!confirm('この取引を削除しますか？')) return;
  await deleteLine(supabase, lineId);
  // renderRecordPage re-derives editingLineId from state.editLine, so that
  // (not just editingLineId) must go, or the form stays in 更新 mode for a
  // line that no longer exists.
  if (state.editLine?.id === lineId) {
    state.editLine = null;
    setSelectedToNode(null);
    ui.recordSlot = 'to';
    ui.resetRecordForm = true;
  }
  invalidateTxCache();
  await render();
}
