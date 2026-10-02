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
  /** Mã vạch sản phẩm (EAN-13, UPC, Code 128...) để quét bán hàng */
  barcode?: string;
}

export interface LineItem {
  /** string = id sản phẩm mẫu (mock); number = id Product thật (Core) — xem AGENTS.md */
  productId?: string | number;
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
  /** Tổng tiền đơn sau giảm giá (Core `totalVnd`) — có thì ưu tiên hơn tổng các dòng, xem `invoiceTotal` */
  total?: number;
  /** false = không biết hình thức thanh toán (đơn lấy từ Core: danh sách đơn không kèm phương thức) */
  methodKnown?: boolean;
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
  status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  inactiveReason?: string | null;
  archivedReason?: string | null;
}

export interface SessionView {
  user: SessionUser;
  role: 'OWNER' | 'ADMIN';
  shops: ShopView[];
  needsOnboarding: boolean;
}

// ---- Danh mục hàng hoá & bán hàng thật — khớp Core (backend/core), xem AGENTS.md/hợp đồng API ----

export interface CategoryView {
  id: number;
  shopId: number;
  name: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface ProductView {
  id: number;
  shopId: number;
  categoryId: number | null;
  name: string;
  barcode: string | null;
  imageUrl: string | null;
  unit: string;
  sellingPriceVnd: number;
  costPriceVnd: number | null;
  tracked: boolean;
  /** BigDecimal ở Core — có thể có phần thập phân; UI hiện tại chỉ cần số nguyên */
  stockQuantity: number | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface SaleDraftItemView {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}

export interface SaleDraftView {
  id: number;
  shopId: number;
  customerName: string | null;
  customerPhone: string | null;
  discountVnd: number;
  estimatedTotalVnd: number;
  initialPaidVnd: number | null;
  initialPaymentMethod: 'CASH' | 'TRANSFER' | null;
  status: 'DRAFT' | 'CONFIRMED' | 'CANCELLED' | 'EXPIRED';
  expiresAt: string;
  confirmedSaleId: number | null;
  items: SaleDraftItemView[];
}

export interface SaleItemView {
  id: number;
  productId: number;
  productName: string;
  unit: string;
  quantity: number;
  unitPriceVnd: number;
  lineTotalVnd: number;
}

export interface SaleView {
  id: number;
  shopId: number;
  customerName: string | null;
  customerPhone: string | null;
  subtotalVnd: number;
  discountVnd: number;
  totalVnd: number;
  paidVnd: number;
  saleStatus: 'CONFIRMED' | 'VOIDED';
  paymentStatus: 'PAID' | 'DEBT' | 'PARTIAL';
  soldAt: string;
  items: SaleItemView[];
  customerId: number | null;
  outstandingVnd: number;
}

// ---- Công nợ, khách hàng, khoản chi thật — khớp Core (backend/core), xem AGENTS.md ----

export interface DebtView {
  id: number;
  saleId: number;
  customerId: number;
  originalVnd: number;
  outstandingVnd: number;
  status: 'OPEN' | 'SETTLED';
  createdAt: string;
  settledAt: string | null;
}

export interface CustomerView {
  id: number;
  shopId: number;
  name: string;
  phone: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface PaymentView {
  id: number;
  saleId: number;
  amountVnd: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  type: 'INITIAL' | 'DEBT_REPAYMENT';
  receivedAt: string;
}

export interface ExpenseView {
  id: number;
  shopId: number;
  /** Free-text ở Core — app gửi/đọc key cố định của `ExpenseCategory` (xem src/data/mock.ts) */
  category: string | null;
  description: string;
  amountVnd: number;
  paymentMethod: 'CASH' | 'TRANSFER' | null;
  expenseAt: string;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}
