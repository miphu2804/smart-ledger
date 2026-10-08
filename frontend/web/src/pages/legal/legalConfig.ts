/**
 * Thông tin dùng chung cho các trang pháp lý (/privacy, /data-deletion).
 *
 * Nội dung pháp lý cần chủ sản phẩm duyệt (AGENTS.md). Cho đến khi duyệt, hai trang hiện nhãn "Bản nháp";
 * sau khi duyệt, đặt VITE_LEGAL_DRAFT=false lúc build để gỡ nhãn mà không phải sửa code.
 * Email liên hệ đọc từ VITE_CONTACT_EMAIL để không đưa địa chỉ thật vào repo công khai.
 */
export const LEGAL_DRAFT: boolean = import.meta.env.VITE_LEGAL_DRAFT !== 'false'

export const CONTACT_EMAIL: string = ((import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? '').trim()

export const CONTROLLER = 'Team HEXA (dự án môn EXE201, Trường Đại học FPT)'

/** Ngày cập nhật gần nhất của cả hai trang. */
export const LEGAL_UPDATED = '08/10/2026'

/** Số ngày nhóm cam kết xử lý yêu cầu xoá dữ liệu — con số đề xuất, chờ chủ sản phẩm xác nhận. */
export const DELETION_DAYS = 30
