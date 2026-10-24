/**
 * Đăng nhập & phiên làm việc.
 *
 * Chỉ role ADMIN được dùng trang quản trị. OWNER (chủ cơ sở) vẫn đăng nhập được
 * ở tầng xác thực, nhưng mọi URL /admin/* sẽ trả trang 403 (xem RequireAuth).
 *
 * Chế độ thật: đăng nhập Firebase bằng email + mật khẩu (REST, xem firebaseAuth.ts) rồi hỏi Core `GET /api/v1/me`;
 * chỉ tài khoản Core có `role` ADMIN mới vào được. ID token chỉ nằm trong bộ nhớ; refresh token được lưu
 * (localStorage khi "Ghi nhớ đăng nhập", sessionStorage khi không) để tải lại trang không phải đăng nhập lại.
 */
import { API_ENDPOINT, MOCK_DELAY_MS, USE_MOCK } from '../config'
import { getScenario } from '../mocks/scenario'
import type { AuthSession, Role, SessionUser } from '../types'
import { readJSON, removeKey, writeJSON } from '../utils/storage'
import { FirebaseAuthError, refreshTokens, signInWithPassword, type FirebaseTokens } from './firebaseAuth'

export const SESSION_KEY = 'snl_admin_session'
/** Refresh token Firebase của phiên thật (không lưu ID token) */
const REFRESH_KEY = 'snl_admin_refresh'
/** Làm mới ID token khi còn dưới mức này (ms) */
const REFRESH_MARGIN_MS = 2 * 60 * 1000

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
/** Token Firebase của phiên thật (chỉ trong bộ nhớ) */
let tokens: FirebaseTokens | null = null
let remembered = true

function persist(session: AuthSession, remember: boolean) {
  memorySession = session
  if (!USE_MOCK) {
    // Chế độ thật: ID token chỉ nằm trong bộ nhớ; chỉ lưu refresh token để khôi phục phiên (xem restoreSession)
    removeKey(SESSION_KEY)
    removeKey(SESSION_KEY, 'session')
    if (tokens) {
      const saved = { refreshToken: tokens.refreshToken, email: tokens.email }
      const ok = writeJSON(REFRESH_KEY, saved, remember ? 'local' : 'session')
      if (ok) removeKey(REFRESH_KEY, remember ? 'session' : 'local')
    }
    return
  }
  // Mock (token giả): "Ghi nhớ đăng nhập" -> localStorage; không ghi nhớ -> sessionStorage (mất khi đóng tab).
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
  tokens = await signInWithPassword(email.trim(), password)
  remembered = remember
  try {
    const session = await openCoreSession(tokens)
    persist(session, remember)
    return session
  } catch (e) {
    clearSession()
    throw e
  }
}

/** Thông tin tài khoản Core của người vừa đăng nhập Firebase (`GET /api/v1/me`) */
interface MeResponse {
  user: { id: number; displayName: string | null; email: string | null }
  role: Role
}

/** Hỏi Core tài khoản này là ai; chỉ ADMIN mới được vào trang quản trị */
async function openCoreSession(t: FirebaseTokens): Promise<AuthSession> {
  let res: Response
  try {
    res = await fetch(`${API_ENDPOINT}/api/v1/me`, { headers: { Authorization: `Bearer ${t.idToken}` } })
  } catch {
    throw new Error('Không kết nối được máy chủ Sổ Nghe Lời. Vui lòng thử lại.')
  }
  if (res.status === 401 || res.status === 403 || res.status === 404) {
    throw new Error('Tài khoản này không có quyền quản trị.')
  }
  if (!res.ok) throw new Error(`Máy chủ Sổ Nghe Lời đang lỗi (${res.status}). Vui lòng thử lại.`)
  const me = (await res.json()) as MeResponse
  if (me.role !== 'ADMIN') throw new Error('Tài khoản này không có quyền quản trị.')
  const user: SessionUser = {
    id: String(me.user.id),
    fullName: me.user.displayName?.trim() || me.user.email || t.email,
    email: me.user.email ?? t.email,
    role: 'ADMIN',
  }
  return { accessToken: t.idToken, user, issuedAt: new Date().toISOString() }
}

/**
 * ID token còn hạn để gọi Core (chế độ thật); tự làm mới khi sắp hết hạn. Không có phiên thì trả null.
 * Làm mới thất bại (refresh token bị thu hồi…) thì xoá phiên.
 */
export async function getIdToken(): Promise<string | null> {
  if (USE_MOCK) return getSession()?.accessToken ?? null
  if (!tokens) return null
  if (tokens.expiresAt - Date.now() > REFRESH_MARGIN_MS) return tokens.idToken
  try {
    tokens = await refreshTokens(tokens.refreshToken, tokens.email)
  } catch {
    clearSession()
    return null
  }
  if (memorySession) {
    memorySession = { ...memorySession, accessToken: tokens.idToken }
    persist(memorySession, remembered)
  }
  return tokens.idToken
}

/**
 * Khôi phục phiên thật sau khi tải lại trang: đổi refresh token đã lưu lấy ID token mới rồi hỏi lại Core.
 * Chế độ mock (phiên nằm sẵn trong storage) hoặc đã có phiên thì trả ngay.
 */
export async function restoreSession(): Promise<AuthSession | null> {
  if (USE_MOCK || memorySession) return getSession()
  const local = readJSON<{ refreshToken: string; email: string }>(REFRESH_KEY)
  const saved = local ?? readJSON<{ refreshToken: string; email: string }>(REFRESH_KEY, 'session')
  if (!saved?.refreshToken) return null
  try {
    tokens = await refreshTokens(saved.refreshToken, saved.email)
    remembered = local !== null
    const session = await openCoreSession(tokens)
    persist(session, remembered)
    return session
  } catch (e) {
    // Mất mạng thì giữ refresh token để lần sau thử lại; token bị từ chối thì xoá
    if (!(e instanceof FirebaseAuthError && e.code === 'NETWORK')) clearSession()
    else tokens = null
    return null
  }
}

export function getSession(): AuthSession | null {
  // Chế độ thật không đọc storage: token chỉ tồn tại trong bộ nhớ (xem persist)
  const s = USE_MOCK
    ? (readJSON<AuthSession>(SESSION_KEY) ?? readJSON<AuthSession>(SESSION_KEY, 'session') ?? memorySession)
    : memorySession
  // Bỏ qua phiên định dạng cũ (không có role)
  return s?.accessToken && s.user?.role ? s : null
}

export function isAuthenticated(): boolean {
  return getSession() !== null
}

export function hasRole(role: Role): boolean {
  return getSession()?.user.role === role
}

/** Xoá phiên phía trình duyệt, không gọi backend (dùng khi token bị từ chối — 401 — hoặc khi đăng xuất). */
export function clearSession(): void {
  memorySession = null
  tokens = null
  removeKey(SESSION_KEY)
  removeKey(SESSION_KEY, 'session')
  removeKey(REFRESH_KEY)
  removeKey(REFRESH_KEY, 'session')
}

/** Đăng xuất phía trình duyệt: Core không giữ phiên (chỉ kiểm ID token Firebase), nên không cần gọi máy chủ */
export async function logout(): Promise<void> {
  clearSession()
}
