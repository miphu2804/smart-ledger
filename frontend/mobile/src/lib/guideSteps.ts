/**
 * Các bước của phần hướng dẫn dạng lớp phủ (src/components/GuideTour.tsx): mỗi bước khoanh sáng một nút có thật trên màn Tổng
 * quan (hoặc thanh tab, mascot Bobi) và Bobi nói một câu ngắn, thân mật, bấm vào đó để làm gì. Bước không có `target` là thẻ ở
 * giữa màn (chào mừng). `{name}` trong tiêu đề được thay bằng tên gọi của chủ tiệm (`personalizeStep`). Nội dung giữ ngắn (tối
 * đa `GUIDE_BODY_MAX` ký tự) để đọc lướt được. Tách khỏi component để kiểm thử bằng `node --test`.
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

export const GUIDE_BODY_MAX = 80;
/** Tên gọi dài hơn mức này thì gọi "bạn" để tiêu đề không xuống dòng */
const NAME_MAX = 12;

export const GUIDE_STEPS: readonly GuideStep[] = [
  {
    target: null,
    title: 'Chào {name}, mình là Bobi!',
    body: 'Để mình dẫn bạn đi một vòng nhé, chưa tới một phút đâu.',
  },
  { target: 'readOrder', title: 'Bán bằng giọng nói', body: 'Khách gọi gì, bạn cứ đọc “hai cà phê sữa”, mình lên đơn liền!' },
  {
    target: 'selectGoods',
    title: 'Thích chạm hơn nói?',
    body: 'Chọn món vào giỏ rồi thanh toán. Khách quen mua chịu thì bấm Ghi nợ.',
  },
  {
    target: 'scanCode',
    title: 'Có mã vạch là nhanh nhất',
    body: 'Đưa mã vào khung là món vô giỏ. Mã lạ thì mình hỏi để thêm món mới.',
  },
  {
    target: 'assistant',
    title: 'Cần số liệu? Hỏi mình!',
    body: 'Hôm nay bán được bao nhiêu, món nào chạy, ai còn nợ… mình trả lời liền.',
  },
  {
    target: 'mascot',
    round: true,
    title: 'Mình luôn ở đây nè',
    body: 'Chạm để gọi mình, giữ lâu để đọc đơn ngay. Vướng thì kéo mình qua chỗ khác.',
  },
  { target: 'bell', title: 'Có gì mới, mình báo', body: 'Đơn mới, hàng sắp hết hay khoản nợ chưa thu đều hiện ở chuông này.' },
  { target: 'quickNav', title: 'Đi tắt cho nhanh', body: 'Mở menu này để tới ngay Công nợ, Hàng hoá, Báo cáo hay Chi phí.' },
  {
    target: 'tabInvoices',
    title: 'Đơn đã bán nằm đây',
    body: 'Tìm lại đơn theo tên khách hoặc món, xem chi tiết hay huỷ khi cần.',
  },
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
