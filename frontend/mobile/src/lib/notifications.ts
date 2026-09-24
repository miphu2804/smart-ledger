import type { IconName } from '../components/ui';
import { aiSuggestions } from '../data/mock';
import type { Debt, Expense, Invoice, Product } from '../data/types';
import { vnd } from './format';
import { inPeriod, invoiceTotal, methodLabel, summary } from './stats';

export type NotifCategory = 'order' | 'stock' | 'debt' | 'finance' | 'ai' | 'system';

export const notifCategoryMeta: Record<NotifCategory, { label: string; icon: IconName; color: string; bg: string }> = {
  order: { label: 'Đơn hàng', icon: 'shopping-bag', color: '#2858D8', bg: '#E9EEFC' },
  stock: { label: 'Kho hàng', icon: 'package', color: '#E0504F', bg: '#FFEEEE' },
  debt: { label: 'Công nợ', icon: 'book-open', color: '#C8860A', bg: '#FFF4D6' },
  finance: { label: 'Thu chi', icon: 'pie-chart', color: '#2E9E4F', bg: '#EAF7EE' },
  ai: { label: 'Gợi ý AI', icon: 'zap', color: '#7A5AF0', bg: '#F1EDFF' },
  system: { label: 'Hệ thống', icon: 'settings', color: '#5A6675', bg: '#EEF1F5' },
};

export const NOTIF_CATEGORIES = Object.keys(notifCategoryMeta) as NotifCategory[];

export interface Notif {
  /** id ổn định — dùng để nhớ trạng thái đã đọc */
  id: string;
  category: NotifCategory;
  title: string;
  body: string;
  at: string; // ISO
  /** true = cần xử lý (hết hàng, nợ lâu…) — tô đỏ nhẹ */
  urgent?: boolean;
  href?: string;
  icon?: IconName;
}

const LOW_STOCK = 6;
const RECENT_ORDERS = 6;

function atToday(now: Date, hour: number, minute = 0) {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return (d > now ? now : d).toISOString();
}

function yesterdayAt(now: Date, hour: number, minute = 0) {
  const d = new Date(now);
  d.setDate(d.getDate() - 1);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/**
 * Sinh danh sách thông báo từ dữ liệu hiện có của tiệm (bản mock — chưa có backend đẩy thông báo).
 * Kết quả đã sắp xếp mới nhất trước.
 */
export function buildNotifications(
  data: { invoices: Invoice[]; products: Product[]; expenses: Expense[]; debts: Debt[] },
  now = new Date(),
): Notif[] {
  const list: Notif[] = [];

  // --- Kho hàng
  for (const p of data.products) {
    if (!p.tracked || p.stock > LOW_STOCK) continue;
    const out = p.stock <= 0;
    list.push({
      id: `stock-${p.id}-${out ? 'out' : 'low'}`,
      category: 'stock',
      icon: out ? 'x-octagon' : 'alert-triangle',
      urgent: out,
      title: out ? `Hết hàng: ${p.name}` : `Sắp hết: ${p.name}`,
      body: out ? 'Món này đã hết, khách gọi sẽ không bán được. Nhập thêm ngay.' : `Chỉ còn ${p.stock} trong kho. Nên nhập thêm.`,
      at: atToday(now, 7),
      href: '/products',
    });
  }

  // --- Công nợ
  for (const d of data.debts) {
    const left = d.total - d.paid;
    if (left <= 0) continue;
    const days = Math.floor((now.getTime() - new Date(d.lastDate).getTime()) / 86400000);
    const old = days >= 3;
    list.push({
      id: `debt-${d.id}-${d.lastDate}`,
      category: 'debt',
      icon: old ? 'clock' : 'book-open',
      urgent: old,
      title: old ? `Nhắc nợ: ${d.name}` : `${d.name} đang nợ ${vnd(left)}`,
      body: old
        ? `Còn nợ ${vnd(left)}, đã ${days} ngày chưa trả. Gọi nhắc khách${d.phone ? ` qua ${d.phone}` : ''}.`
        : d.history[0]?.note ?? 'Khoản nợ mới được ghi',
      at: d.lastDate,
      href: '/debts',
    });
  }

  // --- Đơn hàng: vài đơn mới nhất + đơn bị huỷ trong 7 ngày
  const sorted = [...data.invoices].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const inv of sorted.filter((i) => i.status !== 'cancelled').slice(0, RECENT_ORDERS)) {
    list.push({
      id: `inv-${inv.id}`,
      category: 'order',
      icon: inv.source === 'voice' ? 'mic' : 'shopping-bag',
      title: `Đơn ${inv.code} · ${vnd(invoiceTotal(inv))}`,
      body: `${inv.status === 'debt' ? 'Ghi nợ' : methodLabel[inv.method]} · ${inv.customer ?? 'Khách lẻ'} · ${inv.items
        .map((i) => `${i.qty} ${i.name}`)
        .join(', ')}`,
      at: inv.createdAt,
      href: `/invoice/${inv.id}`,
    });
  }
  for (const inv of sorted.filter((i) => i.status === 'cancelled' && inPeriod(i.createdAt, 'week', now))) {
    list.push({
      id: `inv-cancel-${inv.id}`,
      category: 'order',
      icon: 'x-circle',
      urgent: true,
      title: `Đơn ${inv.code} đã bị huỷ`,
      body: `Giá trị ${vnd(invoiceTotal(inv))} · ${inv.customer ?? 'Khách lẻ'}`,
      at: inv.createdAt,
      href: `/invoice/${inv.id}`,
    });
  }

  // --- Thu chi: tổng kết hôm qua + chi phí hôm nay
  const y = summary(data.invoices, data.products, 'yesterday');
  const ySpend = data.expenses.filter((e) => inPeriod(e.createdAt, 'yesterday', now)).reduce((a, e) => a + e.amount, 0);
  if (y.count || ySpend) {
    list.push({
      id: `fin-yesterday-${now.toDateString()}`,
      category: 'finance',
      icon: 'bar-chart-2',
      title: 'Tổng kết ngày hôm qua',
      body: `${y.count} đơn · Doanh thu ${vnd(y.revenue)} · Chi ${vnd(ySpend)} · Lãi gộp ước tính ${vnd(y.profit)}`,
      at: atToday(now, 6),
      href: '/(tabs)/invoices',
    });
  }
  for (const e of data.expenses.filter((x) => inPeriod(x.createdAt, 'today', now))) {
    list.push({
      id: `exp-${e.id}`,
      category: 'finance',
      icon: 'credit-card',
      title: `Đã ghi chi: ${e.title}`,
      body: `${vnd(e.amount)}${e.source === 'voice' ? ' · ghi bằng giọng nói' : ''}`,
      at: e.createdAt,
      href: '/(tabs)/expenses',
    });
  }

  // --- Gợi ý AI
  aiSuggestions.forEach((a, i) => {
    list.push({
      id: `ai-${a.id}`,
      category: 'ai',
      icon: a.icon as IconName,
      title: a.title,
      body: a.body,
      at: atToday(now, 6, 30 - i),
      href: '/ai',
    });
  });

  // --- Hệ thống (mock)
  list.push(
    {
      id: 'sys-printer',
      category: 'system',
      icon: 'printer',
      title: 'Chưa kết nối máy in',
      body: 'Kết nối máy in nhiệt để in hoá đơn cho khách.',
      at: atToday(now, 5),
      href: '/printer',
    },
    {
      id: 'sys-backup',
      category: 'system',
      icon: 'cloud',
      title: 'Đã sao lưu dữ liệu',
      body: 'Dữ liệu bán hàng hôm qua đã được sao lưu an toàn.',
      at: yesterdayAt(now, 23, 30),
    },
  );

  return list.sort((a, b) => b.at.localeCompare(a.at));
}
