import { useEffect, useMemo, useState } from 'react';
import type { ReportPeriod } from '../components/ReportPeriodTabs';
import { useApp } from '../store/AppStore';
import { bestSellers, summary } from './stats';

/** Giả lập độ trễ của API báo cáo để dựng và kiểm tra trạng thái đang tải; bỏ khi nối Core thật. */
const MOCK_LATENCY_MS = 700;

export type Report = {
  totals: ReturnType<typeof summary>;
  previousDay: ReturnType<typeof summary> | null;
  topSellers: ReturnType<typeof bestSellers>;
};

/**
 * Snapshot báo cáo của một kỳ: `null` khi đang tải, có ngay khi kỳ đó đã tải trước đó.
 * Cache bị bỏ khi hoá đơn hoặc sản phẩm đổi để số luôn khớp dữ liệu.
 */
export function useReport(period: ReportPeriod): Report | null {
  const { invoices, products } = useApp();
  const cache = useMemo(() => new Map<ReportPeriod, Report>(), [invoices, products]);
  const [, refresh] = useState(0);

  useEffect(() => {
    if (cache.has(period)) return;
    const timer = setTimeout(() => {
      cache.set(period, {
        totals: summary(invoices, products, period),
        previousDay: period === 'today' ? summary(invoices, products, 'yesterday') : null,
        topSellers: bestSellers(invoices, period).slice(0, 4),
      });
      refresh((n) => n + 1);
    }, MOCK_LATENCY_MS);
    return () => clearTimeout(timer);
  }, [cache, period, invoices, products]);

  return cache.get(period) ?? null;
}
