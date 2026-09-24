/**
 * Cấu hình môi trường cho app mobile.
 * Expo chỉ đưa các biến bắt đầu bằng EXPO_PUBLIC_ vào bundle (xem .env.example).
 *
 * Hiện toàn bộ app chạy bằng dữ liệu mẫu (src/data/mock.ts) qua AppStore.
 * Khi có backend: đặt EXPO_PUBLIC_USE_MOCK=false, rồi thay các action trong
 * src/store/AppStore.tsx bằng lời gọi tới API_ENDPOINT (giữ nguyên kiểu trong src/data/types.ts).
 */
export const API_ENDPOINT = process.env.EXPO_PUBLIC_API_ENDPOINT ?? 'http://localhost:8000';
export const USE_MOCK = process.env.EXPO_PUBLIC_USE_MOCK !== 'false';
/**
 * Core (POST /auth/session, /me, /shops) giả lập. Mặc định theo USE_MOCK; đặt EXPO_PUBLIC_MOCK_CORE=true để dùng
 * Firebase THẬT nhưng Core vẫn giả lập — dùng khi backend Core chưa có API (test đăng nhập SĐT trên máy thật).
 */
export const USE_MOCK_CORE = USE_MOCK || process.env.EXPO_PUBLIC_MOCK_CORE === 'true';
/**
 * Chỉ POST /shops giả lập. Core đã có /auth/session và /me nhưng CHƯA có /shops: đặt EXPO_PUBLIC_MOCK_SHOPS=true để test
 * trọn luồng với Core thật. Tiệm chỉ lưu ở máy nên mỗi lần mở lại app sẽ bị hỏi tạo tiệm lại (Core vẫn báo needsOnboarding).
 */
export const USE_MOCK_SHOPS = USE_MOCK_CORE || process.env.EXPO_PUBLIC_MOCK_SHOPS === 'true';

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
