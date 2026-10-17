import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ProfitEstimateView, ReportPeriod, ReportSummaryView } from '../data/types';
import { errorMessage } from './errors';
import { periodRevenue } from './homeOverview';
import { reportApi } from './reportApi';
import { reportPeriodWindow } from './saleFilter';
import { saleApi } from './salesApi';

export interface ReportTotals {
  summary: ReportSummaryView;
  /** null khi Core không tính được lãi (vd. lỗi 500): doanh thu và đơn huỷ vẫn hiện, phần lãi báo lỗi riêng */
  profit: ProfitEstimateView | null;
  profitError: string;
  /** Doanh thu không âm và giá trị đơn bán kỳ trước bị huỷ trong kỳ (xem `periodRevenue`) */
  revenue: ReturnType<typeof periodRevenue>;
}

/**
 * Số thu chi của một kỳ cho màn Báo cáo, lấy từ Core: tổng của kỳ (`/reports/summary`), lãi ước tính theo giá vốn chốt lúc bán
 * (`/reports/profit-estimate`) và đơn còn hiệu lực bán trong kỳ (`/sales/summary`). Không tự đoán giá vốn trên máy.
 * Tải lại khi đổi kỳ và mỗi lần màn hình được focus; số cũ giữ nguyên trong lúc chờ.
 */
export function useReportTotals(period: ReportPeriod) {
  const [data, setData] = useState<{ period: ReportPeriod; totals: ReportTotals } | null>(null);
  const [error, setError] = useState('');
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setError('');
    try {
      // Lãi ước tính lỗi riêng thì không chặn cả màn (từng gặp 500 khi tiệm có đơn số tiền khổng lồ làm tràn số ở Core)
      const [summary, profit, sales] = await Promise.all([
        reportApi.summary(period),
        reportApi.profitEstimate(period).then(
          (value) => ({ value, error: '' }),
          (e: unknown) => ({ value: null, error: errorMessage(e) }),
        ),
        saleApi.summary(reportPeriodWindow(period)),
      ]);
      if (mine !== seq.current) return;
      setData({
        period,
        totals: { summary, profit: profit.value, profitError: profit.error, revenue: periodRevenue(summary, sales) },
      });
    } catch (e) {
      if (mine === seq.current) setError(errorMessage(e));
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const totals = data && data.period === period ? data.totals : null;
  return { totals, loading: !totals && !error, error: totals ? '' : error, reload: load };
}
