import { esc, yen } from '../lib/format.js';

// 削除・ログアウトなどの確認。見出し・対象の要約・右下に [キャンセル][実行]。
// 赤い塗りボタン(danger)はここにだけ出す。window.confirm() の置き換えなので
// render() を経由せず body に直接重ね、閉じたら取り除く。結果は Promise<boolean>。
export function confirmDialog({ title, summaryHtml = '', confirmLabel = '削除', danger = true }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="confirm-backdrop"></div>
      <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title">
        <h2 id="confirm-dialog-title">${esc(title)}</h2>
        ${summaryHtml ? `<div class="confirm-summary">${summaryHtml}</div>` : ''}
        <div class="confirm-actions">
          <button type="button" class="btn" data-confirm="cancel">キャンセル</button>
          <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-confirm="ok">${esc(confirmLabel)}</button>
        </div>
      </div>
    `;
    const close = (result) => {
      document.removeEventListener('keydown', onKey);
      wrap.remove();
      resolve(result);
    };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    wrap.querySelector('.confirm-backdrop').addEventListener('click', () => close(false));
    wrap.querySelector('[data-confirm="cancel"]').addEventListener('click', () => close(false));
    wrap.querySelector('[data-confirm="ok"]').addEventListener('click', () => close(true));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(wrap);
    wrap.querySelector('[data-confirm="cancel"]').focus();
  });
}

// 取引の要約(日付・出どころ→行き先・金額・メモ)。取引の削除確認で使う。
export function lineSummary(l) {
  return `
    <div class="confirm-line">
      <span class="mono" style="color:var(--muted);">${esc(l.occurred_on)}</span>
      <span>${esc(l.from_name)} → ${esc(l.to_name)}</span>
      <span class="mono">${yen(l.amount)}</span>
      ${l.memo ? `<span></span><span style="color:var(--muted);">${esc(l.memo)}</span><span></span>` : ''}
    </div>
  `;
}
