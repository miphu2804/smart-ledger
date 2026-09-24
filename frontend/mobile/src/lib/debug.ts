/**
 * Công cụ debug — CHỈ chạy khi dev (__DEV__). Xem log ở terminal đang chạy `expo start`,
 * hoặc `adb logcat -s ReactNativeJS`, hoặc màn "Chẩn đoán kết nối" (Khác → Chẩn đoán).
 * Quy tắc: không ghi token, mật khẩu, số điện thoại/email đầy đủ vào log.
 */
export interface DebugEvent {
  at: number;
  tag: string;
  text: string;
}

const MAX_EVENTS = 60;
const events: DebugEvent[] = [];

const fmt = (a: unknown): string => {
  if (typeof a === 'string') return a;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
};

export function debugLog(tag: string, ...args: unknown[]) {
  if (!__DEV__) return;
  const text = args.map(fmt).join(' ');
  events.push({ at: Date.now(), tag, text });
  if (events.length > MAX_EVENTS) events.shift();
  console.log(`[${tag}] ${text}`);
}

/** Mới nhất trước */
export const getDebugEvents = (): DebugEvent[] => [...events].reverse();
export const clearDebugEvents = () => {
  events.length = 0;
};

/** "+84901234567" -> "+••••••••567"; "ab@x.com" -> "a•@x.com" */
export function maskId(id?: string | null): string {
  if (!id) return '';
  if (id.includes('@')) {
    const [name, domain] = id.split('@');
    return `${name.slice(0, 1)}${'•'.repeat(Math.max(1, name.length - 1))}@${domain}`;
  }
  return id.replace(/\d(?=\d{3})/g, '•');
}

/** Đọc phần claims của một JWT (chỉ để hiển thị aud/iss/exp…; KHÔNG kiểm tra chữ ký). */
export function decodeJwtClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const decode = (globalThis as { atob?: (s: string) => string }).atob;
    if (!decode) return null;
    return JSON.parse(decode(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
