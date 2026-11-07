/** Màn hình mà nút dưới câu trả lời mở được; khoá trùng `Screen` trong backend/ai/src/agent/tools.py. */
export const SCREEN_LINKS = {
  sales: { label: 'Mở Bán hàng', route: '/pos' },
  voice_order: { label: 'Mở Đọc đơn', route: '/voice' },
  orders: { label: 'Mở Đơn hàng', route: '/(tabs)/invoices?from=chat' },
  products: { label: 'Mở Hàng hoá', route: '/products' },
  debts: { label: 'Mở Công nợ', route: '/debts' },
  expenses: { label: 'Mở Chi phí', route: '/expenses' },
  reports: { label: 'Mở Báo cáo', route: '/analytics' },
} as const;

export type AppScreen = keyof typeof SCREEN_LINKS;
