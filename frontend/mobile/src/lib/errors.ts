import { ApiError } from './api';
import { AuthError } from './auth/types';

/** Core trả thông báo tiếng Anh; đổi các mã đã biết sang tiếng Việt cho người dùng. */
const CORE_MESSAGES: Record<string, string> = {
  account_disabled: 'Tài khoản này đã bị khoá. Vui lòng liên hệ hỗ trợ.',
  auth_profile_not_found: 'Tài khoản chưa được tạo. Vui lòng đăng nhập lại.',
  unauthorized: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng đăng nhập lại.',
  validation_failed: 'Thông tin chưa hợp lệ. Vui lòng kiểm tra lại.',
  invalid_request: 'Yêu cầu không hợp lệ. Vui lòng thử lại.',
};

/** Thông báo lỗi tiếng Việt để hiện cho người dùng (từ AuthError / ApiError / lỗi bất ngờ). */
export function errorMessage(e: unknown): string {
  if (e instanceof AuthError) return e.message;
  if (e instanceof ApiError) return CORE_MESSAGES[e.code] ?? e.message;
  return 'Đã có lỗi xảy ra. Vui lòng thử lại';
}

/** Mô tả kỹ thuật ngắn cho log / màn chẩn đoán: "HTTP 401 unauthorized trace=…", "AuthError invalid-code". */
export function describeError(e: unknown): string {
  if (e instanceof ApiError) {
    return `${e.status ? `HTTP ${e.status}` : 'không có phản hồi'} ${e.code}${e.traceId ? ` trace=${e.traceId}` : ''}`;
  }
  if (e instanceof AuthError) return `AuthError ${e.code}`;
  return String(e);
}

/** Core đòi `displayName`: đăng nhập lần đầu của tài khoản Firebase mà chưa gửi tên (400, details.field = displayName). */
export function isDisplayNameRequired(e: unknown): boolean {
  return e instanceof ApiError && e.status === 400 && e.details.some((d) => d.field === 'displayName');
}
