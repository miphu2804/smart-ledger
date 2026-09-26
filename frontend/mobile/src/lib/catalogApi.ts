import type { CategoryView, ProductView } from '../data/types';
import { apiRequest } from './api';

/**
 * Danh mục hàng hoá thật (Core `/categories`, `/products` — cần header X-Shop-Id, xem AGENTS.md).
 * Mọi hàm gọi qua `apiRequest` với `withShop: true` — AppStore đã gắn X-Shop-Id qua `setActiveShop`.
 */

export interface CategoryWriteRequest {
  name: string;
}

export interface ProductWriteRequest {
  categoryId?: number | null;
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
  unit: string;
  sellingPriceVnd: number;
  costPriceVnd?: number | null;
  tracked: boolean;
  /** BẮT BUỘC có (>=0) nếu tracked=true; BẮT BUỘC bỏ trống/null nếu tracked=false */
  stockQuantity?: number | null;
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
  update: (id: number, input: ProductWriteRequest): Promise<ProductView> =>
    apiRequest<ProductView>(`/products/${id}`, { method: 'PUT', body: input, withShop: true }),
  /** DELETE — archive */
  archive: (id: number): Promise<void> => apiRequest<void>(`/products/${id}`, { method: 'DELETE', withShop: true }),
};
