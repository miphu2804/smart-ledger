import { MOCK_DELAY_MS, USE_MOCK } from '../config'
import type { AdminUser, AuthSession } from '../types'
import { readJSON, removeKey, writeJSON } from '../utils/storage'
import { request } from './api'

const SESSION_KEY = 'snl_admin_session'

/** Tài khoản demo cho chế độ mock. */
export const DEMO_ADMIN = {
  email: 'admin@songhloi.vn',
  password: 'admin123',
} as const

const DEMO_USER: AdminUser = {
  id: 'adm_001',
  name: 'Quản trị viên HEXA',
  email: DEMO_ADMIN.email,
  role: 'super_admin',
}

// Dự phòng khi trình duyệt chặn storage: vẫn đăng nhập được trong phiên hiện tại.
let memorySession: AuthSession | null = null

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

function persist(session: AuthSession, remember: boolean) {
  memorySession = session
  // "Ghi nhớ đăng nhập" -> localStorage; không ghi nhớ -> sessionStorage (mất khi đóng tab).
  const ok = writeJSON(SESSION_KEY, session, remember ? 'local' : 'session')
  if (ok) removeKey(SESSION_KEY, remember ? 'session' : 'local')
}

export async function login(email: string, password: string, remember = true): Promise<AuthSession> {
  if (USE_MOCK) {
    await wait(MOCK_DELAY_MS + 450)
    if (email.trim().toLowerCase() !== DEMO_ADMIN.email || password !== DEMO_ADMIN.password) {
      throw new Error('Email hoặc mật khẩu không đúng.')
    }
    const session: AuthSession = {
      token: `mock.${Math.random().toString(36).slice(2)}.${Date.now().toString(36)}`,
      user: DEMO_USER,
      issuedAt: new Date().toISOString(),
    }
    persist(session, remember)
    return session
  }
  // TODO(backend): POST /admin/auth/login -> { token, user }
  const data = await request<{ token: string; user: AdminUser }>('/admin/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
  const session: AuthSession = { ...data, issuedAt: new Date().toISOString() }
  persist(session, remember)
  return session
}

export function getSession(): AuthSession | null {
  return readJSON<AuthSession>(SESSION_KEY) ?? readJSON<AuthSession>(SESSION_KEY, 'session') ?? memorySession
}

export function isAuthenticated(): boolean {
  return Boolean(getSession()?.token)
}

export async function logout(): Promise<void> {
  if (!USE_MOCK) {
    // TODO(backend): POST /admin/auth/logout (thu hồi token)
    await request<void>('/admin/auth/logout', { method: 'POST' }).catch(() => undefined)
  }
  memorySession = null
  removeKey(SESSION_KEY)
  removeKey(SESSION_KEY, 'session')
}
