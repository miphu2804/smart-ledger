import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductView, ReportPeriod, ReportSummaryView, TopProductItem } from '../data/types';
import { productApi } from './catalogApi';
import { errorMessage } from './errors';
import { reportApi } from './reportApi';

/** Lấy dư vài dòng bán chạy vì dòng có số lượng thuần ≤ 0 bị bỏ khi hiện (xem `topSellerRows`) */
const TOP_LIMIT = 8;
/** Số món cần nhập lấy về để nhắc ở mục ưu tiên; tổng số món cần nhập là `totalElements` */
const RESTOCK_SIZE = 3;

interface PeriodData {
  summary: ReportSummaryView;
  top: TopProductItem[] | null;
}

/**
 * Số liệu Tổng quan theo kỳ, lấy từ báo cáo của Core thay vì cộng trên toàn bộ đơn: tổng của kỳ (`/reports/summary`), món bán
 * chạy (`/reports/top-products`) và món cần nhập (`GET /products?stockStatus=NEEDS_RESTOCK`, theo ngưỡng riêng từng món).
 *
 * Mỗi kỳ đã xem được nhớ trong lúc màn hình mở: đổi lại kỳ cũ hiện ngay rồi làm mới nền. Chỉ khi kỳ chưa có số mới là
 * `loading` (skeleton). Lỗi tổng của kỳ lần đầu là `error` (cả màn báo lỗi); lỗi bán chạy hoặc món cần nhập chỉ báo ở mục đó.
 */
export function useHomeOverview(period: ReportPeriod) {
  const [byPeriod, setByPeriod] = useState<Partial<Record<ReportPeriod, PeriodData>>>({});
  const [restock, setRestock] = useState<{ items: ProductView[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [topError, setTopError] = useState('');
  const [restockError, setRestockError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async (p: ReportPeriod) => {
    const mine = ++seq.current;
    setError('');
    // Tổng của kỳ gọi trước tiên để vào đợt request đầu (Android giới hạn số request song song mỗi máy chủ)
    const summaryCall = reportApi.summary(p);
    const [summary, top, needRestock] = await Promise.allSettled([
      summaryCall,
      reportApi.topProducts(p, { limit: TOP_LIMIT, sortBy: 'QUANTITY' }),
      productApi.page(0, RESTOCK_SIZE, { stockStatus: 'NEEDS_RESTOCK' }),
    ]);
    if (mine !== seq.current) return;
    if (needRestock.status === 'fulfilled') {
      setRestock({ items: needRestock.value.items, total: needRestock.value.totalElements });
      setRestockError('');
    } else {
      setRestockError(errorMessage(needRestock.reason));
    }
    setTopError(top.status === 'rejected' ? errorMessage(top.reason) : '');
    if (summary.status === 'fulfilled') {
      setByPeriod((cur) => ({
        ...cur,
        [p]: { summary: summary.value, top: top.status === 'fulfilled' ? top.value.items : cur[p]?.top ?? null },
      }));
    } else {
      setError(errorMessage(summary.reason));
    }
  }, []);

  // Đổi kỳ: tải kỳ mới (kỳ đã có thì vẫn hiện số cũ trong lúc làm mới)
  useEffect(() => {
    void load(period);
  }, [period, load]);

  // Quay lại màn hình: làm mới kỳ đang xem. Lần focus đầu trùng với lần tải của effect trên nên bỏ qua.
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void load(period);
      focused.current = true;
    }, [load, period]),
  );

  const current = byPeriod[period];
  return {
    summary: current?.summary ?? null,
    top: current?.top ?? null,
    restock,
    /** Kỳ đang xem chưa có số nào (hiện skeleton) */
    loading: !current && !error,
    /** Tổng của kỳ không tải được và chưa có số cũ để hiện */
    error: current ? '' : error,
    topError,
    restockError,
    reload: () => load(period),
  };
}
