import { ui } from '../state.js';
import { yen } from '../lib/format.js';

// Plot geometry (px). Height is fixed so the chart never scrolls vertically;
// only the horizontal day pitch depends on the measured container width.
const BAR_CHART_PLOT_H = 120;
const BAR_CHART_PAD_Y = 4;
const BAR_CHART_TICK_H = 18;
const BAR_CHART_VISIBLE_DAYS = 30;
const BAR_CHART_LABEL_GAP = 8;
const MS_PER_DAY = 86400000;

// Tick intervals tried in order, finest first. All are calendar-aligned (not
// "every N days from the first bar") so ticks line up with the month dividers.
// `span` is the nominal day distance between ticks, used to pick the finest
// interval whose labels still fit at the current pitch.
const BAR_TICK_STEPS = [
  { span: 10, isTick: (d) => d.day === 1 || d.day === 11 || d.day === 21 },
  { span: 15, isTick: (d) => d.day === 1 || d.day === 16 },
  ...[1, 2, 3, 6, 12].map((n) => ({ span: 30 * n, isTick: (d) => d.day === 1 && (d.month - 1) % n === 0 })),
];

// One entry per calendar day from the first line through today. A day with
// no line has value null in 1日あたり mode (no bar), but in 累積 mode it
// carries the previous day's cumulative_balance - the balance didn't stop
// existing just because nothing moved that day. This only repeats a value
// v_cumulative already returned; no summing happens here.
function buildChartDays(points, valueKey) {
  const pointByDate = new Map(points.map((p) => [p.occurred_on, p]));
  const [fy, fm, fd] = points[0].occurred_on.split('-').map(Number);
  const [ly, lm, ld] = points[points.length - 1].occurred_on.split('-').map(Number);
  const now = new Date();
  const todayUTC = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const firstUTC = Date.UTC(fy, fm - 1, fd);
  const lastUTC = Math.max(Date.UTC(ly, lm - 1, ld), todayUTC);
  const totalDays = Math.round((lastUTC - firstUTC) / MS_PER_DAY) + 1;
  const carryForward = valueKey === 'cumulative_balance';

  let carried = null;
  return Array.from({ length: totalDays }, (_, i) => {
    const dt = new Date(firstUTC + i * MS_PER_DAY);
    const year = dt.getUTCFullYear();
    const month = dt.getUTCMonth() + 1;
    const day = dt.getUTCDate();
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const p = pointByDate.get(iso);
    let value = p ? Number(p[valueKey]) : null;
    if (carryForward) {
      if (p) carried = value;
      else value = carried;
    }
    return { iso, year, month, day, value };
  });
}

// Scale from the shown mode's own values over the whole period (not just the
// visible window, and never mixed with the other mode's series), so scrolling
// doesn't rescale and 1日あたり bars aren't squashed by the 累積 range. Always
// spans 0, so the zero axis stays put; it's asymmetric (an all-positive node
// gets the full height above zero).
function computeChartScale(days) {
  let max = 0;
  let min = 0;
  for (const d of days) {
    if (d.value === null) continue;
    if (d.value > max) max = d.value;
    if (d.value < min) min = d.value;
  }
  if (max === min) max = 1;
  const zeroY = BAR_CHART_PAD_Y + (BAR_CHART_PLOT_H * max) / (max - min);
  return { max, min, zeroY };
}

// Static shell: y-axis labels (width-independent) + an empty scroll area.
// The bars are drawn by mountBarChart once the scroll area's width is known,
// since the day pitch is derived from it.
export function renderBarChartAxis(points, valueKey, hidden) {
  if (points.length === 0) return '<p style="font-size:13px;color:var(--faint);">データなし</p>';

  const days = buildChartDays(points, valueKey);
  const scale = computeChartScale(days);
  const axisLabel = (n) => (hidden ? '••••••' : yen(n));
  const top = BAR_CHART_PAD_Y;
  const bottom = BAR_CHART_PAD_Y + BAR_CHART_PLOT_H;
  const labels = [];
  // shift keeps the max/min labels inside the plot instead of centered on its edge.
  if (scale.max > 0) labels.push({ y: top, shift: '0', text: axisLabel(scale.max) });
  if (scale.min < 0) labels.push({ y: bottom, shift: '-100%', text: axisLabel(scale.min) });
  // 0 yields to max/min when they'd overlap - the zero line itself stays visible.
  if (labels.every((l) => Math.abs(l.y - scale.zeroY) >= 12)) {
    const zeroShift = scale.zeroY <= top + 6 ? '0' : scale.zeroY >= bottom - 6 ? '-100%' : '-50%';
    labels.push({ y: scale.zeroY, shift: zeroShift, text: '0' });
  }

  return `
    <div class="bar-chart">
      <div class="y-axis-labels mono" style="height:${bottom + BAR_CHART_PAD_Y}px;">
        ${labels.map((l) => `<span style="top:${l.y}px;transform:translateY(${l.shift});">${l.text}</span>`).join('')}
      </div>
      <div class="bar-chart-scroll" id="bar-chart-scroll" style="height:${bottom + BAR_CHART_PAD_Y + BAR_CHART_TICK_H}px;"></div>
    </div>
  `;
}

// Rough label width for IBM Plex Mono at the tick font size - only used to
// decide spacing, so a slight overestimate is fine.
const tickLabelWidth = (text) => text.length * 6.2;

function renderBarChartSvg(days, scale, pitch, viewWidth, hidden) {
  const contentWidth = days.length * pitch;
  const width = Math.max(contentWidth, viewWidth);
  // Fewer than 30 days of history: right-align so the latest day still sits
  // at the right edge, same as when there's more to scroll through.
  const x0 = width - contentWidth;
  const plotBottom = BAR_CHART_PAD_Y + BAR_CHART_PLOT_H;
  const height = plotBottom + BAR_CHART_PAD_Y + BAR_CHART_TICK_H;
  const range = scale.max - scale.min;
  const barW = Math.max(1, pitch * 0.7);
  const barInset = (pitch - barW) / 2;

  const monthLines = [];
  const bars = [];
  days.forEach((d, i) => {
    const x = x0 + i * pitch;
    if (d.day === 1 && i > 0) monthLines.push(`<line class="bc-month" x1="${x}" x2="${x}" y1="0" y2="${plotBottom + BAR_CHART_PAD_Y}" />`);
    if (d.value === null || d.value === 0) return;
    const h = Math.max(1.5, (Math.abs(d.value) / range) * BAR_CHART_PLOT_H);
    const y = d.value > 0 ? scale.zeroY - h : scale.zeroY;
    const title = `${d.iso}: ${hidden ? '••••••' : yen(d.value)}`;
    bars.push(`<rect class="${d.value > 0 ? 'bc-pos' : 'bc-neg'}" x="${x + barInset}" y="${y}" width="${barW}" height="${h}" rx="1"><title>${title}</title></rect>`);
  });

  // Finest calendar-aligned interval whose labels don't crowd at this pitch.
  const minSpacing = tickLabelWidth('12/31') + BAR_CHART_LABEL_GAP;
  const step = BAR_TICK_STEPS.find((s) => s.span * pitch >= minSpacing) ?? BAR_TICK_STEPS[BAR_TICK_STEPS.length - 1];
  const tickText = (d) => (d.month === 1 && d.day === 1 ? `${d.year}/1/1` : `${d.month}/${d.day}`);
  const tickBox = (i) => {
    const text = tickText(days[i]);
    const w = tickLabelWidth(text);
    const cx = x0 + i * pitch + pitch / 2;
    // Clamp at the edges instead of letting the label run off the SVG.
    const left = Math.min(Math.max(cx - w / 2, 0), width - w);
    return { text, left, right: left + w };
  };

  // The latest day always gets a label; regular ticks that would collide
  // with it (or with the previous kept tick) are dropped.
  const lastIdx = days.length - 1;
  const latest = tickBox(lastIdx);
  const ticks = [];
  days.forEach((d, i) => {
    if (i === lastIdx || !step.isTick(d)) return;
    const box = tickBox(i);
    if (box.right + BAR_CHART_LABEL_GAP > latest.left) return;
    const prev = ticks[ticks.length - 1];
    if (prev && box.left < prev.right + BAR_CHART_LABEL_GAP) return;
    ticks.push(box);
  });
  ticks.push(latest);
  const tickY = plotBottom + BAR_CHART_PAD_Y + 13;
  const tickEls = ticks.map((t) => `<text class="bc-tick mono" x="${t.left}" y="${tickY}">${t.text}</text>`);

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" class="bar-chart-svg">
      <rect class="bc-bg" x="0.5" y="0.5" width="${width - 1}" height="${plotBottom + BAR_CHART_PAD_Y - 1}" rx="8" />
      ${monthLines.join('')}
      <line class="bc-zero" x1="0" x2="${width}" y1="${scale.zeroY}" y2="${scale.zeroY}" />
      ${bars.join('')}
      ${tickEls.join('')}
    </svg>
  `;
}

// Draws the bars into the shell from renderBarChartAxis. The pitch is chosen
// so exactly BAR_CHART_VISIBLE_DAYS fit the visible width, and the whole
// history is drawn at once so native horizontal scrolling moves through it
// continuously (no paging, no scroll-snap). Scroll position is kept as "days
// from the right edge" in ui.chartScrollDaysFromRight, so it survives a
// re-render (mode toggle, mask toggle) and a resize that changes the pitch.
let barChartResizeObserver = null;
export function mountBarChart(points, valueKey, hidden) {
  barChartResizeObserver?.disconnect();
  barChartResizeObserver = null;
  const scrollEl = document.getElementById('bar-chart-scroll');
  if (!scrollEl || points.length === 0) return;

  const days = buildChartDays(points, valueKey);
  const scale = computeChartScale(days);
  let pitch = 0;

  const draw = () => {
    const viewWidth = scrollEl.clientWidth;
    if (viewWidth === 0) return;
    pitch = viewWidth / BAR_CHART_VISIBLE_DAYS;
    scrollEl.innerHTML = renderBarChartSvg(days, scale, pitch, viewWidth, hidden);
    const maxScroll = scrollEl.scrollWidth - viewWidth;
    scrollEl.scrollLeft = maxScroll - ui.chartScrollDaysFromRight * pitch;
  };
  draw();

  scrollEl.addEventListener('scroll', () => {
    if (!pitch) return;
    const maxScroll = scrollEl.scrollWidth - scrollEl.clientWidth;
    ui.chartScrollDaysFromRight = Math.max(0, (maxScroll - scrollEl.scrollLeft) / pitch);
  }, { passive: true });

  let lastWidth = scrollEl.clientWidth;
  barChartResizeObserver = new ResizeObserver(() => {
    if (scrollEl.clientWidth === lastWidth) return;
    lastWidth = scrollEl.clientWidth;
    draw();
  });
  barChartResizeObserver.observe(scrollEl);

  // Touch and trackpad scroll natively; a mouse needs drag-to-scroll added.
  let drag = null;
  scrollEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, scrollLeft: scrollEl.scrollLeft };
    scrollEl.setPointerCapture(e.pointerId);
    scrollEl.classList.add('dragging');
  });
  scrollEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    scrollEl.scrollLeft = drag.scrollLeft - (e.clientX - drag.x);
  });
  const endDrag = () => {
    drag = null;
    scrollEl.classList.remove('dragging');
  };
  scrollEl.addEventListener('pointerup', endDrag);
  scrollEl.addEventListener('pointercancel', endDrag);
}
