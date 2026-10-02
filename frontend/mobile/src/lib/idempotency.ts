import { ApiError } from './apiError';

/**
 * `Idempotency-Key` cho các POST ghi tiền của Core (`/expenses`, `/debts/{id}/payments`), xem
 * docs/contracts/api-contracts.md mục 0.
 * - Một hành động dùng một key. Gửi lại cùng nội dung sau lỗi mạng/timeout/5xx trong `RETRY_WINDOW_MS` thì dùng lại
 *   key cũ, nên nếu lần trước Core đã ghi xong thì chỉ trả lại kết quả cũ, không ghi tiền lần hai.
 * - Mỗi nội dung giữ key riêng: chuyển sang thao tác khác (ví dụ trả nợ khách B) rồi quay lại thì vẫn dùng đúng key cũ.
 * - Thành công, Core từ chối bằng lỗi 4xx (đã rollback, không ghi gì) hoặc quá `RETRY_WINDOW_MS` → lần sau dùng key mới,
 *   để một khoản giống hệt ghi lại sau đó không bị coi là lần thử lại.
 */
export const RETRY_WINDOW_MS = 10 * 60 * 1000;

export function newIdempotencyKey(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  // Hermes chưa chắc có crypto.randomUUID: UUID v4 từ Math.random đủ để không trùng giữa các hành động của một tiệm.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface IdempotentSender {
  send<T>(payload: unknown, request: (idempotencyKey: string) => Promise<T>): Promise<T>;
}

/** Mỗi loại thao tác giữ các key đang chờ (lần gửi chưa biết kết quả), theo nội dung gửi. */
export function createIdempotentSender(now: () => number = Date.now): IdempotentSender {
  const pending = new Map<string, { key: string; firstSentAt: number }>();
  return {
    async send<T>(payload: unknown, request: (idempotencyKey: string) => Promise<T>): Promise<T> {
      const at = now();
      for (const [fingerprint, entry] of pending) {
        if (at - entry.firstSentAt >= RETRY_WINDOW_MS) pending.delete(fingerprint);
      }
      const fingerprint = JSON.stringify(payload);
      let attempt = pending.get(fingerprint);
      if (!attempt) {
        attempt = { key: newIdempotencyKey(), firstSentAt: at };
        pending.set(fingerprint, attempt);
      }
      const settle = () => {
        if (pending.get(fingerprint) === attempt) pending.delete(fingerprint);
      };
      try {
        const result = await request(attempt.key);
        settle();
        return result;
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) settle();
        throw err;
      }
    },
  };
}
