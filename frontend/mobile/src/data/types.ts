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
  /**
   * "Món tạm": món mới nhập ở màn quét mã mà chủ tiệm bỏ chọn "Lưu vào danh mục hàng hoá". Dòng này không có `productId`
   * và không bao giờ thành mặt hàng: đơn gửi nó lên Core như một món tuỳ ý (tên, đơn vị, giá). `barcode` là mã vừa quét,
   * để quét lại cùng mã trong đơn này thì cộng số lượng (xem `src/lib/customLines.ts`).
   */
  custom?: { unit: string; barcode?: string };
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
  /** Ghi nhớ trợ lý đã dùng cho câu trả lời này; chỉ có ở lượt vừa chat, không lưu vào lịch sử. */
  memories?: AgentMemoryUsed[];
}

// ---- Trợ lý AI (Agent chat) — khớp docs/contracts/api-contracts.md §5, AI dùng snake_case ----
export interface AgentChatRequest {
  conversation_id?: number | null;
  message: string;
}

export interface AgentChatMessageView {
  conversation_id: number;
  message_id: number;
  answer: string;
}

/** Một ghi nhớ trong sự kiện SSE `memory` */
export interface AgentMemoryUsed {
  id: number;
  memory_type: string;
  content: string;
}

export interface AgentMemorySettings {
  memory_enabled: boolean;
  /** false khi trợ lý chưa bật ghi nhớ dài hạn cho cả hệ thống */
  available: boolean;
}

export interface AgentConversationSummary {
  conversation_id: number;
  title: string | null;
  last_message_at: string;
}

export interface AgentMessageView {
  message_id: number;
  role: 'USER' | 'ASSISTANT';
  content: string;
  created_at: string;
}

export interface AgentConversationView extends AgentConversationSummary {
  messages: AgentMessageView[];
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
  /** Ngưỡng báo sắp hết của riêng mặt hàng; null = không đặt (Core không báo LOW_STOCK, hết hàng vẫn báo OUT_OF_STOCK) */
  lowStockThreshold: number | null;
  status: 'ACTIVE' | 'ARCHIVED';
  createdAt: string;
  updatedAt: string;
}

export interface SaleDraftItemView {
  id: number;
  /** null = món tuỳ ý của đơn, không gắn với mặt hàng nào trong danh mục */
  productId: number | null;
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

/**
 * Tổng của mọi đơn khớp bộ lọc của `GET /sales` (`GET /sales/summary`, CORE-014), không phụ thuộc trang đã tải. Theo trạng
 * thái hiện tại của đơn: `confirmedSalesVnd` là tổng tiền (sau giảm giá) của đơn chưa huỷ, kể cả bán nợ; không phải tiền
 * thực thu và khác `netRevenueVnd` của báo cáo kỳ (báo cáo trừ đơn huỷ theo lúc huỷ).
 */
export interface SaleSummaryView {
  matchedOrderCount: number;
  confirmedOrderCount: number;
  voidedOrderCount: number;
  confirmedSalesVnd: number;
  voidedSalesVnd: number;
}

export interface SaleItemView {
  id: number;
  /** null = món tuỳ ý của đơn, không gắn với mặt hàng nào trong danh mục */
  productId: number | null;
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
  /** Lúc đơn bị huỷ; null khi đơn còn hiệu lực */
  voidedAt?: string | null;
  voidReason?: string | null;
}

/** Hoàn tiền của một đơn đã huỷ (`SaleRefundResponse`). Một đơn có tối đa một khoản hoàn, bằng toàn bộ tiền đã thu. */
export interface SaleRefundView {
  id: number;
  saleId: number;
  amountVnd: number;
  refundMethod: 'CASH' | 'TRANSFER';
  transferReference: string | null;
  refundedByUserId: number;
  refundedAt: string;
}

/** Kết quả `POST /sales/{id}/void` (`SaleVoidResponse`); `refund` là null khi đơn chưa thu đồng nào. */
export interface SaleVoidView {
  sale: SaleView;
  refund: SaleRefundView | null;
  /** Số nợ còn dư bị huỷ cùng đơn (không phải tiền hoàn) */
  cancelledDebtVnd: number;
  stockRestocked: boolean;
}

// ---- Công nợ, khách hàng, khoản chi thật — khớp Core (backend/core), xem AGENTS.md ----

export interface DebtView {
  id: number;
  saleId: number;
  customerId: number;
  originalVnd: number;
  outstandingVnd: number;
  /** `VOIDED`: đơn gốc bị huỷ nên số dư nợ bị huỷ theo (dư nợ 0, `cancelledVnd` là số bị huỷ); không còn là nợ phải thu */
  status: 'OPEN' | 'SETTLED' | 'VOIDED';
  createdAt: string;
  settledAt: string | null;
  voidedAt?: string | null;
  cancelledVnd?: number | null;
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

// ---- Báo cáo của Core (`/reports/*`), docs/contracts/api-contracts.md mục 4 ----

/** Kỳ báo cáo theo giờ Việt Nam: `week` là 7 ngày gồm hôm nay, `this_week` từ thứ Hai, `month`/`year` từ đầu tháng/năm. */
export type ReportPeriod = 'today' | 'yesterday' | 'this_week' | 'week' | 'month' | 'year';

/**
 * Tổng của một kỳ trên toàn tiệm. `orderCount`/`grossRevenueVnd` tính đơn bán trong kỳ (kể cả đơn sau đó bị huỷ);
 * `voided*` tính đơn bị huỷ trong kỳ theo lúc huỷ; `netRevenueVnd` = gross − voided, có thể âm.
 */
export interface ReportSummaryView {
  period: ReportPeriod;
  fromInclusive: string;
  toExclusive: string;
  grossRevenueVnd: number;
  voidedRevenueVnd: number;
  netRevenueVnd: number;
  collectedVnd: number;
  expenseVnd: number;
  currentOutstandingDebtVnd: number;
  orderCount: number;
  refundedVnd: number;
  voidedOrderCount: number;
}

/** Một ngày của chuỗi doanh thu; `date` là ngày `yyyy-mm-dd` theo giờ Việt Nam, Core trả đủ mọi ngày của kỳ. */
export interface SalesSeriesPoint {
  date: string;
  grossRevenueVnd: number;
  voidedRevenueVnd: number;
  netRevenueVnd: number;
  orderCount: number;
  voidedOrderCount: number;
}

export interface SalesSeriesView {
  period: ReportPeriod;
  fromInclusive: string;
  toExclusive: string;
  granularity: 'DAY';
  items: SalesSeriesPoint[];
}

/**
 * Một dòng bán chạy: món trong danh mục gộp theo `productId`, món tuỳ ý gộp theo tên + đơn vị (`source: 'CUSTOM'`).
 * `net*` = bán trong kỳ − huỷ trong kỳ, có thể âm. `itemKey` là khoá ổn định trong một response, không tự phân tích.
 */
export interface TopProductItem {
  itemKey: string;
  productId: number | null;
  productName: string;
  unit: string;
  source: 'CATALOG' | 'CUSTOM';
  grossQuantity: number;
  voidedQuantity: number;
  netQuantity: number;
  grossRevenueVnd: number;
  voidedRevenueVnd: number;
  netRevenueVnd: number;
}

export interface TopProductsView {
  period: ReportPeriod;
  fromInclusive: string;
  toExclusive: string;
  sortBy: 'QUANTITY' | 'NET_REVENUE';
  items: TopProductItem[];
}

/**
 * Lãi ước tính của một kỳ theo giá vốn Core chụp lúc bán (món không có giá vốn không bị đoán). `isComplete=false` khi có
 * dòng thiếu giá vốn; `unknownCostItemCount` đếm các dòng đó. Là số vận hành ước tính, không phải số kế toán.
 */
export interface ProfitEstimateView {
  period: ReportPeriod;
  fromInclusive: string;
  toExclusive: string;
  grossRevenueVnd: number;
  voidedRevenueVnd: number;
  netRevenueVnd: number;
  grossEstimatedCogsVnd: number;
  voidedEstimatedCogsVnd: number;
  netEstimatedCogsVnd: number;
  estimatedGrossProfitVnd: number;
  expenseVnd: number;
  estimatedOperatingProfitVnd: number;
  isComplete: boolean;
  unknownCostItemCount: number;
  unknownCostRevenueVnd: number;
}

export type NotificationType = 'LOW_STOCK' | 'OUT_OF_STOCK' | 'SALE_VOIDED' | 'SHOP_INACTIVATED' | 'SHOP_REACTIVATED';

/** Thông báo trong inbox của OWNER (Core `GET /me/notifications`, docs/contracts/api-contracts.md mục 8). `id` là ID sự kiện. */
export interface NotificationView {
  id: number;
  shopId: number;
  type: NotificationType;
  title: string;
  body: string;
  targetType: 'PRODUCT' | 'SALE' | 'SHOP';
  targetId: number;
  createdAt: string;
  readAt: string | null;
  resolvedAt: string | null;
}

/** Một trang của inbox: `page` tính từ 0, mới nhất trước. */
export interface NotificationPage {
  items: NotificationView[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}
