import { esc } from '../lib/format.js';

// 線画アイコン(線幅2)。表示を編集=目、表示形式=リスト/グリッド。
export const ICONS = {
  eye: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  list: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  grid: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
};

// 36×36 の枠付きアイコンボタン。aria-label 必須(文字を出さないため)。
// `pressed` を渡すとトグルとして aria-pressed を持つ(押下中は強調色の枠と地)。
export function iconButton({ icon, label, pressed = null, attrs = '' }) {
  const pressedAttr = pressed === null ? '' : ` aria-pressed="${pressed}"`;
  return `<button type="button" class="icon-btn" aria-label="${esc(label)}" title="${esc(label)}"${pressedAttr} ${attrs}>${ICONS[icon]}</button>`;
}
