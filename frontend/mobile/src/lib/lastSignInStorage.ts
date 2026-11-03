import { File, Paths } from 'expo-file-system';
import { debugLog } from './debug';
import { parseSignInMethod, type SignInMethod } from './lastSignIn';

/** Cách đăng nhập gần nhất, bản Android/iOS: một file nhỏ trong thư mục tài liệu của app. Web: `lastSignInStorage.web.ts`. */
const file = () => new File(Paths.document, 'last-sign-in.txt');

export async function loadLastSignIn(): Promise<SignInMethod | null> {
  try {
    const f = file();
    return f.exists ? parseSignInMethod((await f.text()).trim()) : null;
  } catch (e) {
    debugLog('auth', 'đọc cách đăng nhập gần nhất ✗', String(e));
    return null;
  }
}

export async function saveLastSignIn(method: SignInMethod): Promise<void> {
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(method);
  } catch (e) {
    debugLog('auth', 'lưu cách đăng nhập gần nhất ✗', String(e));
  }
}
