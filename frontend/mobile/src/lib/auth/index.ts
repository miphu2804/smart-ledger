import { USE_MOCK } from '../../config';
import { firebaseAuth } from './firebase';
import { mockAuth } from './mock';
import { toE164VN } from './phone';
import { AuthClient, AuthError, PhoneConfirmation } from './types';

export { AuthError } from './types';
export type { AuthClient, AuthErrorCode } from './types';

/** USE_MOCK=true → giả lập (OTP 123456). USE_MOCK=false → Firebase thật (native hoặc web tuỳ nền tảng). */
export const authClient: AuthClient = USE_MOCK ? mockAuth : firebaseAuth;

// `confirmation` không đưa qua route params được, nên giữ tạm ở đây giữa màn nhập SĐT và màn nhập OTP.
let pending: PhoneConfirmation | null = null;

/** Gửi OTP tới số dạng nội địa (0901…). Dùng cho cả "Gửi lại". */
export async function startPhoneLogin(localPhone: string): Promise<void> {
  pending = await authClient.sendOtp(toE164VN(localPhone));
}

/** Xác thực mã OTP. Thành công = Firebase đã đăng nhập; chưa có phiên ở Core (xem sessionApi.create). */
export async function confirmPhoneLogin(code: string): Promise<void> {
  if (!pending) throw new AuthError('code-expired');
  await pending.confirm(code);
  pending = null;
}
