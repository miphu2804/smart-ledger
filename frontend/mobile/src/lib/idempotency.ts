import { ApiError } from './apiError';

/**
 * `Idempotency-Key` cho các POST ghi tiền của Core (`/expenses`, `/debts/{id}/payments`), xem
 * docs/contracts/api-contracts.md mục 0.
 * - Một hành động dùng một key. Gửi lại cùng nội dung sau lỗi mạng/timeout/5xx thì dùng lại key cũ, nên nếu lần
 *   trước Core đã ghi xong thì chỉ trả lại kết quả cũ, không ghi tiền lần hai.
 * - Thành công, hoặc Core từ chối bằng lỗi 4xx (đã rollback, không ghi gì) → hành động sau dùng key mới.
 * - Nội dung khác → key mới (cùng key khác nội dung Core trả 409 idempotency_key_conflict).
 */
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

/** Mỗi loại thao tác giữ một key đang chờ (lần gửi chưa biết kết quả) theo nội dung gửi. */
export function createIdempotentSender(): IdempotentSender {
  let pending: { fingerprint: string; key: string } | null = null;
  return {
    async send<T>(payload: unknown, request: (idempotencyKey: string) => Promise<T>): Promise<T> {
      const fingerprint = JSON.stringify(payload);
      if (pending?.fingerprint !== fingerprint) pending = { fingerprint, key: newIdempotencyKey() };
      const attempt = pending;
      try {
        const result = await request(attempt.key);
        if (pending === attempt) pending = null;
        return result;
      } catch (err) {
        const rejected = err instanceof ApiError && err.status >= 400 && err.status < 500;
        if (rejected && pending === attempt) pending = null;
        throw err;
      }
    },
  };
}
