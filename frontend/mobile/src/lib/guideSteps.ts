/**
 * Các bước của phần hướng dẫn dạng lớp phủ (src/components/GuideTour.tsx): mỗi bước khoanh sáng một nút có thật trên màn Tổng
 * quan (hoặc thanh tab, mascot Bobi) và Bobi nói một câu ngắn, thân mật, bấm vào đó để làm gì. Bước không có `target` là thẻ ở
 * giữa màn (chào mừng). `{name}` trong tiêu đề được thay bằng tên gọi của chủ tiệm (`personalizeStep`). Nội dung giữ ngắn (tối
 * đa `GUIDE_BODY_MAX` ký tự) để đọc lướt được. Tách khỏi component để kiểm thử bằng `node --test`.
 */
export type GuideTarget =
  | 'tabSales'
  | 'tabBobi'
  | 'readOrder'
  | 'selectGoods'
  | 'scanCode'
  | 'assistant'
  | 'mascot'
  | 'bell'
  | 'quickNav'
  | 'tabInvoices'
  | 'tabMore';

export interface GuideStep {
  target: GuideTarget | null;
  title: string;
  body: string;
  /** Bo góc của khung sáng (mascot tròn) */
  round?: boolean;
}

export const GUIDE_BODY_MAX = 80;
/** Tên gọi dài hơn mức này thì gọi "bạn" để tiêu đề không xuống dòng */
const NAME_MAX = 12;

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    target: null,
    title: 'Chào {name}, mình là Bobi!',
    body: 'Mình sẽ chỉ bạn chỗ tạo đơn, xem đơn đã bán và hỏi về tiệm nhé.',
  },
  {
    target: 'tabSales',
    title: 'Bắt đầu từ Tạo đơn',
    body: 'Chọn hàng, Đọc đơn hoặc Quét mã. Kiểm tra giỏ rồi thanh toán hay Ghi nợ.',
  },
  {
    target: 'tabInvoices',
    title: 'Xem lại đơn đã bán',
    body: 'Tìm đơn, xem chi tiết và theo dõi thanh toán. Cần huỷ đơn cũng vào đây.',
  },
  {
    target: 'tabBobi',
    title: 'Có câu hỏi? Gặp Bobi',
    body: 'Hỏi về doanh thu, hàng hoá và tình hình tiệm trong màn trò chuyện với mình.',
  },
  { target: 'bell', title: 'Có gì mới, mình báo', body: 'Đơn mới, hàng sắp hết hay khoản nợ chưa thu đều hiện ở chuông này.' },
  { target: 'quickNav', title: 'Đi tắt cho nhanh', body: 'Mở menu này để tới ngay Công nợ, Hàng hoá, Báo cáo hay Chi phí.' },
  {
    target: 'tabMore',
    title: 'Xong rồi đó {name}!',
    body: 'Hàng hoá, cài đặt đều ở Quản lý. Quên gì thì bấm “Xem lại hướng dẫn” nha.',
  },
];

/**
 * Tên gọi từ họ tên đầy đủ: tên người Việt đứng cuối ("Nguyễn Văn Tín" → "Tín"). Không có tên, hoặc tên gọi quá dài (thường là
 * tên tiệm hay biệt danh dài), thì gọi "bạn". Phiên chưa có tên thì AppStore đặt tên "Bạn", cũng gọi "bạn" (chữ thường).
 */
export function guideCallName(fullName: string | null | undefined): string {
  const parts = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  const last = parts[parts.length - 1] ?? '';
  return last && last.length <= NAME_MAX && last.toLowerCase() !== 'bạn' ? last : 'bạn';
}

/** Điền tên gọi vào bước hướng dẫn */
export function personalizeStep(step: GuideStep, fullName: string | null | undefined): GuideStep {
  const name = guideCallName(fullName);
  return { ...step, title: step.title.replaceAll('{name}', name), body: step.body.replaceAll('{name}', name) };
}
