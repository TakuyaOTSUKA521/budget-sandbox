import { pref, render } from '../state.js';
import { yen } from '../lib/format.js';

// Per-node masking (so e.g. a salary or a specific liability can be hidden
// while everything else stays visible). Transaction amounts are left alone -
// hiding what things cost isn't the point, hiding how much money there is, is.
export function isNodeHidden(nodeId) {
  return pref.hiddenNodeIds.has(nodeId);
}

export function maskNodeYen(nodeId, n) {
  return isNodeHidden(nodeId) ? '••••••' : yen(n);
}

// Small icon-only toggle meant to sit inside a clickable row/card; callers
// must stopPropagation so it doesn't also trigger the row's own click.
export function nodeHideToggleButton(nodeId) {
  return `<button type="button" class="node-hide-btn" data-node-hide-id="${nodeId}" title="${isNodeHidden(nodeId) ? 'このノードを表示' : 'このノードを非表示'}">${isNodeHidden(nodeId) ? '🙈' : '🐵'}</button>`;
}

export function toggleNodeHidden(nodeId) {
  if (pref.hiddenNodeIds.has(nodeId)) pref.hiddenNodeIds.delete(nodeId);
  else pref.hiddenNodeIds.add(nodeId);
  localStorage.setItem('kakeibo:hiddenNodeIds', JSON.stringify([...pref.hiddenNodeIds]));
  render();
}

export function netWorthToggleButton() {
  return `<button type="button" id="net-worth-hide-btn" class="node-hide-btn" title="${pref.netWorthHidden ? '純資産を表示' : '純資産を非表示'}">${pref.netWorthHidden ? '🙈' : '🐵'}</button>`;
}

export function toggleNetWorthHidden() {
  pref.netWorthHidden = !pref.netWorthHidden;
  localStorage.setItem('kakeibo:netWorthHidden', pref.netWorthHidden ? '1' : '0');
  render();
}
