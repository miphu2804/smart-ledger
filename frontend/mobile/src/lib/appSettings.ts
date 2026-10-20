/**
 * Tuỳ chọn của app ở màn Cài đặt và Cài đặt thông báo. Lưu trên máy, không theo tài khoản: đăng xuất hay đổi tài khoản vẫn giữ
 * nguyên (đọc/ghi ở `appSettingsStorage.ts`, bản web `appSettingsStorage.web.ts`). Tách khỏi phần lưu để kiểm thử bằng `node --test`.
 */
export interface AppSettings {
  /** Rung phản hồi khi chạm (`triggerFeedback`) */
  haptics: boolean;
  /** Nhóm Kho hàng: thông báo sắp hết / đã hết của Core và mục "Kiểm tra hàng sắp hết" ở Tổng quan */
  stockAlerts: boolean;
  /** Nhóm Đơn hàng: đơn mới (tính trên máy) và đơn bị huỷ (Core) */
  orderAlerts: boolean;
  /** Nhóm Công nợ: khoản nợ còn mở (tính trên máy) */
  debtAlerts: boolean;
  /** Nhóm Thu chi: tổng kết hôm qua và khoản chi hôm nay (tính trên máy) */
  financeAlerts: boolean;
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  haptics: true,
  stockAlerts: true,
  orderAlerts: true,
  debtAlerts: true,
  financeAlerts: true,
};

const KEYS = Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[];

/** Loại thông báo Core thuộc cảnh báo hàng. */
export const STOCK_ALERT_TYPES = ['LOW_STOCK', 'OUT_OF_STOCK'] as const;

export function isStockAlert(type: string): boolean {
  return (STOCK_ALERT_TYPES as readonly string[]).includes(type);
}

/** Nhóm thông báo (`NotifCategory`) ứng với tuỳ chọn nào; nhóm không có tuỳ chọn (Hệ thống: tiệm bị tạm ngưng/mở lại) luôn bật. */
const CATEGORY_SETTING: Partial<Record<string, keyof AppSettings>> = {
  order: 'orderAlerts',
  stock: 'stockAlerts',
  debt: 'debtAlerts',
  finance: 'financeAlerts',
};

export function isCategoryEnabled(settings: AppSettings, category: string): boolean {
  const key = CATEGORY_SETTING[category];
  return key ? settings[key] : true;
}

/**
 * Thông báo có được hiện không: nhóm của nó đang bật và nó tới sau lần "Xoá toàn bộ thông báo" gần nhất (`clearedAt`, ISO;
 * null là chưa xoá lần nào). Thời điểm không đọc được thì vẫn hiện, để không lặng lẽ mất thông báo.
 */
export function isNotificationShown(
  n: { category: string; at: string },
  settings: AppSettings,
  clearedAt: string | null,
): boolean {
  if (!isCategoryEnabled(settings, n.category)) return false;
  if (!clearedAt) return true;
  const at = Date.parse(n.at);
  const cleared = Date.parse(clearedAt);
  return Number.isNaN(at) || Number.isNaN(cleared) || at > cleared;
}

/** Đọc tuỳ chọn đã lưu: thiếu khoá (file của bản app cũ) hay sai kiểu thì lấy giá trị mặc định của khoá đó. */
export function parseAppSettings(raw: unknown): AppSettings {
  const saved = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...DEFAULT_APP_SETTINGS };
  for (const key of KEYS) if (typeof saved[key] === 'boolean') out[key] = saved[key] as boolean;
  return out;
}
