import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import type { ReportSummaryView } from '../data/types';
import { expenseToLegacy, saleToInvoice } from './coreAdapters';
import { debtApi } from './debtApi';
import { errorMessage } from './errors';
import { expenseApi } from './expenseApi';
import { buildLocalNotifications, type Notif } from './notifications';
import { reportApi } from './reportApi';
import { saleApi } from './salesApi';

/** Số đơn mới nhất đưa vào thông báo, và số khoản chi hôm nay tối đa */
const RECENT_SALES = 6;
const TODAY_EXPENSES = 20;

/**
 * Thông báo tính trên máy (đơn mới, công nợ, thu chi) cho Tổng quan và màn Thông báo, từ vài lần gọi nhỏ chạy song song thay
 * vì tải toàn bộ đơn, nợ, khách và chi phí. Tải lại mỗi lần màn hình được focus; chỉ lần đầu mới là `loading`.
 *
 * Một lần gọi lỗi không làm mất các thông báo khác: phần đó chỉ vắng mặt. `error` chỉ có khi mọi lần gọi đều lỗi.
 * Trả kèm báo cáo hôm qua và số khoản nợ đang mở để Tổng quan dùng lại, không gọi trùng.
 */
export function useLocalNotifications() {
  const [notifications, setNotifications] = useState<Notif[]>([]);
  const [yesterday, setYesterday] = useState<ReportSummaryView | null>(null);
  const [openDebtCount, setOpenDebtCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(!hasLoaded.current);
    setError('');
    const [summary, profit, recent, expenses, debts] = await Promise.allSettled([
      reportApi.summary('yesterday'),
      reportApi.profitEstimate('yesterday'),
      saleApi.page(0, RECENT_SALES, { saleStatus: 'CONFIRMED' }),
      expenseApi.page(0, TODAY_EXPENSES, { period: 'today' }),
      debtApi.page(0, 1, { status: 'OPEN' }),
    ]);
    if (mine !== seq.current) return;
    const value = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null);
    const y = value(summary);
    const debtPage = value(debts);
    setYesterday(y);
    setOpenDebtCount(debtPage ? debtPage.totalElements : null);
    setNotifications(
      buildLocalNotifications({
        recentSales: (value(recent)?.items ?? []).map(saleToInvoice),
        yesterday: y,
        yesterdayProfit: value(profit),
        todayExpenses: (value(expenses)?.items ?? []).map(expenseToLegacy),
        // Số tiền nợ đang mở của cả tiệm có trong mọi báo cáo tổng (không phụ thuộc kỳ)
        openDebt: debtPage && y ? { count: debtPage.totalElements, totalVnd: y.currentOutstandingDebtVnd } : null,
      }),
    );
    const failures = [summary, profit, recent, expenses, debts].filter((r) => r.status === 'rejected');
    if (failures.length === 5) setError(errorMessage((failures[0] as PromiseRejectedResult).reason));
    else hasLoaded.current = true;
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return { notifications, yesterday, openDebtCount, loading, error, reload: load };
}
