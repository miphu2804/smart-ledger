import { DEFAULT_APP_SETTINGS, parseAppSettings, type AppSettings } from './appSettings';

/** Tuỳ chọn của app, bản web: `localStorage` của trình duyệt (chế độ ẩn danh hay bị chặn thì chỉ không lưu được, không lỗi). */
const KEY = 'smartledger.appSettings';

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? parseAppSettings(JSON.parse(raw)) : DEFAULT_APP_SETTINGS;
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Không lưu được (chế độ ẩn danh, bị chặn): tuỳ chọn chỉ còn tới khi tải lại trang
  }
}
