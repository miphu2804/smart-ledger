import type { ProductView } from '../data/types';
import type { ProductUpdateRequest } from './catalogApi';

export type StockLevel = 'untracked' | 'out' | 'low' | 'ok';

/**
 * Mức tồn của một mặt hàng theo cách Core tính cảnh báo (docs/contracts/api-contracts.md mục 8): hết hàng khi tồn ≤ 0;
 * sắp hết chỉ khi mặt hàng có đặt `lowStockThreshold` và tồn ≤ ngưỡng. Mặt hàng chưa đặt ngưỡng không bị coi là sắp hết.
 */
export function stockLevel(p: Pick<ProductView, 'tracked' | 'stockQuantity' | 'lowStockThreshold'>): StockLevel {
  if (!p.tracked) return 'untracked';
  const stock = p.stockQuantity ?? 0;
  if (stock <= 0) return 'out';
  if (p.lowStockThreshold != null && stock <= p.lowStockThreshold) return 'low';
  return 'ok';
}

/**
 * Chỉ chữ số (số nguyên không âm). "-5", "1.5" và "1,5" không hợp lệ: bỏ ký tự lạ rồi đọc tiếp sẽ ra số khác
 * ("-5" thành 5, "1,5" thành 15), nên các ô số lượng và ngưỡng phải từ chối thay vì tự đoán.
 */
export function isWholeNumber(text: string): boolean {
  return /^[0-9]+$/.test(text.trim());
}

/** Ô ngưỡng chỉ nhận số nguyên không âm; để trống = không đặt ngưỡng (null). Gọi sau khi `isWholeNumber` đã đúng. */
export function parseThreshold(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  return digits === '' ? null : parseInt(digits, 10);
}

export interface ProductFormValues {
  name: string;
  unit: string;
  barcode: string;
  sellingPriceVnd: number;
  costPriceVnd: number | null;
  categoryId: number | null;
  tracked: boolean;
  lowStockThreshold: number | null;
}

/**
 * Nội dung PATCH /products/{id}: chỉ những trường thật sự khác bản đang lưu, `{}` nếu không đổi gì (khỏi gửi thừa, mỗi
 * lần sửa Core còn ghi audit). Không bao giờ có `stockQuantity`/`imageUrl` (Core từ chối); tồn đổi bằng stock-in.
 * Ngưỡng chỉ gửi khi mặt hàng đang theo dõi tồn sau khi lưu.
 */
export function buildProductPatch(p: ProductView, v: ProductFormValues): ProductUpdateRequest {
  const patch: ProductUpdateRequest = {};
  const name = v.name.trim();
  const unit = v.unit.trim();
  const barcode = v.barcode.trim() || null;
  if (name !== p.name) patch.name = name;
  if (unit !== p.unit) patch.unit = unit;
  if (barcode !== (p.barcode ?? null)) patch.barcode = barcode;
  if (v.sellingPriceVnd !== p.sellingPriceVnd) patch.sellingPriceVnd = v.sellingPriceVnd;
  if (v.costPriceVnd !== (p.costPriceVnd ?? null)) patch.costPriceVnd = v.costPriceVnd;
  if (v.categoryId !== (p.categoryId ?? null)) patch.categoryId = v.categoryId;
  if (v.tracked !== p.tracked) patch.tracked = v.tracked;
  if (v.tracked && v.lowStockThreshold !== (p.lowStockThreshold ?? null)) patch.lowStockThreshold = v.lowStockThreshold;
  return patch;
}
