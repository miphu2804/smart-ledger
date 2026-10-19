import { debugLog } from './debug';
import { profileKey, type LocalProfile } from './localProfile.types';

/** Hồ sơ trên máy, bản web: `localStorage` của trình duyệt (chế độ ẩn danh hay bị chặn thì chỉ không lưu được, không lỗi). */
export async function loadLocalProfile(userId: string): Promise<LocalProfile | null> {
  try {
    const raw = window.localStorage.getItem(profileKey(userId));
    return raw ? (JSON.parse(raw) as LocalProfile) : null;
  } catch (e) {
    debugLog('profile', 'đọc hồ sơ trên máy ✗', String(e));
    return null;
  }
}

export async function saveLocalProfile(userId: string, profile: LocalProfile): Promise<void> {
  try {
    window.localStorage.setItem(profileKey(userId), JSON.stringify(profile));
  } catch (e) {
    debugLog('profile', 'lưu hồ sơ trên máy ✗', String(e));
  }
}
