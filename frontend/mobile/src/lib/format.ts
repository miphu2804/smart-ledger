/** 20000 -> "20.000đ" */
export function vnd(n: number, withUnit = true): string {
  const s = Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return withUnit ? `${s}đ` : s;
}

/** 1250000 -> "1,25tr" ; 980000 -> "980k" */
export function compact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) {
    const v = n / 1_000_000;
    return `${v
      .toFixed(v >= 10 ? 1 : 2)
      .replace(/\.?0+$/, '')
      .replace('.', ',')}tr`;
  }
  if (abs >= 1_000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

export function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

export function hhmm(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ddmm(d: Date) {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function sameDay(a: Date, b: Date) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

/** "Hôm nay", "Hôm qua", "3 ngày trước", "12/08" */
export function relDay(d: Date, now = new Date()) {
  const diff = Math.round((startOfDay(now).getTime() - startOfDay(d).getTime()) / 86400000);
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Hôm qua';
  if (diff < 7) return `${diff} ngày trước`;
  return ddmm(d);
}

export function initials(name: string) {
  const w = name.trim().split(/\s+/);
  return (w[w.length - 1]?.[0] ?? '?').toUpperCase();
}

/** Two-letter badge like the prototype: "Trà đá" -> "TĐ" */
export function abbr(name: string) {
  const w = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/);
  if (w.length === 1) return w[0].slice(0, 2).toUpperCase();
  return (w[0][0] + w[1][0]).toUpperCase();
}

export function hashIndex(s: string, mod: number) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export const WEEKDAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

/** bỏ dấu + chữ thường — dùng cho tìm kiếm */
export function normalizeText(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}
