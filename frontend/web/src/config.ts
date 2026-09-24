/**
 * Cấu hình chung cho web.
 *
 * - USE_MOCK: mặc định dùng dữ liệu giả (localStorage). Đặt VITE_USE_MOCK=false
 *   trong file .env để chuyển sang gọi API thật.
 * - API_ENDPOINT: địa chỉ backend, lấy từ VITE_API_ENDPOINT (xem .env.example).
 */
export const USE_MOCK: boolean = import.meta.env.VITE_USE_MOCK !== 'false'

export const API_ENDPOINT: string = (import.meta.env.VITE_API_ENDPOINT ?? 'http://localhost:8000').replace(/\/+$/, '')

/** Độ trễ giả lập cho các lời gọi mock (ms). */
export const MOCK_DELAY_MS = 350

/** Hạn mức đơn/tháng của Gói Cơ bản. */
export const BASIC_MONTHLY_QUOTA = 200

/**
 * "Hôm nay" của bộ dữ liệu mẫu. Dữ liệu seed được sinh quanh mốc này để
 * biểu đồ 14 ngày / 7 ngày luôn có số liệu dù demo vào ngày nào.
 */
export const MOCK_TODAY = '2026-09-16'
