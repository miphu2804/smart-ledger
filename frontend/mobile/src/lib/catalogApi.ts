import type { CategoryView, ProductView } from '../data/types';
import { apiRequest } from './api';
import { createIdempotentSender } from './idempotency';

/**
 * Danh mục hàng hoá thật (Core `/categories`, `/products` — cần header X-Shop-Id, xem AGENTS.md).
 * Mọi hàm gọi qua `apiRequest` với `withShop: true` — AppStore đã gắn X-Shop-Id qua `setActiveShop`.
 */

const stockInSender = createIdempotentSender();

export interface CategoryWriteRequest {
  name: string;
}

/**
 * POST /products. `imageUrl` không phải input (ảnh đi qua POST /products/{id}/image), nên không có ở đây.
 */
export interface ProductWriteRequest {
  categoryId?: number | null;
  name: string;
  barcode?: string | null;
  unit: string;
  sellingPriceVnd: number;
  costPriceVnd?: number | null;
  tracked: boolean;
  /** BẮT BUỘC có (>=0) nếu tracked=true; BẮT BUỘC bỏ trống/null nếu tracked=false */
  stockQuantity?: number | null;
  /** >= 0; bỏ trống/null = không đặt ngưỡng nên Core không báo LOW_STOCK (hết hàng vẫn báo OUT_OF_STOCK) */
  lowStockThreshold?: number | null;
}

/**
 * PATCH /products/{id}: chỉ gửi trường muốn đổi, bỏ trường = giữ nguyên; `null` chỉ hợp lệ cho
 * categoryId/barcode/costPriceVnd/lowStockThreshold. KHÔNG có `stockQuantity` (kể cả null) và `imageUrl`:
 * Core trả 400 — đổi tồn bằng `productApi.stockIn`.
 */
export interface ProductUpdateRequest {
  categoryId?: number | null;
  name?: string;
  barcode?: string | null;
  unit?: string;
  sellingPriceVnd?: number;
  costPriceVnd?: number | null;
  tracked?: boolean;
  lowStockThreshold?: number | null;
}

export interface StockInRequest {
  /** > 0, tối đa 12 chữ số nguyên và 3 chữ số thập phân */
  quantity: number;
  /** tối đa 500 ký tự; trống = không ghi lý do */
  reason?: string | null;
}

export const categoryApi = {
  /** GET /categories — danh sách ACTIVE */
  list: (): Promise<CategoryView[]> => apiRequest<CategoryView[]>('/categories', { withShop: true }),
  create: (input: CategoryWriteRequest): Promise<CategoryView> =>
    apiRequest<CategoryView>('/categories', { method: 'POST', body: input, withShop: true }),
  update: (id: number, input: CategoryWriteRequest): Promise<CategoryView> =>
    apiRequest<CategoryView>(`/categories/${id}`, { method: 'PUT', body: input, withShop: true }),
  /** DELETE — archive; lỗi `category_has_products` nếu còn sản phẩm active */
  archive: (id: number): Promise<void> => apiRequest<void>(`/categories/${id}`, { method: 'DELETE', withShop: true }),
};

export const productApi = {
  /** GET /products — danh sách ACTIVE */
  list: (): Promise<ProductView[]> => apiRequest<ProductView[]>('/products', { withShop: true }),
  create: (input: ProductWriteRequest): Promise<ProductView> =>
    apiRequest<ProductView>('/products', { method: 'POST', body: input, withShop: true }),
  update: (id: number, input: ProductUpdateRequest): Promise<ProductView> =>
    apiRequest<ProductView>(`/products/${id}`, { method: 'PATCH', body: input, withShop: true }),
  /**
   * POST /products/{id}/stock-in — cộng tồn (chỉ mặt hàng đang theo dõi tồn). Bấm lại cùng số lượng và lý do sau lỗi mạng
   * dùng lại Idempotency-Key cũ nên không cộng hai lần; Core trả bản chụp mặt hàng lúc nhập.
   */
  stockIn: (id: number, input: StockInRequest): Promise<ProductView> =>
    stockInSender.send({ productId: id, ...input }, (idempotencyKey) =>
      apiRequest<ProductView>(`/products/${id}/stock-in`, { method: 'POST', body: input, withShop: true, idempotencyKey }),
    ),
  /** DELETE — archive */
  archive: (id: number): Promise<void> => apiRequest<void>(`/products/${id}`, { method: 'DELETE', withShop: true }),
};
