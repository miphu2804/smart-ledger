/** Giao diện đăng nhập dùng chung: bản mock, Firebase native (React Native Firebase) và Firebase web đều theo giao diện này. */

export type AuthErrorCode =
  | 'invalid-email'
  | 'invalid-credentials'
  | 'email-in-use'
  | 'weak-password'
  | 'provider-disabled'
  | 'too-many-requests'
  | 'network'
  | 'not-configured'
  | 'not-owner'
  | 'cancelled'
  | 'account-exists'
  | 'unknown';

// Lỗi cấu hình (provider-disabled, not-configured) là việc của người phát triển: người dùng chỉ thấy một câu chung,
// còn mã gốc và chi tiết kỹ thuật vẫn ghi vào log (debugLog) và màn chẩn đoán.
const MESSAGES: Record<AuthErrorCode, string> = {
  'invalid-email': 'Email không hợp lệ',
  'invalid-credentials': 'Email hoặc mật khẩu chưa đúng',
  'email-in-use': 'Email này đã có tài khoản. Hãy chuyển sang “Đăng nhập”',
  'weak-password': 'Mật khẩu quá yếu (cần ít nhất 6 ký tự)',
  'provider-disabled': 'Cách đăng nhập này chưa dùng được lúc này. Vui lòng chọn cách khác hoặc thử lại sau',
  'too-many-requests': 'Bạn thử quá nhiều lần. Vui lòng đợi một lúc rồi thử lại',
  network: 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại',
  'not-configured': 'Cách đăng nhập này chưa dùng được lúc này. Vui lòng chọn cách khác hoặc thử lại sau',
  'not-owner': 'Tài khoản quản trị chỉ đăng nhập trên trang web quản trị',
  cancelled: 'Bạn đã huỷ đăng nhập',
  'account-exists': 'Email này đã đăng ký bằng một cách đăng nhập khác (email hoặc Facebook). Hãy dùng cách đó để vào app',
  unknown: 'Không đăng nhập được. Vui lòng thử lại',
};

/** Các mã lỗi cấu hình: thông điệp chi tiết của chúng chỉ để ghi log, không hiện cho người dùng. */
const CONFIG_CODES: ReadonlySet<AuthErrorCode> = new Set(['provider-disabled', 'not-configured']);

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  /** Chi tiết kỹ thuật (chỉ dành cho log); `message` luôn là câu thân thiện với người dùng. */
  readonly detail?: string;
  constructor(code: AuthErrorCode, detail?: string) {
    super(CONFIG_CODES.has(code) ? MESSAGES[code] : (detail ?? MESSAGES[code]));
    this.name = 'AuthError';
    this.code = code;
    this.detail = CONFIG_CODES.has(code) ? detail : undefined;
  }
}

export interface AuthClient {
  /** Đăng nhập bằng email + mật khẩu (Firebase Email/Password). Lỗi ném AuthError. */
  signInWithEmail(email: string, password: string): Promise<void>;
  /** Tự đăng ký tài khoản Firebase bằng email + mật khẩu (không cần thêm user trong Console) và đăng nhập luôn. */
  signUpWithEmail(email: string, password: string): Promise<void>;
  /**
   * Gửi email đặt lại mật khẩu. Email không có tài khoản cũng trả thành công, để không lộ email nào đã đăng ký.
   * Email sai định dạng → AuthError('invalid-email').
   */
  sendPasswordReset(email: string): Promise<void>;
  /** Gửi (lại) email xác minh tới người đang đăng nhập bằng email + mật khẩu. */
  sendEmailVerification(): Promise<void>;
  /** true khi người đang đăng nhập dùng email + mật khẩu mà chưa xác minh email (Facebook không có bước này). */
  needsEmailVerification(): boolean;
  /** Tải lại hồ sơ từ Firebase; trả true khi email đã xác minh (và làm mới ID token để mang cờ đã xác minh). */
  refreshEmailVerified(): Promise<boolean>;
  /**
   * Đăng nhập bằng Facebook rồi đổi sang tài khoản Firebase. Người dùng đóng hộp thoại Facebook → AuthError('cancelled').
   * Native cần development build có Facebook SDK (không chạy trên Expo Go); web mở cửa sổ popup của Firebase.
   */
  signInWithFacebook(): Promise<void>;
  /** Firebase ID token hiện tại (SDK tự làm mới khi gần hết hạn). null nếu chưa đăng nhập. */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  signOut(): Promise<void>;
  /** Số điện thoại (E.164) của tài khoản cũ đăng ký bằng SĐT; null với tài khoản email hoặc Facebook. Không còn cách đăng nhập mới bằng SĐT. */
  currentPhone(): string | null;
  /** Email của người đang đăng nhập; null nếu chưa đăng nhập hoặc tài khoản không có email. */
  currentEmail(): string | null;
  /**
   * Gọi lại mỗi khi trạng thái đổi. Lần gọi đầu tiên xảy ra SAU khi SDK khôi phục xong phiên đã lưu
   * (mở lại app vẫn còn đăng nhập) — màn splash chờ lần này. Trả về hàm huỷ đăng ký.
   */
  onAuthStateChanged(cb: (signedIn: boolean) => void): () => void;
}
