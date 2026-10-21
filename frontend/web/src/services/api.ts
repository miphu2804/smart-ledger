/**
 * HTTP client cho Core (dùng khi USE_MOCK = false). Mọi đường dẫn tương đối với `/api/v1`, gửi kèm ID token Firebase
 * còn hạn (tự làm mới). Lỗi đọc theo định dạng của Core: `{ code, message, traceId }`.
 */
import { API_ENDPOINT } from '../config'
import { clearSession, getIdToken } from './authService'

export const API_BASE = `${API_ENDPOINT}/api/v1`

export class ApiError extends Error {
  status: number
  code?: string
  constructor(status: number, message: string, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdToken()
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.')
  }
  if (!res.ok) {
    let message = `Lỗi máy chủ (${res.status})`
    let code: string | undefined
    try {
      const body = (await res.json()) as { code?: string; message?: string; detail?: string }
      code = body.code
      message = body.message ?? body.detail ?? message
    } catch {
      /* body không phải JSON */
    }
    // 401: phiên hết hạn -> xoá phiên rồi về trang đăng nhập (không xoá thì LoginPage thấy phiên cũ và đẩy ngược về /admin).
    if (res.status === 401) {
      clearSession()
      if (typeof window !== 'undefined' && window.location.pathname !== '/admin/login') window.location.assign('/admin/login')
    }
    if (res.status === 403) message = 'Tài khoản không có quyền thực hiện thao tác này.'
    throw new ApiError(res.status, message, code)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export function toQueryString(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '' && v !== 'all') q.set(k, String(v))
  }
  const s = q.toString()
  return s ? `?${s}` : ''
}
