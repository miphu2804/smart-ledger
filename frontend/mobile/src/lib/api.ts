import { fetch as expoFetch } from 'expo/fetch';
import { API_ENDPOINT, USE_MOCK } from '../config';
import { authClient } from './auth';
import { ApiError } from './apiError';
import type { ApiErrorDetail } from './apiError';
import { debugLog } from './debug';
import { resetAllIdempotentSenders } from './idempotency';
import { mockCoreRequest } from './mockCore';

/**
 * Client gọi Core (backend/core, Spring Boot):
 * - Base `${API_ENDPOINT}/api/v1`. Mọi request gửi `Authorization: Bearer <Firebase ID token>`; Core tự xác thực
 *   token bằng Firebase Admin SDK. Token lấy mới mỗi request (SDK tự làm mới khi gần hết hạn, app không tự lưu).
 * - Endpoint nghiệp vụ của OWNER gửi thêm `X-Shop-Id` (bật bằng `withShop`). POST ghi tiền gửi thêm
 *   `Idempotency-Key` (`idempotencyKey`, sinh/giữ key ở `idempotency.ts`).
 * - Lỗi của Core: `{ code, message, details?, traceId }` (details: `[{ field, issue }]`). Lỗi của AI service: `{ detail }`.
 *   401 → đăng xuất.
 * - Quá thời gian chờ (mặc định 15 giây) → ApiError status 0, code 'timeout' (không để app quay vô hạn khi
 *   sai IP hoặc tường lửa chặn).
 * - EXPO_PUBLIC_USE_MOCK=true (xem src/config.ts): các endpoint nghiệp vụ (danh mục/sản phẩm, đơn nháp, bán
 *   hàng, công nợ, khách hàng, chi phí) được `mockCore.ts` phục vụ từ dữ liệu mẫu trong bộ nhớ — KHÔNG gọi
 *   mạng — để màn hình xem trước dùng được khi chưa có Core thật chạy.
 */
export { ApiError };
export type { ApiErrorDetail };

const DEFAULT_TIMEOUT_MS = 15000;

let unauthorizedHandler: (() => void) | null = null;
let activeShopId: string | null = null;

/** AppStore đăng ký: gặp 401 thì đăng xuất Firebase, xoá phiên và về màn đăng nhập. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

/** Tiệm đang chọn — gửi qua header X-Shop-Id khi `withShop: true`. */
export function setActiveShop(id: string | null) {
  // Đổi tiệm hoặc đăng xuất: key đang giữ của tiệm/tài khoản trước không được dùng lại cho tiệm/tài khoản sau.
  if (id !== activeShopId) resetAllIdempotentSenders();
  activeShopId = id;
}

export async function apiRequest<T>(
  path: string,
  opts: {
    method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
    body?: unknown;
    /** Gửi kèm X-Shop-Id (endpoint nghiệp vụ của OWNER) */
    withShop?: boolean;
    /** false = 401 chỉ ném lỗi, không tự đăng xuất (dùng cho bước đổi token lấy phiên lúc đăng nhập) */
    handle401?: boolean;
    timeoutMs?: number;
    /** Header Idempotency-Key — bắt buộc với POST /expenses và POST /debts/{id}/payments */
    idempotencyKey?: string;
  } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');

  if (USE_MOCK) {
    debugLog('api', '→ (mock)', method, path);
    const raw = mockCoreRequest<T>(path, method, opts.body, opts.idempotencyKey);
    const data = raw === undefined ? raw : (JSON.parse(JSON.stringify(raw)) as T);
    debugLog('api', '✓ (mock)', method, path);
    return data;
  }

  const started = Date.now();
  const took = () => `${Date.now() - started}ms`;
  debugLog('api', '→', method, path);

  const token = await authClient.getIdToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_ENDPOINT}/api/v1${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.withShop && activeShopId ? { 'X-Shop-Id': activeShopId } : {}),
        ...(opts.idempotencyKey ? { 'Idempotency-Key': opts.idempotencyKey } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (ctrl.signal.aborted) {
      debugLog('api', '✗', method, path, 'hết thời gian chờ', took(), '→', API_ENDPOINT);
      throw new ApiError(0, 'timeout', 'Máy chủ không phản hồi. Vui lòng kiểm tra địa chỉ máy chủ, mạng và tường lửa');
    }
    debugLog('api', '✗', method, path, 'không kết nối được:', String(err), took(), '→', API_ENDPOINT);
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw await errorFrom(res, method, path, took(), opts.handle401 !== false);
  debugLog('api', '✓', method, path, res.status, took());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * POST nhận server-sent events (`/agent/chat/stream`): gọi `onEvent` cho từng sự kiện ngay khi tới.
 * Lỗi trước sự kiện đầu tiên vẫn là JSON nên ném ApiError như `apiRequest`; `onEvent` ném lỗi thì dừng đọc.
 * Dùng `fetch` của expo vì `fetch` của React Native chỉ trả body khi đã nhận đủ.
 */
export async function apiStream(
  path: string,
  opts: { body: unknown; withShop?: boolean; timeoutMs?: number },
  onEvent: (event: string, data: unknown) => void,
): Promise<void> {
  const started = Date.now();
  const took = () => `${Date.now() - started}ms`;
  debugLog('api', '→ POST', path);

  const token = await authClient.getIdToken();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await expoFetch(`${API_ENDPOINT}/api/v1${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(opts.withShop && activeShopId ? { 'X-Shop-Id': activeShopId } : {}),
      },
      body: JSON.stringify(opts.body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw await errorFrom(res as unknown as Response, 'POST', path, took(), true);

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
        // Mỗi sự kiện kết thúc bằng một dòng trống; phần còn lại chờ lần đọc sau.
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const event = block.match(/^event:\s*(.*)$/m)?.[1];
          const data = block.match(/^data:\s*(.*)$/m)?.[1];
          if (event && data !== undefined) onEvent(event, JSON.parse(data));
        }
      }
    } finally {
      reader.cancel().catch(() => undefined);
    }
    debugLog('api', '✓ POST', path, res.status, took());
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (ctrl.signal.aborted) {
      debugLog('api', '✗ POST', path, 'hết thời gian chờ', took());
      throw new ApiError(0, 'timeout', 'Máy chủ không phản hồi. Vui lòng kiểm tra địa chỉ máy chủ, mạng và tường lửa');
    }
    debugLog('api', '✗ POST', path, 'không kết nối được:', String(err), took());
    throw new ApiError(0, 'network', 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng và thử lại');
  } finally {
    clearTimeout(timer);
  }
}

/** Đọc lỗi Core `{ code, message, details?, traceId }` hoặc lỗi AI `{ detail }` thành ApiError; 401 → đăng xuất. */
async function errorFrom(res: Response, method: string, path: string, took: string, handle401: boolean) {
  let code = 'error';
  let message = `Lỗi máy chủ (${res.status})`;
  let traceId: string | undefined;
  let details: ApiErrorDetail[] = [];
  try {
    const b = (await res.json()) as {
      code?: string;
      message?: string;
      detail?: unknown;
      details?: ApiErrorDetail[];
      traceId?: string;
    };
    code = b.code ?? (typeof b.detail === 'string' ? b.detail : code);
    message = b.message ?? (typeof b.detail === 'string' ? b.detail : message);
    traceId = b.traceId;
    details = Array.isArray(b.details) ? b.details : [];
  } catch {
    /* phản hồi không phải JSON */
  }
  debugLog('api', '✗', method, path, res.status, code, traceId ? `trace=${traceId}` : '', took);
  if (res.status === 401 && handle401) unauthorizedHandler?.();
  return new ApiError(res.status, code, message, traceId, details);
}
