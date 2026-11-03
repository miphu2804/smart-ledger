/** "10/2026" của tháng cách tháng của `now` `back` tháng */
function monthLabel(now: Date, back: number): string {
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getMonth() + 1}/${d.getFullYear()}`;
}

/** Gợi ý hỏi trợ lý ở Đơn hàng, như hàng gợi ý ở trang doanh thu của MoMo: tháng trước, so với tháng trước, món bán chạy. */
export function revenueSuggestions(now = new Date()): string[] {
  return [`Phân tích doanh thu tháng ${monthLabel(now, 1)}`, 'Doanh thu tháng này so với tháng trước?', 'Món nào bán chạy nhất 7 ngày qua?'];
}

/** Gợi ý hỏi tiếp dưới câu trả lời: các gợi ý chưa hỏi, rồi hai tháng trước nữa; tối đa bốn câu. */
export function followUpSuggestions(asked: string[], now = new Date()): string[] {
  const all = [...revenueSuggestions(now), `Phân tích doanh thu tháng ${monthLabel(now, 2)}`, `Phân tích doanh thu tháng ${monthLabel(now, 3)}`];
  return all.filter((q) => !asked.includes(q)).slice(0, 4);
}
