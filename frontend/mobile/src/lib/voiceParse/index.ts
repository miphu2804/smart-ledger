/**
 * PoC parse giọng nói L1–L4 (xem docs/development/voice-parse-poc-brief.md), giữ nguyên interface `parseOrder`:
 * L1 `tokenize` (chuẩn hoá + ITN tiền) → L2 chỉ mục danh mục → L3 gắn nhãn BIO → ghép slot {qty, unit, item}
 * → L4 liên kết tên món + gate: tự nhận / hỏi chọn biến thể (`disambiguations`) / món chưa có trong danh mục.
 */
import type { LineItem } from '../../data/types';
import type { DisambiguationItem, ParseableProduct, ParsedExpenseItem, ParsedOrder } from '../parseOrder';
import { type CatalogIndex, catalogIndex, type LinkCandidate, linkSpan } from './catalog';
import { type CrfModel, viterbi } from './crf';
import { crfFeatures } from './features';
import { analyze, type Label, ruleTag, type Slot, type TokenInfo } from './tagger';
import { quantityValue, type Token, tokenize } from './text';
import { DELIMITERS, FILLER_RAW, FILLER_WORDS, UNIT_WORDS } from './lexicon';

export interface ParseOptions {
  /** Gắn nhãn bằng luật (mặc định) hoặc bằng hàm khác (CRF). */
  tagger?: (tokens: Token[], index: CatalogIndex, info: TokenInfo[]) => Label[];
  /** Điểm tối thiểu để coi là món trong danh mục. */
  tau?: number;
  /** Khoảng cách tối thiểu giữa ứng viên 1 và 2 để tự nhận; gần hơn thì hỏi chọn. */
  delta?: number;
}

export interface DetailedParse extends ParsedOrder {
  /** Câu trông như đơn hàng nhưng không ra được dòng nào: nên gửi LLM (`draft_parse`). PoC chỉ đếm, chưa gọi. */
  fallback: boolean;
  tokens: Token[];
  labels: Label[];
}

/** Tagger CRF (L3 đã train) thay cho tagger luật: `parseOrderDetailed(text, products, { tagger: crfTagger(model) })`. */
export const crfTagger =
  (model: CrfModel): NonNullable<ParseOptions['tagger']> =>
  (tokens, _index, info) =>
    viterbi(model, crfFeatures(tokens, info)) as Label[];

export const DEFAULT_TAU = 0.72;
export const DEFAULT_DELTA = 0.12;
const MAX_OPTIONS = 6;
const MIN_ITEM_PRICE = 500;

interface Span {
  slot: Slot;
  from: number;
  to: number;
}

function spansOf(labels: Label[]): Span[] {
  const out: Span[] = [];
  labels.forEach((l, i) => {
    if (l === 'O') return;
    const slot = l.slice(2) as Slot;
    const last = out[out.length - 1];
    if (l.startsWith('I-') && last && last.slot === slot && last.to === i) last.to = i + 1;
    else out.push({ slot, from: i, to: i + 1 });
  });
  return out;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Tên hiển thị của món chưa có trong danh mục: chữ gốc có dấu, bỏ đơn vị đứng đầu. */
function displayName(tokens: Token[]): string {
  const words = tokens.map((t) => t.raw);
  while (words.length > 1 && UNIT_WORDS.has(tokens[tokens.length - words.length].norm)) words.shift();
  return capitalize(words.join(' '));
}

/** Tiêu đề khoản chi: bỏ động từ chi đứng đầu ("chi", "trả") và từ đệm, giữ "tiền" ("tiền điện"). */
function expenseTitle(tokens: Token[]): string {
  const filler = (t: Token) => FILLER_RAW.has(t.raw) || (t.raw === t.norm && FILLER_WORDS.has(t.norm));
  const keep = (t: Token, i: number) => t.norm === 'tien' || (i > 0 && !filler(t));
  const title = tokens.filter(keep).map((t) => t.raw).join(' ').trim();
  return capitalize(title || tokens.map((t) => t.raw).join(' ')) || 'Khoản chi';
}

export function parseOrderDetailed(text: string, products: ParseableProduct[], opts: ParseOptions = {}): DetailedParse {
  const tau = opts.tau ?? DEFAULT_TAU;
  const delta = opts.delta ?? DEFAULT_DELTA;
  const index = catalogIndex(products);
  const tokens = tokenize(text);
  const info = analyze(tokens, index);
  const labels = (opts.tagger ?? ruleTag)(tokens, index, info);
  const spans = spansOf(labels);

  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  const missingQuantityItems: string[] = [];
  const disambiguations: DisambiguationItem[] = [];
  const expenses: ParsedExpenseItem[] = [];

  // Mệnh đề: cắt ở dấu câu và ở từ nối đã được gắn O
  const clauseOf: number[] = [];
  let clause = 0;
  tokens.forEach((t, i) => {
    if (t.kind === 'sep' || (labels[i] === 'O' && DELIMITERS.has(t.norm))) clause++;
    clauseOf.push(clause);
  });
  const byClause = new Map<number, Span[]>();
  for (const s of spans) {
    const c = clauseOf[s.from];
    byClause.set(c, [...(byClause.get(c) ?? []), s]);
  }

  for (const list of byClause.values()) {
    const used = new Set<Span>();
    // Khoản chi: cụm EXP + số tiền trong cùng mệnh đề
    const exp = list.filter((s) => s.slot === 'EXP');
    const amts = list.filter((s) => s.slot === 'AMT');
    if (exp.length && amts.length) {
      const amt = amts.find((s) => s.from > exp[0].from) ?? amts[0];
      const words = tokens.slice(exp[0].from, exp[exp.length - 1].to).filter((t) => t.kind !== 'money');
      expenses.push({ title: expenseTitle(words), amount: tokens[amt.from].value, category: 'khac' });
      used.add(amt);
    }

    const itemSpans = list.filter((s) => s.slot === 'ITEM');
    const qtys = list.filter((s) => s.slot === 'QTY');
    const between = (lo: number, hi: number) => qtys.filter((q) => !used.has(q) && q.from >= lo && q.to <= hi);
    const nameFirst = itemSpans.length > 0 && !qtys.some((q) => q.to <= itemSpans[0].from) && between(itemSpans[0].to, itemSpans[1]?.from ?? Infinity).length > 0;

    itemSpans.forEach((item, n) => {
      const prevEnd = n > 0 ? itemSpans[n - 1].to : -1;
      const nextStart = itemSpans[n + 1]?.from ?? Infinity;
      const left = between(prevEnd, item.from);
      const right = between(item.to, nextStart);
      let q: Span | undefined;
      if (nameFirst) q = right[0];
      else q = left[left.length - 1] ?? (right.length && (right.length > 1 || n === itemSpans.length - 1) ? right[0] : undefined);
      if (q) used.add(q);
      const qtyTokens = q ? tokens.slice(q.from, q.to) : [];
      const unitSpan = list.find(
        (s) => s.slot === 'UNIT' && ((q && s.from === q.to) || s.to === item.from || (nameFirst && s.from === item.to)),
      );
      const qty = q ? quantityValue(qtyTokens) : null;
      const explicit = qty !== null || !!unitSpan;
      const price = list.find((s) => s.slot === 'AMT' && !used.has(s) && s.from >= item.to && s.from < nextStart);
      const spoken = price && tokens[price.from].value >= MIN_ITEM_PRICE ? tokens[price.from].value : 0;
      if (price) used.add(price);

      const span = tokens.slice(item.from, item.to);
      const cands = linkSpan(index, span);
      const top = cands[0] as LinkCandidate | undefined;
      const amount = qty ?? 1;
      if (top && top.score >= tau) {
        const close = cands.filter((c) => c.score >= top.score - delta && c.coverage >= tau);
        if (close.length >= 2) {
          disambiguations.push({
            rawName: displayName(span),
            qty: amount,
            unit: unitSpan ? tokens[unitSpan.from].raw : null,
            options: close.slice(0, MAX_OPTIONS).map((c) => ({ product_id: c.product.id, name: c.product.name, unit_price_vnd: c.product.price })),
          });
          return;
        }
        const p = top.product;
        const ex = items.find((i) => i.productId === p.id);
        if (ex) ex.qty += amount;
        else items.push({ productId: p.id, name: p.name, price: p.price, qty: amount });
        return;
      }
      const name = displayName(span);
      if (spoken || explicit) {
        const dup = unknown.find((u) => u.name === name && u.price === spoken);
        if (dup) dup.qty += amount;
        else unknown.push({ name, price: spoken, qty: amount });
      } else missingQuantityItems.push(name);
    });
  }

  const empty = !items.length && !unknown.length && !missingQuantityItems.length && !disambiguations.length && !expenses.length;
  const orderish = labels.some((l) => l !== 'O') || info.some((x) => x.isNum);
  return {
    items,
    unknown,
    missingQuantityItems,
    disambiguations,
    expenses,
    normalizedText: tokens.map((t) => t.norm).join(' '),
    fallback: empty && orderish,
    tokens,
    labels,
  };
}

export function parseOrder(text: string, products: ParseableProduct[]): ParsedOrder {
  const { tokens: _t, labels: _l, fallback: _f, ...order } = parseOrderDetailed(text, products);
  return order;
}
