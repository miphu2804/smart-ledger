import type { ProfitEstimateView, ReportPeriod, ReportSummaryView, SalesSeriesView, TopProductsView } from '../data/types';
import { apiRequest } from './api';
import { withQuery } from './pageApi';

/**
 * Báo cáo của Core (`/reports/*`, cần X-Shop-Id). Số tổng được tính ở Core trên toàn tiệm, nên dùng được cả khi màn hình
 * chỉ tải một vài trang của danh sách (không được cộng tổng trên các trang đã tải).
 */
export const reportApi = {
  summary: (period: ReportPeriod): Promise<ReportSummaryView> =>
    apiRequest<ReportSummaryView>(withQuery('/reports/summary', { period }), { withShop: true }),
  /** Doanh thu và số đơn từng ngày của kỳ */
  salesSeries: (period: ReportPeriod): Promise<SalesSeriesView> =>
    apiRequest<SalesSeriesView>(withQuery('/reports/sales-series', { period, granularity: 'DAY' }), { withShop: true }),
  /** Món bán chạy của kỳ (`limit` 1–100), xếp theo số lượng hoặc doanh thu thuần */
  topProducts: (period: ReportPeriod, opts: { limit: number; sortBy: 'QUANTITY' | 'NET_REVENUE' }): Promise<TopProductsView> =>
    apiRequest<TopProductsView>(withQuery('/reports/top-products', { period, limit: opts.limit, sortBy: opts.sortBy }), { withShop: true }),
  /** Lãi gộp và lãi vận hành ước tính của kỳ */
  profitEstimate: (period: ReportPeriod): Promise<ProfitEstimateView> =>
    apiRequest<ProfitEstimateView>(withQuery('/reports/profit-estimate', { period }), { withShop: true }),
};
