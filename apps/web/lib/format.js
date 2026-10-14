export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function yen(n) {
  const v = Number(n ?? 0);
  return (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('ja-JP');
}

// toISOString() は UTC なので使わない(日本時間 0〜9時に前日になる)。端末のローカル日付で作る
export function todayISODate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function monthStart(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
}
