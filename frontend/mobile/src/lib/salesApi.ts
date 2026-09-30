import type { PaymentView, SaleDraftView, SaleView } from '../data/types';
import { apiRequest } from './api';

/**
 * Bán hàng thật (Core `/sale-drafts`, `/sales` — cần header X-Shop-Id, xem AGENTS.md).
 * Luồng bắt buộc: tạo draft rồi `confirm` ngay. `confirm` nhận `initialPaidVnd` bất kỳ từ 0 tới tổng đơn —
 * trả ít hơn tổng thì cần có khách (`customerId` có sẵn hoặc `customerName` để Core tự tạo khách mới),
 * nếu không sẽ lỗi `customer_required_for_debt`.
 */

export interface SaleDraftItemRequest {
  productId: number;
  quantity: number;
  unitPriceVnd: number;
}

export interface SaleDraftWriteRequest {
  customerName?: string | null;
  customerPhone?: string | null;
  customerId?: number | null;
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

export const paymentApi = {
  /** Lịch sử trả tiền (append-only) của một đơn — dùng để dựng "Lịch sử" của một khoản nợ */
  listForSale: (saleId: number): Promise<PaymentView[]> =>
    apiRequest<PaymentView[]>(`/sales/${saleId}/payments`, { withShop: true }),
};
