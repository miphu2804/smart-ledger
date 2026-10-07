/**
 * Hồ sơ tiệm lưu ở Core qua `PATCH /api/v1/shops/{shopId}` (docs/contracts/api-contracts.md mục 1): `name`, `industry`,
 * `phone`, `address`. Màn "Chỉnh sửa thông tin" chỉ sửa tên, ngành và địa chỉ; tên người dùng, email, Facebook và tài khoản
 * ngân hàng chưa có chỗ lưu ở Core nên vẫn chỉ nằm trên máy.
 */

export interface ShopFields {
  name: string;
  address: string;
  industries: string[];
}

/** Các trường đã đổi, đúng dạng app dùng (xem `sessionApi.updateShop` để biết dạng gửi cho Core). */
export interface ShopChanges {
  name?: string;
  address?: string;
  industries?: string[];
}

/**
 * Core lưu MỘT chuỗi `industry` (1–100 ký tự), còn UI cho chọn nhiều mã ngành nên nối bằng ", ".
 * Mười mã trong `industryList` nối lại dài nhất 77 ký tự nên luôn nằm trong giới hạn.
 */
export const industriesToCore = (ids: string[]): string => ids.join(', ');

/** Ngược lại với `industriesToCore`: "food, drink" → ["food", "drink"]. */
export function industriesFromCore(industry?: string | null): string[] {
  return (industry ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

const asSet = (ids: string[]) => [...new Set(ids)].sort().join('\u0000');

/**
 * Chỉ giữ các trường thật sự khác với bản đang lưu, để không gửi `PATCH` thừa (mỗi lần sửa Core ghi một dòng audit
 * `SHOP_UPDATED`). Trả về `null` khi không có gì đổi. Tên và địa chỉ so sau khi cắt khoảng trắng đầu cuối; ngành so như tập hợp.
 */
export function shopChanges(current: ShopFields, next: ShopFields): ShopChanges | null {
  const changes: ShopChanges = {};
  const name = next.name.trim();
  if (name !== current.name.trim()) changes.name = name;
  // Địa chỉ rỗng là cách xoá địa chỉ: Core coi chuỗi rỗng của phone/address là xoá, còn bỏ trường thì giữ nguyên.
  const address = next.address.trim();
  if (address !== current.address.trim()) changes.address = address;
  if (asSet(current.industries) !== asSet(next.industries)) changes.industries = next.industries;
  return Object.keys(changes).length ? changes : null;
}
