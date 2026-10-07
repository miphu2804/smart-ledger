import type {
  CustomerView,
  Debt,
  DebtView,
  Expense,
  ExpenseCategory,
  ExpenseView,
  Invoice,
  Product,
  ProductView,
  SaleView,
} from '../data/types';

/**
 * Đổi dữ liệu thật từ Core (`*View`) sang dạng cũ (`Invoice`/`Product`/`Debt`/`Expense`) mà `stats.ts`,
 * `notifications.ts` và các màn Tổng quan/Báo cáo đã dùng — để nối dữ liệu thật mà không viết lại phần tính toán.
 */

/** Giá vốn ước tính khi sản phẩm chưa có `costPriceVnd` — cùng hệ số với phần dự phòng của `summary` trong stats.ts. */
const ESTIMATED_COST_RATIO = 0.6;

export function saleToInvoice(sale: SaleView): Invoice {
  const paid = sale.paymentStatus === 'PAID';
  return {
    id: String(sale.id),
    code: `#${sale.id}`, // cùng cách gọi với danh sách và chi tiết hoá đơn ("#6")
    createdAt: sale.soldAt,
    items: sale.items.map((it) => ({
      // Core có thể trả dòng không gắn sản phẩm (món ngoài danh mục) — bỏ productId thay vì để null.
      productId: it.productId ?? undefined,
      name: it.productName,
      price: it.unitPriceVnd,
      qty: it.quantity,
    })),
    customer: sale.customerName ?? undefined,
    // Danh sách đơn của Core không kèm phương thức thanh toán nên `method` chỉ là giá trị tạm; `methodKnown: false`
    // báo cho chỗ hiển thị biết để không in sai "Tiền mặt".
    method: paid ? 'cash' : 'debt',
    methodKnown: false,
    source: 'pos',
    staffId: '',
    status: sale.saleStatus === 'VOIDED' ? 'cancelled' : paid ? 'paid' : 'debt',
    total: sale.totalVnd,
  };
}

export function productToLegacy(p: ProductView): Product {
  return {
    id: String(p.id),
    name: p.name,
    price: p.sellingPriceVnd,
    cost: p.costPriceVnd ?? Math.round(p.sellingPriceVnd * ESTIMATED_COST_RATIO),
    stock: p.stockQuantity ?? 0,
    tracked: p.tracked,
    // Danh mục thật là tên tự do (CategoryView), không khớp liên hợp `Category` cũ; các màn này không dùng tới.
    category: 'other',
    barcode: p.barcode ?? undefined,
  };
}

/** Core lưu một khoản nợ cho mỗi đơn; các màn cũ coi nợ theo khách nên gộp theo `customerId`. */
export function debtsToLegacy(debts: DebtView[], customers: CustomerView[]): Debt[] {
  const byCustomer = new Map<number, Debt>();
  for (const d of debts) {
    // Nợ của đơn đã huỷ (VOIDED) không còn là khoản phải thu: tính vào sẽ coi phần đã hoàn lại cho khách là "đã trả".
    if (d.status === 'VOIDED') continue;
    const last = d.settledAt ?? d.createdAt;
    const cur = byCustomer.get(d.customerId);
    if (cur) {
      cur.total += d.originalVnd;
      cur.paid += d.originalVnd - d.outstandingVnd;
      if (new Date(last) > new Date(cur.lastDate)) cur.lastDate = last;
      continue;
    }
    const customer = customers.find((c) => c.id === d.customerId);
    byCustomer.set(d.customerId, {
      id: String(d.customerId),
      name: customer?.name ?? `Khách #${d.customerId}`,
      phone: customer?.phone ?? '',
      total: d.originalVnd,
      paid: d.originalVnd - d.outstandingVnd,
      lastDate: last,
      history: [],
    });
  }
  return [...byCustomer.values()];
}

export function expenseToLegacy(e: ExpenseView): Expense {
  return {
    id: String(e.id),
    title: e.description,
    amount: e.amountVnd,
    // Giữ chuỗi thô của Core (chuỗi lạ vẫn hiện đúng qua `catMeta`); Core chưa có trường `source`.
    category: (e.category ?? 'khac') as ExpenseCategory,
    createdAt: e.expenseAt,
    source: 'manual',
  };
}
