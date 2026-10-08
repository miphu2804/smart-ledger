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

  if (!res.ok) {
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
    debugLog('api', '✗', method, path, res.status, code, traceId ? `trace=${traceId}` : '', took());
    if (res.status === 401 && opts.handle401 !== false) unauthorizedHandler?.();
    throw new ApiError(res.status, code, message, traceId, details);
  }
  debugLog('api', '✓', method, path, res.status, took());
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
