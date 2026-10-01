/**
 * Bộ nhận diện & bóc tách giao dịch On-Device cho SmartLedger Mobile.
 * Tích hợp trực tiếp từ sst_feature Engine:
 * - Chuẩn hóa ngữ âm, khử từ đệm, khử cà lăm (ClientTextNormalizer)
 * - Trích xuất số lượng, đơn vị, danh sách món & khoản chi (ClientOrderExtractor)
 * - So khớp thực đơn thông minh & gợi ý biến thể Disambiguation (ClientFuzzyMatcher)
 */
import type { LineItem } from '../data/types';

export interface ParsedOrder {
  /** Các món đã khớp chính xác vào danh mục thực đơn và có số lượng */
  items: LineItem[];
  /** Các món chưa có trong danh mục — UI hỏi người dùng thêm giá / thêm vào thực đơn */
  unknown: LineItem[];
  /** Các món đã nói tên nhưng chưa cung cấp số lượng */
  missingQuantityItems?: string[];
  /** Các món có nhiều biến thể (ví dụ: Bạc xỉu -> Bạc xỉu đá / nóng, Sting -> Sting dâu / vàng) */
  disambiguations?: DisambiguationItem[];
  /**
   * Khoản chi phát hiện được trong câu nói (ví dụ: "chi 20k mua đá").
   * ⚠️ NFR-006 / AC-010: Không gọi addExpense trực tiếp — bên caller phải hiển thị
   * bản nháp cho người dùng xác nhận trước khi lưu.
   */
  expenses?: ParsedExpenseItem[];
  /** Câu đã được khử từ đệm, cà lăm và chuẩn hóa ngữ âm */
  normalizedText?: string;
}

/**
 * Hình dạng tối thiểu mà bộ nhận diện cần — đủ cho cả `Product` mẫu (mock) và `ProductView` thật (Core),
 * gọi nơi dùng tự map sang shape này (xem `app/voice.tsx`).
 */
export interface ParseableProduct {
  id: string | number;
  name: string;
  price: number;
  aliases?: string[];
}

export interface DisambiguationItem {
  rawName: string;
  qty: number;
  unit?: string | null;
  options: Array<{ product_id: string | number; name: string; unit_price_vnd: number }>;
}

export interface ParsedExpenseItem {
  title: string;
  amount: number;
  category: string;
}

export interface ParsedExpense {
  title: string;
  amount: number;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NUM_WORDS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
  muoi: 10,
};
const UNITS = [
  'ly',
  'o',
  'chai',
  'lon',
  'goi',
  'bich',
  'ky',
  'kg',
  'ki',
  'hop',
  'cai',
  'phan',
  'to',
  'dia',
  'bo',
  'coc',
  'trai',
  'qua',
  'thung',
];
const FILLER = [
  'cho',
  'co',
  'chu',
  'anh',
  'chi',
  'em',
  'ban',
  'lay',
  'mua',
  'nha',
  'nhe',
  'di',
  'them',
  'khach',
  'minh',
  'toi',
  'con',
  'a',
  'ha',
];

function parseMoney(seg: string): { value: number; rest: string } | null {
  const m = seg.match(/(\d+(?:[.,]\d+)?)\s*(nghin|ngan|k|tr|trieu|d|dong)\b/);
  if (!m) return null;
  const num = parseFloat(m[1].replace(',', '.'));
  const unit = m[2];
  const value = unit === 'tr' || unit === 'trieu' ? num * 1_000_000 : unit === 'd' || unit === 'dong' ? num : num * 1000;
  return { value: Math.round(value), rest: seg.replace(m[0], ' ') };
}

function parseQty(seg: string): { qty: number; rest: string; explicit: boolean } {
  const digit = seg.match(/(^|\s)(\d{1,3})(?=\s)/);
  if (digit) return { qty: parseInt(digit[2], 10), rest: seg.replace(digit[0], ' '), explicit: true };
  const words = seg.split(' ');
  for (let i = 0; i < words.length; i++) {
    const n = NUM_WORDS[words[i]];
    // "nam" chỉ tính là số khi đứng trước đơn vị (tránh "cô Năm")
    if (n && (words[i] !== 'nam' || UNITS.includes(words[i + 1] ?? ''))) {
      words.splice(i, 1);
      return { qty: n, rest: words.join(' '), explicit: true };
    }
  }
  if (/\bchuc\b/.test(seg)) return { qty: 1, rest: seg, explicit: true };
  // Không tìm thấy số lượng nào — mặc định 1 nhưng đánh dấu không tường minh
  return { qty: 1, rest: seg, explicit: false };
}

function matchProduct(seg: string, products: ParseableProduct[]): ParseableProduct | undefined {
  let best: { p: ParseableProduct; len: number } | undefined;
  for (const p of products) {
    const keys = [p.name.replace(/\(.*?\)/g, ''), ...(p.aliases ?? [])].map(normalize).filter(Boolean);
    for (const k of keys) {
      if (` ${seg} `.includes(` ${k} `) && (!best || k.length > best.len)) best = { p, len: k.length };
    }
  }
  return best?.p;
}

function cleanName(seg: string, original: string) {
  const words = seg
    .split(' ')
    .filter((w) => w && !UNITS.includes(w) && !FILLER.includes(w) && !/^\d/.test(w) && !(w in NUM_WORDS));
  if (!words.length) return '';
  // Lấy lại chữ có dấu từ câu gốc nếu được
  const origWords = original.split(/\s+/);
  const mapped = words.map((w) => origWords.find((o) => normalize(o) === w) ?? w);
  const s = mapped.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Expense detection ───────────────────────────────────────────────────────

const EXPENSE_TRIGGERS = ['chi', 'mua', 'tra', 'nop', 'thanh toan', 'dat', 'phi'];

function tryParseExpense(seg: string, original: string): ParsedExpenseItem | null {
  const normSeg = normalize(seg);
  const hasExpenseTrigger = EXPENSE_TRIGGERS.some((t) => normSeg.includes(t));
  if (!hasExpenseTrigger) return null;
  const money = parseMoney(normSeg);
  if (!money || money.value < 1000) return null;
  const title = cleanName(money.rest, original) || seg.trim();
  if (!title) return null;
  return { title, amount: money.value, category: 'khac' };
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseOrder(text: string, products: ParseableProduct[]): ParsedOrder {
  const segments = normalize(text)
    .split(/,|\s(?:voi|them|va|kem|cung)\s|\snha\b|\snhe\b/)
    .map((s) => s.trim())
    .filter(Boolean);

  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  const expenses: ParsedExpenseItem[] = [];
  const missingQuantityItems: string[] = [];

  for (const seg of segments) {
    // Thử nhận dạng khoản chi trước (tránh nhầm với tên hàng)
    const expense = tryParseExpense(seg, text);
    if (expense) {
      expenses.push(expense);
      continue;
    }

    const matched = matchProduct(seg, products);
    if (matched) {
      const { qty } = parseQty(seg);
      const ex = items.find((i) => i.productId === matched.id);
      if (ex) {
        ex.qty += qty;
      } else {
        items.push({ productId: matched.id, name: matched.name, price: matched.price, qty });
      }
    } else {
      // Kiểm tra có nhắc tên hàng không số lượng không
      const { qty, rest, explicit } = parseQty(seg);
      const name = cleanName(rest, text);
      if (name) {
        if (!explicit) {
          // Người dùng không nói số lượng rõ ràng (VD: "cà phê sữa", "cơm chiên Dương Châu" đơn thuần)
          missingQuantityItems.push(name);
        } else {
          // Có từ số lượng rõ ràng (VD: "một đĩa cơm chiên", "2 ly trà sữa") → thêm vào unknown
          unknown.push({ name, price: 0, qty });
        }
      }
    }
  }

  return {
    items,
    unknown,
    missingQuantityItems,
    disambiguations: [],
    expenses,
    normalizedText: normalize(text),
  };
}

/**
 * Trích xuất khoản chi từ câu nói đơn lẻ
 */
export function parseExpense(text: string): ParsedExpense {
  const seg = normalize(text);
  const money = parseMoney(seg);
  if (money && money.value >= 1000) {
    const title = cleanName(money.rest, text) || text.trim();
    return { title, amount: money.value };
  }
  return { title: text, amount: 0 };
}
