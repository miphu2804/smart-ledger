import type { SaleDraftView, SaleView } from '../data/types';
import { apiRequest } from './api';

/**
 * Bán hàng thật (Core `/sale-drafts`, `/sales` — cần header X-Shop-Id, xem AGENTS.md).
 * Luồng bắt buộc: tạo draft với `initialPaidVnd = total` + `initialPaymentMethod`, rồi `confirm` ngay
 * (đã bỏ ghi nợ — Core chỉ xác nhận đơn khi khách trả đủ tiền, lỗi `full_payment_required` nếu chưa đủ).
 */

export interface SaleDraftItemRequest {
  productId: number;
  quantity: number;
  unitPriceVnd: number;
}

export interface SaleDraftWriteRequest {
  customerName?: string | null;
  customerPhone?: string | null;
  discountVnd?: number | null;
  initialPaidVnd?: number | null;
  initialPaymentMethod?: 'CASH' | 'TRANSFER' | null;
  /** 1-100 dòng, KHÔNG được trùng productId */
  items: SaleDraftItemRequest[];
}

export const saleDraftApi = {
  create: (input: SaleDraftWriteRequest): Promise<SaleDraftView> =>
    apiRequest<SaleDraftView>('/sale-drafts', { method: 'POST', body: input, withShop: true }),
  list: (): Promise<SaleDraftView[]> => apiRequest<SaleDraftView[]>('/sale-drafts', { withShop: true }),
  getById: (id: number): Promise<SaleDraftView> => apiRequest<SaleDraftView>(`/sale-drafts/${id}`, { withShop: true }),
  replace: (id: number, input: SaleDraftWriteRequest): Promise<SaleDraftView> =>
    apiRequest<SaleDraftView>(`/sale-drafts/${id}`, { method: 'PUT', body: input, withShop: true }),
  /** Huỷ, chỉ khi còn DRAFT */
  cancel: (id: number): Promise<void> => apiRequest<void>(`/sale-drafts/${id}`, { method: 'DELETE', withShop: true }),
  /** Xác nhận thành Sale — trừ kho thật; lỗi `product_stock_insufficient` nếu không đủ hàng */
  confirm: (id: number): Promise<SaleView> =>
    apiRequest<SaleView>(`/sale-drafts/${id}/confirm`, { method: 'POST', withShop: true }),
};

export const saleApi = {
  list: (): Promise<SaleView[]> => apiRequest<SaleView[]>('/sales', { withShop: true }),
  getById: (id: number): Promise<SaleView> => apiRequest<SaleView>(`/sales/${id}`, { withShop: true }),
};
