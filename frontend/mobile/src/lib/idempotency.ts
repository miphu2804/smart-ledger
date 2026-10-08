import { ApiError } from './apiError';

/**
 * `Idempotency-Key` cho các POST ghi tiền của Core (`/expenses`, `/debts/{id}/payments`, sau này `/sales/{id}/void`),
 * xem docs/contracts/api-contracts.md mục 0. Core giữ key theo tiệm + thao tác + người dùng + nội dung: gửi lại cùng key
 * và cùng nội dung thì trả lại kết quả cũ, không ghi tiền lần hai; cùng key khác nội dung thì `409 idempotency_key_conflict`.
 *
 * Quy tắc của bộ gửi:
 * - Một thao tác dùng một key. Gửi lại cùng nội dung sau lỗi mạng/timeout/5xx trong `RETRY_WINDOW_MS` thì dùng lại key
 *   cũ: nếu lần trước Core đã ghi xong mà app không nhận được trả lời thì chỉ nhận lại kết quả cũ.
 * - Hai lần bấm gần như cùng lúc (cùng nội dung) chỉ tạo MỘT yêu cầu; cả hai nhận cùng kết quả.
 * - Core báo 503 (không lấy được khoá, `resource_busy`) thì tự gửi lại đúng yêu cầu với đúng key, vài lần ngắn.
 * - Thành công hoặc Core từ chối bằng 4xx (đã rollback, chưa ghi gì) → lần sau dùng key mới, để một khoản giống hệt ghi
 *   lại sau đó không bị coi là lần thử lại. Quá `RETRY_WINDOW_MS` cũng dùng key mới.
 * - Nội dung so sánh theo JSON chuẩn hoá (khoá sắp xếp, bỏ `undefined`) nên thứ tự thuộc tính không đổi key.
 * - Key chỉ giữ trong bộ nhớ: tắt app giữa chừng thì mất, xem `reset` cho đăng xuất/đổi tiệm.
 */
export const RETRY_WINDOW_MS = 10 * 60 * 1000;

/** Chờ trước mỗi lần tự gửi lại khi Core báo 503; số phần tử = số lần gửi lại tối đa. */
export const BUSY_BACKOFF_MS = [300, 900];

export function newIdempotencyKey(): string {
  const webCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  // Hermes chưa chắc có crypto.randomUUID: UUID v4 từ Math.random đủ để không trùng giữa các hành động của một tiệm.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function canonical(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  const withToJson = value as { toJSON?: () => unknown };
  if (typeof withToJson.toJSON === 'function') return canonical(withToJson.toJSON());
  if (Array.isArray(value)) return value.map((item) => (item === undefined ? null : canonical(item)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    const item = (value as Record<string, unknown>)[key];
    if (item !== undefined) out[key] = canonical(item);
  }
  return out;
}

/** JSON ổn định: cùng một nội dung luôn ra cùng một chuỗi dù thứ tự thuộc tính khác nhau. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value)) ?? 'null';
}

export interface IdempotentSender {
  send<T>(payload: unknown, request: (idempotencyKey: string) => Promise<T>): Promise<T>;
  /** Quên mọi key đang giữ và thôi gộp các yêu cầu đang chạy (đăng xuất, đổi tiệm). */
  reset(): void;
}

export interface IdempotentSenderOptions {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const senders = new Set<IdempotentSender>();

/** Gọi khi đổi tiệm hoặc đăng xuất: key của tiệm/tài khoản trước không được dùng lại cho tiệm/tài khoản sau. */
export function resetAllIdempotentSenders(): void {
  senders.forEach((sender) => sender.reset());
}

/** Mỗi loại thao tác một bộ gửi; giữ các key đang chờ (lần gửi chưa biết kết quả) theo nội dung gửi. */
export function createIdempotentSender(options: IdempotentSenderOptions = {}): IdempotentSender {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const pending = new Map<string, { key: string; firstSentAt: number }>();
  const inFlight = new Map<string, Promise<unknown>>();
  let epoch = 0;

  const sender: IdempotentSender = {
    send<T>(payload: unknown, request: (idempotencyKey: string) => Promise<T>): Promise<T> {
      const fingerprint = canonicalJson(payload);
      const running = inFlight.get(fingerprint);
      if (running) return running as Promise<T>;

      const run = (async (): Promise<T> => {
        const at = now();
        for (const [other, entry] of pending) {
          if (at - entry.firstSentAt >= RETRY_WINDOW_MS) pending.delete(other);
        }
        let attempt = pending.get(fingerprint);
        if (!attempt) {
          attempt = { key: newIdempotencyKey(), firstSentAt: at };
          pending.set(fingerprint, attempt);
        }
        const myEpoch = epoch;
        const settle = () => {
          if (epoch === myEpoch && pending.get(fingerprint) === attempt) pending.delete(fingerprint);
        };
        for (let retry = 0; ; retry++) {
          try {
            const result = await request(attempt.key);
            settle();
            return result;
          } catch (err) {
            if (err instanceof ApiError) {
              if (err.status === 503 && retry < BUSY_BACKOFF_MS.length) {
                await sleep(BUSY_BACKOFF_MS[retry]);
                continue;
              }
              if (err.status >= 400 && err.status < 500) settle();
            }
            throw err;
          }
        }
      })();

      inFlight.set(fingerprint, run);
      const clear = () => {
        if (inFlight.get(fingerprint) === run) inFlight.delete(fingerprint);
      };
      run.then(clear, clear);
      return run;
    },
    reset() {
      epoch++;
      pending.clear();
      inFlight.clear();
    },
  };
  senders.add(sender);
  return sender;
}
