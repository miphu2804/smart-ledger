/**
 * HTTP client tối giản cho backend thật (dùng khi USE_MOCK = false).
 * TODO(backend): thống nhất định dạng lỗi & đường dẫn với nhóm backend.
 */
import { API_ENDPOINT } from '../config'
import { readJSON } from '../utils/storage'
import type { AuthSession } from '../types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function currentToken(): string | null {
  const s = readJSON<AuthSession>('snl_admin_session') ?? readJSON<AuthSession>('snl_admin_session', 'session')
  return s?.token ?? null
}

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = currentToken()
  const res = await fetch(`${API_ENDPOINT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok) {
    let message = `Lỗi máy chủ (${res.status})`
    try {
      const body = (await res.json()) as { message?: string; detail?: string }
      message = body.message ?? body.detail ?? message
    } catch {
      /* body không phải JSON */
    }
    throw new ApiError(res.status, message)
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
