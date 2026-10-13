import type { DebtView, PaymentView } from '../data/types';
import { apiRequest } from './api';
import { createIdempotentSender } from './idempotency';
import { fetchAllPages } from './pageApi';

const repaySender = createIdempotentSender();

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
  list: (): Promise<DebtView[]> => fetchAllPages<DebtView>('/debts'),
  getById: (id: number): Promise<DebtView> => apiRequest<DebtView>(`/debts/${id}`, { withShop: true }),
  /** Ghi nhận một lần trả (append-only), trả về nợ + payment vừa tạo. Bấm lại sau lỗi mạng dùng lại key cũ. */
  repay: (id: number, input: DebtRepaymentRequest): Promise<DebtRepaymentResponse> =>
    repaySender.send({ id, input }, (idempotencyKey) =>
      apiRequest<DebtRepaymentResponse>(`/debts/${id}/payments`, {
        method: 'POST',
        body: input,
        withShop: true,
        idempotencyKey,
      }),
    ),
};
