/**
 * Danh mục sự kiện gửi lên Google Analytics 4 (Firebase Analytics). Gửi ở `analytics.ts`; tách riêng để kiểm thử bằng `node --test`.
 *
 * Tham số chỉ là giá trị liệt kê hoặc số đếm: không gửi tên, số điện thoại, email, tên tiệm, tên món, số tiền hay nội dung
 * chat, vì đó là dữ liệu của chủ tiệm và khách của họ. Tên sự kiện và tham số theo luật của GA4: chữ thường, số, gạch dưới,
 * tối đa 40 ký tự, không bắt đầu bằng `firebase_`, `google_` hay `ga_`.
 */
export interface AnalyticsEventParams {
  login: { method: 'google' | 'zalo' | 'email' };
  shop_created: { via: 'onboarding' | 'new_shop' };
  sale_completed: { source: 'voice' | 'pos' | 'manual'; payment: 'cash' | 'transfer' | 'debt'; item_count: number };
  voice_order_reviewed: { item_count: number };
  ai_message_sent: { conversation: 'new' | 'existing' };
  product_created: { via: 'products' | 'pos' | 'voice' };
  expense_created: { via: 'expenses' | 'voice' };
}

export type AnalyticsEventName = keyof AnalyticsEventParams;

/** Mỗi sự kiện đo điều gì; thêm sự kiện mới thì TypeScript bắt thêm dòng ở đây. */
export const ANALYTICS_EVENTS: Record<AnalyticsEventName, string> = {
  login: 'Đăng nhập xong (sự kiện khuyến nghị của GA4), theo cách đăng nhập',
  shop_created: 'Tạo tiệm: tiệm đầu tiên lúc bắt đầu dùng app, hoặc thêm tiệm sau đó',
  sale_completed: 'Lưu đơn bán thành công: đơn tạo bằng giọng nói, máy bán hàng hay nhập tay, và cách thanh toán',
  voice_order_reviewed: 'Đơn đọc bằng giọng nói được chuyển sang màn thanh toán',
  ai_message_sent: 'Gửi một tin nhắn cho trợ lý AI, mở cuộc trò chuyện mới hay tiếp tục',
  product_created: 'Thêm sản phẩm, theo màn đã thêm',
  expense_created: 'Ghi một khoản chi, theo màn đã ghi',
};

/**
 * Tên màn gửi kèm `screen_view`, lấy từ `useSegments()` của expo-router: bỏ nhóm như `(tabs)` và giữ nguyên tham số động
 * như `[id]`, để không gửi mã hoá đơn và mọi hoá đơn gộp về một màn. Màn gốc của nhóm tab là `home`.
 */
export function screenNameFromSegments(segments: readonly string[]): string {
  const name = segments.filter((s) => !(s.startsWith('(') && s.endsWith(')'))).join('/');
  return name || 'home';
}
