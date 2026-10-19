import { File, Paths } from 'expo-file-system';
import { DEFAULT_APP_SETTINGS, parseAppSettings, type AppSettings } from './appSettings';
import { debugLog } from './debug';

/** Tuỳ chọn của app, bản Android/iOS: một file JSON trong thư mục tài liệu của app. Web: `appSettingsStorage.web.ts`. */
const file = () => new File(Paths.document, 'app-settings.json');

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const f = file();
    if (!f.exists) return DEFAULT_APP_SETTINGS;
    return parseAppSettings(JSON.parse(await f.text()));
  } catch (e) {
    debugLog('settings', 'đọc tuỳ chọn ✗', String(e));
    return DEFAULT_APP_SETTINGS;
  }
}

export async function saveAppSettings(settings: AppSettings): Promise<void> {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(settings));
  } catch (e) {
    debugLog('settings', 'lưu tuỳ chọn ✗', String(e));
  }
}
