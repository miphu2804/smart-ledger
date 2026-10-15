/** Số trang hiển thị: trang đầu, trang cuối, trang hiện tại và hai trang kề, "…" ở chỗ nhảy cách. Trang đánh số từ 0. */
export function pageNumbers(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i);
  const out: (number | '…')[] = [0];
  const start = Math.max(1, page - 1);
  const end = Math.min(totalPages - 2, page + 1);
  if (start > 1) out.push('…');
  for (let i = start; i <= end; i += 1) out.push(i);
  if (end < totalPages - 2) out.push('…');
  out.push(totalPages - 1);
  return out;
}
