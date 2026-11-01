/**
 * Thông tin dùng chung cho các trang pháp lý (/chinh-sach, /data-deletion).
 *
 * Email liên hệ là địa chỉ công khai của sản phẩm, đọc từ `site.yaml`.
 */
export const CONTACT_EMAIL: string = (__SITE__.contact_email ?? '').trim()

export const CONTROLLER = 'Team HEXA (dự án môn EXE201, Trường Đại học FPT)'

/** Ngày cập nhật gần nhất của /data-deletion. */
export const LEGAL_UPDATED = '14/10/2026'

/** Ngày của bản chính sách gửi Google Play (/chinh-sach). */
export const POLICY_UPDATED = '01/11/2026'

/** Số ngày nhóm cam kết xử lý yêu cầu xoá dữ liệu. */
export const DELETION_DAYS = 30
