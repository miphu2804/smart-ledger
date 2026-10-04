import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import type { CustomerView, DebtView, ExpenseView, ProductView, SaleView } from '../data/types';
import { productApi } from './catalogApi';
import { debtsToLegacy, expenseToLegacy, productToLegacy, saleToInvoice } from './coreAdapters';
import { customerApi } from './customerApi';
import { debtApi } from './debtApi';
import { errorMessage } from './errors';
import { expenseApi } from './expenseApi';
import { saleApi } from './salesApi';

export interface CoreDataWant {
  invoices?: boolean;
  products?: boolean;
  debts?: boolean;
  expenses?: boolean;
}

/**
 * Tải dữ liệu thật của tiệm từ Core (đơn, sản phẩm, nợ, chi phí) và trả về đúng dạng `Invoice`/`Product`/`Debt`/`Expense`
 * mà `stats.ts` và `notifications.ts` đang dùng. Chỉ gọi các API được yêu cầu; tải lại mỗi khi màn hình được focus.
 * Mảng chưa tải xong là mảng rỗng — dùng `loading`/`error` để phân biệt "chưa có dữ liệu" với "chưa tải".
 */
export function useCoreData(want: CoreDataWant) {
  const { invoices: wantInvoices, products: wantProducts, debts: wantDebts, expenses: wantExpenses } = want;
  const [sales, setSales] = useState<SaleView[]>([]);
  const [productViews, setProductViews] = useState<ProductView[]>([]);
  const [debtViews, setDebtViews] = useState<DebtView[]>([]);
  const [customers, setCustomers] = useState<CustomerView[]>([]);
  const [expenseViews, setExpenseViews] = useState<ExpenseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const seq = useRef(0);
  // Chỉ lần tải đầu mới coi là "loading" (che số liệu bằng spinner); các lần tải lại khi focus giữ số cũ, tránh nhấp nháy.
  const hasLoaded = useRef(false);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(!hasLoaded.current);
    setError('');
    try {
      const [s, p, d, c, e] = await Promise.all([
        wantInvoices ? saleApi.list() : null,
        wantProducts ? productApi.list() : null,
        wantDebts ? debtApi.list() : null,
        wantDebts ? customerApi.list() : null,
        wantExpenses ? expenseApi.list() : null,
      ]);
      if (mine !== seq.current) return; // đã có lần tải mới hơn
      if (s) setSales(s);
      if (p) setProductViews(p);
      if (d) setDebtViews(d);
      if (c) setCustomers(c);
      if (e) setExpenseViews(e);
      hasLoaded.current = true;
    } catch (err) {
      if (mine === seq.current) setError(errorMessage(err));
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, [wantInvoices, wantProducts, wantDebts, wantExpenses]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const invoices = useMemo(() => sales.map(saleToInvoice), [sales]);
  const products = useMemo(() => productViews.map(productToLegacy), [productViews]);
  const debts = useMemo(() => debtsToLegacy(debtViews, customers), [debtViews, customers]);
  const expenses = useMemo(() => expenseViews.map(expenseToLegacy), [expenseViews]);

  return { invoices, products, debts, expenses, loading, error, reload: load };
}
