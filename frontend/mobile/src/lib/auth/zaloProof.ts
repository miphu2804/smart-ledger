/**
 * Phần không dùng DOM của luồng đăng nhập Zalo trên web (hợp đồng Zalo CORE-015, docs/contracts/api-contracts.md):
 * mã ngẫu nhiên, `clientChallenge` và đọc message mà trang callback của Core gửi về cửa sổ app.
 * Tách riêng để kiểm thử bằng `node --test`; phần mở popup nằm ở `zaloLogin.web.ts`.
 */

/** Định dạng `proof`, `clientVerifier`, `clientChallenge`: 43 ký tự base64url (32 byte). */
export const ZALO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ZaloPurpose = 'LOGIN' | 'LINK';

export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Chuỗi ngẫu nhiên base64url; 32 byte cho ra đúng 43 ký tự như Core đòi với `clientVerifier`. */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

/** SHA-256 của `clientVerifier` (ASCII), base64url không "=": khớp `ZaloCrypto.hash` ở Core khi đổi proof. */
export async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

export type ZaloMessageResult = { kind: 'ignore' } | { kind: 'proof'; proof: string } | { kind: 'error'; error: string };

/**
 * Đọc một message gửi tới cửa sổ app. Chỉ nhận message từ đúng origin của Core, đúng cửa sổ popup đã mở và đúng
 * `requestId`/`purpose` của lượt này; message khác (tiện ích trình duyệt, tab khác, lượt cũ) bỏ qua chứ không coi là lỗi.
 */
export function readZaloMessage(
  origin: string,
  fromPopup: boolean,
  data: unknown,
  expected: { coreOrigin: string; requestId: string; purpose: ZaloPurpose },
): ZaloMessageResult {
  if (origin !== expected.coreOrigin || !fromPopup || !data || typeof data !== 'object') return { kind: 'ignore' };
  const m = data as Record<string, unknown>;
  if (m.type !== 'smartledger:zalo' || m.requestId !== expected.requestId || m.purpose !== expected.purpose) {
    return { kind: 'ignore' };
  }
  if (typeof m.error === 'string' && m.error) return { kind: 'error', error: m.error };
  if (typeof m.proof === 'string' && ZALO_TOKEN.test(m.proof)) return { kind: 'proof', proof: m.proof };
  return { kind: 'error', error: 'invalid_message' };
}
