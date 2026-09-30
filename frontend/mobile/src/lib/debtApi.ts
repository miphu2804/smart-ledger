import type { DebtView, PaymentView } from '../data/types';
import { apiRequest } from './api';

/**
 * Công nợ thật (Core `/debts` — cần header X-Shop-Id, xem AGENTS.md).
 * Không có endpoint xoá nợ đã trả hết; danh sách chỉ join tên/SĐT khách qua `customerApi`.
 */

export interface DebtRepaymentRequest {
  amountVnd: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  transferReference?: string;
}

export interface DebtRepaymentResponse {
  debt: DebtView;
  payment: PaymentView;
}

export const debtApi = {
  list: (): Promise<DebtView[]> => apiRequest<DebtView[]>('/debts', { withShop: true }),
  getById: (id: number): Promise<DebtView> => apiRequest<DebtView>(`/debts/${id}`, { withShop: true }),
  /** Ghi nhận một lần trả (append-only), trả về nợ + payment vừa tạo */
  repay: (id: number, input: DebtRepaymentRequest): Promise<DebtRepaymentResponse> =>
    apiRequest<DebtRepaymentResponse>(`/debts/${id}/payments`, { method: 'POST', body: input, withShop: true }),
};
