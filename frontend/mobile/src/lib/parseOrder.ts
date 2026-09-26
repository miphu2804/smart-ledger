/**
 * Bộ "nhận diện" giao dịch tiếng Việt GIẢ LẬP (rule-based) để demo UI.
 * Khi có backend AI thật, thay parseOrder()/parseExpense() bằng lời gọi API
 * và trả về đúng kiểu ParsedOrder / ParsedExpense.
 */
import type { LineItem, Product } from '../data/types';

export interface ParsedOrder {
  items: LineItem[];
  /** Món không có trong danh mục — UI sẽ hỏi có thêm vào danh mục không */
  unknown: LineItem[];
}

export interface ParsedExpense {
  title: string;
  amount: number;
}

export function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9.,\s]/g, ' ')
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

function parseQty(seg: string): { qty: number; rest: string } {
  const digit = seg.match(/(^|\s)(\d{1,3})(?=\s)/);
  if (digit) return { qty: parseInt(digit[2], 10), rest: seg.replace(digit[0], ' ') };
  const words = seg.split(' ');
  for (let i = 0; i < words.length; i++) {
    const n = NUM_WORDS[words[i]];
    // "nam" chỉ tính là số khi đứng trước đơn vị (tránh "cô Năm")
    if (n && (words[i] !== 'nam' || UNITS.includes(words[i + 1] ?? ''))) {
      words.splice(i, 1);
      return { qty: n, rest: words.join(' ') };
    }
  }
  if (/\bchuc\b/.test(seg)) return { qty: 1, rest: seg };
  return { qty: 1, rest: seg };
}

function matchProduct(seg: string, products: Product[]): Product | undefined {
  let best: { p: Product; len: number } | undefined;
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

export function parseOrder(text: string, products: Product[]): ParsedOrder {
  const segments = normalize(text)
    .split(/,|\s(?:voi|them|va|kem|cung)\s|\snha\b|\snhe\b/)
    .map((s) => s.trim())
    .filter(Boolean);
  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  for (const raw of segments) {
    const money = parseMoney(raw);
    const afterMoney = money ? money.rest : raw;
    const { qty, rest } = parseQty(` ${afterMoney} `);
    const p = matchProduct(rest, products);
    const unitPrice = money ? Math.round(money.value / Math.max(qty, 1)) : undefined;
    if (p) {
      const ex = items.find((i) => i.productId === p.id);
      if (ex) ex.qty += qty;
      else items.push({ productId: p.id, name: p.name, price: unitPrice ?? p.price, qty });
    } else {
      const name = cleanName(rest.trim(), text);
      if (name) unknown.push({ name, price: unitPrice ?? 0, qty });
    }
  }
  return { items, unknown };
}

export function parseExpense(text: string): ParsedExpense {
  const n = normalize(text);
  const money = parseMoney(n);
  const title = text
    .replace(/\s*(hết|het)?\s*\d+(?:[.,]\d+)?\s*(nghìn|ngàn|nghin|ngan|k|tr|triệu|trieu|đồng|d)\b/i, '')
    .trim();
  return { title: title.charAt(0).toUpperCase() + title.slice(1), amount: money?.value ?? 0 };
}
