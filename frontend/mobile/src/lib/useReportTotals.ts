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
  profit: ProfitEstimateView;
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
      const [summary, profit, sales] = await Promise.all([
        reportApi.summary(period),
        reportApi.profitEstimate(period),
        saleApi.summary(reportPeriodWindow(period)),
      ]);
      if (mine !== seq.current) return;
      setData({ period, totals: { summary, profit, revenue: periodRevenue(summary, sales) } });
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
