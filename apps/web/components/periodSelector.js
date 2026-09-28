import { monthStart } from '../lib/format.js';

export const SPEND_PERIODS = {
  month: '今月',
  last_month: '先月',
  '30d': '直近30日',
  all: '全期間'
};

// {from, to} bounds (or {null, null} for "all") to scope 消費相手 上位 by.
export function periodRange(period) {
  const today = new Date();
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (period === 'month') return { from: monthStart(today), to: iso(today) };

  if (period === 'last_month') {
    const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDayOfLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
    return { from: monthStart(lastMonth), to: iso(lastDayOfLastMonth) };
  }

  if (period === '30d') {
    const from = new Date(today);
    from.setDate(from.getDate() - 30);
    return { from: iso(from), to: iso(today) };
  }

  return { from: null, to: null };
}
