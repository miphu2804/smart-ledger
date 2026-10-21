/**
 * Các bước của phần hướng dẫn dạng lớp phủ (src/components/GuideTour.tsx): mỗi bước khoanh sáng một nút có thật trên màn Tổng
 * quan (hoặc thanh tab, mascot Bobi) và giải thích bấm vào đó để làm gì. Bước không có `target` là thẻ ở giữa màn (chào mừng).
 * Tách khỏi component để kiểm thử bằng `node --test`.
 */
export type GuideTarget =
  'readOrder' | 'selectGoods' | 'scanCode' | 'assistant' | 'mascot' | 'bell' | 'quickNav' | 'tabInvoices' | 'tabMore';

export interface GuideStep {
  target: GuideTarget | null;
  title: string;
  body: string;
  /** Bo góc của khung sáng (mascot tròn) */
  round?: boolean;
}

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    target: null,
    title: 'Chào mừng đến Sổ Nghe Lời',
    body: 'Xem nhanh trong một phút cách lên đơn, quét mã, ghi nợ và hỏi trợ lý. Bạn có thể bỏ qua và xem lại bất cứ lúc nào ở tab Quản lý.',
  },
  {
    target: 'readOrder',
    title: 'Gọi món bằng giọng nói',
    body: 'Bấm Đọc đơn rồi nói món và số lượng, ví dụ “hai cà phê sữa, một bánh mì”. App tự lên đơn để bạn kiểm tra rồi thanh toán.',
  },
  {
    target: 'selectGoods',
    title: 'Chọn hàng và thanh toán',
    body: 'Chạm món để thêm vào giỏ, rồi bấm giỏ để thanh toán bằng tiền mặt, chuyển khoản hoặc Ghi nợ khi khách mua chịu.',
  },
  {
    target: 'scanCode',
    title: 'Quét mã vạch',
    body: 'Đưa mã vạch trên sản phẩm vào khung để thêm vào giỏ. Mã chưa có trong danh mục thì app cho nhập thông tin để thêm món mới.',
  },
  {
    target: 'assistant',
    title: 'Hỏi trợ lý Bobi',
    body: 'Hỏi về doanh thu, món bán chạy hay khách còn nợ. Bobi trả lời theo số liệu của chính tiệm bạn.',
  },
  {
    target: 'mascot',
    round: true,
    title: 'Bobi luôn ở góc màn hình',
    body: 'Chạm để mở nhanh Hỏi đáp, Đọc đơn hay Báo cáo; giữ để đọc đơn ngay. Bobi che nội dung thì kéo sang chỗ khác.',
  },
  {
    target: 'bell',
    title: 'Thông báo',
    body: 'Đơn mới, hàng sắp hết và khoản nợ chưa thu hiện ở đây. Bánh răng trong màn Thông báo cho chọn nhóm muốn nhận.',
  },
  {
    target: 'quickNav',
    title: 'Chuyển nhanh',
    body: 'Mở menu bên trái để tới ngay Công nợ, Hàng hoá, Báo cáo, Chi phí hay Cài đặt.',
  },
  {
    target: 'tabInvoices',
    title: 'Đơn hàng',
    body: 'Xem lại các đơn đã bán, tìm theo tên khách hoặc món, xem chi tiết và huỷ đơn khi cần.',
  },
  {
    target: 'tabMore',
    title: 'Quản lý',
    body: 'Hàng hoá, Công nợ (thu tiền khách còn nợ), Chi phí, Báo cáo và Cài đặt nằm ở đây. Muốn xem lại hướng dẫn này, bấm “Xem lại hướng dẫn”.',
  },
];
