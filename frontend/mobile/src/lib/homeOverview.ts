/**
 * Phần thuần của màn Tổng quan (không gọi mạng, không import gì để test được bằng `node --test`). Số liệu đến từ báo cáo
 * của Core (`useHomeOverview`), các hàm ở đây chỉ chọn dòng để hiện và tính phần trăm so sánh.
 */

/** Tỉ lệ thay đổi doanh thu so với hôm qua (0.25 = +25%); `null` khi hôm qua không có doanh thu dương để so. */
export function revenueChange(current: number, yesterday: number | null | undefined): number | null {
  if (yesterday == null || yesterday <= 0) return null;
  return (current - yesterday) / yesterday;
}

/** Tối đa `max` dòng bán chạy; bỏ dòng có số lượng thuần ≤ 0 (bán rồi huỷ hết trong kỳ), Core không tự lọc. */
export function topSellerRows<T extends { netQuantity: number }>(items: T[], max = 4): T[] {
  return items.filter((item) => item.netQuantity > 0).slice(0, max);
}

/** Món cần nhập để nhắc ở mục ưu tiên: hết hàng trước, rồi tồn ít trước (chỉ sắp trong vài món Core trả về). */
export function restockRows<T extends { stockQuantity: number | null }>(items: T[], max = 2): T[] {
  return [...items].sort((a, b) => (a.stockQuantity ?? 0) - (b.stockQuantity ?? 0)).slice(0, max);
}

/** Số lượng gọn để hiện: Core trả số thập phân (BigDecimal), bỏ phần lẻ thừa ("2.000" → "2", "1.5" giữ nguyên). */
export function formatQuantity(quantity: number): string {
  return String(Number(quantity.toFixed(3)));
}
