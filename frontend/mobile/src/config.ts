/**
 * Cấu hình môi trường cho app mobile.
 * Expo chỉ đưa các biến bắt đầu bằng EXPO_PUBLIC_ vào bundle (xem .env.example).
 *
 * API_ENDPOINT và ba cờ giả lập bắt buộc đặt trong env, không có giá trị mặc định: thiếu hoặc cờ không phải true/false
 * thì app dừng ngay khi mở, thay vì lặng lẽ chạy nhầm chế độ. Phải đọc dạng `process.env.EXPO_PUBLIC_X` (không qua
 * biến trung gian) để Expo thay giá trị vào bundle lúc build.
 */
export const API_ENDPOINT = requiredEnv('EXPO_PUBLIC_API_ENDPOINT', process.env.EXPO_PUBLIC_API_ENDPOINT);
export const USE_MOCK = envFlag('EXPO_PUBLIC_USE_MOCK', process.env.EXPO_PUBLIC_USE_MOCK);
/**
 * Core (POST /auth/session, /me, /shops) giả lập. Luôn bật khi USE_MOCK=true; đặt EXPO_PUBLIC_MOCK_CORE=true để dùng
 * Firebase THẬT nhưng Core vẫn giả lập — dùng khi backend Core chưa có API (test đăng nhập SĐT trên máy thật).
 */
export const USE_MOCK_CORE = envFlag('EXPO_PUBLIC_MOCK_CORE', process.env.EXPO_PUBLIC_MOCK_CORE) || USE_MOCK;
/**
 * Chỉ POST /shops giả lập. Core đã có /auth/session và /me nhưng CHƯA có /shops: đặt EXPO_PUBLIC_MOCK_SHOPS=true để test
 * trọn luồng với Core thật. Tiệm chỉ lưu ở máy nên mỗi lần mở lại app sẽ bị hỏi tạo tiệm lại (Core vẫn báo needsOnboarding).
 */
export const USE_MOCK_SHOPS = envFlag('EXPO_PUBLIC_MOCK_SHOPS', process.env.EXPO_PUBLIC_MOCK_SHOPS) || USE_MOCK_CORE;

/**
 * Firebase Auth (đăng nhập + xác thực số điện thoại) — chỉ dùng khi USE_MOCK=false.
 * - Web (expo web): đọc các biến EXPO_PUBLIC_FIREBASE_* bên dưới (Firebase Console → Project settings → Your apps → Web).
 * - Android / iOS: đọc từ google-services.json / GoogleService-Info.plist (xem README, mục "Gắn Firebase").
 */
export const FIREBASE_WEB_CONFIG = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

/**
 * Nhận dạng giọng nói trên Android (model sherpa-onnx chạy trên máy). App tải các file model từ địa chỉ này về bộ nhớ
 * của app ở lần đầu mở màn Đọc đơn (xem assets/models/README.md). Phải kết thúc bằng `/`; để trống thì mic báo chưa có model.
 */
export const STT_MODEL_URL = process.env.EXPO_PUBLIC_STT_MODEL_URL ?? '';

/** Email hỗ trợ hiện ở màn xác minh email; để trống thì không hiện dòng liên hệ. */
export const SUPPORT_EMAIL = (process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').trim();

function requiredEnv(name: string, value: string | undefined): string {
  if (!value?.trim()) throw new Error(`${name} chưa đặt (xem frontend/mobile/.env.example)`);
  return value;
}

function envFlag(name: string, value: string | undefined): boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} phải là true hoặc false, đang là ${JSON.stringify(value)} (xem frontend/mobile/.env.example)`);
}
