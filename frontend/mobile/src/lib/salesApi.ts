import type { PaymentView, SaleDraftView, SaleRefundView, SaleView, SaleVoidView } from '../data/types';
import { ApiError, apiRequest } from './api';
import { createIdempotentSender } from './idempotency';
import type { SaleVoidRequest } from './saleVoid';

// Mỗi loại thao tác ghi tiền một bộ gửi: mất mạng rồi bấm lại cùng nội dung dùng lại Idempotency-Key cũ nên Core
// không huỷ và hoàn tiền hai lần (xem idempotency.ts).
const voidSender = createIdempotentSender();

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
  /**
   * POST /sales/{id}/void: huỷ cả đơn, hoàn toàn bộ tiền đã thu, huỷ nợ còn dư, tuỳ chọn hoàn hàng về kho (xem saleVoid.ts).
   * Cần Idempotency-Key; lỗi mạng/timeout/5xx giữ key để bấm lại không huỷ hai lần. Đơn đã huỷ → 409 sale_already_voided.
   */
  void: (id: number, input: SaleVoidRequest): Promise<SaleVoidView> =>
    voidSender.send({ saleId: id, ...input }, (idempotencyKey) =>
      apiRequest<SaleVoidView>(`/sales/${id}/void`, { method: 'POST', body: input, withShop: true, idempotencyKey }),
    ),
  /** GET /sales/{id}/refund: khoản hoàn của đơn đã huỷ; `null` khi đơn chưa thu đồng nào nên không có khoản hoàn (404 sale_refund_not_found). */
  getRefund: async (id: number): Promise<SaleRefundView | null> => {
    try {
      return await apiRequest<SaleRefundView>(`/sales/${id}/refund`, { withShop: true });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && e.code === 'sale_refund_not_found') return null;
      throw e;
    }
  },
};

export const paymentApi = {
  /** Lịch sử trả tiền (append-only) của một đơn — dùng để dựng "Lịch sử" của một khoản nợ */
  listForSale: (saleId: number): Promise<PaymentView[]> =>
    apiRequest<PaymentView[]>(`/sales/${saleId}/payments`, { withShop: true }),
};
