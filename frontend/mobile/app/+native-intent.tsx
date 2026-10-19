import { API_ENDPOINT } from '../src/config';
import { isZaloReturnUrl, originOf } from '../src/lib/auth/zaloProof';

const CORE_ORIGIN = originOf(API_ENDPOINT);

/**
 * expo-router gọi hàm này với mọi link mở app (Android). App Link Zalo trả về (`https://<Core>/mobile/auth/zalo/complete#…`)
 * không phải một màn trong app: màn đăng nhập tự đọc link đó qua `Linking` (src/lib/zaloLogin.ts), nên ở đây không điều hướng.
 * Link tới lúc app vừa khởi động lại (máy đã đóng app khi đang ở trình duyệt) thì mã xác minh của lượt đó đã mất, mở màn đầu
 * như bình thường để người dùng bấm Zalo lại.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (!isZaloReturnUrl(path, CORE_ORIGIN)) return path;
  return initial ? '/' : null;
}
