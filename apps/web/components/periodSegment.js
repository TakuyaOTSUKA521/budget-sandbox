import { esc } from '../lib/format.js';
import { SPEND_PERIODS } from './periodSelector.js';
import { segmented, wireSegmented } from './segmented.js';

// 期間専用のセグメント。常に「今月/先月/直近30日/全期間」の順。幅 640px 以下では
// CSS で <select> に畳む(両方を出力し、表示だけ切り替える)。選択状態は各画面が
// 自分の state.*Period / cache.txPeriod に持つ(画面間で共有しない)。
export function periodSegment(id, selected) {
  const options = Object.entries(SPEND_PERIODS);
  return `
    <div class="period-segment">
      ${segmented(id, options, selected, { ariaLabel: '期間' })}
      <select class="period-select" id="${id}-select" aria-label="期間">
        ${options.map(([value, label]) => `<option value="${value}" ${value === selected ? 'selected' : ''}>${esc(label)}</option>`).join('')}
      </select>
    </div>
  `;
}

export function wirePeriodSegment(id, onChange) {
  wireSegmented(id, onChange);
  document.getElementById(`${id}-select`)?.addEventListener('change', (e) => onChange(e.target.value));
}
