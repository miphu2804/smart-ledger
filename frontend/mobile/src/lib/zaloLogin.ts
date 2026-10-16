import { AuthError } from './auth';

/**
 * Đăng nhập Zalo trên Android/iOS: Core mới có luồng cho web (popup + postMessage), chưa có cách đưa kết quả về app
 * (App Link), nên app vẫn ghi "Sắp có". Bản web dùng `zaloLogin.web.ts`.
 */
export const ZALO_LOGIN_AVAILABLE = false;

export async function signInWithZalo(): Promise<{ displayName: string }> {
  throw new AuthError('not-configured', 'Đăng nhập Zalo trên app chưa có: Core mới hỗ trợ bản web');
}
