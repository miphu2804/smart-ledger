import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { NotificationView } from '../data/types';
import { errorMessage } from './errors';
import { MARK_READ_BATCH, notificationApi } from './notificationApi';

/** Số thông báo mỗi trang ở màn Thông báo (Core cho 1–100) */
export const NOTIFICATION_PAGE_SIZE = 20;

/** Dừng vòng "đọc hết" sau từng này lô để một lỗi logic không thể quay vô hạn (tối đa 2.000 thông báo mỗi lần). */
const MARK_ALL_MAX_BATCHES = 20;

/**
 * Inbox thông báo của Core, phân trang thật: lần đầu và mỗi lần màn hình được focus tải lại trang đầu (`page=0`), `loadMore` tải
 * trang kế (`page+1`) và nối vào cuối. `unreadCount` đếm trên toàn bộ inbox ở Core, không chỉ các trang đã tải.
 * Dữ liệu dịch chuyển giữa các lần tải (có thông báo mới) có thể làm một thông báo lặp lại ở trang kế nên danh sách được lọc trùng theo ID.
 */
export function useCoreNotifications(pageSize = NOTIFICATION_PAGE_SIZE) {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [page, setPage] = useState(-1);
  const [totalPages, setTotalPages] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  /** Chỉ lần tải đầu mới coi là đang tải (che danh sách bằng spinner); lần tải lại khi focus giữ danh sách cũ, không nháy. */
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Lỗi tải trang đầu (không có gì để hiện) và lỗi tải thêm (vẫn giữ các trang đã có) tách riêng */
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');
  const seq = useRef(0);
  const hasLoaded = useRef(false);
  const busyMore = useRef(false);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(!hasLoaded.current);
    setError('');
    setMoreError('');
    try {
      const [first, count] = await Promise.all([notificationApi.list({ page: 0, size: pageSize }), notificationApi.unreadCount()]);
      if (mine !== seq.current) return;
      setItems(first.items);
      setPage(first.page);
      setTotalPages(first.totalPages);
      setUnreadCount(count.unreadCount);
      hasLoaded.current = true;
    } catch (e) {
      if (mine !== seq.current) return;
      setError(errorMessage(e));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [pageSize]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const hasMore = page + 1 < totalPages;

  const loadMore = useCallback(async () => {
    if (busyMore.current || !hasMore) return;
    busyMore.current = true;
    const mine = seq.current;
    setLoadingMore(true);
    setMoreError('');
    try {
      const next = await notificationApi.list({ page: page + 1, size: pageSize });
      if (mine !== seq.current) return;
      setItems((cur) => {
        const seen = new Set(cur.map((n) => n.id));
        return [...cur, ...next.items.filter((n) => !seen.has(n.id))];
      });
      setPage(next.page);
      setTotalPages(next.totalPages);
    } catch (e) {
      if (mine === seq.current) setMoreError(errorMessage(e));
    } finally {
      busyMore.current = false;
      if (mine === seq.current) setLoadingMore(false);
    }
  }, [hasMore, page, pageSize]);

  /**
   * Đánh dấu các thông báo (ID ở Core) đã đọc: hiện đã đọc ngay, gửi lên Core, lỗi thì tải lại từ Core rồi ném lỗi để màn hình báo.
   * Core cho đánh dấu tối đa 100 ID mỗi lần và từ chối cả lô nếu một ID không còn.
   */
  const markRead = useCallback(
    async (ids: number[]) => {
      const unread = ids.filter((id) => items.some((n) => n.id === id && n.readAt === null));
      if (!unread.length) return;
      const at = new Date().toISOString();
      setItems((cur) => cur.map((n) => (unread.includes(n.id) && n.readAt === null ? { ...n, readAt: at } : n)));
      setUnreadCount((c) => Math.max(0, c - unread.length));
      try {
        if (unread.length === 1) await notificationApi.markRead(unread[0]);
        else for (let i = 0; i < unread.length; i += MARK_READ_BATCH) await notificationApi.markReadMany(unread.slice(i, i + MARK_READ_BATCH));
      } catch (e) {
        await refresh();
        throw e;
      }
    },
    [items, refresh],
  );

  /**
   * Đọc hết kể cả các trang chưa tải: Core không có API "đọc tất cả", nên lấy từng lô thông báo chưa đọc (`unreadOnly`) rồi đánh dấu;
   * lô sau luôn bắt đầu từ trang 0 vì lô trước đã không còn chưa đọc.
   */
  const markAllRead = useCallback(async () => {
    try {
      for (let i = 0; i < MARK_ALL_MAX_BATCHES; i++) {
        const batch = await notificationApi.list({ page: 0, size: MARK_READ_BATCH, unreadOnly: true });
        if (!batch.items.length) break;
        await notificationApi.markReadMany(batch.items.map((n) => n.id));
        if (batch.totalPages <= 1) break;
      }
    } finally {
      await refresh();
    }
  }, [refresh]);

  return { items, unreadCount, loading, loadingMore, error, moreError, hasMore, refresh, loadMore, markRead, markAllRead };
}
