import { parseSignInMethod, type SignInMethod } from './lastSignIn';

/** Cách đăng nhập gần nhất, bản web: `localStorage` (chế độ ẩn danh hay bị chặn thì chỉ không có nhãn, không lỗi). */
const KEY = 'smartledger.lastSignIn';

export async function loadLastSignIn(): Promise<SignInMethod | null> {
  try {
    return parseSignInMethod(window.localStorage.getItem(KEY));
  } catch {
    return null;
  }
}

export async function saveLastSignIn(method: SignInMethod): Promise<void> {
  try {
    window.localStorage.setItem(KEY, method);
  } catch {
    // Không lưu được thì lần sau không có nhãn "Lần trước dùng"
  }
}
