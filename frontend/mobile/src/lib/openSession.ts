import type { SessionView } from '../data/types';
import { isDisplayNameRequired } from './errors';

/**
 * Tên mặc định cho tài khoản mới đăng nhập bằng số điện thoại. Firebase chỉ cho biết số điện thoại, còn Core bắt buộc
 * `displayName` khi tạo tài khoản (thiếu → 400), nên app tự điền thay vì dừng lại hỏi tên.
 */
export const DEFAULT_OWNER_NAME = 'Chủ tiệm';

/**
 * Mở phiên Core sau khi Firebase đã xác thực xong. Lần đăng nhập đầu của một tài khoản, Core trả 400 đòi `displayName`:
 * tạo luôn tài khoản bằng tên mặc định rồi vào app. Mọi lỗi khác (401, 403 `account_disabled`, mất mạng…) giữ nguyên.
 */
export async function openSession(signIn: (displayName?: string) => Promise<SessionView>): Promise<SessionView> {
  try {
    return await signIn();
  } catch (e) {
    if (!isDisplayNameRequired(e)) throw e;
    return signIn(DEFAULT_OWNER_NAME);
  }
}
