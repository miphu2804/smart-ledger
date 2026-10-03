import type { ExpenseView } from '../data/types';
import { apiRequest } from './api';
import { createIdempotentSender } from './idempotency';

const createSender = createIdempotentSender();

/**
 * Chi phí thật (Core `/expenses` — cần header X-Shop-Id, xem AGENTS.md).
 * `category` là chuỗi tự do ở Core — app gửi/đọc key cố định của `ExpenseCategory` (xem src/data/mock.ts).
 */
export interface ExpenseWriteRequest {
  category?: string | null;
  description: string;
  amountVnd: number;
  paymentMethod?: 'CASH' | 'TRANSFER' | null;
  expenseAt?: string | null;
}

export const expenseApi = {
  /** Bấm lưu lại cùng nội dung sau lỗi mạng dùng lại Idempotency-Key cũ, không ghi chi phí hai lần */
  create: (input: ExpenseWriteRequest): Promise<ExpenseView> =>
    createSender.send(input, (idempotencyKey) =>
      apiRequest<ExpenseView>('/expenses', { method: 'POST', body: input, withShop: true, idempotencyKey }),
    ),
  /** GET /expenses — KHÔNG truyền period: trả toàn bộ khoản chi ACTIVE, app tự lọc theo tháng ở client */
  list: (): Promise<ExpenseView[]> => apiRequest<ExpenseView[]>('/expenses', { withShop: true }),
  getById: (id: number): Promise<ExpenseView> => apiRequest<ExpenseView>(`/expenses/${id}`, { withShop: true }),
  /** DELETE — archive */
  archive: (id: number): Promise<void> => apiRequest<void>(`/expenses/${id}`, { method: 'DELETE', withShop: true }),
};
