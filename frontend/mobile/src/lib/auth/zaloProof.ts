/**
 * Phần không dùng DOM của luồng đăng nhập Zalo (docs/contracts/api-contracts.md, Zalo CORE-015 cho web và CORE-016 cho
 * Android): mã ngẫu nhiên, `clientChallenge`, đọc message trang callback gửi về cửa sổ web và đọc App Link trả về app.
 * Không dùng Web Crypto hay `btoa` để chạy được cả trên Hermes (Android); kiểm thử bằng `node --test`.
 */
import { secureRandomBytes } from './secureRandom.ts';
import { asciiBytes, sha256 } from './sha256.ts';

/** Định dạng `proof`, `handoffReference`, `clientVerifier`, `clientChallenge`: 43 ký tự base64url (32 byte). */
export const ZALO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export type ZaloPurpose = 'LOGIN' | 'LINK';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** base64url không "=" (RFC 4648 §5). */
export function base64url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63];
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63];
    if (i + 2 < bytes.length) out += ALPHABET[n & 63];
  }
  return out;
}

/** Chuỗi ngẫu nhiên base64url; 32 byte cho ra đúng 43 ký tự như Core đòi với `clientVerifier`. */
export function randomToken(byteLength = 32): string {
  return base64url(secureRandomBytes(byteLength));
}

/** SHA-256 của `clientVerifier` (ASCII), base64url không "=": khớp `ZaloCrypto.hash` ở Core khi đổi proof/reference. */
export async function challengeFor(verifier: string): Promise<string> {
  return base64url(sha256(asciiBytes(verifier)));
}

export type ZaloMessageResult = { kind: 'ignore' } | { kind: 'proof'; proof: string } | { kind: 'error'; error: string };

/**
 * Web: đọc một message gửi tới cửa sổ app. Chỉ nhận message từ đúng origin của Core, đúng cửa sổ popup đã mở và đúng
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

/** Đường dẫn cố định Core redirect về sau khi đăng nhập Zalo trên Android (CORE-016), App Link mở lại app. */
export const ZALO_RETURN_PATH = '/mobile/auth/zalo/complete';

/** Origin (`https://host[:port]`, chữ thường) của một URL tuyệt đối; không dùng `URL` vì Hermes không có đủ API này. */
export function originOf(url: string): string {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url.trim());
  return m ? m[1].toLowerCase() : '';
}

/** true khi URL là App Link trả về của Zalo trên đúng Core (không kể tham số trong fragment). */
export function isZaloReturnUrl(url: string, coreOrigin: string): boolean {
  return url === `${coreOrigin}${ZALO_RETURN_PATH}` || url.startsWith(`${coreOrigin}${ZALO_RETURN_PATH}#`);
}

export type ZaloReturnResult = { kind: 'ignore' } | { kind: 'handoff'; handoffReference: string } | { kind: 'error'; error: string };

/**
 * Android: đọc App Link Core trả về, dạng `https://<core>/mobile/auth/zalo/complete#nativeClientId=…&requestId=…&purpose=…&
 * handoffReference=…` (hoặc `error=<mã>` thay cho reference). Chỉ nhận đúng Core, đúng client, đúng `requestId`/`purpose` của
 * lượt đang chờ; URL khác (lượt cũ, link mở tay) bỏ qua.
 */
export function readZaloReturn(
  url: string,
  expected: { coreOrigin: string; nativeClientId: string; requestId: string; purpose: ZaloPurpose },
): ZaloReturnResult {
  if (!isZaloReturnUrl(url, expected.coreOrigin)) return { kind: 'ignore' };
  const fragment = url.slice(url.indexOf('#') + 1);
  const params: Record<string, string> = {};
  for (const part of fragment.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    try {
      params[decodeURIComponent(part.slice(0, eq))] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      return { kind: 'error', error: 'invalid_return' };
    }
  }
  if (
    params.nativeClientId !== expected.nativeClientId ||
    params.requestId !== expected.requestId ||
    params.purpose !== expected.purpose
  ) {
    return { kind: 'ignore' };
  }
  if (params.error) return { kind: 'error', error: params.error };
  if (ZALO_TOKEN.test(params.handoffReference ?? '')) return { kind: 'handoff', handoffReference: params.handoffReference };
  return { kind: 'error', error: 'invalid_return' };
}
