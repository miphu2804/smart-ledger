/**
 * Thông tin hồ sơ Core chưa có chỗ lưu (họ tên sửa tay, email liên hệ, Facebook, tài khoản nhận chuyển khoản), giữ trên
 * máy theo từng tài khoản để đăng xuất rồi đăng nhập lại không mất. Không đồng bộ sang máy khác.
 */
export interface LocalProfile {
  name?: string;
  email?: string;
  facebook?: string;
  bankName?: string;
  bankAccount?: string;
}

/** Tên file/khoá an toàn từ id tài khoản của Core. */
export const profileKey = (userId: string) => `profile-${userId.replace(/[^\w-]/g, '_')}`;
