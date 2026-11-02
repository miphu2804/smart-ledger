export type ShopBanks = Record<string, { bankName?: string; bankAccount?: string }>;

/**
 * Thông tin hồ sơ Core chưa có chỗ lưu (họ tên sửa tay, email liên hệ, Facebook, tài khoản nhận chuyển khoản), giữ trên
 * máy theo từng tài khoản để đăng xuất rồi đăng nhập lại không mất. Không đồng bộ sang máy khác.
 */
export interface LocalProfile {
  name?: string;
  email?: string;
  facebook?: string;
  /** Bản cũ: một tài khoản nhận chuyển khoản cho cả hồ sơ; chỉ còn đọc để gán cho tiệm đầu tiên */
  bankName?: string;
  bankAccount?: string;
  /** Tài khoản nhận chuyển khoản của từng tiệm, theo id tiệm */
  shopBanks?: ShopBanks;
  /** Tiệm chọn gần nhất trên máy này */
  activeShopId?: string;
  /** id các thông báo tính trên máy đã đọc (đơn mới, công nợ, thu chi); chỉ giữ các id gần nhất */
  readNotifs?: string[];
  /** Lần "Xoá toàn bộ thông báo" gần nhất (ISO): thông báo tới trước mốc này không hiện nữa trên máy này */
  notifClearedAt?: string;
  /** Đã xem (hoặc bỏ qua) phần hướng dẫn trên máy này: không tự mở lại, chỉ mở khi bấm "Xem lại hướng dẫn" */
  guideSeen?: boolean;
}

/** Tên file/khoá an toàn từ id tài khoản của Core. */
export const profileKey = (userId: string) => `profile-${userId.replace(/[^\w-]/g, '_')}`;
