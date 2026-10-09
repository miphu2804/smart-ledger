import type { NotificationPage, NotificationType } from '../data/types';
import { apiRequest } from './api';

/**
 * Inbox thông báo của OWNER (Core `/me/notifications`, docs/contracts/api-contracts.md mục 8). Các endpoint này không cần
 * `X-Shop-Id`: Core lấy người dùng từ token và đọc thông báo của mọi tiệm hợp lệ (lọc bằng `shopId` nếu muốn).
 * Danh sách phân trang theo `page` (từ 0) và `size` (1–100), mới nhất trước.
 */
export interface NotificationQuery {
  page?: number;
  size?: number;
  type?: NotificationType;
  unreadOnly?: boolean;
  shopId?: number;
}

function queryString(params: Record<string, string | number | boolean | undefined>): string {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

/** Mỗi lần đánh dấu nhiều thông báo tối đa 100 ID (giới hạn của Core). */
export const MARK_READ_BATCH = 100;

export const notificationApi = {
  /** GET /me/notifications — một trang, `page` từ 0 */
  list: (q: NotificationQuery = {}): Promise<NotificationPage> =>
    apiRequest<NotificationPage>(`/me/notifications${queryString({ ...q })}`),
  /** GET /me/notifications/unread-count — đếm trên toàn bộ thông báo, không chỉ trang đã tải */
  unreadCount: (q: { shopId?: number; type?: NotificationType } = {}): Promise<{ unreadCount: number }> =>
    apiRequest<{ unreadCount: number }>(`/me/notifications/unread-count${queryString({ ...q })}`),
  /** PATCH /me/notifications/{id}/read — 204; đánh dấu lại không đổi `readAt` đầu tiên */
  markRead: (id: number): Promise<void> => apiRequest<void>(`/me/notifications/${id}/read`, { method: 'PATCH' }),
  /** PATCH /me/notifications/read — 1–100 ID; một ID không thấy thì 404 và cả lô không đổi */
  markReadMany: (ids: number[]): Promise<void> => apiRequest<void>('/me/notifications/read', { method: 'PATCH', body: { ids } }),
};
