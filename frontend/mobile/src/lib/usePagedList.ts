import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './errors';
import type { PageResponse } from './pageApi';

/** Số dòng mỗi lần tải ở các danh sách cuộn vô hạn (Bán hàng, Đơn hàng); cũng là cỡ trang mặc định của Core. */
export const LIST_PAGE_SIZE = 20;

/**
 * Danh sách cuộn vô hạn trên một GET phân trang của Core.
 *
 * - `queryKey` gói bộ lọc hiện tại: đổi key thì bỏ danh sách cũ và tải lại từ trang đầu; kết quả về muộn của bộ lọc cũ bị
 *   bỏ qua. `fetchPage` luôn được gọi với bộ lọc mới nhất nên không cần ổn định giữa các lần render.
 * - `loadMore` tải trang kế và nối vào cuối (gọi từ `onEndReached`; gọi trùng hoặc khi đã hết trang thì không làm gì).
 * - `refreshTop` tải lại trang đầu và giữ các trang đã tải phía sau: dùng khi quay lại màn hình (có đơn mới, vừa sửa món)
 *   mà không mất chỗ đang cuộn. `reload` tải lại từ đầu (kéo để làm mới, bấm "Thử lại").
 *
 * Các trang không chung snapshot: bản ghi mới chèn lên đầu làm dịch trang nên một bản ghi có thể về hai lần; lọc trùng theo
 * `id`. Không cộng tổng trên `items` (chỉ là các trang đã tải); tổng số bản ghi của bộ lọc là `total`.
 */
export function usePagedList<T extends { id: number | string }>(
  queryKey: string,
  fetchPage: (page: number, size: number) => Promise<PageResponse<T>>,
  pageSize = LIST_PAGE_SIZE,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  /** Chưa có trang đầu của bộ lọc hiện tại: màn hình hiện vòng xoay thay cho danh sách */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Lỗi tải trang đầu (không có gì để hiện) và lỗi tải thêm (vẫn giữ các trang đã có) tách riêng */
  const [error, setError] = useState('');
  const [moreError, setMoreError] = useState('');

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  /** Tăng mỗi lần tải lại từ đầu: phản hồi của lần trước về muộn thì bỏ */
  const seq = useRef(0);
  /** Trang cuối đã tải và tổng số trang của bộ lọc hiện tại; -1 = chưa có trang nào */
  const cursor = useRef({ page: -1, totalPages: 0 });
  const busyMore = useRef(false);
  const hasItems = useRef(false);
  hasItems.current = items.length > 0;

  const applyCursor = (page: number, totalPages: number) => {
    cursor.current = { page, totalPages };
    setHasMore(page + 1 < totalPages);
  };

  const loadFirst = useCallback(
    async (mode: 'reset' | 'pull') => {
      const mine = ++seq.current;
      cursor.current = { page: -1, totalPages: 0 };
      if (mode === 'reset') {
        setItems([]);
        setHasMore(false);
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      // Lần tải thêm của bộ lọc cũ còn đang chạy sẽ bị bỏ khi về, nên không còn tính là đang tải thêm
      setLoadingMore(false);
      setError('');
      setMoreError('');
      try {
        const first = await fetchRef.current(0, pageSize);
        if (mine !== seq.current) return;
        setItems(first.items);
        setTotal(first.totalElements);
        applyCursor(0, first.totalPages);
      } catch (e) {
        if (mine !== seq.current) return;
        setError(errorMessage(e));
      } finally {
        if (mine === seq.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [pageSize],
  );

  useEffect(() => {
    void loadFirst('reset');
  }, [queryKey, loadFirst]);

  const reload = useCallback(() => loadFirst(hasItems.current ? 'pull' : 'reset'), [loadFirst]);

  const refreshTop = useCallback(async () => {
    const mine = seq.current;
    if (cursor.current.page < 0) return;
    try {
      const first = await fetchRef.current(0, pageSize);
      if (mine !== seq.current) return;
      const fresh = new Set(first.items.map((item) => item.id));
      setItems((cur) => [...first.items, ...cur.filter((item) => !fresh.has(item.id))]);
      setTotal(first.totalElements);
      applyCursor(cursor.current.page, first.totalPages);
    } catch {
      // Giữ danh sách đang có; lần cuộn hoặc làm mới sau sẽ báo lỗi nếu vẫn không tải được
    }
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    const { page, totalPages } = cursor.current;
    if (busyMore.current || page < 0 || page + 1 >= totalPages) return;
    busyMore.current = true;
    const mine = seq.current;
    setLoadingMore(true);
    setMoreError('');
    try {
      const next = await fetchRef.current(page + 1, pageSize);
      if (mine !== seq.current) return;
      setItems((cur) => {
        const seen = new Set(cur.map((item) => item.id));
        return [...cur, ...next.items.filter((item) => !seen.has(item.id))];
      });
      setTotal(next.totalElements);
      // Trang rỗng (dữ liệu vừa bớt đi) cũng là hết, để onEndReached không gọi mãi
      applyCursor(page + 1, next.items.length ? next.totalPages : page + 1);
    } catch (e) {
      if (mine === seq.current) setMoreError(errorMessage(e));
    } finally {
      busyMore.current = false;
      if (mine === seq.current) setLoadingMore(false);
    }
  }, [pageSize]);

  return { items, setItems, total, hasMore, loading, refreshing, loadingMore, error, moreError, loadMore, refreshTop, reload };
}
