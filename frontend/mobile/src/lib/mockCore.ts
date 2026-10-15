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
  NotificationPage,
  NotificationType,
  NotificationView,
  PaymentView,
  ProductView,
  ProfitEstimateView,
  ReportPeriod,
  ReportSummaryView,
  TopProductItem,
  TopProductsView,
  SaleDraftItemView,
  SaleDraftView,
  SaleItemView,
  SaleRefundView,
  SaleSummaryView,
  SaleView,
  SaleVoidView,
  SalesSeriesPoint,
  SalesSeriesView,
} from '../data/types';
import { ApiError } from './apiError';
import { dayKey, normalizeText, vnd } from './format';
import { canonicalJson } from './idempotency';
import type { PageResponse } from './pageApi';

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
/** Khoản hoàn của đơn đã huỷ, theo saleId (mỗi đơn tối đa một khoản) */
const refunds = new Map<number, SaleRefundView>();
/** Lúc huỷ của đơn đã huỷ, theo saleId — Core lưu voidedAt nhưng `SaleView` không trả, báo cáo cần để tính doanh thu bị huỷ */
const saleVoidedAt = new Map<number, string>();
/** Inbox thông báo của OWNER (mới nhất cuối mảng; endpoint trả mới nhất trước) */
let notifications: NotificationView[] = [];

let nextCategoryId = 1;
let nextProductId = 1;
let nextDraftId = 1;
let nextDraftItemId = 1;
let nextSaleId = 1;
let nextPaymentId = 1;
let nextCustomerId = 1;
let nextDebtId = 1;
let nextExpenseId = 1;
let nextRefundId = 1;
let nextNotificationId = 1;

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

/** Tách query string thành các cặp khoá/giá trị đã giải mã. */
function parseQuery(rawQuery: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const pair of rawQuery.split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent(eq < 0 ? pair : pair.slice(0, eq));
    params[key] = eq < 0 ? '' : decodeURIComponent(pair.slice(eq + 1));
  }
  return params;
}

/**
 * Cắt một danh sách (đã lọc và sắp xếp) thành `PageResponse` như sáu GET danh sách OWNER của Core (mặc định page=0, size=20,
 * size 1–100, sai thì 400 với mã `invalid_*_query` của danh sách đó). Bộ lọc của `/sales` và `/products` xem
 * `filterSales`/`filterProducts`; các danh sách khác mock chưa lọc.
 */
function pageOf<T>(items: T[], rawQuery: string, errorCode: string): PageResponse<T> {
  const params = parseQuery(rawQuery);
  const page = params.page === undefined ? 0 : Number(params.page);
  const size = params.size === undefined ? 20 : Number(params.size);
  if (!Number.isInteger(page) || page < 0) throw apiErr(400, errorCode, 'page phải là số nguyên không âm.');
  if (!Number.isInteger(size) || size < 1 || size > 100) throw apiErr(400, errorCode, 'size phải là số nguyên từ 1 đến 100.');
  return {
    items: items.slice(page * size, (page + 1) * size),
    page,
    size,
    totalElements: items.length,
    totalPages: Math.ceil(items.length / size),
  };
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
    // Dữ liệu mẫu giữ mốc 6 mà bản mock cũ dùng để báo sắp hết
    lowStockThreshold: p.tracked ? 6 : null,
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

// ---------------------------------------------------------------------------
// Inbox thông báo — mô phỏng GET/PATCH /me/notifications (contract mục 8)
// ---------------------------------------------------------------------------

const NOTIFICATION_TYPES: NotificationType[] = ['LOW_STOCK', 'OUT_OF_STOCK', 'SALE_VOIDED', 'SHOP_INACTIVATED', 'SHOP_REACTIVATED'];

function pushNotification(
  type: NotificationType,
  title: string,
  body: string,
  targetType: NotificationView['targetType'],
  targetId: number,
  createdAt = nowIso(),
  extra: Partial<Pick<NotificationView, 'readAt' | 'resolvedAt'>> = {},
): void {
  notifications.push({
    id: nextNotificationId++,
    shopId: SHOP_ID,
    type,
    title,
    body,
    targetType,
    targetId,
    createdAt,
    readAt: extra.readAt ?? null,
    resolvedAt: extra.resolvedAt ?? null,
  });
}

/**
 * Dữ liệu đầu: cảnh báo đang mở cho các món tồn thấp, cộng lịch sử cảnh báo đã kết thúc để màn Thông báo có nhiều hơn một trang.
 * Mock không tự phát thêm cảnh báo tồn khi bạn đổi sản phẩm hay bán hàng (Core thì có); chỉ đơn bị huỷ mới tạo thông báo mới.
 */
function seedNotifications(): void {
  const now = Date.now();
  const daysAgo = (days: number, hour: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - days);
    d.setHours(hour, 0, 0, 0);
    return d;
  };
  const draft: Array<Parameters<typeof pushNotification>> = [];
  products.filter((p) => p.tracked).forEach((p, i) => {
    const stock = p.stockQuantity ?? 0;
    // Như Core: hết hàng luôn báo, sắp hết chỉ khi mặt hàng có ngưỡng và tồn chạm ngưỡng đó
    if (stock <= 0 || (p.lowStockThreshold != null && stock <= p.lowStockThreshold)) {
      const out = stock <= 0;
      draft.push([
        out ? 'OUT_OF_STOCK' : 'LOW_STOCK',
        out ? 'Sản phẩm đã hết hàng' : 'Sản phẩm sắp hết hàng',
        out ? `${p.name} đã hết hàng.` : `${p.name} chỉ còn ${stock} ${p.unit}.`,
        'PRODUCT',
        p.id,
        daysAgo(0, 7).toISOString(),
        {},
      ]);
    }
    const created = daysAgo(2 + (i % 26), 7 + (i % 10));
    draft.push([
      'LOW_STOCK',
      'Sản phẩm sắp hết hàng',
      `${p.name} chỉ còn ${1 + (i % 5)} ${p.unit}.`,
      'PRODUCT',
      p.id,
      created.toISOString(),
      { resolvedAt: new Date(created.getTime() + 86400000).toISOString(), readAt: i % 5 === 0 ? null : created.toISOString() },
    ]);
  });
  draft.sort((a, b) => String(a[5]).localeCompare(String(b[5])));
  for (const args of draft) pushNotification(...args);
}
seedNotifications();

type NotificationParams = Map<string, string>;

function badNotificationQuery(message: string): ApiError {
  return apiErr(400, 'invalid_notification_query', message);
}

function visibleNotifications(params: NotificationParams): NotificationView[] {
  const rawShopId = params.get('shopId');
  const shopId = rawShopId === undefined ? undefined : Number(rawShopId);
  if (shopId !== undefined && (!Number.isInteger(shopId) || shopId <= 0)) {
    throw apiErr(400, 'invalid_shop_id', 'shopId must be a positive integer.');
  }
  // Mock chỉ có một tiệm của OWNER; tiệm khác không phải của họ nên Core trả 403
  if (shopId !== undefined && shopId !== SHOP_ID) throw apiErr(403, 'shop_access_denied', 'This shop is not available to the current owner.');
  const type = params.get('type');
  if (type !== undefined && !NOTIFICATION_TYPES.includes(type as NotificationType)) {
    throw apiErr(400, 'validation_failed', 'type is not a notification type.');
  }
  const unreadOnly = params.get('unreadOnly');
  if (unreadOnly !== undefined && unreadOnly !== 'true' && unreadOnly !== 'false') {
    throw apiErr(400, 'validation_failed', 'unreadOnly must be true or false.');
  }
  return notifications.filter((n) => (!type || n.type === type) && (unreadOnly !== 'true' || n.readAt === null));
}

function listNotifications(params: NotificationParams): NotificationPage {
  const rows = visibleNotifications(params);
  const page = params.has('page') ? Number(params.get('page')) : 0;
  const size = params.has('size') ? Number(params.get('size')) : 20;
  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100) {
    throw badNotificationQuery('page must be 0 or more and size must be between 1 and 100.');
  }
  const sorted = [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  return {
    items: sorted.slice(page * size, page * size + size),
    page,
    size,
    totalElements: sorted.length,
    totalPages: Math.ceil(sorted.length / size),
  };
}

/** Như Core: ID không thấy thì 404 và cả lô không đổi; đánh dấu lại không đổi `readAt` đầu tiên. */
function markNotificationsRead(ids: unknown, single = false): undefined {
  if (single) {
    const id = (ids as number[])[0];
    if (!Number.isInteger(id) || id <= 0) throw badNotificationQuery('Notification id must be positive.');
  } else if (!Array.isArray(ids) || ids.length < 1 || ids.length > 100 || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw apiErr(400, 'validation_failed', 'ids must contain 1 to 100 positive notification ids.');
  }
  const unique = Array.from(new Set(ids as number[]));
  const found = unique.map((id) => notifications.find((n) => n.id === id));
  if (found.some((n) => !n)) throw apiErr(404, 'notification_not_found', 'This notification is unavailable.');
  const at = nowIso();
  for (const n of found as NotificationView[]) if (n.readAt === null) n.readAt = at;
  return undefined;
}

function handleNotifications(path: string, method: string, body: unknown): unknown {
  const [pathname, queryText = ''] = path.split('?');
  const params: NotificationParams = new Map(
    queryText
      .split('&')
      .filter(Boolean)
      .map((pair) => {
        const [key, value = ''] = pair.split('=');
        return [decodeURIComponent(key), decodeURIComponent(value)] as [string, string];
      }),
  );
  const parts = pathname.split('/').filter(Boolean); // ['me', 'notifications', ...]
  if (parts.length === 2 && method === 'GET') return listNotifications(params);
  if (parts.length === 3 && parts[2] === 'unread-count' && method === 'GET') {
    return { unreadCount: visibleNotifications(params).filter((n) => n.readAt === null).length };
  }
  if (parts.length === 3 && parts[2] === 'read' && method === 'PATCH') {
    return markNotificationsRead((body as { ids?: unknown } | undefined)?.ids);
  }
  if (parts.length === 4 && parts[3] === 'read' && method === 'PATCH') return markNotificationsRead([Number(parts[2])], true);
  throw apiErr(404, 'not_found', `Mock Core does not implement ${method} ${path}.`);
}

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
  lowStockThreshold?: number | null;
}

/** PATCH /products/{id}: không có stockQuantity và imageUrl; hai trường đó có trong kiểu để mock từ chối giống Core. */
interface ProductPatchBody {
  categoryId?: number | null;
  name?: string;
  barcode?: string | null;
  unit?: string;
  sellingPriceVnd?: number;
  costPriceVnd?: number | null;
  tracked?: boolean;
  lowStockThreshold?: number | null;
  stockQuantity?: number | null;
  imageUrl?: string | null;
}

interface StockInBody {
  quantity: number;
  reason?: string | null;
}

function listProducts(): ProductView[] {
  return products.filter((p) => p.status === 'ACTIVE');
}

/** Từ khoá `q` như Core: bỏ khoảng trắng hai đầu, rỗng là không lọc, tối đa 200 ký tự. */
function queryText(params: Record<string, string>, errorCode: string): string {
  const q = (params.q ?? '').trim();
  if (q.length > 200) throw apiErr(400, errorCode, 'q không được dài quá 200 ký tự.');
  return q;
}

/** `GET /products` như Core: tìm tên/mã vạch không phân biệt hoa thường và dấu, lọc nhóm và tồn, rồi sắp xếp. */
function filterProducts(rawQuery: string): ProductView[] {
  const params = parseQuery(rawQuery);
  const q = normalizeText(queryText(params, 'invalid_product_query'));
  const categoryId = params.categoryId === undefined ? null : Number(params.categoryId);
  if (categoryId !== null && (!Number.isInteger(categoryId) || categoryId <= 0)) {
    throw apiErr(400, 'invalid_product_query', 'categoryId phải là số nguyên dương.');
  }
  const stockStatus = params.stockStatus;
  if (stockStatus !== undefined && !['LOW', 'OUT', 'NEEDS_RESTOCK'].includes(stockStatus)) {
    throw apiErr(400, 'validation_failed', 'stockStatus không hợp lệ.');
  }
  const sort = params.sort ?? 'ID_ASC';
  if (!['ID_ASC', 'NAME_ASC', 'PRICE_ASC', 'STOCK_DESC'].includes(sort)) throw apiErr(400, 'validation_failed', 'sort không hợp lệ.');

  // Lọc tồn chỉ xét món theo dõi tồn: OUT khi tồn 0; LOW khi tồn dương mà không quá ngưỡng riêng của món (có đặt ngưỡng)
  const isOut = (p: ProductView) => p.tracked && (p.stockQuantity ?? 0) <= 0;
  const isLow = (p: ProductView) =>
    p.tracked && (p.stockQuantity ?? 0) > 0 && p.lowStockThreshold != null && (p.stockQuantity ?? 0) <= p.lowStockThreshold;
  const filtered = listProducts().filter((p) => {
    if (q && !normalizeText(p.name).includes(q) && !normalizeText(p.barcode ?? '').includes(q)) return false;
    if (categoryId !== null && p.categoryId !== categoryId) return false;
    if (stockStatus === 'OUT' && !isOut(p)) return false;
    if (stockStatus === 'LOW' && !isLow(p)) return false;
    if (stockStatus === 'NEEDS_RESTOCK' && !isOut(p) && !isLow(p)) return false;
    return true;
  });
  const byId = (a: ProductView, b: ProductView) => a.id - b.id;
  return filtered.sort((a, b) => {
    if (sort === 'NAME_ASC') return a.name.localeCompare(b.name, 'vi') || byId(a, b);
    if (sort === 'PRICE_ASC') return a.sellingPriceVnd - b.sellingPriceVnd || byId(a, b);
    if (sort === 'STOCK_DESC') {
      // Tồn giảm dần, món không có số tồn xếp cuối
      if (a.stockQuantity == null || b.stockQuantity == null) return (a.stockQuantity == null ? 1 : 0) - (b.stockQuantity == null ? 1 : 0) || byId(a, b);
      return b.stockQuantity - a.stockQuantity || byId(a, b);
    }
    return byId(a, b);
  });
}

/**
 * Như Core (CORE-012): bỏ khoảng trắng hai đầu (kể cả CR/LF/TAB máy quét gửi kèm), chuỗi rỗng nghĩa là không có mã. Mã giữ
 * nguyên từng ký tự, không chứa khoảng trắng hay ký tự điều khiển bên trong và dài tối đa 100 ký tự; sai thì 400.
 */
function normalizeBarcode(raw: string | null | undefined): string | null {
  const code = (raw ?? '').trim();
  if (!code) return null;
  if (/[\s\p{Cc}]/u.test(code) || [...code].length > 100) {
    throw new ApiError(400, 'validation_failed', 'barcode is invalid.', undefined, [{ field: 'barcode', issue: 'invalid' }]);
  }
  return code;
}

/**
 * Mã vạch là duy nhất giữa các sản phẩm đang bán của tiệm; món đã ẩn nhả mã để dùng lại. Trùng thì 409 kèm món đang giữ
 * mã, như Core.
 */
function assertBarcodeFree(barcode: string | null, exceptId?: number): void {
  const holder = barcode ? products.find((p) => p.status === 'ACTIVE' && p.id !== exceptId && p.barcode === barcode) : undefined;
  if (holder) {
    throw new ApiError(409, 'product_barcode_conflict', 'The product barcode is already in use in this shop.', undefined, [
      { field: 'barcode', issue: 'already_in_use', productId: holder.id, status: 'ACTIVE' },
    ]);
  }
}

/** GET /products/lookup?barcode=: khớp chính xác, chỉ sản phẩm ACTIVE; thiếu mã hoặc mã không hợp lệ thì 400, chưa có thì 404. */
function lookupProduct(rawQuery: string): ProductView {
  const barcode = normalizeBarcode(new URLSearchParams(rawQuery).get('barcode'));
  if (!barcode) {
    throw new ApiError(400, 'validation_failed', 'barcode is required.', undefined, [{ field: 'barcode', issue: 'required' }]);
  }
  const product = products.find((p) => p.status === 'ACTIVE' && p.barcode === barcode);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  return { ...product };
}

function createProduct(body: ProductWriteBody): ProductView {
  if (body.imageUrl) {
    throw apiErr(400, 'product_image_url_unsupported', 'Product images are uploaded through the image endpoint.');
  }
  if (body.tracked && (body.stockQuantity == null || body.stockQuantity < 0)) {
    throw apiErr(400, 'validation_failed', 'stockQuantity is required and must be 0 or more when tracked is true.');
  }
  if (!body.tracked && body.stockQuantity != null) {
    throw apiErr(400, 'validation_failed', 'stockQuantity must be empty when tracked is false.');
  }
  if (body.lowStockThreshold != null && body.lowStockThreshold < 0) {
    throw apiErr(400, 'validation_failed', 'lowStockThreshold must be 0 or more.');
  }
  const barcode = normalizeBarcode(body.barcode);
  assertBarcodeFree(barcode);
  const now = nowIso();
  const product: ProductView = {
    id: nextProductId++,
    shopId: SHOP_ID,
    categoryId: body.categoryId ?? null,
    name: body.name,
    barcode,
    imageUrl: null,
    unit: body.unit,
    sellingPriceVnd: body.sellingPriceVnd,
    costPriceVnd: body.costPriceVnd ?? null,
    tracked: body.tracked,
    stockQuantity: body.tracked ? (body.stockQuantity ?? 0) : null,
    lowStockThreshold: body.lowStockThreshold ?? null,
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
  };
  products.push(product);
  return product;
}

/** Giống PATCH của Core: bỏ trường = giữ nguyên, tồn chỉ đổi qua stock-in, đổi theo dõi tồn thì tồn về 0 hoặc bị xoá. */
function updateProduct(id: number, body: ProductPatchBody): ProductView {
  const product = findActiveProduct(id);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  if (body.stockQuantity !== undefined) {
    throw apiErr(400, 'invalid_request', 'stockQuantity cannot be changed with PATCH; use stock-in.');
  }
  if (body.imageUrl !== undefined) {
    throw apiErr(400, 'product_image_url_unsupported', 'Product images are uploaded through the image endpoint.');
  }
  if (body.name !== undefined && !String(body.name).trim()) throw apiErr(400, 'validation_failed', 'name must not be empty.');
  if (body.unit !== undefined && !String(body.unit).trim()) throw apiErr(400, 'validation_failed', 'unit must not be empty.');
  if (body.sellingPriceVnd !== undefined && !(body.sellingPriceVnd >= 0)) {
    throw apiErr(400, 'validation_failed', 'sellingPriceVnd must be 0 or more.');
  }
  if (body.lowStockThreshold != null && body.lowStockThreshold < 0) {
    throw apiErr(400, 'validation_failed', 'lowStockThreshold must be 0 or more.');
  }
  // Chỉ kiểm tra khi mã thật sự đổi: giữ nguyên mã của chính món đang sửa là hợp lệ
  if (body.barcode !== undefined && normalizeBarcode(body.barcode) !== product.barcode) {
    assertBarcodeFree(normalizeBarcode(body.barcode), product.id);
  }
  if (body.categoryId !== undefined) product.categoryId = body.categoryId;
  if (body.name !== undefined) product.name = body.name;
  if (body.barcode !== undefined) product.barcode = normalizeBarcode(body.barcode);
  if (body.unit !== undefined) product.unit = body.unit;
  if (body.sellingPriceVnd !== undefined) product.sellingPriceVnd = body.sellingPriceVnd;
  if (body.costPriceVnd !== undefined) product.costPriceVnd = body.costPriceVnd;
  if (body.lowStockThreshold !== undefined) product.lowStockThreshold = body.lowStockThreshold;
  if (body.tracked !== undefined && body.tracked !== product.tracked) {
    product.tracked = body.tracked;
    product.stockQuantity = body.tracked ? 0 : null;
  }
  product.updatedAt = nowIso();
  return product;
}

/** POST /products/{id}/stock-in: cộng tồn cho mặt hàng đang theo dõi tồn; trả bản chụp mặt hàng sau khi cộng. */
function stockInProduct(id: number, body: StockInBody): ProductView {
  const product = findActiveProduct(id);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  if (typeof body.quantity !== 'number' || !(body.quantity > 0)) {
    throw apiErr(400, 'validation_failed', 'quantity must be greater than 0.');
  }
  if ((body.reason ?? '').trim().length > 500) throw apiErr(400, 'validation_failed', 'reason must be 500 characters or fewer.');
  // Core: quantity tối đa 12 chữ số nguyên và 3 chữ số thập phân; đếm theo phần nghìn để khỏi sai số số thực.
  const thousandths = body.quantity * 1000;
  if (!Number.isFinite(thousandths) || Math.abs(thousandths - Math.round(thousandths)) > 1e-6 || Math.round(thousandths) > 999999999999999) {
    throw apiErr(400, 'validation_failed', 'quantity must have at most 12 integer digits and 3 decimal places.');
  }
  if (!product.tracked) throw apiErr(409, 'product_stock_in_unavailable', 'This product does not track stock.');
  // Tổng tồn vượt 999999999999.999 thì Core từ chối và không đổi dữ liệu.
  if (Math.round(((product.stockQuantity ?? 0) + body.quantity) * 1000) > 999999999999999) {
    throw apiErr(409, 'product_stock_overflow', 'The resulting stock exceeds the supported maximum.');
  }
  product.stockQuantity = (product.stockQuantity ?? 0) + body.quantity;
  product.updatedAt = nowIso();
  return { ...product };
}

/** POST /products/{id}/image: bản mock không lưu file, chỉ giữ địa chỉ ảnh xem trước của máy để hiện lại. */
function setProductImage(id: number, body: { imageUri?: string } | undefined): ProductView {
  const product = findActiveProduct(id);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  if (!body?.imageUri) throw apiErr(400, 'image_required', 'An image file is required.');
  product.imageUrl = body.imageUri;
  product.updatedAt = nowIso();
  return { ...product };
}

/** DELETE /products/{id}/image: chưa có ảnh thì vẫn thành công (204), như Core. */
function deleteProductImage(id: number): void {
  const product = findActiveProduct(id);
  if (!product) throw apiErr(404, 'product_not_found', 'This product is unavailable.');
  product.imageUrl = null;
  product.updatedAt = nowIso();
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
  /** Bỏ trống hoặc null = món tuỳ ý, khi đó phải có `productName` và `unit` */
  productId?: number | null;
  quantity: number;
  unitPriceVnd: number;
  productName?: string | null;
  unit?: string | null;
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
    // Như Core (`SaleDraftItemRequest`): số lượng dương, đơn giá là số nguyên từ 0, cho mọi dòng kể cả món tuỳ ý
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) {
      throw apiErr(400, 'validation_failed', 'quantity must be greater than 0.');
    }
    if (!Number.isInteger(item.unitPriceVnd) || item.unitPriceVnd < 0) {
      throw apiErr(400, 'validation_failed', 'unitPriceVnd must be 0 or more.');
    }
    const lineTotalVnd = Math.round(item.unitPriceVnd * item.quantity);
    if (item.productId == null) {
      // Món tuỳ ý: phải có tên và đơn vị. Core không tạo mặt hàng, không trừ tồn và coi mỗi dòng là độc lập.
      const productName = normalizeOrNull(item.productName);
      const unit = normalizeOrNull(item.unit);
      if (!productName || !unit || productName.length > 255 || unit.length > 50) {
        throw apiErr(400, 'draft_item_invalid', 'A custom draft item needs a product name and a unit.');
      }
      subtotal += lineTotalVnd;
      return { id: nextDraftItemId++, productId: null, productName, unit, quantity: item.quantity, unitPriceVnd: item.unitPriceVnd, lineTotalVnd };
    }
    // Món trong danh mục lấy tên và đơn vị từ mặt hàng: gửi kèm tên hoặc đơn vị bị từ chối như ở Core thật.
    if (normalizeOrNull(item.productName) || normalizeOrNull(item.unit)) {
      throw apiErr(400, 'draft_item_invalid', 'A catalog draft item must not carry a product name or unit.');
    }
    if (seenProductIds.has(item.productId)) throw apiErr(400, 'draft_item_duplicate', 'A product may appear only once in a draft.');
    seenProductIds.add(item.productId);
    const product = findActiveProduct(item.productId);
    if (!product) throw apiErr(400, 'draft_item_invalid', 'Every draft item must reference an active product in this shop.');
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

function getSaleDraft(id: number): SaleDraftView {
  const draft = saleDrafts.find((d) => d.id === id);
  if (!draft) throw apiErr(404, 'draft_not_found', 'This draft is unavailable.');
  return draft;
}

/** Chỉ huỷ được nháp còn DRAFT — nháp đã chốt/đã huỷ thì Core trả 409 `draft_not_editable`. */
function cancelSaleDraft(id: number): void {
  const draft = getSaleDraft(id);
  if (draft.status !== 'DRAFT') throw apiErr(409, 'draft_not_editable', 'Only a current draft can be changed.');
  draft.status = 'CANCELLED';
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
    if (item.productId == null) continue; // món tuỳ ý không có mặt hàng và không có tồn
    const product = findActiveProduct(item.productId);
    if (!product) throw apiErr(400, 'draft_item_invalid', 'Every draft item must reference an active product in this shop.');
    if (product.tracked && (product.stockQuantity == null || product.stockQuantity < item.quantity)) {
      throw apiErr(409, 'product_stock_insufficient', 'Tracked product stock is insufficient.');
    }
  }
  const now = nowIso();
  for (const item of draft.items) {
    if (item.productId == null) continue;
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

/** Mốc thời gian `from`/`to` của một danh sách: ISO 8601 có múi giờ, sai định dạng thì 400 như Core. */
function queryInstant(value: string | undefined, field: string): number | null {
  if (value === undefined) return null;
  const at = Date.parse(value);
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(at)) {
    throw new ApiError(400, 'validation_failed', `${field} phải là thời điểm ISO 8601 có múi giờ.`, undefined, [{ field, issue: 'invalid' }]);
  }
  return at;
}

/**
 * `GET /sales` như Core: đơn có soldAt trong `[from, to)`, lọc trạng thái, tìm theo tên khách/tên món (không phân biệt dấu)
 * hoặc đúng mã đơn dạng số; mới bán trước (soldAt giảm, id giảm).
 */
function filterSales(rawQuery: string): SaleView[] {
  const params = parseQuery(rawQuery);
  const from = queryInstant(params.from, 'from');
  const to = queryInstant(params.to, 'to');
  if (from !== null && to !== null && from >= to) throw apiErr(400, 'invalid_sale_query', 'from phải trước to.');
  const status = params.saleStatus;
  if (status !== undefined && status !== 'CONFIRMED' && status !== 'VOIDED') throw apiErr(400, 'validation_failed', 'saleStatus không hợp lệ.');
  const raw = queryText(params, 'invalid_sale_query');
  const q = normalizeText(raw);
  const idQuery = /^\d+$/.test(raw) ? Number(raw) : null;
  return sales
    .filter((s) => {
      const soldAt = Date.parse(s.soldAt);
      if (from !== null && soldAt < from) return false;
      if (to !== null && soldAt >= to) return false;
      if (status && s.saleStatus !== status) return false;
      if (!q) return true;
      if (idQuery !== null && s.id === idQuery) return true;
      return normalizeText(`${s.customerName ?? ''} ${s.items.map((item) => item.productName).join(' ')}`).includes(q);
    })
    .sort((a, b) => Date.parse(b.soldAt) - Date.parse(a.soldAt) || b.id - a.id);
}

/** `GET /sales/summary` như Core: cùng bộ lọc với `GET /sales`, tổng theo trạng thái hiện tại của đơn. */
function summarizeSales(rawQuery: string): SaleSummaryView {
  const matched = filterSales(rawQuery);
  const confirmed = matched.filter((s) => s.saleStatus === 'CONFIRMED');
  const voided = matched.filter((s) => s.saleStatus === 'VOIDED');
  return {
    matchedOrderCount: matched.length,
    confirmedOrderCount: confirmed.length,
    voidedOrderCount: voided.length,
    confirmedSalesVnd: confirmed.reduce((sum, s) => sum + s.totalVnd, 0),
    voidedSalesVnd: voided.reduce((sum, s) => sum + s.totalVnd, 0),
  };
}

/** Cửa sổ `[from, to)` của một kỳ báo cáo theo giờ máy (Core tính theo giờ Việt Nam). */
function reportWindow(rawQuery: string): { period: ReportPeriod; from: Date; to: Date } {
  const period = (parseQuery(rawQuery).period ?? 'today') as ReportPeriod;
  const now = new Date();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
  const tomorrow = day(1);
  switch (period) {
    case 'today':
      return { period, from: day(0), to: tomorrow };
    case 'yesterday':
      return { period, from: day(-1), to: day(0) };
    case 'this_week':
      return { period, from: day(-((now.getDay() + 6) % 7)), to: tomorrow };
    case 'week':
      return { period, from: day(-6), to: tomorrow };
    case 'month':
      return { period, from: new Date(now.getFullYear(), now.getMonth(), 1), to: tomorrow };
    case 'year':
      return { period, from: new Date(now.getFullYear(), 0, 1), to: tomorrow };
    default:
      throw apiErr(400, 'invalid_report_period', 'Kỳ báo cáo không hợp lệ.');
  }
}

/** Doanh thu và số đơn của một khoảng: đơn bán theo soldAt (kể cả đơn sau đó bị huỷ), đơn bị huỷ theo lúc huỷ. */
function salesTotals(from: Date, to: Date): Omit<SalesSeriesPoint, 'date'> {
  const within = (iso: string | undefined) => !!iso && Date.parse(iso) >= from.getTime() && Date.parse(iso) < to.getTime();
  const sold = sales.filter((s) => within(s.soldAt));
  const voided = sales.filter((s) => s.saleStatus === 'VOIDED' && within(saleVoidedAt.get(s.id) ?? s.soldAt));
  const gross = sold.reduce((sum, s) => sum + s.totalVnd, 0);
  const voidedVnd = voided.reduce((sum, s) => sum + s.totalVnd, 0);
  return {
    grossRevenueVnd: gross,
    voidedRevenueVnd: voidedVnd,
    netRevenueVnd: gross - voidedVnd,
    orderCount: sold.length,
    voidedOrderCount: voided.length,
  };
}

function reportSummary(rawQuery: string): ReportSummaryView {
  const { period, from, to } = reportWindow(rawQuery);
  const within = (iso: string) => Date.parse(iso) >= from.getTime() && Date.parse(iso) < to.getTime();
  return {
    period,
    fromInclusive: from.toISOString(),
    toExclusive: to.toISOString(),
    ...salesTotals(from, to),
    collectedVnd: payments.filter((p) => within(p.receivedAt)).reduce((sum, p) => sum + p.amountVnd, 0),
    refundedVnd: [...refunds.values()].filter((r) => within(r.refundedAt)).reduce((sum, r) => sum + r.amountVnd, 0),
    expenseVnd: expenses.filter((e) => e.status === 'ACTIVE' && within(e.expenseAt)).reduce((sum, e) => sum + e.amountVnd, 0),
    currentOutstandingDebtVnd: debts.filter((d) => d.status === 'OPEN').reduce((sum, d) => sum + d.outstandingVnd, 0),
  };
}

/**
 * `/reports/top-products` như Core: món trong danh mục gộp theo productId, món tuỳ ý theo tên + đơn vị; bán theo soldAt,
 * huỷ theo lúc huỷ; doanh thu dòng chia theo tỷ lệ thành tiền trên tổng đơn (sau giảm giá).
 */
function reportTopProducts(rawQuery: string): TopProductsView {
  const { period, from, to } = reportWindow(rawQuery);
  const params = parseQuery(rawQuery);
  const limit = params.limit === undefined ? 10 : Number(params.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw apiErr(400, 'invalid_report_query', 'limit phải từ 1 đến 100.');
  const sortBy = params.sortBy ?? 'NET_REVENUE';
  if (sortBy !== 'QUANTITY' && sortBy !== 'NET_REVENUE') throw apiErr(400, 'validation_failed', 'sortBy không hợp lệ.');
  const within = (iso: string | undefined) => !!iso && Date.parse(iso) >= from.getTime() && Date.parse(iso) < to.getTime();
  const rows = new Map<string, TopProductItem>();
  const add = (sale: SaleView, sign: 'gross' | 'voided') => {
    const lineSum = sale.items.reduce((sum, item) => sum + item.lineTotalVnd, 0) || 1;
    for (const item of sale.items) {
      const key = item.productId != null ? `P${item.productId}` : `C${item.productName.trim().toLowerCase()}|${item.unit.trim()}`;
      const row = rows.get(key) ?? {
        itemKey: key,
        productId: item.productId,
        productName: item.productName,
        unit: item.unit,
        source: item.productId != null ? ('CATALOG' as const) : ('CUSTOM' as const),
        grossQuantity: 0,
        voidedQuantity: 0,
        netQuantity: 0,
        grossRevenueVnd: 0,
        voidedRevenueVnd: 0,
        netRevenueVnd: 0,
      };
      const revenue = Math.round((sale.totalVnd * item.lineTotalVnd) / lineSum);
      if (sign === 'gross') {
        row.grossQuantity += item.quantity;
        row.grossRevenueVnd += revenue;
      } else {
        row.voidedQuantity += item.quantity;
        row.voidedRevenueVnd += revenue;
      }
      row.netQuantity = row.grossQuantity - row.voidedQuantity;
      row.netRevenueVnd = row.grossRevenueVnd - row.voidedRevenueVnd;
      rows.set(key, row);
    }
  };
  for (const s of sales) {
    if (within(s.soldAt)) add(s, 'gross');
    if (s.saleStatus === 'VOIDED' && within(saleVoidedAt.get(s.id) ?? s.soldAt)) add(s, 'voided');
  }
  const metric = (r: TopProductItem) => (sortBy === 'QUANTITY' ? r.netQuantity : r.netRevenueVnd);
  const items = [...rows.values()].sort((a, b) => metric(b) - metric(a) || a.itemKey.localeCompare(b.itemKey)).slice(0, limit);
  return { period, fromInclusive: from.toISOString(), toExclusive: to.toISOString(), sortBy, items };
}

/**
 * `/reports/profit-estimate` gần đúng: Core chụp giá vốn lúc bán, mock không lưu nên dùng giá vốn hiện tại của món; món
 * không có giá vốn (hoặc món tuỳ ý) tính vào phần thiếu giá vốn và làm `isComplete=false`. Chỉ dùng để thử giao diện.
 */
function reportProfitEstimate(rawQuery: string): ProfitEstimateView {
  const { period, from, to } = reportWindow(rawQuery);
  const within = (iso: string | undefined) => !!iso && Date.parse(iso) >= from.getTime() && Date.parse(iso) < to.getTime();
  const totals = salesTotals(from, to);
  let grossCogs = 0;
  let voidedCogs = 0;
  let unknownCount = 0;
  let unknownRevenue = 0;
  const cost = (sale: SaleView, into: 'gross' | 'voided') => {
    for (const item of sale.items) {
      const unitCost = item.productId != null ? products.find((p) => p.id === item.productId)?.costPriceVnd ?? null : null;
      if (unitCost == null) {
        unknownCount += 1;
        unknownRevenue += item.lineTotalVnd;
        continue;
      }
      if (into === 'gross') grossCogs += Math.round(unitCost * item.quantity);
      else voidedCogs += Math.round(unitCost * item.quantity);
    }
  };
  for (const s of sales) {
    if (within(s.soldAt)) cost(s, 'gross');
    if (s.saleStatus === 'VOIDED' && within(saleVoidedAt.get(s.id) ?? s.soldAt)) cost(s, 'voided');
  }
  const expenseVnd = expenses.filter((e) => e.status === 'ACTIVE' && within(e.expenseAt)).reduce((sum, e) => sum + e.amountVnd, 0);
  const netCogs = grossCogs - voidedCogs;
  const grossProfit = totals.netRevenueVnd - netCogs;
  return {
    period,
    fromInclusive: from.toISOString(),
    toExclusive: to.toISOString(),
    grossRevenueVnd: totals.grossRevenueVnd,
    voidedRevenueVnd: totals.voidedRevenueVnd,
    netRevenueVnd: totals.netRevenueVnd,
    grossEstimatedCogsVnd: grossCogs,
    voidedEstimatedCogsVnd: voidedCogs,
    netEstimatedCogsVnd: netCogs,
    estimatedGrossProfitVnd: grossProfit,
    expenseVnd,
    estimatedOperatingProfitVnd: grossProfit - expenseVnd,
    isComplete: unknownCount === 0,
    unknownCostItemCount: unknownCount,
    unknownCostRevenueVnd: unknownRevenue,
  };
}

function reportSalesSeries(rawQuery: string): SalesSeriesView {
  const { period, from, to } = reportWindow(rawQuery);
  const items: SalesSeriesPoint[] = [];
  for (let day = from; day < to; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    items.push({ date: dayKey(day), ...salesTotals(day, next < to ? next : to) });
  }
  return { period, fromInclusive: from.toISOString(), toExclusive: to.toISOString(), granularity: 'DAY', items };
}

function getSaleById(id: number): SaleView {
  const sale = sales.find((s) => s.id === id);
  if (!sale) throw apiErr(404, 'sale_not_found', 'This sale is unavailable.');
  return sale;
}

function listPaymentsForSale(saleId: number): PaymentView[] {
  return payments.filter((p) => p.saleId === saleId);
}

interface SaleVoidBody {
  reason?: string | null;
  restockItems?: boolean | null;
  refundMethod?: 'CASH' | 'TRANSFER' | null;
  transferReference?: string | null;
}

/**
 * Huỷ cả đơn, bám SaleVoidServiceImpl#voidSale của Core thật: hoàn TOÀN BỘ tiền đã thu, huỷ nợ OPEN còn dư, tuỳ chọn hoàn
 * kho; mọi kiểm tra chạy trước khi đổi dữ liệu nên lỗi thì không đổi gì. Khác Core ở một điểm: mock không giữ ảnh chụp
 * "đã trừ kho" của từng dòng, nên coi dòng nào có sản phẩm đang theo dõi tồn là đã trừ kho.
 */
function voidSale(id: number, body: SaleVoidBody): SaleVoidView {
  const reason = body.reason?.trim();
  if (!reason || reason.length > 500) throw apiErr(400, 'validation_failed', 'reason must contain 1 to 500 characters.');
  if (typeof body.restockItems !== 'boolean') {
    throw apiErr(400, 'validation_failed', 'Choose whether returned items should be restocked.');
  }
  if (body.refundMethod != null && body.refundMethod !== 'CASH' && body.refundMethod !== 'TRANSFER') {
    throw apiErr(400, 'validation_failed', 'refundMethod must be CASH or TRANSFER.');
  }
  if (body.transferReference != null && body.transferReference.length > 255) {
    throw apiErr(400, 'validation_failed', 'transferReference must not exceed 255 characters.');
  }

  const sale = sales.find((s) => s.id === id);
  if (!sale) throw apiErr(404, 'sale_not_found', 'This sale is unavailable.');
  if (sale.saleStatus !== 'CONFIRMED') throw apiErr(409, 'sale_already_voided', 'This sale has already been voided.');

  const received = payments.filter((p) => p.saleId === id).reduce((sum, p) => sum + p.amountVnd, 0);
  if (received !== sale.paidVnd) {
    throw apiErr(409, 'sale_payment_mismatch', 'Sale payments do not match the recorded paid amount.');
  }
  if (received > 0 && !body.refundMethod) {
    throw apiErr(400, 'sale_refund_method_required', 'A refund method is required when the sale has received payment.');
  }
  if (received === 0 && body.refundMethod) {
    throw apiErr(400, 'sale_refund_method_invalid', 'Do not provide a refund method for a sale with no payment.');
  }

  const restores: Array<{ product: ProductView; quantity: number }> = [];
  if (body.restockItems) {
    for (const item of sale.items) {
      if (item.productId == null) continue; // món tuỳ ý chưa từng trừ tồn nên không có gì để hoàn
      const product = products.find((p) => p.id === item.productId);
      if (!product) {
        throw apiErr(409, 'sale_restock_unavailable', 'Stock cannot be safely restored for this sale item; void without restocking.');
      }
      if (product.tracked && product.stockQuantity != null) restores.push({ product, quantity: item.quantity });
    }
  }

  const now = nowIso();
  for (const { product, quantity } of restores) {
    product.stockQuantity = (product.stockQuantity ?? 0) + quantity;
    product.updatedAt = now;
  }
  const debt = debts.find((d) => d.saleId === id);
  let cancelledDebtVnd = 0;
  if (debt && debt.status === 'OPEN') {
    cancelledDebtVnd = debt.outstandingVnd;
    debt.status = 'VOIDED';
    debt.voidedAt = now;
    debt.cancelledVnd = cancelledDebtVnd;
    debt.outstandingVnd = 0;
  }
  let refund: SaleRefundView | null = null;
  if (received > 0) {
    refund = {
      id: nextRefundId++,
      saleId: id,
      amountVnd: received,
      refundMethod: body.refundMethod as 'CASH' | 'TRANSFER',
      transferReference: body.transferReference?.trim() || null,
      refundedByUserId: 1,
      refundedAt: now,
    };
    refunds.set(id, refund);
  }
  // Như Core: đơn đã huỷ có dư nợ 0 nhưng giữ nguyên số đã thu và trạng thái thanh toán để xem lại lịch sử.
  sale.saleStatus = 'VOIDED';
  sale.outstandingVnd = 0;
  saleVoidedAt.set(id, now);
  pushNotification('SALE_VOIDED', 'Đơn hàng đã hủy', `Đơn #${sale.id} đã được hủy.`, 'SALE', sale.id);
  return { sale, refund, cancelledDebtVnd, stockRestocked: restores.length > 0 };
}

function getRefund(saleId: number): SaleRefundView {
  if (!sales.some((s) => s.id === saleId)) throw apiErr(404, 'sale_not_found', 'This sale is unavailable.');
  const refund = refunds.get(saleId);
  if (!refund) throw apiErr(404, 'sale_refund_not_found', 'No refund exists for this sale.');
  return refund;
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

/** `GET /debts` như Core: lọc trạng thái và khách, mới nhất trước. */
function filterDebts(rawQuery: string): DebtView[] {
  const params = parseQuery(rawQuery);
  const status = params.status;
  if (status !== undefined && !['OPEN', 'SETTLED', 'VOIDED'].includes(status)) throw apiErr(400, 'validation_failed', 'status không hợp lệ.');
  const customerId = params.customerId === undefined ? null : Number(params.customerId);
  if (customerId !== null && (!Number.isInteger(customerId) || customerId <= 0)) {
    throw apiErr(400, 'invalid_debt_query', 'customerId phải là số nguyên dương.');
  }
  return listDebts().filter((d) => (!status || d.status === status) && (customerId === null || d.customerId === customerId));
}

function repayDebt(id: number, body: DebtRepaymentBody): { debt: DebtView; payment: PaymentView } {
  const debt = debts.find((d) => d.id === id);
  if (!debt) throw apiErr(404, 'debt_not_found', 'This debt is unavailable.');
  if (debt.status === 'VOIDED') throw apiErr(409, 'sale_already_voided', 'This sale has already been voided.');
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

/** `GET /expenses` như Core: lọc theo kỳ báo cáo (`period`), mới nhất trước. Mock chưa lọc from/to và category. */
function filterExpenses(rawQuery: string): ExpenseView[] {
  const params = parseQuery(rawQuery);
  const list = listExpenses().sort((a, b) => Date.parse(b.expenseAt) - Date.parse(a.expenseAt) || b.id - a.id);
  if (params.period === undefined) return list;
  const { from, to } = reportWindow(rawQuery);
  return list.filter((e) => Date.parse(e.expenseAt) >= from.getTime() && Date.parse(e.expenseAt) < to.getTime());
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
  if (/bieu do|bang/.test(q)) {
    // Có bảng và khối chart để xem cách bong bóng trình bày chúng (docs/contracts/api-contracts.md, mục Stream).
    const top = [...active].sort((a, b) => b.sellingPriceVnd - a.sellingPriceVnd).slice(0, 5);
    const chart = { type: 'bar', title: 'Giá bán 5 món cao nhất', unit: 'vnd', data: top.map((p) => ({ label: p.name.slice(0, 12), value: p.sellingPriceVnd })) };
    return [
      `Món giá cao nhất là **${top[0]?.name}** với ${vnd(top[0]?.sellingPriceVnd ?? 0)}.`,
      '',
      '| Món | Giá bán |',
      '|---|---:|',
      ...top.map((p) => `| ${p.name} | ${vnd(p.sellingPriceVnd)} |`),
      '',
      '```chart',
      JSON.stringify(chart),
      '```',
      scope,
    ].join('\n');
  }
  if (/het hang|sap het|ton kho|con bao nhieu|nhap/.test(q)) {
    const low = active.filter((p) => p.tracked && (p.stockQuantity ?? 0) <= 6);
    if (!low.length) return `Chưa có mặt hàng nào dưới ngưỡng 6. ${scope}`;
    return `Các món sắp hết:\n${low.map((p) => `• ${p.name}: còn ${p.stockQuantity} ${p.unit}`).join('\n')}\n${scope}`;
  }
  if (/bao nhieu (mon|mat hang|san pham)|may mon/.test(q)) {
    return `Tiệm đang bán ${active.length} mặt hàng trong ${listCategories().length} nhóm. ${scope}`;
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
// Idempotency-Key — mô phỏng IdempotencyServiceImpl của Core thật
// ---------------------------------------------------------------------------

const idempotentResults = new Map<string, { hash: string; response: unknown }>();

/**
 * Cùng key + cùng nội dung → trả lại kết quả cũ, không chạy lại; cùng key khác nội dung → 409; thiếu/sai key → 400.
 * Lỗi nghiệp vụ ném ra từ `action` thì chưa lưu gì (Core rollback cả việc giữ key), nên có thể sửa rồi gửi lại với key đó.
 */
function idempotent<T>(operation: string, key: string | undefined, body: unknown, action: () => T): T {
  if (key === undefined) throw apiErr(400, 'missing_required_header', 'The Idempotency-Key header is required.');
  const normalized = key.trim();
  if (!normalized || key.length > 255) {
    throw apiErr(400, 'invalid_idempotency_key', 'Idempotency-Key must be 1 to 255 characters.');
  }
  const id = `${operation}|${normalized}`;
  const hash = canonicalJson(body);
  const stored = idempotentResults.get(id);
  if (stored) {
    if (stored.hash !== hash) {
      throw apiErr(409, 'idempotency_key_conflict', 'This Idempotency-Key was already used for a different request.');
    }
    return JSON.parse(JSON.stringify(stored.response)) as T;
  }
  const response = action();
  idempotentResults.set(id, { hash, response: JSON.parse(JSON.stringify(response)) });
  return response;
}

// ---------------------------------------------------------------------------
// Định tuyến — nhận đúng path/method mà catalogApi/salesApi/debtApi/customerApi/expenseApi gửi
// ---------------------------------------------------------------------------

/**
 * `apiRequest` (src/lib/api.ts) gọi hàm này khi USE_MOCK=true thay vì `fetch` mạng. Chỉ các endpoint
 * app thực sự dùng (xem catalogApi/salesApi/debtApi/customerApi/expenseApi) mới được xử lý; endpoint
 * khác ném lỗi rõ ràng thay vì âm thầm thất bại hoặc gọi mạng thật.
 */
export function mockCoreRequest<T>(path: string, method: string, body: unknown, idempotencyKey?: string): T {
  if (path.startsWith('/me/notifications')) return handleNotifications(path, method, body) as T;
  // Sáu GET danh sách OWNER nhận thêm query (page/size); các route còn lại khớp theo path trần
  const [route, rawQuery = ''] = path.split('?');
  const segments = route.split('/').filter(Boolean);

  if (path === '/categories') {
    if (method === 'GET') return listCategories() as unknown as T;
    if (method === 'POST') return createCategory(body as { name: string }) as unknown as T;
  }

  if (route === '/products') {
    if (method === 'GET') return pageOf(filterProducts(rawQuery), rawQuery, 'invalid_product_query') as unknown as T;
    if (method === 'POST') return createProduct(body as ProductWriteBody) as unknown as T;
  }
  // Đường dẫn cố định, phải khớp trước /products/{id}
  if (route === '/products/lookup' && method === 'GET') return lookupProduct(rawQuery) as unknown as T;
  if (segments[0] === 'products' && segments.length === 2) {
    const id = Number(segments[1]);
    if (method === 'PATCH') return updateProduct(id, body as ProductPatchBody) as unknown as T;
    if (method === 'DELETE') {
      archiveProduct(id);
      return undefined as T;
    }
  }

  if (segments[0] === 'products' && segments.length === 3 && segments[2] === 'stock-in' && method === 'POST') {
    return idempotent(`POST ${path}`, idempotencyKey, body, () =>
      stockInProduct(Number(segments[1]), body as StockInBody),
    ) as unknown as T;
  }

  if (segments[0] === 'products' && segments.length === 3 && segments[2] === 'image') {
    const id = Number(segments[1]);
    if (method === 'POST') {
      return idempotent(`POST ${path}`, idempotencyKey, body, () =>
        setProductImage(id, body as { imageUri?: string } | undefined),
      ) as unknown as T;
    }
    if (method === 'DELETE') {
      deleteProductImage(id);
      return undefined as T;
    }
  }

  if (path === '/sale-drafts' && method === 'POST') return createSaleDraft(body as SaleDraftWriteBody) as unknown as T;
  if (segments[0] === 'sale-drafts' && segments.length === 2) {
    const id = Number(segments[1]);
    if (method === 'GET') return getSaleDraft(id) as unknown as T;
    if (method === 'DELETE') {
      cancelSaleDraft(id);
      return undefined as T;
    }
  }
  if (segments[0] === 'sale-drafts' && segments.length === 3 && segments[2] === 'confirm' && method === 'POST') {
    return confirmSaleDraft(Number(segments[1])) as unknown as T;
  }

  if (route === '/sales' && method === 'GET') return pageOf(filterSales(rawQuery), rawQuery, 'invalid_sale_query') as unknown as T;
  if (route === '/sales/summary' && method === 'GET') return summarizeSales(rawQuery) as unknown as T;
  if (route === '/reports/summary' && method === 'GET') return reportSummary(rawQuery) as unknown as T;
  if (route === '/reports/sales-series' && method === 'GET') return reportSalesSeries(rawQuery) as unknown as T;
  if (route === '/reports/top-products' && method === 'GET') return reportTopProducts(rawQuery) as unknown as T;
  if (route === '/reports/profit-estimate' && method === 'GET') return reportProfitEstimate(rawQuery) as unknown as T;
  if (segments[0] === 'sales' && segments.length === 2 && method === 'GET') {
    return getSaleById(Number(segments[1])) as unknown as T;
  }
  if (segments[0] === 'sales' && segments.length === 3 && segments[2] === 'payments' && method === 'GET') {
    return listPaymentsForSale(Number(segments[1])) as unknown as T;
  }
  if (segments[0] === 'sales' && segments.length === 3 && segments[2] === 'void' && method === 'POST') {
    return idempotent(`POST ${path}`, idempotencyKey, body, () =>
      voidSale(Number(segments[1]), body as SaleVoidBody),
    ) as unknown as T;
  }
  if (segments[0] === 'sales' && segments.length === 3 && segments[2] === 'refund' && method === 'GET') {
    return getRefund(Number(segments[1])) as unknown as T;
  }

  if (route === '/customers' && method === 'GET') return pageOf(listCustomers(), rawQuery, 'invalid_customer_query') as unknown as T;

  if (route === '/debts' && method === 'GET') return pageOf(filterDebts(rawQuery), rawQuery, 'invalid_debt_query') as unknown as T;
  if (segments[0] === 'debts' && segments.length === 3 && segments[2] === 'payments' && method === 'POST') {
    return idempotent(`POST ${path}`, idempotencyKey, body, () =>
      repayDebt(Number(segments[1]), body as DebtRepaymentBody),
    ) as unknown as T;
  }

  if (route === '/expenses') {
    if (method === 'GET') return pageOf(filterExpenses(rawQuery), rawQuery, 'invalid_expense_query') as unknown as T;
    if (method === 'POST') {
      return idempotent('POST /expenses', idempotencyKey, body, () => createExpense(body as ExpenseWriteBody)) as unknown as T;
    }
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
