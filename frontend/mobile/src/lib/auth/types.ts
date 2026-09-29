/** Giao diện đăng nhập dùng chung: bản mock, Firebase native (React Native Firebase) và Firebase web đều theo giao diện này. */

export type AuthErrorCode =
  | 'invalid-phone'
  | 'invalid-code'
  | 'code-expired'
  | 'invalid-email'
  | 'invalid-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'provider-disabled'
  | 'too-many-requests'
  | 'network'
  | 'not-configured'
  | 'not-owner'
  | 'unknown';

const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-phone': 'Số điện thoại không hợp lệ',
  'invalid-code': 'Mã OTP không đúng. Vui lòng thử lại',
  'code-expired': 'Mã OTP đã hết hạn. Bấm “Gửi lại” để nhận mã mới',
  'invalid-email': 'Email không hợp lệ',
  'invalid-credentials': 'Email hoặc mật khẩu không đúng',
  'email-in-use': 'Email này đã có tài khoản. Hãy chuyển sang “Đăng nhập”',
  'weak-password': 'Mật khẩu quá yếu (cần ít nhất 6 ký tự)',
  'provider-disabled': 'Phương thức đăng nhập này chưa được bật trong Firebase Console (Authentication → Sign-in method)',
  'too-many-requests': 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại',
  network: 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại',
  'not-configured': 'Chưa cấu hình Firebase cho bản build này',
  'not-owner': 'Tài khoản quản trị chỉ đăng nhập trên trang web quản trị',
  unknown: 'Không đăng nhập được. Vui lòng thử lại',
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? MESSAGES[code]);
    this.name = 'AuthError';
    this.code = code;
  }
}

export interface PhoneConfirmation {
  /** Nhập mã 6 số. Thành công = Firebase đã đăng nhập người dùng. Lỗi ném AuthError. */
  confirm(code: string): Promise<void>;
}

export interface AuthClient {
  /** Gửi SMS OTP tới số E.164 (+84…). Lỗi ném AuthError. */
  sendOtp(phoneE164: string): Promise<PhoneConfirmation>;
  /** Đăng nhập bằng email + mật khẩu (Firebase Email/Password). Lỗi ném AuthError. */
  signInWithEmail(email: string, password: string): Promise<void>;
  /** Tự đăng ký tài khoản Firebase bằng email + mật khẩu (không cần thêm user trong Console) và đăng nhập luôn. */
  signUpWithEmail(email: string, password: string): Promise<void>;
  /** Firebase ID token hiện tại (SDK tự làm mới khi gần hết hạn). null nếu chưa đăng nhập. */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  signOut(): Promise<void>;
  /** Số điện thoại (E.164) của người đang đăng nhập; null nếu chưa đăng nhập hoặc đăng nhập bằng email. */
  currentPhone(): string | null;
  /** Email của người đang đăng nhập; null nếu chưa đăng nhập hoặc đăng nhập bằng số điện thoại. */
  currentEmail(): string | null;
  /**
   * Gọi lại mỗi khi trạng thái đổi. Lần gọi đầu tiên xảy ra SAU khi SDK khôi phục xong phiên đã lưu
   * (mở lại app vẫn còn đăng nhập) — màn splash chờ lần này. Trả về hàm huỷ đăng ký.
   */
  onAuthStateChanged(cb: (signedIn: boolean) => void): () => void;
}
