const vnd = new Intl.NumberFormat('vi-VN')

export function formatVND(n: number): string {
  return `${vnd.format(Math.round(n))}đ`
}

export function formatNumber(n: number): string {
  return vnd.format(n)
}

/** 1.250.000 -> "1,25tr", 850.000 -> "850k" */
export function formatCompactVND(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000
    return `${v.toLocaleString('vi-VN', { maximumFractionDigits: v >= 10 ? 1 : 2 })}tr`
  }
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return String(Math.round(n))
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toLocaleString('vi-VN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatDate(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())} · ${formatDate(iso)}`
}

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function formatRelative(iso: string, now: Date): string {
  const diff = now.getTime() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'Vừa xong'
  if (min < 60) return `${min} phút trước`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} giờ trước`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hôm qua'
  if (d < 30) return `${d} ngày trước`
  const m = Math.floor(d / 30)
  if (m < 12) return `${m} tháng trước`
  return formatDate(iso)
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return (parts[parts.length - 1]?.[0] ?? '?').toUpperCase()
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
export function normalizeVi(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

export const PHONE_RE = /^0\d{9}$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
