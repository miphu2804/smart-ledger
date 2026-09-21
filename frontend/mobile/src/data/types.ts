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
