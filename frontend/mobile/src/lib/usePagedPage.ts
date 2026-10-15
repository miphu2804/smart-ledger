import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from './errors';
import type { PageResponse } from './pageApi';
import { LIST_PAGE_SIZE } from './usePagedList';

/**
 * Danh sách phân trang theo số trang trên một GET phân trang của Core (Bán hàng): mỗi lần hiện đúng một trang, đổi trang thì
 * tải trang đó. `page` đánh số từ 0 như Core.
 *
 * - `queryKey` gói bộ lọc hiện tại: đổi key thì về trang 0; kết quả về muộn của trang hay bộ lọc cũ bị bỏ qua.
 *   `fetchPage` luôn được gọi với bộ lọc mới nhất nên không cần ổn định giữa các lần render.
 * - `refresh` tải lại trang đang xem mà không che danh sách (quay lại màn hình); `reload` tải lại có vòng xoay (kéo để làm
 *   mới, "Thử lại").
 * - Trang vượt cuối (dữ liệu vừa bớt đi) nhảy về trang cuối còn có dữ liệu.
 */
export function usePagedPage<T extends { id: number | string }>(
  queryKey: string,
  fetchPage: (page: number, size: number) => Promise<PageResponse<T>>,
  pageSize = LIST_PAGE_SIZE,
) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  /** Trang đang xem, gắn với bộ lọc của nó: bộ lọc khác thì coi là trang 0 mà không cần một lần render thừa */
  const [pageState, setPageState] = useState({ key: queryKey, page: 0 });
  const page = pageState.key === queryKey ? pageState.page : 0;
  /** Chưa có dữ liệu của trang hiện tại: màn hình hiện vòng xoay thay cho danh sách */
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;
  /** Tăng mỗi lần bắt đầu tải: phản hồi của lần trước về muộn thì bỏ */
  const seq = useRef(0);
  const hasItems = useRef(false);
  hasItems.current = items.length > 0;
  const queryKeyRef = useRef(queryKey);
  queryKeyRef.current = queryKey;

  const load = useCallback(
    async (target: number, mode: 'show' | 'silent' | 'pull') => {
      const mine = ++seq.current;
      if (mode === 'show') {
        setItems([]);
        setLoading(true);
      } else if (mode === 'pull') {
        setRefreshing(true);
      }
      setError('');
      try {
        const result = await fetchRef.current(target, pageSize);
        if (mine !== seq.current) return;
        setTotal(result.totalElements);
        setTotalPages(result.totalPages);
        if (!result.items.length && target > 0 && result.totalPages > 0) {
          setPageState({ key: queryKeyRef.current, page: result.totalPages - 1 });
          return;
        }
        setItems(result.items);
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
    void load(page, 'show');
  }, [queryKey, page, load]);

  const setPage = useCallback((next: number) => setPageState({ key: queryKeyRef.current, page: next }), []);
  const reload = useCallback(() => load(page, hasItems.current ? 'pull' : 'show'), [load, page]);
  const refresh = useCallback(() => load(page, 'silent'), [load, page]);

  return { items, total, page, totalPages, setPage, loading, refreshing, error, reload, refresh };
}
