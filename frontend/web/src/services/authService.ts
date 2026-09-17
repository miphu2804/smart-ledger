/**
 * Đăng nhập & phiên làm việc.
 *
 * Chỉ role ADMIN được dùng trang quản trị. OWNER (chủ cơ sở) vẫn đăng nhập được
 * ở tầng xác thực, nhưng mọi URL /admin/* sẽ trả trang 403 (xem RequireAuth).
 */
import { MOCK_DELAY_MS, USE_MOCK } from '../config'
import { getScenario } from '../mocks/scenario'
import type { AuthSession, Role, SessionUser } from '../types'
import { readJSON, removeKey, writeJSON } from '../utils/storage'
import { request } from './api'

export const SESSION_KEY = 'snl_admin_session'

/** Tài khoản demo cho chế độ mock. */
export const DEMO_ACCOUNTS: { email: string; password: string; role: Role; note: string; user: SessionUser }[] = [
  {
    email: 'admin@songhloi.vn',
    password: 'admin123',
    role: 'ADMIN',
    note: 'Quản trị viên — vào được dashboard',
    user: { id: 'usr_admin_001', fullName: 'Quản trị viên HEXA', email: 'admin@songhloi.vn', role: 'ADMIN' },
  },
  {
    email: 'owner@songhloi.vn',
    password: 'owner123',
    role: 'OWNER',
    note: 'Chủ cơ sở — sẽ nhận trang 403',
    user: { id: 'own_001', fullName: 'Nguyễn Thị Lan', email: 'owner@songhloi.vn', role: 'OWNER' },
  },
]

// Dự phòng khi trình duyệt chặn storage: vẫn đăng nhập được trong phiên hiện tại.
let memorySession: AuthSession | null = null

function persist(session: AuthSession, remember: boolean) {
  memorySession = session
  // "Ghi nhớ đăng nhập" -> localStorage; không ghi nhớ -> sessionStorage (mất khi đóng tab).
  const ok = writeJSON(SESSION_KEY, session, remember ? 'local' : 'session')
  if (ok) removeKey(SESSION_KEY, remember ? 'session' : 'local')
}

export async function login(email: string, password: string, remember = true): Promise<AuthSession> {
  if (USE_MOCK) {
    await new Promise((r) => setTimeout(r, MOCK_DELAY_MS + 450))
    if (getScenario() === 'error') throw new Error('Không kết nối được máy chủ (giả lập lỗi). Vui lòng thử lại.')
    const acc = DEMO_ACCOUNTS.find((a) => a.email === email.trim().toLowerCase() && a.password === password)
    if (!acc) throw new Error('Email hoặc mật khẩu không đúng.')
    const session: AuthSession = {
      accessToken: `mock.${Math.random().toString(36).slice(2)}.${Date.now().toString(36)}`,
      user: acc.user,
      issuedAt: new Date().toISOString(),
    }
    persist(session, remember)
    return session
  }
  // TODO(backend): POST /auth/login -> { accessToken, user: { id, fullName, email, role } }
  const data = await request<{ accessToken: string; user: SessionUser }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const session: AuthSession = { ...data, issuedAt: new Date().toISOString() }
  persist(session, remember)
  return session
}

export function getSession(): AuthSession | null {
  const s = readJSON<AuthSession>(SESSION_KEY) ?? readJSON<AuthSession>(SESSION_KEY, 'session') ?? memorySession
  // Bỏ qua phiên định dạng cũ (không có role)
  return s?.accessToken && s.user?.role ? s : null
}

export function isAuthenticated(): boolean {
  return getSession() !== null
}

export function hasRole(role: Role): boolean {
  return getSession()?.user.role === role
}

export async function logout(): Promise<void> {
  if (!USE_MOCK) {
    // TODO(backend): POST /auth/logout (thu hồi token)
    await request<void>('/auth/logout', { method: 'POST' }).catch(() => undefined)
  }
  memorySession = null
  removeKey(SESSION_KEY)
  removeKey(SESSION_KEY, 'session')
}
