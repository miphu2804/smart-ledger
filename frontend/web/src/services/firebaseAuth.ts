/**
 * Đăng nhập Firebase (email + mật khẩu) cho trang quản trị, gọi thẳng REST API của Firebase Auth thay vì cài SDK `firebase`:
 * trang quản trị chỉ cần lấy ID token để gửi Core (`Authorization: Bearer`) và làm mới token khi sắp hết hạn.
 * - Đăng nhập: POST identitytoolkit `accounts:signInWithPassword`
 * - Làm mới: POST securetoken `token` (grant_type=refresh_token)
 * Không ghi token ra log. Thông báo lỗi tiếng Việt, không lặp lại thông điệp thô của Firebase.
 */
import { FIREBASE_API_KEY } from '../config'

export interface FirebaseTokens {
  idToken: string
  refreshToken: string
  /** Thời điểm hết hạn của idToken (ms) */
  expiresAt: number
  email: string
}

// Firebase Auth Emulator khi chạy thử trên máy (VITE_FIREBASE_AUTH_EMULATOR_HOST, vd. localhost:9099): cùng đường dẫn, đổi gốc
const EMULATOR = (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? '').trim()
const ORIGIN = (host: string) => (EMULATOR ? `http://${EMULATOR}/${host}` : `https://${host}`)
const SIGN_IN_URL = `${ORIGIN('identitytoolkit.googleapis.com')}/v1/accounts:signInWithPassword`
const REFRESH_URL = `${ORIGIN('securetoken.googleapis.com')}/v1/token`

const MESSAGES: Record<string, string> = {
  INVALID_LOGIN_CREDENTIALS: 'Email hoặc mật khẩu không đúng.',
  EMAIL_NOT_FOUND: 'Email hoặc mật khẩu không đúng.',
  INVALID_PASSWORD: 'Email hoặc mật khẩu không đúng.',
  INVALID_EMAIL: 'Email không hợp lệ.',
  USER_DISABLED: 'Tài khoản này đã bị khoá trong Firebase.',
  TOO_MANY_ATTEMPTS_TRY_LATER: 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại.',
  OPERATION_NOT_ALLOWED: 'Đăng nhập bằng email chưa được bật cho dự án Firebase này.',
  TOKEN_EXPIRED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  USER_NOT_FOUND: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  INVALID_REFRESH_TOKEN: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
  // Mã tự đặt, không đến từ Firebase
  MISSING_API_KEY: 'Trang quản trị chưa được cấu hình Firebase (thiếu VITE_FIREBASE_API_KEY).',
  NETWORK: 'Không kết nối được tới máy chủ đăng nhập. Kiểm tra mạng rồi thử lại.',
}

export class FirebaseAuthError extends Error {
  readonly code: string
  constructor(code: string) {
    super(MESSAGES[code] ?? `Không đăng nhập được (mã: ${code}). Vui lòng thử lại.`)
    this.name = 'FirebaseAuthError'
    this.code = code
  }
}

function requireKey(): string {
  if (!FIREBASE_API_KEY) throw new FirebaseAuthError('MISSING_API_KEY')
  return FIREBASE_API_KEY
}

/** Mã lỗi Firebase nằm ở `error.message`, có thể kèm giải thích sau dấu " : " (vd. "TOO_MANY_ATTEMPTS_TRY_LATER : ...") */
async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string } }
    const raw = body.error?.message ?? ''
    const code = raw.split(':')[0].trim()
    return /^[A-Z_]{3,64}$/.test(code) ? code : `HTTP_${res.status}`
  } catch {
    return `HTTP_${res.status}`
  }
}

async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init)
  } catch {
    throw new FirebaseAuthError('NETWORK')
  }
}

export async function signInWithPassword(email: string, password: string): Promise<FirebaseTokens> {
  const res = await post(`${SIGN_IN_URL}?key=${encodeURIComponent(requireKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  })
  if (!res.ok) throw new FirebaseAuthError(await errorCode(res))
  const b = (await res.json()) as { idToken: string; refreshToken: string; expiresIn: string; email?: string }
  return { idToken: b.idToken, refreshToken: b.refreshToken, expiresAt: Date.now() + Number(b.expiresIn) * 1000, email: b.email ?? email }
}

export async function refreshTokens(refreshToken: string, email: string): Promise<FirebaseTokens> {
  const res = await post(`${REFRESH_URL}?key=${encodeURIComponent(requireKey())}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }).toString(),
  })
  if (!res.ok) throw new FirebaseAuthError(await errorCode(res))
  const b = (await res.json()) as { id_token: string; refresh_token: string; expires_in: string }
  return { idToken: b.id_token, refreshToken: b.refresh_token, expiresAt: Date.now() + Number(b.expires_in) * 1000, email }
}
