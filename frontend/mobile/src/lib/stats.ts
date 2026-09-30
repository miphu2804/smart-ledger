import type { Expense, Invoice, LineItem, Product } from '../data/types';
import { sameDay, startOfDay } from './format';

export type Period = 'today' | 'yesterday' | 'thisWeek' | 'week' | 'month' | 'all';

export const periodLabel: Record<Period, string> = {
  today: 'Hôm nay',
  yesterday: 'Hôm qua',
  thisWeek: 'Tuần này',
  week: '7 ngày',
  month: 'Tháng này',
  all: 'Tất cả',
};

export const itemsTotal = (items: LineItem[]) => items.reduce((a, i) => a + i.price * i.qty, 0);
export const invoiceTotal = (inv: Invoice) => itemsTotal(inv.items);

export function inPeriod(iso: string, p: Period, now = new Date()) {
  const d = new Date(iso);
  switch (p) {
    case 'today':
      return sameDay(d, now);
    case 'yesterday': {
      const y = new Date(now);
      y.setDate(now.getDate() - 1);
      return sameDay(d, y);
    }
    case 'thisWeek': {
      // Tuần lịch bắt đầu từ thứ Hai (giờ máy), tính tới hiện tại.
      const from = startOfDay(now);
      from.setDate(from.getDate() - ((now.getDay() + 6) % 7));
      return d >= from;
    }
    case 'week': {
      const from = startOfDay(now);
      from.setDate(from.getDate() - 6);
      return d >= from;
    }
    case 'month':
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    default:
      return true;
  }
}

export function activeInvoices(invoices: Invoice[], p: Period) {
  return invoices.filter((i) => i.status !== 'cancelled' && inPeriod(i.createdAt, p));
}

export function summary(invoices: Invoice[], products: Product[], p: Period) {
  const list = activeInvoices(invoices, p);
  const costOf = (li: LineItem) => (products.find((x) => x.id === li.productId)?.cost ?? li.price * 0.6) * li.qty;
  const revenue = list.reduce((a, i) => a + invoiceTotal(i), 0);
  const cost = list.reduce((a, i) => a + i.items.reduce((b, li) => b + costOf(li), 0), 0);
  const voice = list.filter((i) => i.source === 'voice').length;
  const qty = list.reduce((a, i) => a + i.items.reduce((b, li) => b + li.qty, 0), 0);
  return { count: list.length, revenue, profit: revenue - cost, voiceRatio: list.length ? voice / list.length : 0, qty };
}

/** Doanh thu theo giờ (6h → 22h) cho 1 ngày */
export function hourly(invoices: Invoice[], p: Period) {
  const buckets = Array.from({ length: 9 }, (_, i) => ({ label: `${6 + i * 2}h`, value: 0 }));
  activeInvoices(invoices, p).forEach((inv) => {
    const h = new Date(inv.createdAt).getHours();
    const idx = Math.min(8, Math.max(0, Math.floor((h - 6) / 2)));
    buckets[idx].value += invoiceTotal(inv);
  });
  return buckets;
}

/** Doanh thu theo ngày, n ngày gần nhất */
export function daily(invoices: Invoice[], days = 7, now = new Date()) {
  const out: { label: string; value: number; date: Date }[] = [];
  for (let k = days - 1; k >= 0; k--) {
    const d = new Date(now);
    d.setDate(now.getDate() - k);
    const value = invoices
      .filter((i) => i.status !== 'cancelled' && sameDay(new Date(i.createdAt), d))
      .reduce((a, i) => a + invoiceTotal(i), 0);
    out.push({ label: k === 0 ? 'Nay' : `${d.getDate()}/${d.getMonth() + 1}`, value, date: d });
  }
  return out;
}

export function bestSellers(invoices: Invoice[], p: Period) {
  const map = new Map<string | number, { name: string; qty: number; revenue: number; productId?: string | number }>();
  activeInvoices(invoices, p).forEach((inv) =>
    inv.items.forEach((li) => {
      const key = li.productId ?? li.name;
      const cur = map.get(key) ?? { name: li.name, qty: 0, revenue: 0, productId: li.productId };
      cur.qty += li.qty;
      cur.revenue += li.qty * li.price;
      map.set(key, cur);
    }),
  );
  return [...map.values()].sort((a, b) => b.qty - a.qty);
}

export function monthExpenses(expenses: Expense[], monthOffset: number, now = new Date()) {
  const m = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  return expenses.filter((e) => {
    const d = new Date(e.createdAt);
    return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
  });
}

export function monthRevenue(invoices: Invoice[], monthOffset: number, now = new Date()) {
  const m = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
  return invoices
    .filter((i) => {
      const d = new Date(i.createdAt);
      return i.status !== 'cancelled' && d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
    })
    .reduce((a, i) => a + invoiceTotal(i), 0);
}

export const methodLabel = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', debt: 'Ghi nợ' } as const;
export const sourceLabel = { voice: 'Đọc đơn AI', pos: 'POS', manual: 'Nhập tay' } as const;
