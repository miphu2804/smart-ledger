import { debugLog } from '../debug';
import { AuthError } from './types';

/** Đổi lỗi của Firebase SDK (web hoặc React Native Firebase) sang AuthError có thông báo tiếng Việt. */
export function mapFirebaseError(e: unknown): AuthError {
  if (e instanceof AuthError) return e;
  const code = String((e as { code?: unknown })?.code ?? '');
  // Ghi mã gốc + thông điệp của SDK để dò lỗi cấu hình (chỉ khi dev)
  debugLog('auth', 'Firebase lỗi:', code || '(không có code)', (e as { message?: string })?.message ?? '');
  switch (code.replace(/^auth\//, '')) {
    case 'invalid-phone-number':
    case 'missing-phone-number':
      return new AuthError('invalid-phone');
    case 'invalid-verification-code':
    case 'missing-verification-code':
      return new AuthError('invalid-code');
    case 'code-expired':
    case 'session-expired':
      return new AuthError('code-expired');
    case 'invalid-email':
    case 'missing-email':
      return new AuthError('invalid-email');
    // Firebase gộp "sai mật khẩu" và "không có tài khoản" (chống dò email) → invalid-credential / invalid-login-credentials
    case 'user-not-found':
    case 'wrong-password':
    case 'invalid-credential':
    case 'invalid-login-credentials':
    case 'missing-password':
      return new AuthError('invalid-credentials');
    case 'email-already-in-use':
      return new AuthError('email-in-use');
    case 'weak-password':
      return new AuthError('weak-password');
    case 'operation-not-allowed':
      return new AuthError('provider-disabled');
    case 'too-many-requests':
    case 'quota-exceeded':
      return new AuthError('too-many-requests');
    case 'network-request-failed':
      return new AuthError('network');
    default:
      // Lỗi cấu hình (chặn vùng +84, sai SHA, domain chưa được phép…) — hiện mã khi dev để dễ dò
      return new AuthError('unknown', __DEV__ && code ? `Không đăng nhập được (${code})` : undefined);
  }
}
