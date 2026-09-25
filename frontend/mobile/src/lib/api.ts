import { API_ENDPOINT } from '../config';
import { authClient } from './auth';
import { debugLog } from './debug';

/**
 * Client gọi Core (backend/core, Spring Boot):
 * - Base `${API_ENDPOINT}/api/v1`. Mọi request gửi `Authorization: Bearer <Firebase ID token>`; Core tự xác thực
 *   token bằng Firebase Admin SDK. Token lấy mới mỗi request (SDK tự làm mới khi gần hết hạn, app không tự lưu).
 * - Endpoint nghiệp vụ của OWNER gửi thêm `X-Shop-Id` (bật bằng `withShop`).
 * - Lỗi của Core: `{ code, message, details?, traceId }` (details: `[{ field, issue }]`). Lỗi của AI service: `{ detail }`.
 *   401 → đăng xuất.
 * - Quá thời gian chờ (mặc định 15 giây) → ApiError status 0, code 'timeout' (không để app quay vô hạn khi
 *   sai IP hoặc tường lửa chặn).
 */
export interface ApiErrorDetail {
  field: string;
  issue?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId?: string;
  readonly details: ApiErrorDetail[];
  constructor(status: number, code: string, message: string, traceId?: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;

let unauthorizedHandler: (() => void) | null = null;
let activeShopId: string | null = null;

/** AppStore đăng ký: gặp 401 thì đăng xuất Firebase, xoá phiên và về màn đăng nhập. */
export function setUnauthorizedHandler(fn: (() => void) | null) {
  unauthorizedHandler = fn;
}

/** Tiệm đang chọn — gửi qua header X-Shop-Id khi `withShop: true`. */
export function setActiveShop(id: string | null) {
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
  } = {},
): Promise<T> {
  const method = opts.method ?? (opts.body === undefined ? 'GET' : 'POST');
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
