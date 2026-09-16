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
