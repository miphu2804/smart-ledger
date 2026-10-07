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

// ─── Chuẩn hoá chữ ───────────────────────────────────────────────────────────

/** Hạ chữ thường, bỏ dấu tiếng Việt. Chưa đụng đến dấu câu và chữ số. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd');
}

function normalize(s: string): string {
  return fold(s)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const DIGIT_WORDS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
};
/** Từ chỉ số lượng dùng để bỏ khỏi tên món (không gồm "lăm" vì không đứng một mình). */
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
/** Từ nối giữa hai món khi nói liền một câu: "2 cà phê VÀ 1 bánh mì". */
const DELIMITER_WORDS = new Set(['voi', 'them', 'va', 'kem', 'cung', 'nha', 'nhe', 'roi']);

// ─── Đọc tiền ────────────────────────────────────────────────────────────────
//
// Model giọng nói trả về chữ liền, không dấu câu, số đọc bằng chữ ("hai mươi nghìn"), còn người gõ tay hay viết "20k"
// hoặc "20.000đ". Cả hai đều được đưa về một token tiền dạng `m20000` trước khi tách món.

const MONEY_SCALE: Record<string, number> = {
  nghin: 1000,
  ngan: 1000,
  ka: 1000,
  k: 1000,
  trieu: 1_000_000,
  tr: 1_000_000,
  dong: 1,
  d: 1,
};
const DIGIT_MONEY_RE = /(\d+(?:[.,]\d+)?)\s*(nghin|ngan|ka|k|trieu|tr|dong|d)(?![a-z0-9])/g;
/** Số tiền nhỏ nhất coi là giá bán (500đ); khoản chi thì từ 1.000đ. */
const MIN_ITEM_PRICE = 500;
const MIN_EXPENSE = 1000;

const isMoney = (t: string | undefined): t is string => !!t && /^m\d+$/.test(t);
const moneyValue = (t: string) => parseInt(t.slice(1), 10);

const SPOKEN_START = new Set([...Object.keys(DIGIT_WORDS), 'muoi', 'tram']);
const SPOKEN_TOKENS = new Set([...Object.keys(DIGIT_WORDS), 'muoi', 'chuc', 'tram', 'linh', 'le', 'ruoi', 'nghin', 'ngan', 'trieu']);
const isNumberToken = (t: string | undefined): t is string => !!t && (SPOKEN_TOKENS.has(t) || /^\d+$/.test(t));

interface SpokenNumber {
  value: number;
  /** Có nghìn/triệu trong cách đọc: tự nó đã là số tiền, không cần "k". */
  scaled: boolean;
}

/**
 * Đọc một cụm số tiếng Việt đã bỏ dấu: "hai muoi lam nghin" → 25000, "mot tram hai muoi" → 120,
 * "hai lam" → 25 (cách nói tắt), "hai tram ruoi" → 250. Trả null nếu cụm không hợp lệ.
 */
function parseSpokenRun(tokens: string[]): SpokenNumber | null {
  let total = 0;
  let group = 0;
  let pend: number | null = null;
  let pendAfterHundred = false;
  let prev = '';
  let lastScale = 0;
  let scaled = false;
  const flush = () => {
    if (pend === null) return;
    // "hai trăm năm" nói tắt cho 250; còn "một trăm linh năm" mới là 105
    group += pendAfterHundred && group % 100 === 0 ? pend * 10 : pend;
    pend = null;
    pendAfterHundred = false;
  };
  for (const w of tokens) {
    if (/^\d+$/.test(w)) {
      flush();
      group += parseInt(w, 10);
      prev = 'num';
      continue;
    }
    const d = DIGIT_WORDS[w];
    if (d !== undefined) {
      if (pend !== null && prev === 'digit') {
        // hai chữ số liền nhau: "hai lăm" = 25, "ba bảy" = 37
        group += pend * 10 + d;
        pend = null;
        pendAfterHundred = false;
        prev = 'pair';
      } else {
        flush();
        pend = d;
        pendAfterHundred = prev === 'tram';
        prev = 'digit';
      }
      continue;
    }
    switch (w) {
      case 'muoi':
      case 'chuc':
        group += (pend ?? 1) * 10;
        pend = null;
        pendAfterHundred = false;
        prev = 'tens';
        break;
      case 'tram':
        group += (pend ?? 1) * 100;
        pend = null;
        pendAfterHundred = false;
        prev = 'tram';
        lastScale = 100;
        break;
      case 'linh':
      case 'le':
        flush();
        prev = 'zero';
        break;
      case 'ruoi':
        flush();
        if (lastScale === 1_000_000) total += 500_000;
        else if (lastScale === 1000) total += 500;
        else if (lastScale === 100) group += 50;
        else return null;
        prev = 'half';
        break;
      case 'nghin':
      case 'ngan':
        flush();
        if (group === 0) return null;
        total += group * 1000;
        group = 0;
        lastScale = 1000;
        scaled = true;
        prev = 'scale';
        break;
      case 'trieu':
        flush();
        if (group === 0) return null;
        total += group * 1_000_000;
        group = 0;
        lastScale = 1_000_000;
        scaled = true;
        prev = 'scale';
        break;
      default:
        return null;
    }
  }
  flush();
  total += group;
  return total > 0 ? { value: total, scaled } : null;
}

/** "20k" nói thành "hai mươi ca"; "ca" đứng trước "phê" thì là cà phê chứ không phải nghìn. */
const isThousandWord = (w: string | undefined, after: string | undefined) =>
  w === 'k' || w === 'ka' || (w === 'ca' && after !== 'phe');

/** Gom các cụm số đọc bằng chữ + đơn vị tiền thành token `m<đồng>`; cụm không có đơn vị tiền giữ nguyên (là số lượng). */
function convertSpokenMoney(words: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    if (!SPOKEN_START.has(words[i]) && !/^\d+$/.test(words[i])) {
      out.push(words[i++]);
      continue;
    }
    let j = i + 1;
    while (j < words.length && isNumberToken(words[j])) {
      // "ba hai mươi nghìn": chữ số thứ hai mở đầu một số mới, "ba" là số lượng
      const startsNewNumber =
        words[j] in DIGIT_WORDS && words[j - 1] in DIGIT_WORDS && ['muoi', 'chuc', 'tram'].includes(words[j + 1] ?? '');
      if (startsNewNumber) break;
      j++;
    }
    const run = words.slice(i, j);
    const num = parseSpokenRun(run);
    const next = words[j];
    let value: number | null = null;
    let end = j;
    if (num) {
      if (num.scaled) {
        value = num.value;
        if (next === 'dong' || next === 'd') end = j + 1;
      } else if (isThousandWord(next, words[j + 1])) {
        value = num.value * 1000;
        end = j + 1;
      } else if (next === 'dong' || next === 'd') {
        value = num.value;
        end = j + 1;
      }
    }
    if (value !== null && value >= 1) {
      out.push(`m${value}`);
      i = end;
    } else {
      out.push(...run);
      i = j;
    }
  }
  return out;
}

/**
 * Câu nói/gõ → danh sách token đã bỏ dấu; dấu câu thành ",", từ nối thành ",", mọi số tiền thành `m<đồng>`.
 * ("2 cà phê, 1 bánh mì 20.000đ" → ["2","ca","phe",",","1","banh","mi","m20000"])
 */
function tokenize(text: string): string[] {
  let s = fold(text);
  // 1.500.000 → 1500000 (dấu chấm/phẩy ngăn hàng nghìn); còn "1,5tr" giữ nguyên để đọc như số thập phân
  s = s.replace(/(\d)[.,](?=\d{3}(?!\d))/g, '$1');
  s = s.replace(DIGIT_MONEY_RE, (_m, n: string, u: string) => ` m${Math.round(parseFloat(n.replace(',', '.')) * MONEY_SCALE[u])} `);
  s = s.replace(/[,;.!?\n]+/g, ' , ').replace(/[^a-z0-9\s,]/g, ' ');
  const words = s.split(/\s+/).filter(Boolean);
  return convertSpokenMoney(words).map((w) => {
    if (DELIMITER_WORDS.has(w)) return ',';
    // 20000 viết trơn (không đơn vị) từ 4 chữ số trở lên chắc chắn là giá, không phải số lượng
    return /^\d{4,}$/.test(w) ? `m${w}` : w;
  });
}

function splitClauses(tokens: string[]): string[][] {
  const clauses: string[][] = [];
  let cur: string[] = [];
  for (const t of tokens) {
    if (t === ',') {
      if (cur.length) clauses.push(cur);
      cur = [];
    } else cur.push(t);
  }
  if (cur.length) clauses.push(cur);
  return clauses;
}

// ─── Số lượng, tên món ───────────────────────────────────────────────────────

/** Số lượng viết bằng chữ số (1–3 chữ số), kèm đơn vị đứng ngay sau nếu có: "2 ly", "10 cái". */
const QTY_DIGIT_RE = new RegExp(`(^|\\s)(\\d{1,3})(?=\\s|$)(\\s(?:${UNITS.join('|')})(?=\\s|$))?`);

function parseQty(seg: string): { qty: number; rest: string; explicit: boolean } {
  const digit = seg.match(QTY_DIGIT_RE);
  if (digit && parseInt(digit[2], 10) > 0) {
    return { qty: parseInt(digit[2], 10), rest: seg.replace(digit[0], ' ').trim(), explicit: true };
  }
  const words = seg.split(' ');
  for (let i = 0; i < words.length; i++) {
    if (!(words[i] in DIGIT_WORDS) && words[i] !== 'muoi' && words[i] !== 'tram') continue;
    let j = i + 1;
    while (j < words.length && isNumberToken(words[j]) && words[j] !== 'nghin' && words[j] !== 'ngan' && words[j] !== 'trieu') {
      const startsNewNumber =
        words[j] in DIGIT_WORDS && words[j - 1] in DIGIT_WORDS && ['muoi', 'chuc', 'tram'].includes(words[j + 1] ?? '');
      if (startsNewNumber) break;
      j++;
    }
    const run = words.slice(i, j);
    // "nam" chỉ tính là số khi đứng trước đơn vị (tránh "cô Năm")
    if (run.length === 1 && run[0] === 'nam' && !UNITS.includes(words[j] ?? '')) continue;
    const n = parseSpokenRun(run);
    if (n && n.value > 0 && n.value < 1000) {
      // đơn vị đứng ngay sau số lượng ("hai ly cà phê") đi theo số, không thuộc tên món
      words.splice(i, j - i + (UNITS.includes(words[j] ?? '') ? 1 : 0));
      return { qty: n.value, rest: words.join(' '), explicit: true };
    }
  }
  if (/\bchuc\b/.test(seg)) return { qty: 1, rest: seg, explicit: true };
  // Không tìm thấy số lượng nào — mặc định 1 nhưng đánh dấu không tường minh
  return { qty: 1, rest: seg, explicit: false };
}

function productKeys(p: ParseableProduct): string[][] {
  return [p.name.replace(/\(.*?\)/g, ''), ...(p.aliases ?? [])]
    .map(normalize)
    .filter(Boolean)
    .map((k) => k.split(' '));
}

function matchProduct(seg: string, products: ParseableProduct[]): ParseableProduct | undefined {
  let best: { p: ParseableProduct; len: number } | undefined;
  for (const p of products) {
    for (const k of productKeys(p).map((ws) => ws.join(' '))) {
      if (` ${seg} `.includes(` ${k} `) && (!best || k.length > best.len)) best = { p, len: k.length };
    }
  }
  return best?.p;
}

interface ProductHit {
  start: number;
  end: number;
  p: ParseableProduct;
}

/** Mọi chỗ tên món trong danh mục xuất hiện trong dãy token (ưu tiên tên dài, không chồng lên nhau), theo thứ tự nói. */
function findProductHits(tokens: string[], products: ParseableProduct[]): ProductHit[] {
  const cands: Array<ProductHit & { len: number }> = [];
  for (const p of products) {
    for (const key of productKeys(p)) {
      for (let i = 0; i + key.length <= tokens.length; i++) {
        if (key.every((k, o) => tokens[i + o] === k)) cands.push({ start: i, end: i + key.length, p, len: key.length });
      }
    }
  }
  cands.sort((a, b) => b.len - a.len || a.start - b.start);
  const taken = new Array<boolean>(tokens.length).fill(false);
  const hits: ProductHit[] = [];
  for (const c of cands) {
    let free = true;
    for (let i = c.start; i < c.end; i++) if (taken[i]) free = false;
    if (!free) continue;
    for (let i = c.start; i < c.end; i++) taken[i] = true;
    hits.push({ start: c.start, end: c.end, p: c.p });
  }
  return hits.sort((a, b) => a.start - b.start);
}

const isQtyPrefix = (t: string) => /^\d+$/.test(t) || t in DIGIT_WORDS || t === 'muoi' || t === 'chuc' || t === 'tram' || UNITS.includes(t);

/**
 * Nói liền "hai cà phê sữa một bánh mì thịt ba trà đá" không có từ nối: cắt trước mỗi món trong danh mục từ món thứ hai,
 * kéo điểm cắt lùi qua số lượng/đơn vị đứng ngay trước tên món ("… sữa | một bánh mì thịt | ba trà đá").
 */
function chunkByCatalog(tokens: string[], products: ParseableProduct[]): string[][] {
  const hits = findProductHits(tokens, products);
  if (hits.length < 2) return [tokens];
  const cuts: number[] = [];
  for (let k = 1; k < hits.length; k++) {
    let c = hits[k].start;
    while (c > hits[k - 1].end && isQtyPrefix(tokens[c - 1])) c--;
    cuts.push(c);
  }
  const chunks: string[][] = [];
  let from = 0;
  for (const c of cuts) {
    chunks.push(tokens.slice(from, c));
    from = c;
  }
  chunks.push(tokens.slice(from));
  return chunks.filter((c) => c.length);
}

/** Mỗi giá nói ra là điểm kết thúc một món: "bánh mì 20k cà phê 20k" → ["bánh mì 20k", "cà phê 20k"]. */
function splitByPrice(tokens: string[]): string[][] {
  const segs: string[][] = [];
  let cur: string[] = [];
  for (const t of tokens) {
    cur.push(t);
    if (isMoney(t)) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  return segs;
}

function cleanName(seg: string, original: string, extraDrop: string[] = []) {
  const words = seg
    .split(' ')
    .filter((w) => w && !FILLER.includes(w) && !extraDrop.includes(w) && !/^\d/.test(w) && !(w in NUM_WORDS));
  // Đơn vị chỉ bỏ khi đứng đầu tên ("ly cà phê"); "tố", "bơ" ở giữa "sinh tố bơ" trùng chữ với đơn vị tô/bó nên phải giữ
  while (words.length && UNITS.includes(words[0])) words.shift();
  if (!words.length) return '';
  // Lấy lại chữ có dấu từ câu gốc nếu được; cùng một chữ không dấu thì ưu tiên dạng có dấu ("ca" nghìn vs "cà" phê)
  const origWords = original.split(/\s+/);
  const mapped = words.map((w) => {
    const same = origWords.filter((o) => normalize(o) === w);
    return same.find((o) => o.toLowerCase() !== fold(o)) ?? same[0] ?? w;
  });
  const s = mapped.join(' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Expense detection ───────────────────────────────────────────────────────

/** Sau "trả"/"trà" các từ này nghĩa là đang gọi trà (trà sữa, trà đá…), không phải trả tiền. */
const TEA_WORDS = new Set(['sua', 'da', 'dao', 'chanh', 'xanh', 'tac', 'den', 'nong', 'lipton', 'gung', 'atiso', 'hoa', 'vai', 'nhai', 'sen', 'chau', 'tran', 'thai', 'bi']);
const EXPENSE_VERBS = ['chi', 'mua', 'tra', 'nop', 'thanh', 'dat', 'phi'];

/** Từ ở vị trí i có mở đầu một khoản chi không ("chị lấy…" là xưng hô, "trà sữa…" là món). */
function startsExpense(t: string[], i: number): boolean {
  const next = t[i + 1];
  switch (t[i]) {
    case 'chi':
      return next !== undefined && (isMoney(next) || ['tien', 'mua', 'ra', 'phi'].includes(next));
    case 'mua':
    case 'nop':
    case 'phi':
      return true;
    case 'thanh':
      return next === 'toan';
    case 'tra':
      return !(next && TEA_WORDS.has(next));
    case 'dat':
      return next === 'coc' || next === 'hang';
    default:
      return false;
  }
}

/** Tìm khoản chi trong một mệnh đề: trả vị trí bắt đầu và khoản chi (từ động từ chi đến hết mệnh đề). */
function findExpense(clause: string[], products: ParseableProduct[], original: string): { start: number; item: ParsedExpenseItem } | null {
  const hitEnds = new Set(findProductHits(clause, products).map((h) => h.end));
  for (let p = 0; p < clause.length; p++) {
    if (!EXPENSE_VERBS.includes(clause[p]) || !startsExpense(clause, p)) continue;
    // Động từ chi chỉ mở khoản chi ở đầu mệnh đề, sau một giá hoặc sau một món trong kho; giữa tên món thì không ("ba chỉ")
    if (p > 0 && !isMoney(clause[p - 1]) && !hitEnds.has(p)) continue;
    const tail = clause.slice(p);
    const money = tail.find(isMoney);
    if (!money || moneyValue(money) < MIN_EXPENSE) continue;
    // "mua 2 cà phê sữa 50k": mua món có trong danh mục là bán hàng, không phải chi
    if (clause[p] === 'mua' && findProductHits(tail.slice(1), products).length) continue;
    const rest = tail.filter((t) => !isMoney(t)).join(' ');
    const drop = [clause[p], ...(clause[p] === 'thanh' ? ['toan'] : [])];
    const title = cleanName(rest, original, drop) || tail.filter((t) => !isMoney(t)).join(' ') || 'Khoản chi';
    return { start: p, item: { title, amount: moneyValue(money), category: 'khac' } };
  }
  return null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function parseOrder(text: string, products: ParseableProduct[]): ParsedOrder {
  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  const expenses: ParsedExpenseItem[] = [];
  const missingQuantityItems: string[] = [];

  const addLine = (chunk: string[]) => {
    const price = chunk.find(isMoney);
    const seg = chunk.filter((t) => !isMoney(t)).join(' ');
    if (!seg) return;

    const matched = matchProduct(seg, products);
    if (matched) {
      // Giá bán của món trong danh mục do Core quyết định; giá nói ra chỉ dùng để tách món
      const { qty } = parseQty(seg);
      const ex = items.find((i) => i.productId === matched.id);
      if (ex) {
        ex.qty += qty;
      } else {
        items.push({ productId: matched.id, name: matched.name, price: matched.price, qty });
      }
      return;
    }

    // Kiểm tra có nhắc tên hàng không số lượng không
    const { qty, rest, explicit } = parseQty(seg);
    const name = cleanName(rest, text);
    if (!name) return;
    const spoken = price && moneyValue(price) >= MIN_ITEM_PRICE ? moneyValue(price) : 0;
    if (spoken) {
      // Nói cả giá ("bánh mì 20k") là đã chốt một dòng: không có số lượng thì hiểu là 1
      const dup = unknown.find((u) => u.name === name && u.price === spoken);
      if (dup) dup.qty += qty;
      else unknown.push({ name, price: spoken, qty });
    } else if (!explicit) {
      // Người dùng không nói số lượng rõ ràng (VD: "cà phê sữa", "cơm chiên Dương Châu" đơn thuần)
      missingQuantityItems.push(name);
    } else {
      // Có từ số lượng rõ ràng (VD: "một đĩa cơm chiên", "2 ly trà sữa") → thêm vào unknown
      unknown.push({ name, price: 0, qty });
    }
  };

  for (const clause of splitClauses(tokenize(text))) {
    // Thử nhận dạng khoản chi trước (tránh nhầm với tên hàng); phần đứng trước động từ chi vẫn là món bán
    const expense = findExpense(clause, products, text);
    if (expense) expenses.push(expense.item);
    const itemTokens = expense ? clause.slice(0, expense.start) : clause;
    for (const seg of splitByPrice(itemTokens)) {
      for (const chunk of chunkByCatalog(seg, products)) addLine(chunk);
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
  const tokens = tokenize(text).filter((t) => t !== ',');
  const money = tokens.find(isMoney);
  if (money && moneyValue(money) >= MIN_EXPENSE) {
    const rest = tokens.filter((t) => !isMoney(t)).join(' ');
    const title = cleanName(rest, text, EXPENSE_VERBS) || text.trim();
    return { title, amount: moneyValue(money) };
  }
  return { title: text, amount: 0 };
}
