/** "10/2026" của tháng cách tháng của `now` `back` tháng */
function monthLabel(now: Date, back: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
}

/**
 * Gợi ý hỏi trợ lý ở Đơn hàng, như hàng gợi ý ở trang doanh thu của MoMo: tháng trước, so với tháng trước, món bán chạy.
 * Mỗi câu hỏi theo tuần, theo ngày hoặc kèm tỷ trọng để câu trả lời có thẻ biểu đồ thay vì một con số.
 */
export function revenueSuggestions(now = new Date()): string[] {
  return [
    `Phân tích doanh thu tháng ${monthLabel(now, 1)} theo từng tuần`,
    'Doanh thu từng tuần tháng này so với tháng trước',
    '5 món mang về nhiều doanh thu nhất 7 ngày qua',
  ];
}

/** Gợi ý hỏi tiếp dưới câu trả lời: các gợi ý chưa hỏi, rồi thứ bán chạy, thu và nợ, tháng trước nữa; tối đa bốn câu. */
export function followUpSuggestions(asked: string[], now = new Date()): string[] {
  const all = [
    ...revenueSuggestions(now),
    'Thứ mấy trong tuần bán chạy nhất 30 ngày qua?',
    'Tiền đã thu và còn nợ theo từng tuần tháng này',
    `Phân tích doanh thu tháng ${monthLabel(now, 2)} theo từng tuần`,
  ];
  return all.filter((q) => !asked.includes(q)).slice(0, 4);
}
