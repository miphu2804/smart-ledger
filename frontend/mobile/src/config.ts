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
