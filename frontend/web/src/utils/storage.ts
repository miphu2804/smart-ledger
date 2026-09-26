/**
 * Bọc localStorage/sessionStorage trong try/catch — trình duyệt ẩn danh,
 * iframe bị chặn cookie… có thể ném lỗi khi truy cập.
 */
type Kind = 'local' | 'session'

function getStore(kind: Kind): Storage | null {
  try {
    const s = kind === 'local' ? window.localStorage : window.sessionStorage
    return s ?? null
  } catch {
    return null
  }
}

export function readJSON<T>(key: string, kind: Kind = 'local'): T | null {
  try {
    const raw = getStore(kind)?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function writeJSON(key: string, value: unknown, kind: Kind = 'local'): boolean {
  try {
    const s = getStore(kind)
    if (!s) return false
    s.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function removeKey(key: string, kind: Kind = 'local'): void {
  try {
    getStore(kind)?.removeItem(key)
  } catch {
    /* bỏ qua */
  }
}
