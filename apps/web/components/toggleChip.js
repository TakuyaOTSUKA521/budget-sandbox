import { esc } from '../lib/format.js';

// オン/オフの絞り込み・フラグ。左のチェック枠で今の状態が見える。
// 無効(disabled)のときは枠・文字とも薄色にするだけで、理由の説明文は出さない。
export function toggleChip(id, label, { on = false, disabled = false } = {}) {
  return `<button type="button" class="toggle-chip" id="${id}" aria-pressed="${on && !disabled}"${disabled ? ' disabled' : ''}><span class="tc-box" aria-hidden="true"></span>${esc(label)}</button>`;
}

export function isToggleChipOn(id) {
  const el = document.getElementById(id);
  return Boolean(el && !el.disabled && el.getAttribute('aria-pressed') === 'true');
}

// Flips the chip in place and reports the new value. Callers that filter a
// page just render() in onChange; a form field (集計から除外) can pass none
// and read it back with isToggleChipOn() on submit.
export function wireToggleChip(id, onChange = () => {}) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('click', () => {
    const next = el.getAttribute('aria-pressed') !== 'true';
    el.setAttribute('aria-pressed', String(next));
    onChange(next);
  });
}
