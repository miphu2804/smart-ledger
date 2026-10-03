import { categoryMeta, mockProducts as legacyProducts } from '../data/mock';
import type {
  AgentChatMessageView,
  AgentChatRequest,
  AgentConversationSummary,
  AgentConversationView,
  AgentMessageView,
  CategoryView,
  CustomerView,
  DebtView,
  ExpenseView,
  PaymentView,
  ProductView,
  SaleDraftItemView,
  SaleDraftView,
  SaleItemView,
  SaleView,
} from '../data/types';
import { ApiError } from './apiError';
import { normalizeText, vnd } from './format';

/**
 * Core giả lập cho chế độ xem trước (EXPO_PUBLIC_USE_MOCK=true, xem src/config.ts) khi chưa có Core
 * thật chạy — `apiRequest` (src/lib/api.ts) gọi thẳng vào đây thay vì `fetch` mạng.
 *
 * Dữ liệu lưu trong bộ nhớ (mất khi tải lại app/reload Metro) và chỉ mô phỏng đúng các endpoint mà
 * app thực sự gọi qua catalogApi/salesApi/debtApi/customerApi/expenseApi/agentApi. Logic xác nhận đơn nháp
 * (`confirmSaleDraft`) cố tình bám sát Core thật — xem
 * backend/core/src/main/java/com/smartledger/core/service/impl/SaleDraftServiceImpl.java#confirm —
 * để hành vi giống nhau: kiểm tra tồn kho, mở nợ khi trả thiếu, bắt buộc có khách khi ghi nợ.
 *
 * Chỉ một "tiệm" giả lập (SHOP_ID cố định) — mock hiện chỉ phục vụ preview một tiệm, khớp với
 * `sessionApi`/`USE_MOCK_CORE` (src/lib/sessionApi.ts) cũng chỉ có một `mock-shop`.
 */
const SHOP_ID = 1;

let categories: CategoryView[] = [];
let products: ProductView[] = [];
let saleDrafts: SaleDraftView[] = [];
let sales: SaleView[] = [];
let payments: PaymentView[] = [];
let customers: CustomerView[] = [];
let debts: DebtView[] = [];
let expenses: ExpenseView[] = [];

let nextCategoryId = 1;
let nextProductId = 1;
let nextDraftId = 1;
let nextDraftItemId = 1;
let nextSaleId = 1;
let nextPaymentId = 1;
let nextCustomerId = 1;
let nextDebtId = 1;
let nextExpenseId = 1;

/** Khách gắn với một đơn nháp qua `customerId` có sẵn — không có trong `SaleDraftView` nên lưu riêng ở đây. */
const draftCustomerId = new Map<number, number | null>();

function nowIso(): string {
  return new Date().toISOString();
}

function pastIso(days: number, hours: number, minutes = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hours, minutes, 0, 0);
  return d.toISOString();
}

function apiErr(status: number, code: string, message: string): ApiError {
  return new ApiError(status, code, message);
}

function makeSaleItem(product: ProductView, quantity: number): SaleItemView {
  return {
    id: nextDraftItemId++,
    productId: product.id,
    productName: product.name,
    unit: product.unit,
    quantity,
    unitPriceVnd: product.sellingPriceVnd,
    lineTotalVnd: Math.round(product.sellingPriceVnd * quantity),
  };
}

function addMockSale({
  customerName,
  customerPhone,
  soldAt,
  itemSpecs,
  paidVnd,
  method = 'CASH',
}: {
  customerName: string | null;
  customerPhone?: string | null;
  soldAt: string;
  itemSpecs: Array<[number, number]>;
  paidVnd?: number;
  method?: PaymentView['paymentMethod'];
}): void {
  const items = itemSpecs.map(([productIndex, quantity]) => makeSaleItem(products[productIndex], quantity));
  const subtotalVnd = items.reduce((sum, item) => sum + item.lineTotalVnd, 0);
  const totalVnd = subtotalVnd;
  const resolvedPaid = paidVnd ?? totalVnd;
  const outstandingVnd = Math.max(0, totalVnd - resolvedPaid);
  const paymentStatus: SaleView['paymentStatus'] = outstandingVnd === 0 ? 'PAID' : resolvedPaid > 0 ? 'PARTIAL' : 'DEBT';
  let customerId: number | null = null;

  if (customerName && outstandingVnd > 0) {
    const customer: CustomerView = {
      id: nextCustomerId++,
      shopId: SHOP_ID,
      name: customerName,
      phone: customerPhone ?? null,
      status: 'ACTIVE',
      createdAt: soldAt,
      updatedAt: soldAt,
    };
    customers.push(customer);
    customerId = customer.id;
  }

  const sale: SaleView = {
    id: nextSaleId++,
    shopId: SHOP_ID,
    customerName,
    customerPhone: customerPhone ?? null,
    subtotalVnd,
    discountVnd: 0,
    totalVnd,
    paidVnd: resolvedPaid,
    saleStatus: 'CONFIRMED',
    paymentStatus,
    soldAt,
    items,
    customerId,
    outstandingVnd,
  };
  sales.push(sale);

  if (resolvedPaid > 0) {
    payments.push({
      id: nextPaymentId++,
      saleId: sale.id,
      amountVnd: resolvedPaid,
      paymentMethod: method,
      type: 'INITIAL',
      receivedAt: soldAt,
    });
  }

  if (customerId != null && outstandingVnd > 0) {
    debts.push({
      id: nextDebtId++,
      saleId: sale.id,
      customerId,
      originalVnd: outstandingVnd,
      outstandingVnd,
      status: 'OPEN',
      createdAt: soldAt,
      settledAt: null,
    });
  }
}

function seed(): void {
  const legacyCategoryKeys = Object.keys(categoryMeta).filter((key) => key !== 'all');
  const categoryIdByLegacyKey = new Map<string, number>();
  const now = nowIso();
  categories = legacyCategoryKeys.map((key) => {
    const id = nextCategoryId++;
    categoryIdByLegacyKey.set(key, id);
    return { id, shopId: SHOP_ID, name: categoryMeta[key], status: 'ACTIVE', createdAt: now, updatedAt: now };
  });
  products = legacyProducts.map((p) => ({
    id: nextProductId++,
    shopId: SHOP_ID,
    categoryId: categoryIdByLegacyKey.get(p.category) ?? null,
    name: p.name,
    barcode: (p as any).barcode ?? null,
    imageUrl: null,
    unit: 'cái',
    sellingPriceVnd: p.price,
    costPriceVnd: p.cost,
    tracked: p.tracked,
    stockQuantity: p.tracked ? p.stock : null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  }));
  addMockSale({
    customerName: null,
    soldAt: pastIso(0, 8, 35),
    itemSpecs: [[19, 2], [20, 3], [12, 1]],
    method: 'CASH',
  });
  addMockSale({
    customerName: 'Chị Hạnh',
    customerPhone: '0908123456',
    soldAt: pastIso(0, 10, 20),
    itemSpecs: [[0, 4], [13, 1], [21, 2]],
    paidVnd: 40000,
    method: 'TRANSFER',
  });
  addMockSale({
    customerName: null,
    soldAt: pastIso(0, 15, 5),
    itemSpecs: [[3, 1], [9, 2]],
    method: 'CASH',
  });
  addMockSale({
    customerName: 'Anh Minh',
    customerPhone: '0912345678',
    soldAt: pastIso(1, 17, 42),
    itemSpecs: [[2, 1], [4, 1], [14, 2]],
    paidVnd: 0,
  });
  addMockSale({
    customerName: null,
    soldAt: pastIso(3, 9, 12),
    itemSpecs: [[16, 1], [17, 1], [18, 3]],
    method: 'CASH',
  });
  addMockSale({
    customerName: 'Cô Mai',
    customerPhone: '0987654321',
    soldAt: pastIso(7, 14, 18),
    itemSpecs: [[10, 1], [11, 2]],
    paidVnd: 120000,
    method: 'TRANSFER',
  });
  // Khách hàng/công nợ/đơn hàng/chi phí bắt đầu trống — dữ liệu mẫu cũ (Debt/Invoice) ghi lẫn lịch sử mua và
  // trả nợ, không map 1-1 sang originalVnd/outstandingVnd/Payment của Core nên không cố chuyển đổi (xem báo cáo).
}
seed();

function findActiveProduct(id: number): ProductView | undefined {
  return products.find((p) => p.id === id && p.status === 'ACTIVE');
}

function findActiveCustomer(id: number): CustomerView | undefined {
  return customers.find((c) => c.id === id && c.status === 'ACTIVE');
}

function normalizeOrNull(value?: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ---------------------------------------------------------------------------
// Danh mục hàng hoá
// ---------------------------------------------------------------------------

function listCategories(): CategoryView[] {
  return categories.filter((c) => c.status === 'ACTIVE');
}

function createCategory(body: { name: string }): CategoryView {
  const now = nowIso();
  const category: CategoryView = { id: nextCategoryId++, shopId: SHOP_ID, name: body.name, status: 'ACTIVE', createdAt: now, updatedAt: now };
  categories.push(category);
  return category;
}

// ---------------------------------------------------------------------------
// Sản phẩm
// ---------------------------------------------------------------------------

interface ProductWriteBody {
  categoryId?: number | null;
  name: string;
  barcode?: string | null;
  imageUrl?: string | null;
  unit: string;
  sellingPriceVnd: number;
  costPriceVnd?: number | null;
  tracked: boolean;
  stockQuantity?: number | null;
}

function listProducts(): ProductView[] {
  return products.filter((p) => p.status === 'ACTIVE');
}

function createProduct(body: ProductWriteBody): ProductView {
  const now = nowIso();
  const product: ProductView = {
    id: nextProductId++,
    shopId: SHOP_ID,
    categoryId: body.categoryId ?? null,
    name: body.name,
    barcode: body.barcode ?? null,
    imageUrl: body.imageUrl ?? null,
    unit: body.unit,
    sellingPriceVnd: body.sellingPriceVnd,
    costPriceVnd: body.costPriceVnd ?? null,
    tracked: body.tracked,
    stockQuantity: body.tracked ? (body.stockQuantity ?? 0) : null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  products.push(product);
  return product;
}

function updateProduct(id: number, body: ProductWriteBody): ProductView {
  const product = findActiveProduct(id);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  product.categoryId = body.categoryId ?? null;
  product.name = body.name;
  product.barcode = body.barcode ?? null;
  product.imageUrl = body.imageUrl ?? null;
  product.unit = body.unit;
  product.sellingPriceVnd = body.sellingPriceVnd;
  product.costPriceVnd = body.costPriceVnd ?? null;
  product.tracked = body.tracked;
  product.stockQuantity = body.tracked ? (body.stockQuantity ?? 0) : null;
  product.updatedAt = nowIso();
  return product;
}

function archiveProduct(id: number): void {
  const product = findActiveProduct(id);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  product.status = 'ARCHIVED';
  product.updatedAt = nowIso();
}

// ---------------------------------------------------------------------------
// Đơn nháp + xác nhận (khớp SaleDraftServiceImpl#confirm của Core thật)
// ---------------------------------------------------------------------------

interface SaleDraftItemBody {
  productId: number;
  quantity: number;
  unitPriceVnd: number;
}

interface SaleDraftWriteBody {
  customerName?: string | null;
  customerPhone?: string | null;
  customerId?: number | null;
  discountVnd?: number | null;
  initialPaidVnd?: number | null;
  initialPaymentMethod?: 'CASH' | 'TRANSFER' | null;
  items: SaleDraftItemBody[];
}

function createSaleDraft(body: SaleDraftWriteBody): SaleDraftView {
  if (!body.items?.length) throw apiErr(400, 'draft_item_invalid', 'Every draft item must reference an active product in this shop.');
  const seenProductIds = new Set<number>();
  let subtotal = 0;
  const items: SaleDraftItemView[] = body.items.map((item) => {
    if (seenProductIds.has(item.productId)) throw apiErr(400, 'draft_item_duplicate', 'A product may appear only once in a draft.');
    seenProductIds.add(item.productId);
    const product = findActiveProduct(item.productId);
    if (!product) throw apiErr(400, 'draft_item_invalid', 'Every draft item must reference an active product in this shop.');
    const lineTotalVnd = Math.round(item.unitPriceVnd * item.quantity);
    subtotal += lineTotalVnd;
    return {
      id: nextDraftItemId++,
      productId: product.id,
      productName: product.name,
      unit: product.unit,
      quantity: item.quantity,
      unitPriceVnd: item.unitPriceVnd,
      lineTotalVnd,
    };
  });

  const discountVnd = body.discountVnd ?? 0;
  const estimatedTotalVnd = subtotal - discountVnd;
  if (estimatedTotalVnd <= 0) throw apiErr(400, 'draft_total_invalid', 'Draft total or discount is invalid.');

  const initialPaidVnd = body.initialPaidVnd ?? 0;
  if (
    initialPaidVnd > estimatedTotalVnd ||
    (initialPaidVnd > 0 && !body.initialPaymentMethod) ||
    (initialPaidVnd === 0 && body.initialPaymentMethod)
  ) {
    throw apiErr(
      400,
      'draft_payment_invalid',
      'Initial payment cannot exceed the draft total; provide a payment method only when the paid amount is greater than zero.',
    );
  }

  let customer: CustomerView | undefined;
  if (body.customerId != null) {
    customer = findActiveCustomer(body.customerId);
    if (!customer) throw apiErr(404, 'customer_not_found', 'This customer is unavailable in the selected shop.');
  }

  const now = nowIso();
  const id = nextDraftId++;
  draftCustomerId.set(id, body.customerId ?? null);
  const draft: SaleDraftView = {
    id,
    shopId: SHOP_ID,
    customerName: customer ? customer.name : normalizeOrNull(body.customerName),
    customerPhone: customer ? customer.phone : normalizeOrNull(body.customerPhone),
    discountVnd,
    estimatedTotalVnd,
    initialPaidVnd,
    initialPaymentMethod: body.initialPaymentMethod ?? null,
    status: 'DRAFT',
    // Core thật giữ đơn nháp 1 tháng trước khi hết hạn — không quan trọng ở mock vì app confirm ngay sau create.
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    confirmedSaleId: null,
    items,
  };
  saleDrafts.push(draft);
  return draft;
}

function confirmSaleDraft(id: number): SaleView {
  const draft = saleDrafts.find((d) => d.id === id);
  if (!draft) throw apiErr(404, 'draft_not_found', 'This draft is unavailable.');

  if (draft.status === 'CONFIRMED' && draft.confirmedSaleId != null) {
    const existing = sales.find((s) => s.id === draft.confirmedSaleId);
    if (existing) return existing;
    throw apiErr(404, 'sale_not_found', 'This sale is unavailable.');
  }
  if (draft.status !== 'DRAFT' || new Date(draft.expiresAt).getTime() <= Date.now()) {
    throw apiErr(409, 'draft_not_editable', 'Only a current draft can be changed.');
  }

  const customerRequired = draft.initialPaidVnd == null || draft.initialPaidVnd < draft.estimatedTotalVnd;
  const linkedCustomerId = draftCustomerId.get(draft.id) ?? null;
  let customer: CustomerView | undefined;
  if (linkedCustomerId != null) {
    customer = findActiveCustomer(linkedCustomerId);
    if (!customer && customerRequired) throw apiErr(404, 'customer_not_found', 'This customer is unavailable in the selected shop.');
  } else if (customerRequired) {
    if (!draft.customerName?.trim()) {
      throw apiErr(400, 'customer_required_for_debt', 'A customer is required before confirming an unpaid sale.');
    }
    const now = nowIso();
    customer = {
      id: nextCustomerId++,
      shopId: SHOP_ID,
      name: draft.customerName.trim(),
      phone: normalizeOrNull(draft.customerPhone),
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    };
    customers.push(customer);
  }

  if (!draft.items.length) throw apiErr(400, 'draft_item_invalid', 'Every draft item must reference an active product in this shop.');
  // Kiểm tra đủ hàng cho MỌI dòng trước khi trừ bất kỳ dòng nào (tránh trừ nửa chừng rồi báo lỗi).
  for (const item of draft.items) {
    const product = findActiveProduct(item.productId);
    if (!product) throw apiErr(400, 'draft_item_invalid', 'Every draft item must reference an active product in this shop.');
    if (product.tracked && (product.stockQuantity == null || product.stockQuantity < item.quantity)) {
      throw apiErr(409, 'product_stock_insufficient', 'Tracked product stock is insufficient.');
    }
  }
  const now = nowIso();
  for (const item of draft.items) {
    const product = findActiveProduct(item.productId)!;
    if (product.tracked && product.stockQuantity != null) {
      product.stockQuantity -= item.quantity;
      product.updatedAt = now;
    }
  }

  const initialPaidVnd = draft.initialPaidVnd ?? 0;
  const paymentStatus: SaleView['paymentStatus'] =
    initialPaidVnd === draft.estimatedTotalVnd ? 'PAID' : initialPaidVnd === 0 ? 'DEBT' : 'PARTIAL';
  const saleItems: SaleItemView[] = draft.items.map((item) => ({
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    unit: item.unit,
    quantity: item.quantity,
    unitPriceVnd: item.unitPriceVnd,
    lineTotalVnd: item.lineTotalVnd,
  }));
  const subtotalVnd = draft.items.reduce((sum, item) => sum + item.lineTotalVnd, 0);
  const sale: SaleView = {
    id: nextSaleId++,
    shopId: SHOP_ID,
    customerName: customer ? customer.name : draft.customerName,
    customerPhone: customer ? customer.phone : draft.customerPhone,
    subtotalVnd,
    discountVnd: draft.discountVnd,
    totalVnd: draft.estimatedTotalVnd,
    paidVnd: initialPaidVnd,
    saleStatus: 'CONFIRMED',
    paymentStatus,
    soldAt: now,
    items: saleItems,
    customerId: customer ? customer.id : null,
    outstandingVnd: draft.estimatedTotalVnd - initialPaidVnd,
  };
  sales.push(sale);

  if (initialPaidVnd > 0) {
    payments.push({
      id: nextPaymentId++,
      saleId: sale.id,
      amountVnd: initialPaidVnd,
      paymentMethod: draft.initialPaymentMethod ?? 'CASH',
      type: 'INITIAL',
      receivedAt: now,
    });
  }
  if (initialPaidVnd < draft.estimatedTotalVnd) {
    // `customerRequired` đã bảo đảm có `customer` tới đây (nếu không đã ném lỗi ở trên).
    debts.push({
      id: nextDebtId++,
      saleId: sale.id,
      customerId: customer!.id,
      originalVnd: draft.estimatedTotalVnd - initialPaidVnd,
      outstandingVnd: draft.estimatedTotalVnd - initialPaidVnd,
      status: 'OPEN',
      createdAt: now,
      settledAt: null,
    });
  }

  draft.status = 'CONFIRMED';
  draft.confirmedSaleId = sale.id;
  return sale;
}

// ---------------------------------------------------------------------------
// Bán hàng đã xác nhận & lịch sử thanh toán
// ---------------------------------------------------------------------------

function listSales(): SaleView[] {
  return [...sales].sort((a, b) => b.id - a.id);
}

function getSaleById(id: number): SaleView {
  const sale = sales.find((s) => s.id === id);
  if (!sale) throw apiErr(404, 'sale_not_found', 'This sale is unavailable.');
  return sale;
}

function listPaymentsForSale(saleId: number): PaymentView[] {
  return payments.filter((p) => p.saleId === saleId);
}

// ---------------------------------------------------------------------------
// Khách hàng
// ---------------------------------------------------------------------------

function listCustomers(): CustomerView[] {
  return customers.filter((c) => c.status === 'ACTIVE');
}

// ---------------------------------------------------------------------------
// Công nợ (khớp DebtServiceImpl#repay/Debt#repay của Core thật)
// ---------------------------------------------------------------------------

interface DebtRepaymentBody {
  amountVnd: number;
  paymentMethod: 'CASH' | 'TRANSFER';
  transferReference?: string;
}

function listDebts(): DebtView[] {
  return [...debts].sort((a, b) => b.id - a.id);
}

function repayDebt(id: number, body: DebtRepaymentBody): { debt: DebtView; payment: PaymentView } {
  const debt = debts.find((d) => d.id === id);
  if (!debt) throw apiErr(404, 'debt_not_found', 'This debt is unavailable.');
  if (debt.status !== 'OPEN') throw apiErr(409, 'debt_already_settled', 'This debt has already been settled.');
  if (body.amountVnd <= 0 || body.amountVnd > debt.outstandingVnd) {
    throw apiErr(400, 'debt_payment_invalid', 'Repayment amount is invalid or exceeds the remaining debt.');
  }

  const now = nowIso();
  debt.outstandingVnd -= body.amountVnd;
  if (debt.outstandingVnd === 0) {
    debt.status = 'SETTLED';
    debt.settledAt = now;
  }
  const sale = sales.find((s) => s.id === debt.saleId);
  if (sale) {
    sale.paidVnd += body.amountVnd;
    sale.outstandingVnd = sale.totalVnd - sale.paidVnd;
    sale.paymentStatus = sale.paidVnd === sale.totalVnd ? 'PAID' : 'PARTIAL';
  }
  const payment: PaymentView = {
    id: nextPaymentId++,
    saleId: debt.saleId,
    amountVnd: body.amountVnd,
    paymentMethod: body.paymentMethod,
    type: 'DEBT_REPAYMENT',
    receivedAt: now,
  };
  payments.push(payment);
  return { debt, payment };
}

// ---------------------------------------------------------------------------
// Chi phí
// ---------------------------------------------------------------------------

interface ExpenseWriteBody {
  category?: string | null;
  description: string;
  amountVnd: number;
  paymentMethod?: 'CASH' | 'TRANSFER' | null;
  expenseAt?: string | null;
}

function listExpenses(): ExpenseView[] {
  return expenses.filter((e) => e.status === 'ACTIVE').sort((a, b) => b.id - a.id);
}

function createExpense(body: ExpenseWriteBody): ExpenseView {
  const now = nowIso();
  const expense: ExpenseView = {
    id: nextExpenseId++,
    shopId: SHOP_ID,
    category: body.category ?? null,
    description: body.description,
    amountVnd: body.amountVnd,
    paymentMethod: body.paymentMethod ?? null,
    expenseAt: body.expenseAt ?? now,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  expenses.push(expense);
  return expense;
}

function archiveExpense(id: number): void {
  const expense = expenses.find((e) => e.id === id && e.status === 'ACTIVE');
  if (!expense) throw apiErr(404, 'expense_not_found', 'This expense is unavailable.');
  expense.status = 'ARCHIVED';
  expense.updatedAt = nowIso();
}

// ---------------------------------------------------------------------------
// Trợ lý AI (Agent chat) — hội thoại lưu trong bộ nhớ, câu trả lời giả tính từ danh mục mẫu
// ---------------------------------------------------------------------------

/** Câu chứa chuỗi này giả lập AI lỗi (503 ai_unavailable) để thử thông báo lỗi ở màn /ai. */
export const MOCK_AI_FAILURE_TRIGGER = '#ai-loi';

interface MockConversation {
  conversation_id: number;
  title: string | null;
  last_message_at: string;
  messages: AgentMessageView[];
}

let agentConversations: MockConversation[] = [];
let nextConversationId = 1;
let nextAgentMessageId = 1;

function mockAgentAnswer(question: string): string {
  const q = normalizeText(question);
  const active = products.filter((p) => p.status === 'ACTIVE');
  const scope = '(Số liệu giả lập từ danh mục mẫu của tiệm hiện tại.)';
  if (/gia von/.test(q)) {
    const missing = active.filter((p) => p.costPriceVnd == null);
    if (!missing.length) return `Món nào cũng đã có giá vốn. ${scope}`;
    return `Chưa nhập giá vốn:\n${missing.slice(0, 20).map((p) => `• ${p.name}`).join('\n')}\n${scope}`;
  }
  if (/dat nhat|mac nhat/.test(q)) {
    const top = [...active].sort((a, b) => b.sellingPriceVnd - a.sellingPriceVnd).slice(0, 5);
    return `Năm món giá cao nhất:\n${top.map((p, i) => `${i + 1}. ${p.name} — ${vnd(p.sellingPriceVnd)}`).join('\n')}\n${scope}`;
  }
  if (/het hang|sap het|ton kho|con bao nhieu|nhap/.test(q)) {
    const low = active.filter((p) => p.tracked && (p.stockQuantity ?? 0) <= 6);
    if (!low.length) return `Chưa có mặt hàng nào dưới ngưỡng 6. ${scope}`;
    return `Các món sắp hết:\n${low.map((p) => `• ${p.name}: còn ${p.stockQuantity} ${p.unit}`).join('\n')}\n${scope}`;
  }
  const matched = active.filter((p) => {
    const name = normalizeText(p.name);
    return name.length > 2 && (q.includes(name) || name.split(' ').some((word) => word.length > 2 && q.includes(word)));
  });
  if (matched.length) {
    return `${matched
      .slice(0, 5)
      .map((p) => `• ${p.name}: ${vnd(p.sellingPriceVnd)}/${p.unit}${p.tracked ? `, còn ${p.stockQuantity}` : ''}`)
      .join('\n')}\n${scope}`;
  }
  if (/bao nhieu (mon|mat hang|san pham)|may mon/.test(q)) {
    return `Tiệm đang bán ${active.length} mặt hàng trong ${listCategories().length} nhóm. ${scope}`;
  }
  return 'Mình chưa đủ dữ liệu để trả lời câu này. Ở bản xem trước, bạn thử hỏi giá hoặc tồn kho của một món nhé.';
}

function agentSummary(c: MockConversation): AgentConversationSummary {
  return { conversation_id: c.conversation_id, title: c.title, last_message_at: c.last_message_at };
}

function findConversation(id: number): MockConversation {
  const conversation = agentConversations.find((c) => c.conversation_id === id);
  if (!conversation) throw apiErr(404, 'conversation_not_found', 'Không tìm thấy cuộc trò chuyện.');
  return conversation;
}

function agentChat(body: AgentChatRequest): AgentChatMessageView {
  const message = body.message?.trim() ?? '';
  if (!message) throw apiErr(422, 'validation_error', 'Tin nhắn không được để trống.');
  if (message.includes(MOCK_AI_FAILURE_TRIGGER)) {
    throw apiErr(503, 'ai_unavailable', 'Trợ lý AI tạm thời không phản hồi.');
  }
  const now = nowIso();
  let conversation: MockConversation;
  if (body.conversation_id != null) {
    conversation = findConversation(body.conversation_id);
  } else {
    conversation = { conversation_id: nextConversationId++, title: message.slice(0, 255), last_message_at: now, messages: [] };
    agentConversations.push(conversation);
  }
  const answer = mockAgentAnswer(message);
  conversation.messages.push({ message_id: nextAgentMessageId++, role: 'USER', content: message, created_at: now });
  const reply: AgentMessageView = { message_id: nextAgentMessageId++, role: 'ASSISTANT', content: answer, created_at: now };
  conversation.messages.push(reply);
  conversation.last_message_at = now;
  return { conversation_id: conversation.conversation_id, message_id: reply.message_id, answer };
}

function listAgentConversations(): AgentConversationSummary[] {
  return [...agentConversations]
    .sort((a, b) => b.last_message_at.localeCompare(a.last_message_at))
    .map(agentSummary);
}

function getAgentConversation(id: number): AgentConversationView {
  const conversation = findConversation(id);
  return { ...agentSummary(conversation), messages: conversation.messages };
}

function renameAgentConversation(id: number, body: { title?: string }): AgentConversationSummary {
  const title = body.title?.trim() ?? '';
  if (!title || title.length > 255) throw apiErr(422, 'validation_error', 'Tên cuộc trò chuyện dài 1–255 ký tự.');
  const conversation = findConversation(id);
  conversation.title = title;
  return agentSummary(conversation);
}

function deleteAgentConversation(id: number): void {
  findConversation(id);
  agentConversations = agentConversations.filter((c) => c.conversation_id !== id);
}

// ---------------------------------------------------------------------------
// Định tuyến — nhận đúng path/method mà catalogApi/salesApi/debtApi/customerApi/expenseApi gửi
// ---------------------------------------------------------------------------

/**
 * `apiRequest` (src/lib/api.ts) gọi hàm này khi USE_MOCK=true thay vì `fetch` mạng. Chỉ các endpoint
 * app thực sự dùng (xem catalogApi/salesApi/debtApi/customerApi/expenseApi) mới được xử lý; endpoint
 * khác ném lỗi rõ ràng thay vì âm thầm thất bại hoặc gọi mạng thật.
 */
export function mockCoreRequest<T>(path: string, method: string, body: unknown): T {
  const segments = path.split('/').filter(Boolean);

  if (path === '/categories') {
    if (method === 'GET') return listCategories() as unknown as T;
    if (method === 'POST') return createCategory(body as { name: string }) as unknown as T;
  }

  if (path === '/products') {
    if (method === 'GET') return listProducts() as unknown as T;
    if (method === 'POST') return createProduct(body as ProductWriteBody) as unknown as T;
  }
  if (segments[0] === 'products' && segments.length === 2) {
    const id = Number(segments[1]);
    if (method === 'PATCH') return updateProduct(id, body as ProductWriteBody) as unknown as T;
    if (method === 'DELETE') {
      archiveProduct(id);
      return undefined as T;
    }
  }

  if (path === '/sale-drafts' && method === 'POST') return createSaleDraft(body as SaleDraftWriteBody) as unknown as T;
  if (segments[0] === 'sale-drafts' && segments.length === 3 && segments[2] === 'confirm' && method === 'POST') {
    return confirmSaleDraft(Number(segments[1])) as unknown as T;
  }

  if (path === '/sales' && method === 'GET') return listSales() as unknown as T;
  if (segments[0] === 'sales' && segments.length === 2 && method === 'GET') {
    return getSaleById(Number(segments[1])) as unknown as T;
  }
  if (segments[0] === 'sales' && segments.length === 3 && segments[2] === 'payments' && method === 'GET') {
    return listPaymentsForSale(Number(segments[1])) as unknown as T;
  }

  if (path === '/customers' && method === 'GET') return listCustomers() as unknown as T;

  if (path === '/debts' && method === 'GET') return listDebts() as unknown as T;
  if (segments[0] === 'debts' && segments.length === 3 && segments[2] === 'payments' && method === 'POST') {
    return repayDebt(Number(segments[1]), body as DebtRepaymentBody) as unknown as T;
  }

  if (path === '/expenses') {
    if (method === 'GET') return listExpenses() as unknown as T;
    if (method === 'POST') return createExpense(body as ExpenseWriteBody) as unknown as T;
  }
  if (segments[0] === 'expenses' && segments.length === 2 && method === 'DELETE') {
    archiveExpense(Number(segments[1]));
    return undefined as T;
  }

  if (path === '/agent/chat' && method === 'POST') return agentChat(body as AgentChatRequest) as unknown as T;
  if (path === '/agent/conversations' && method === 'GET') return listAgentConversations() as unknown as T;
  if (segments[0] === 'agent' && segments[1] === 'conversations' && segments.length === 3) {
    const id = Number(segments[2]);
    if (method === 'GET') return getAgentConversation(id) as unknown as T;
    if (method === 'PATCH') return renameAgentConversation(id, body as { title?: string }) as unknown as T;
    if (method === 'DELETE') {
      deleteAgentConversation(id);
      return undefined as T;
    }
  }

  throw apiErr(501, 'mock_not_implemented', `Chưa hỗ trợ giả lập cho ${method} ${path} khi EXPO_PUBLIC_USE_MOCK=true.`);
}
