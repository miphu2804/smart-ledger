/**
 * Danh sách màn của menu chuyển nhanh bên trái (src/components/QuickNav.tsx). Tách khỏi component để kiểm thử bằng
 * `node --test`. `icon` là tên icon Feather.
 */
export type QuickNavItem = {
  key: string;
  label: string;
  hint: string;
  icon: string;
  href: string;
  /** Màn nằm ở thanh tab dưới: chuyển tab thay vì mở màn mới chồng lên. */
  tab?: boolean;
};

export type QuickNavSection = { title: string; items: QuickNavItem[] };

export const QUICK_NAV_SECTIONS: QuickNavSection[] = [
  {
    title: 'BÁN HÀNG',
    items: [
      { key: 'overview', label: 'Tổng quan', hint: 'Doanh thu và việc cần làm hôm nay', icon: 'home', href: '/', tab: true },
      { key: 'sales', label: 'Bán hàng', hint: 'Chọn món, quét mã, đọc đơn', icon: 'shopping-bag', href: '/sales', tab: true },
      { key: 'invoices', label: 'Đơn hàng', hint: 'Đơn đã bán và đơn chờ thu', icon: 'file-text', href: '/invoices', tab: true },
    ],
  },
  {
    title: 'QUẢN LÝ',
    items: [
      { key: 'debts', label: 'Công nợ', hint: 'Khách còn nợ, thu nợ', icon: 'book-open', href: '/debts' },
      { key: 'products', label: 'Hàng hoá', hint: 'Mặt hàng, giá và tồn kho', icon: 'package', href: '/products' },
      { key: 'analytics', label: 'Báo cáo', hint: 'Doanh thu, chi phí, bán chạy', icon: 'bar-chart-2', href: '/analytics' },
      { key: 'expenses', label: 'Chi phí', hint: 'Các khoản chi đã ghi', icon: 'credit-card', href: '/expenses' },
    ],
  },
  {
    title: 'KHÁC',
    items: [
      { key: 'ai', label: 'Trợ lý AI', hint: 'Hỏi Bobi về sổ bán hàng', icon: 'message-circle', href: '/ai' },
      { key: 'settings', label: 'Cài đặt', hint: 'Rung, cảnh báo sắp hết hàng, máy in', icon: 'settings', href: '/settings' },
    ],
  },
];

/** Mục đang mở theo đường dẫn hiện tại (`usePathname` của expo-router); không khớp mục nào thì `null`. */
export function activeQuickNavKey(pathname: string): string | null {
  const path = pathname.split(/[?#]/)[0].replace(/\/(\(tabs\))(?=\/|$)/, '').replace(/\/+$/, '') || '/';
  for (const section of QUICK_NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.href === '/' ? path === '/' : path === item.href || path.startsWith(`${item.href}/`)) return item.key;
    }
  }
  return null;
}

/** Vận tốc ngang (px/ms) từ đó coi là vuốt nhanh: hướng vuốt quyết định mở hay đóng, bất kể bảng đã ra bao nhiêu. */
export const QUICK_NAV_FLING = 0.3;

/**
 * Thả tay sau khi kéo menu: vuốt nhanh sang phải thì mở, nhanh sang trái thì đóng. Kéo chậm thì chỉ cần kéo quá 35% theo
 * hướng đang kéo: từ đóng kéo ra quá 35% bề rộng là mở, từ mở kéo vào quá 35% là đóng. `openRatio` là phần bảng đang hiện
 * (0–1), `velocityX` là vận tốc ngang lúc thả (px/ms, dương là sang phải), `startedOpen` là menu đang mở lúc bắt đầu kéo.
 */
export function opensAfterDrag(openRatio: number, velocityX: number, startedOpen: boolean): boolean {
  if (velocityX > QUICK_NAV_FLING) return true;
  if (velocityX < -QUICK_NAV_FLING) return false;
  return startedOpen ? openRatio > 0.65 : openRatio > 0.35;
}
