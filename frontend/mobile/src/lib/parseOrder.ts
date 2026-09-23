/**
 * Bộ nhận diện & bóc tách giao dịch On-Device cho SmartLedger Mobile.
 * Tích hợp trực tiếp từ sst_feature Engine:
 * - Chuẩn hóa ngữ âm, khử từ đệm, khử cà lăm (ClientTextNormalizer)
 * - Trích xuất số lượng, đơn vị, danh sách món & khoản chi (ClientOrderExtractor)
 * - So khớp thực đơn thông minh & gợi ý biến thể Disambiguation (ClientFuzzyMatcher)
 */
import type { LineItem, Product } from '../data/types';
import { ClientTextNormalizer } from '../sst/order_parser/normalizer';
import { ClientOrderExtractor } from '../sst/order_parser/extractor';
import { ClientFuzzyMatcher } from '../sst/order_parser/fuzzy_matcher';
import type { ProductItem, DisambiguationOption } from '../sst/types';

export interface DisambiguationItem {
  rawName: string;
  qty: number;
  unit?: string | null;
  options: DisambiguationOption[];
}

export interface ParsedExpenseItem {
  title: string;
  amount: number;
  category: string;
}

export interface ParsedOrder {
  /** Các món đã khớp chính xác vào danh mục thực đơn */
  items: LineItem[];
  /** Các món chưa có trong danh mục — UI hỏi người dùng thêm giá / thêm vào thực đơn */
  unknown: LineItem[];
  /** Các món có nhiều biến thể (ví dụ: Bạc xỉu -> Bạc xỉu đá / nóng, Sting -> Sting dâu / vàng) */
  disambiguations?: DisambiguationItem[];
  /** Khoản chi phát hiện được trong câu nói (ví dụ: "chi 20k mua đá") */
  expenses?: ParsedExpenseItem[];
  /** Câu đã được khử từ đệm, cà lăm và chuẩn hóa ngữ âm */
  normalizedText?: string;
  /** Loại giao dịch (SALE, EXPENSE, MIXED) */
  intent?: string;
}

export interface ParsedExpense {
  title: string;
  amount: number;
}

const normalizer = new ClientTextNormalizer();
const extractor = new ClientOrderExtractor();
const matcher = new ClientFuzzyMatcher();

/**
 * Chuyển đổi danh sách Product của Mobile Store sang ProductItem cho Engine
 */
export function convertProductsToEngineFormat(products: Product[]): ProductItem[] {
  return products.map((p) => ({
    id: p.id,
    shop_id: 'default',
    name: p.name,
    price_vnd: p.price,
    category: p.category || 'other',
    unit: 'phần',
    aliases: p.aliases || [],
  }));
}

/**
 * Bóc tách đơn hàng thông minh bằng on-device NLP Engine
 */
export function parseOrder(text: string, products: Product[]): ParsedOrder {
  if (!text || !text.trim()) {
    return { items: [], unknown: [], disambiguations: [], expenses: [] };
  }

  // 1. Chuẩn hóa & Khử từ đệm / cà lăm / lỗi phát âm ASR
  const normalizedText = normalizer.normalize(text);

  // 2. Bóc tách số lượng, đơn vị, tên món và khoản chi
  const extraction = extractor.extract(normalizedText);

  // 3. Chuyển đổi danh mục sản phẩm của quán
  const engineProducts = convertProductsToEngineFormat(products);

  // 4. So khớp thực đơn với thuật toán Fuzzy Matching & Disambiguation
  const matchedItems = extraction.items.map((it) => matcher.matchItem(it, engineProducts));

  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  const disambiguations: DisambiguationItem[] = [];

  for (const m of matchedItems) {
    if (m.needs_disambiguation && m.disambiguation_options.length > 0) {
      // Món cần chọn biến thể (ví dụ: "Bạc xỉu" -> [Bạc xỉu đá, Bạc xỉu nóng])
      disambiguations.push({
        rawName: m.raw_input_name,
        qty: m.quantity,
        unit: m.unit,
        options: m.disambiguation_options,
      });
    } else if (m.product_id && m.matched_name) {
      // Khớp chính xác hoặc khớp mờ có độ tin cậy cao
      const ex = items.find((i) => i.productId === m.product_id);
      if (ex) {
        ex.qty += m.quantity;
      } else {
        items.push({
          productId: m.product_id,
          name: m.matched_name,
          price: m.unit_price_vnd,
          qty: m.quantity,
        });
      }
    } else {
      // Món chưa có trong danh mục quán
      const displayName = m.raw_input_name.charAt(0).toUpperCase() + m.raw_input_name.slice(1);
      unknown.push({
        name: displayName,
        price: m.unit_price_vnd || 0,
        qty: m.quantity,
      });
    }
  }

  // 5. Khoản chi phát hiện được
  const expenses: ParsedExpenseItem[] = extraction.expenses.map((e) => ({
    title: e.notes || `Chi ${e.category}`,
    amount: e.amount_vnd,
    category: e.category,
  }));

  return {
    items,
    unknown,
    disambiguations,
    expenses,
    normalizedText,
    intent: extraction.intent,
  };
}

/**
 * Trích xuất khoản chi từ câu nói
 */
export function parseExpense(text: string): ParsedExpense {
  const norm = normalizer.normalize(text);
  const extraction = extractor.extract(norm);
  if (extraction.expenses.length > 0) {
    const first = extraction.expenses[0];
    return {
      title: first.notes || text,
      amount: first.amount_vnd,
    };
  }
  return { title: text, amount: 0 };
}
