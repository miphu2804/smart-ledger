import type { ShopView } from '../data/types';

/** Tiệm dùng được: Core chặn mọi API nghiệp vụ của tiệm bị ADMIN tạm ngưng, nên tiệm đó chỉ hiện trong danh sách, không chọn được. */
export function isShopUsable(shop: ShopView): boolean {
  return !shop.status || shop.status === 'ACTIVE';
}

/**
 * Tiệm mở khi vào app: tiệm đã chọn lần trước nếu còn dùng được, không thì tiệm dùng được đầu tiên. Tất cả bị tạm ngưng thì lấy
 * tiệm đầu danh sách để app vẫn có tiệm và các API báo đúng lỗi tạm ngưng.
 */
export function pickActiveShop(shops: ShopView[], preferredId?: string | null): ShopView | undefined {
  const preferred = shops.find((shop) => String(shop.id) === preferredId);
  if (preferred && isShopUsable(preferred)) return preferred;
  return shops.find(isShopUsable) ?? shops[0];
}
