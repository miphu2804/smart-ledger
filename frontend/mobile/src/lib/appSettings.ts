/**
 * Tuỳ chọn của app ở màn Cài đặt. Lưu trên máy, không theo tài khoản: đăng xuất hay đổi tài khoản vẫn giữ nguyên
 * (đọc/ghi ở `appSettingsStorage.ts`, bản web `appSettingsStorage.web.ts`). Tách khỏi phần lưu để kiểm thử bằng `node --test`.
 */
export interface AppSettings {
  /** Rung phản hồi khi chạm (`triggerFeedback`) */
  haptics: boolean;
  /** Cảnh báo hàng sắp hết / đã hết: mục "Kiểm tra hàng sắp hết" ở Tổng quan và thông báo kho hàng của Core */
  stockAlerts: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = { haptics: true, stockAlerts: true };

/** Loại thông báo Core thuộc cảnh báo hàng; tắt `stockAlerts` thì ẩn các loại này khỏi danh sách và số chưa đọc. */
export const STOCK_ALERT_TYPES = ['LOW_STOCK', 'OUT_OF_STOCK'] as const;

export function isStockAlert(type: string): boolean {
  return (STOCK_ALERT_TYPES as readonly string[]).includes(type);
}

/** Đọc tuỳ chọn đã lưu: thiếu khoá (file của bản app cũ) hay sai kiểu thì lấy giá trị mặc định của khoá đó. */
export function parseAppSettings(raw: unknown): AppSettings {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const flag = (key: keyof AppSettings) => (typeof saved[key] === 'boolean' ? (saved[key] as boolean) : DEFAULT_APP_SETTINGS[key]);
  return { haptics: flag('haptics'), stockAlerts: flag('stockAlerts') };
}
