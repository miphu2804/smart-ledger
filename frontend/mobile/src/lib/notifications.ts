import type { IconName } from '../components/ui';
import type { Expense, Invoice, NotificationType, NotificationView } from '../data/types';
import { vnd } from './format';
import { invoiceTotal, methodLabel } from './stats';

export type NotifCategory = 'order' | 'stock' | 'debt' | 'finance' | 'ai' | 'system';

export const notifCategoryMeta: Record<NotifCategory, { label: string; icon: IconName; color: string; bg: string }> = {
  order: { label: 'Đơn hàng', icon: 'shopping-bag', color: '#2858D8', bg: '#E9EEFC' },
  stock: { label: 'Kho hàng', icon: 'package', color: '#E0504F', bg: '#FFEEEE' },
  debt: { label: 'Công nợ', icon: 'book-open', color: '#C8860A', bg: '#FFF4D6' },
  finance: { label: 'Thu chi', icon: 'pie-chart', color: '#2E9E4F', bg: '#EAF7EE' },
  ai: { label: 'Gợi ý', icon: 'zap', color: '#7A5AF0', bg: '#F1EDFF' },
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
  /** Có khi thông báo đến từ inbox Core: ID sự kiện ở Core. Trạng thái đã đọc nằm ở Core (`read`), không nằm trong `readNotifs` của app. */
  coreId?: number;
  read?: boolean;
  /** Cảnh báo tồn đã kết thúc (tồn đã khá hơn hoặc đã tắt theo dõi) */
  resolved?: boolean;
}

const RECENT_ORDERS = 6;

function atToday(now: Date, hour: number, minute = 0) {
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  return (d > now ? now : d).toISOString();
}

/** Dữ liệu cho thông báo trên máy: vài bản ghi mới nhất và số tổng của Core, không phải toàn bộ danh sách của tiệm. */
export interface LocalNotificationData {
  /** Vài đơn chưa huỷ mới nhất (trang đầu của `GET /sales?saleStatus=CONFIRMED`) */
  recentSales: Invoice[];
  /**
   * Hôm qua: số đơn còn hiệu lực, doanh thu không âm (`periodRevenue`), khoản chi và giá trị đơn bán trước đó mà bị huỷ
   * hôm qua (tính vào chi)
   */
  yesterday: { orderCount: number; revenueVnd: number; expenseVnd: number; cancelledEarlierVnd: number } | null;
  /** Lãi gộp ước tính hôm qua; `isComplete=false` khi có món thiếu giá vốn */
  yesterdayProfit: { estimatedGrossProfitVnd: number; isComplete: boolean; unknownCostItemCount: number } | null;
  /** Các khoản chi hôm nay (giờ Việt Nam) */
  todayExpenses: Expense[];
  /** Nợ đang mở của cả tiệm: số khoản và số tiền chưa thu */
  openDebt: { count: number; totalVnd: number } | null;
}

/**
 * Sinh thông báo trên máy: đơn mới, công nợ và thu chi. Kho hàng, đơn bị huỷ và tình trạng tiệm lấy từ inbox Core
 * (`fromCoreNotification`). Công nợ là một thông báo gộp cho cả tiệm: Core không trả tên khách trong danh sách nợ và không cho
 * gộp nợ theo khách trên một trang, nên không còn nhắc nợ riêng từng khách ở đây (xem màn Công nợ). Mới nhất trước.
 */
export function buildLocalNotifications(data: LocalNotificationData, now = new Date()): Notif[] {
  const list: Notif[] = [];

  // --- Công nợ: id đổi khi số khoản hoặc số tiền đổi, để thông báo hiện lại là chưa đọc
  if (data.openDebt && data.openDebt.count > 0 && data.openDebt.totalVnd > 0) {
    const { count, totalVnd } = data.openDebt;
    list.push({
      id: `debt-open-${count}-${totalVnd}`,
      category: 'debt',
      icon: 'book-open',
      title: `Còn ${count} khoản nợ chưa thu`,
      body: `${vnd(totalVnd)} chưa thu. Mở Công nợ để xem và nhắc khách.`,
      at: atToday(now, 7),
      href: '/debts',
    });
  }

  // --- Đơn hàng: vài đơn mới nhất
  for (const inv of data.recentSales.filter((i) => i.status !== 'cancelled').slice(0, RECENT_ORDERS)) {
    // Đơn lấy từ Core không biết tiền mặt hay chuyển khoản (methodKnown === false) → chỉ nói "Đã thanh toán", không đoán phương thức.
    const payment =
      inv.status === 'debt' ? 'Ghi nợ' : inv.methodKnown === false ? 'Đã thanh toán' : methodLabel[inv.method];
    list.push({
      id: `inv-${inv.id}`,
      category: 'order',
      icon: inv.source === 'voice' ? 'mic' : 'shopping-bag',
      title: `Đơn ${inv.code} · ${vnd(invoiceTotal(inv))}`,
      body: `${payment} · ${inv.customer ?? 'Khách lẻ'} · ${inv.items
        .map((i) => `${i.qty} ${i.name}`)
        .join(', ')}`,
      at: inv.createdAt,
      href: `/invoice/${inv.id}`,
    });
  }

  // --- Thu chi: tổng kết hôm qua theo báo cáo của Core + chi phí hôm nay
  const y = data.yesterday;
  if (y && (y.orderCount || y.expenseVnd || y.cancelledEarlierVnd)) {
    const profit = data.yesterdayProfit;
    const profitText = profit
      ? ` · Lãi gộp ước tính ${vnd(profit.estimatedGrossProfitVnd)}${
          profit.isComplete ? '' : ` (thiếu giá vốn ${profit.unknownCostItemCount} món)`
        }`
      : '';
    list.push({
      id: `fin-yesterday-${now.toDateString()}`,
      category: 'finance',
      icon: 'bar-chart-2',
      title: 'Tổng kết ngày hôm qua',
      body: `${y.orderCount} đơn · Doanh thu ${vnd(y.revenueVnd)} · Chi ${vnd(y.expenseVnd + y.cancelledEarlierVnd)}${
        y.cancelledEarlierVnd ? ` (gồm huỷ đơn ${vnd(y.cancelledEarlierVnd)})` : ''
      }${profitText}`,
      at: atToday(now, 6),
      href: '/(tabs)/invoices',
    });
  }
  for (const e of data.todayExpenses) {
    list.push({
      id: `exp-${e.id}`,
      category: 'finance',
      icon: 'credit-card',
      title: `Đã ghi chi: ${e.title}`,
      body: `${vnd(e.amount)}${e.source === 'voice' ? ' · ghi bằng giọng nói' : ''}`,
      at: e.createdAt,
      href: '/expenses',
    });
  }

  // Không còn thông báo "Gợi ý AI" và "Hệ thống" dựng sẵn: trước đây là nội dung cố định (vd. "chiếm 58%",
  // "đã sao lưu dữ liệu") không đến từ dữ liệu hay hệ thống nào. Thêm lại khi AI service / sao lưu thật có nguồn tin.

  return list.sort((a, b) => b.at.localeCompare(a.at));
}

export const CORE_CATEGORY: Record<NotificationType, NotifCategory> = {
  LOW_STOCK: 'stock',
  OUT_OF_STOCK: 'stock',
  SALE_VOIDED: 'order',
  SHOP_INACTIVATED: 'system',
  SHOP_REACTIVATED: 'system',
};

/** Đổi một thông báo của inbox Core sang dạng `Notif` mà màn Thông báo và Trang chủ đang dùng. */
export function fromCoreNotification(n: NotificationView): Notif {
  const open = n.resolvedAt === null;
  const icon: Record<NotificationType, IconName> = {
    LOW_STOCK: 'alert-triangle',
    OUT_OF_STOCK: 'x-octagon',
    SALE_VOIDED: 'x-circle',
    SHOP_INACTIVATED: 'alert-circle',
    SHOP_REACTIVATED: 'check-circle',
  };
  const href = n.targetType === 'PRODUCT' ? '/products' : n.targetType === 'SALE' ? `/invoice/${n.targetId}` : '/profile';
  return {
    id: `core-${n.id}`,
    coreId: n.id,
    read: n.readAt !== null,
    resolved: (n.type === 'LOW_STOCK' || n.type === 'OUT_OF_STOCK') && !open,
    category: CORE_CATEGORY[n.type],
    icon: icon[n.type],
    // Chỉ cảnh báo còn mở cần xử lý ngay: hết hàng, hoặc tiệm đang bị tạm ngưng.
    urgent: open && (n.type === 'OUT_OF_STOCK' || n.type === 'SHOP_INACTIVATED'),
    title: n.title,
    body: n.body,
    at: n.createdAt,
    href,
  };
}

const time = (iso: string) => Date.parse(iso);

/**
 * Gộp thông báo tính trên máy với thông báo Core đã tải, mới nhất trước. Khi Core còn trang chưa tải (`coreHasMore`), chỉ giữ
 * thông báo trên máy mới hơn thông báo Core cũ nhất đã tải; nếu không, bấm "Tải thêm" sẽ chèn thông báo cũ hơn vào giữa danh
 * sách thay vì nối vào cuối.
 */
export function mergeNotifications(local: Notif[], core: Notif[], coreHasMore: boolean): Notif[] {
  const oldestCore = core.length ? Math.min(...core.map((n) => time(n.at))) : null;
  const kept = coreHasMore && oldestCore !== null ? local.filter((n) => time(n.at) >= oldestCore) : local;
  return [...kept, ...core].sort((a, b) => time(b.at) - time(a.at));
}

/**
 * Tổng số chưa đọc của hai nguồn. Core đếm trên toàn bộ inbox (kể cả trang chưa tải); thông báo trên máy đếm trên danh sách đầy đủ
 * `local`, không phải danh sách đã gộp: khi Core còn trang chưa tải, `mergeNotifications` ẩn bớt thông báo máy cũ, nhưng chúng vẫn
 * chưa đọc và sẽ hiện ra khi tải thêm, nên không được bỏ khỏi số đếm hay khỏi "Đọc hết".
 */
export function totalUnread(local: Notif[], readLocal: Set<string>, coreUnread: number): number {
  return coreUnread + local.filter((n) => !readLocal.has(n.id)).length;
}

/** Thông báo Core đọc trạng thái từ Core; thông báo trên máy đọc từ danh sách đã đọc của app. */
export function isNotifUnread(n: Notif, readLocal: Set<string>): boolean {
  return n.coreId != null ? !n.read : !readLocal.has(n.id);
}
