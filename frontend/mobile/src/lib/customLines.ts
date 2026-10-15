/**
 * "Món tạm" của một đơn (`LineItem.custom`): món mới nhập ở màn quét mã mà chủ tiệm chọn không lưu vào danh mục. Món này
 * chỉ có trong đơn đang lập; đơn gửi nó lên Core như một món tuỳ ý (Core nhận dòng không có `productId`, kèm tên và đơn vị,
 * không tạo mặt hàng và không trừ tồn).
 */
import type { LineItem } from '../data/types';
import type { SaleDraftItemRequest } from './salesApi';

/** Giới hạn của Core cho tên và đơn vị của một dòng đơn (cũng vừa với tên mặt hàng). */
export const CUSTOM_NAME_MAX = 255;
export const CUSTOM_UNIT_MAX = 50;

/**
 * Đặt một món tạm vào các dòng của đơn theo mã vạch: chưa có thì thêm vào cuối, có rồi thì thay bằng dòng mới.
 * `qty <= 0` là bỏ món đó khỏi đơn.
 */
export function upsertCustomLine(lines: LineItem[], line: LineItem): LineItem[] {
  const barcode = line.custom?.barcode;
  if (!barcode) return lines;
  const index = lines.findIndex((x) => x.custom?.barcode === barcode);
  if (line.qty <= 0) return index < 0 ? lines : lines.filter((_, i) => i !== index);
  return index < 0 ? [...lines, line] : lines.map((x, i) => (i === index ? line : x));
}

/** Dòng gửi lên Core cho một dòng của đơn: món tạm đi như món tuỳ ý, món trong danh mục đi theo `productId`. */
export function toDraftItem(line: LineItem): SaleDraftItemRequest {
  if (line.custom) return { productName: line.name.trim(), unit: line.custom.unit.trim(), quantity: line.qty, unitPriceVnd: line.price };
  return { productId: line.productId as number, quantity: line.qty, unitPriceVnd: line.price };
}
