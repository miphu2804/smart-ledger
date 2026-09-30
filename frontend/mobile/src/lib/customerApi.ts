import type { CustomerView } from '../data/types';
import { apiRequest } from './api';

/**
 * Khách hàng thật (Core `/customers` — cần header X-Shop-Id, xem AGENTS.md).
 * App hiện chưa có UI chọn/tạo khách; danh sách này chỉ dùng để join tên/SĐT vào màn Quản lý nợ.
 */
export const customerApi = {
  /** GET /customers — danh sách ACTIVE */
  list: (): Promise<CustomerView[]> => apiRequest<CustomerView[]>('/customers', { withShop: true }),
  getById: (id: number): Promise<CustomerView> => apiRequest<CustomerView>(`/customers/${id}`, { withShop: true }),
};
