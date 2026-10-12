import type { CategoryView, ProductView } from '../data/types';
import { apiRequest, type UploadImage } from './api';
import { fetchAllPages } from './pageApi';
import { createIdempotentSender } from './idempotency';

/**
 * Danh mục hàng hoá thật (Core `/categories`, `/products` — cần header X-Shop-Id, xem AGENTS.md).
 * Mọi hàm gọi qua `apiRequest` với `withShop: true` — AppStore đã gắn X-Shop-Id qua `setActiveShop`.
 */

const stockInSender = createIdempotentSender();
const imageSender = createIdempotentSender();
/** Upload ảnh qua mạng di động chậm hơn các lời gọi JSON nên chờ lâu hơn mặc định */
const IMAGE_UPLOAD_TIMEOUT_MS = 60000;

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
  list: (): Promise<ProductView[]> => fetchAllPages<ProductView>('/products'),
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
  /**
   * POST /products/{id}/image — đặt ảnh cho mặt hàng (JPEG/PNG, tối đa 5 MiB, mỗi cạnh ≤ 2048 px). Gửi lại cùng ảnh sau
   * lỗi mạng dùng lại Idempotency-Key cũ; Core trả mặt hàng kèm `imageUrl` mới.
   */
  uploadImage: (id: number, image: UploadImage): Promise<ProductView> =>
    imageSender.send({ productId: id, uri: image.uri }, (idempotencyKey) =>
      apiRequest<ProductView>(`/products/${id}/image`, {
        method: 'POST',
        image,
        withShop: true,
        idempotencyKey,
        timeoutMs: IMAGE_UPLOAD_TIMEOUT_MS,
      }),
    ),
  /** DELETE /products/{id}/image — bỏ ảnh riêng của mặt hàng; chưa có ảnh thì Core vẫn trả 204 */
  deleteImage: (id: number): Promise<void> => apiRequest<void>(`/products/${id}/image`, { method: 'DELETE', withShop: true }),
  /** DELETE — archive */
  archive: (id: number): Promise<void> => apiRequest<void>(`/products/${id}`, { method: 'DELETE', withShop: true }),
};
