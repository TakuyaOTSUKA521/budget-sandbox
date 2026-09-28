export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function yen(n) {
  const v = Number(n ?? 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('ja-JP');
}

export function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export function monthStart(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}
