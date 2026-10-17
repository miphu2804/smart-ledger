import { AuthError } from './auth';

/**
 * Đăng nhập Zalo trên Android/iOS: app chưa làm. Core đã có luồng Android riêng (CORE-016: trình duyệt ngoài + HTTPS App Link,
 * `/auth/zalo/native/*`), còn iOS chưa có, nên app vẫn ghi "Sắp có". Bản web dùng `zaloLogin.web.ts`.
 */
export const ZALO_LOGIN_AVAILABLE = false;

export async function signInWithZalo(): Promise<{ displayName: string }> {
  throw new AuthError('not-configured', 'Đăng nhập Zalo trên app chưa có: Core mới hỗ trợ bản web');
}
