import { File, Paths } from 'expo-file-system';
import { debugLog } from './debug';
import { profileKey, type LocalProfile } from './localProfile.types';

/** Hồ sơ trên máy, bản Android/iOS: một file JSON trong thư mục tài liệu của app (hệ thống không tự xoá). Web: `localProfile.web.ts`. */
const fileFor = (userId: string) => new File(Paths.document, `${profileKey(userId)}.json`);

export async function loadLocalProfile(userId: string): Promise<LocalProfile | null> {
  try {
    const file = fileFor(userId);
    if (!file.exists) return null;
    return JSON.parse(await file.text()) as LocalProfile;
  } catch (e) {
    debugLog('profile', 'đọc hồ sơ trên máy ✗', String(e));
    return null;
  }
}

export async function saveLocalProfile(userId: string, profile: LocalProfile): Promise<void> {
  try {
    const file = fileFor(userId);
    if (!file.exists) file.create();
    file.write(JSON.stringify(profile));
  } catch (e) {
    debugLog('profile', 'lưu hồ sơ trên máy ✗', String(e));
  }
}
