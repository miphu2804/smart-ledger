export type Category = 'drink' | 'food' | 'grocery' | 'fresh' | 'other';

export interface Product {
  id: string;
  name: string;
  price: number;
  /** Giá vốn ước tính — dùng để tính lợi nhuận cơ bản */
  cost: number;
  stock: number;
  /** false = bán theo yêu cầu, không theo dõi tồn kho */
  tracked: boolean;
  category: Category;
  /** Các cách người bán hay gọi tên món — giúp bộ nhận diện giả lập */
  aliases?: string[];
}

export interface LineItem {
  productId?: string;
  name: string;
  price: number;
  qty: number;
}

export type PayMethod = 'cash' | 'transfer' | 'debt';
export type InvoiceSource = 'voice' | 'pos' | 'manual';

/** Tác động của đơn lên kho / sổ nợ lúc tạo — lưu lại để huỷ đơn hoàn tác đúng số đã áp dụng. */
export interface InvoiceEffects {
  /** Số lượng thực tế đã trừ khỏi kho (chỉ mặt hàng theo dõi tồn kho) */
  stock: { productId: string; qty: number }[];
  /** Khoản nợ đã cộng vào sổ nợ của khách (đơn ghi nợ) */
  debt?: { debtId: string; amount: number };
}

export interface Invoice {
  id: string;
  code: string;
  createdAt: string; // ISO
  items: LineItem[];
  customer?: string;
  method: PayMethod;
  source: InvoiceSource;
  staffId: string;
  status: 'paid' | 'debt' | 'cancelled';
  transcript?: string;
  /** Chỉ có ở đơn tạo trong phiên này; dữ liệu mẫu ban đầu không có */
  effects?: InvoiceEffects;
}

export type ExpenseCategory = 'nguyenlieu' | 'dien' | 'matbang' | 'luong' | 'khac';

export interface Expense {
  id: string;
  title: string;
  amount: number;
  category: ExpenseCategory;
  createdAt: string;
  source: 'voice' | 'manual';
}

export interface Debt {
  id: string;
  name: string;
  phone: string;
  total: number;
  paid: number;
  lastDate: string;
  history: { at: string; amount: number; note: string }[];
}

export interface Staff {
  id: string;
  name: string;
  role: string;
  phone: string;
  active: boolean;
}

export interface ChatMessage {
  id: string;
  from: 'user' | 'ai';
  text: string;
}

// ---- Phiên đăng nhập & tiệm — khớp `AuthSessionResponse` của Core (backend/core, nhánh feat/auth-session) ----
// Lưu ý: Core đang trả camelCase và id kiểu số (Long); docs/contracts/api-contracts.md ghi snake_case và uuid.
// Đang bám theo code của Core; nếu backend đổi (SNAKE_CASE…) thì chỉ cần sửa các kiểu dưới đây và sessionApi.

export interface SessionUser {
  id: number | string;
  displayName: string;
  email?: string | null;
  phone?: string | null; // E.164 lấy từ claim phone_number của Firebase, ví dụ +84901234567
  avatarUrl?: string | null;
}

export interface ShopView {
  id: number | string;
  name: string;
  /** Core lưu một ngành (`industry`); docs ghi `industries` — chấp nhận cả hai cho tới khi chốt */
  industry?: string | null;
  industries?: string[] | null;
  phone?: string | null;
  address?: string | null;
  status?: 'ACTIVE' | 'INACTIVE';
}

export interface SessionView {
  user: SessionUser;
  role: 'OWNER' | 'ADMIN';
  shops: ShopView[];
  needsOnboarding: boolean;
}
