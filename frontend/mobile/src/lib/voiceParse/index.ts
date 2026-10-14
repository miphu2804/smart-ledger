/**
 * PoC parse giọng nói L1–L4 (xem docs/development/voice-parse-poc-brief.md), giữ nguyên interface `parseOrder`:
 * L1 `tokenize` (chuẩn hoá + ITN tiền) → L2 chỉ mục danh mục → L3 gắn nhãn BIO → ghép slot {qty, unit, item}
 * → L4 liên kết tên món + gate: tự nhận / hỏi chọn biến thể (`disambiguations`) / món chưa có trong danh mục.
 */
import type { LineItem } from '../../data/types';
import type { DisambiguationItem, ParseableProduct, ParsedExpenseItem, ParsedOrder } from '../parseOrder';
import { type CatalogIndex, catalogIndex, type LinkCandidate, linkSpan } from './catalog';
import { type CrfModel, marginals, viterbi } from './crf';
import crfModelJson from './crf-model.json';
import { crfFeatures } from './features';
import { analyze, findMarkers, isReferenceNumber, type Label, QTY_SLOTS, ruleTag, type Slot, type TokenInfo } from './tagger';
import { quantityValue, type Token, tokenize } from './text';
import { DELIMITERS, FILLER_RAW, FILLER_WORDS, UNIT_WORDS } from './lexicon';

/** Kết quả của tagger: nhãn BIO và (nếu có) độ tin cậy 0..1 của cả câu. */
export interface TagResult {
  labels: Label[];
  confidence?: number;
}
export type Tagger = (tokens: Token[], index: CatalogIndex, info: TokenInfo[]) => TagResult;

export interface ParseOptions {
  /** Gắn nhãn bằng luật (mặc định) hoặc bằng CRF (`crfTagger`). */
  tagger?: Tagger;
  /** Điểm tối thiểu để coi là món trong danh mục. */
  tau?: number;
  /** Khoảng cách tối thiểu giữa ứng viên 1 và 2 để tự nhận; gần hơn thì hỏi chọn. */
  delta?: number;
  /** Độ tin cậy tối thiểu của tagger; thấp hơn thì không tự nhận mà gửi LLM / hỏi lại. */
  minConfidence?: number;
  /**
   * Tagger thứ hai (CRF) cho câu mà tagger chính không hiểu (gate báo `marker` hoặc `unattached`): tagger luật chắc ở câu
   * thường, CRF đã học "mỗi thứ", "cũng vậy", sửa lời. Kết quả của tagger thứ hai vẫn qua cùng gate.
   */
  fallbackTagger?: Tagger;
}

export type FallbackReason = 'empty' | 'unattached' | 'marker' | 'confidence';

export interface DetailedParse extends ParsedOrder {
  /**
   * Không tự nhận câu này: gửi LLM (`draft_parse`) hoặc hỏi lại. Khi đó các mảng kết quả rỗng và kết quả cục bộ nằm ở
   * `tentative`. PoC chỉ đếm, chưa gọi LLM.
   */
  fallback: boolean;
  reason?: FallbackReason;
  tentative?: ParsedOrder;
  confidence?: number;
  tokens: Token[];
  labels: Label[];
}

export const ruleTagger: Tagger = (tokens, index, info) => ({ labels: ruleTag(tokens, index, info) });

/** Tagger CRF (L3 đã train): nhãn Viterbi và độ tin cậy = xác suất biên nhỏ nhất của nhãn đã chọn trên các token. */
export const crfTagger =
  (model: CrfModel): Tagger =>
  (tokens, _index, info) => {
    const x = crfFeatures(tokens, info);
    const labels = viterbi(model, x) as Label[];
    const marg = marginals(model, x);
    const pick = labels.map((l, t) => marg[t][model.labels.indexOf(l)]);
    return { labels, confidence: pick.length ? Math.min(...pick) : 1 };
  };

export const DEFAULT_TAU = 0.72;
export const DEFAULT_DELTA = 0.12;
export const DEFAULT_MIN_CONFIDENCE = 0.9;
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

/** Liên kết các cụm của một câu, nhớ kết quả theo vị trí để mỗi cụm chỉ so với danh mục một lần. */
function linker(index: CatalogIndex, tokens: Token[]) {
  const memo = new Map<string, LinkCandidate[]>();
  return (from: number, to: number): LinkCandidate[] => {
    const key = `${from}:${to}`;
    let v = memo.get(key);
    if (!v) memo.set(key, (v = linkSpan(index, tokens.slice(from, to))));
    return v;
  };
}
type Link = ReturnType<typeof linker>;

/**
 * Sửa ranh giới cụm tên món bằng bằng chứng của linker (dùng cho mọi tagger):
 * - bỏ đơn vị đứng đầu cụm ("chai nam ngư" → đơn vị "chai" + "nam ngư");
 * - cắt bổ ngữ cuối khi phần đầu tự khớp một món tốt hơn ("trà tắc không đường" → "trà tắc");
 * - nối hai cụm liền nhau khi cụm sau không tự chỉ một món khác ("mì ly" + "lẩu thái", "tra đào cam" + "xả").
 */
function repairItemSpans(spans: Span[], info: TokenInfo[], link: Link, tau: number): Span[] {
  const out: Span[] = [];
  for (const s0 of spans) {
    let s = s0;
    if (s.slot === 'ITEM') {
      if (s.to - s.from > 1 && info[s.from].isUnit && !(info[s.from].gzLen >= 2 && info[s.from].gzContent)) {
        out.push({ slot: 'UNIT', from: s.from, to: s.from + 1 });
        s = { ...s, from: s.from + 1 };
      }
      for (let k = s.from + 1; k < s.to; k++) {
        if (!info[k].isFiller || info[k].gzLen > 0) continue;
        const whole = link(s.from, s.to)[0];
        const head = link(s.from, k)[0];
        if (head && head.score >= tau && (!whole || head.score > whole.score)) s = { ...s, to: k };
        break;
      }
      const prev = out[out.length - 1];
      if (prev?.slot === 'ITEM' && prev.to === s.from) {
        const a = link(prev.from, prev.to)[0];
        const b = link(s.from, s.to)[0];
        const both = link(prev.from, s.to)[0];
        const bOwn = b && b.score >= tau && b.product !== a?.product;
        if (a && a.score >= tau && both && both.product === a.product && both.score >= tau && !bOwn) {
          prev.to = s.to;
          continue;
        }
      }
    }
    out.push({ ...s });
  }
  return out;
}

interface Line {
  item: Span;
  clause: number;
  qty: number | null;
  qtySpan?: Span;
}

/** Model CRF đã train (`npm run voice:train`), dùng cho câu mà tagger luật không hiểu. */
export const CRF_MODEL = crfModelJson as unknown as CrfModel;
const defaultCrf = crfTagger(CRF_MODEL);

/**
 * Mặc định: tagger luật trước (chắc ở câu thường), câu nào nó không hiểu thì CRF gắn lại. Truyền `tagger`/`fallbackTagger`
 * để so sánh từng cách (`fallbackTagger: undefined` là chỉ dùng tagger chính).
 */
export function parseOrderDetailed(text: string, products: ParseableProduct[], options: ParseOptions = {}): DetailedParse {
  const opts: ParseOptions = { fallbackTagger: defaultCrf, ...options };
  const first = parseWith(text, products, opts);
  if (!opts.fallbackTagger || (first.reason !== 'marker' && first.reason !== 'unattached')) return first;
  return parseWith(text, products, { ...opts, tagger: opts.fallbackTagger, fallbackTagger: undefined });
}

function parseWith(text: string, products: ParseableProduct[], opts: ParseOptions): DetailedParse {
  const tau = opts.tau ?? DEFAULT_TAU;
  const delta = opts.delta ?? DEFAULT_DELTA;
  const index = catalogIndex(products);
  const tokens = tokenize(text);
  const info = analyze(tokens, index);
  const { labels, confidence } = (opts.tagger ?? ruleTagger)(tokens, index, info);
  const link = linker(index, tokens);
  const spans = repairItemSpans(spansOf(labels), info, link, tau);

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
  const used = new Set<Span>();
  const lines: Line[] = spans.filter((s) => s.slot === 'ITEM').map((item) => ({ item, clause: clauseOf[item.from], qty: null }));
  const setQty = (line: Line, q: Span) => {
    line.qty = quantityValue(tokens.slice(q.from, q.to));
    line.qtySpan = q;
    used.add(q);
  };

  // Khoản chi: cụm EXP + số tiền trong cùng mệnh đề
  for (const c of new Set(spans.map((s) => clauseOf[s.from]))) {
    const list = spans.filter((s) => clauseOf[s.from] === c);
    const exp = list.filter((s) => s.slot === 'EXP');
    const amts = list.filter((s) => s.slot === 'AMT');
    if (exp.length && amts.length) {
      const amt = amts.find((s) => s.from > exp[0].from) ?? amts[0];
      const words = tokens.slice(exp[0].from, exp[exp.length - 1].to).filter((t) => t.kind !== 'money');
      expenses.push({ title: expenseTitle(words), amount: tokens[amt.from].value, category: 'khac' });
      used.add(amt);
    }
  }

  // Số lượng thường (QTY): trong cùng mệnh đề, đứng trước tên món; câu nói tên trước ("gạo hai bao") thì lấy số đứng sau
  for (const c of new Set(lines.map((l) => l.clause))) {
    const inClause = lines.filter((l) => l.clause === c);
    const qtys = spans.filter((s) => s.slot === 'QTY' && clauseOf[s.from] === c);
    const between = (lo: number, hi: number) => qtys.filter((q) => !used.has(q) && q.from >= lo && q.to <= hi);
    const first = inClause[0].item;
    const nameFirst = !qtys.some((q) => q.to <= first.from) && between(first.to, inClause[1]?.item.from ?? Infinity).length > 0;
    inClause.forEach((line, n) => {
      const prevEnd = n > 0 ? inClause[n - 1].item.to : -1;
      const nextStart = inClause[n + 1]?.item.from ?? Infinity;
      const left = between(prevEnd, line.item.from);
      const right = between(line.item.to, nextStart);
      const q = nameFirst
        ? right[0]
        : (left[left.length - 1] ?? (right.length && (right.length > 1 || n === inClause.length - 1) ? right[0] : undefined));
      if (q) setQty(line, q);
    });
  }

  // Số lượng có quan hệ (chỉ CRF gán): món trước, cả danh sách, sửa lời, lấy lại số của món trước
  for (const s of spans.filter((x) => x.slot === 'QTYP' || x.slot === 'QTYD' || x.slot === 'QTYC' || x.slot === 'COPY')) {
    const before = lines.filter((l) => l.item.to <= s.from);
    const prev = before[before.length - 1];
    if ((s.slot === 'QTYP' || s.slot === 'QTYC') && prev) setQty(prev, s);
    else if (s.slot === 'QTYD') {
      const group: Line[] = [];
      for (let i = before.length - 1; i >= 0 && before[i].qty === null; i--) group.unshift(before[i]);
      if (!group.length) {
        for (const l of lines.filter((x) => x.item.from >= s.to)) {
          if (l.qty !== null || spans.some((q) => QTY_SLOTS.has(q.slot) && q !== s && q.from >= s.to && q.to <= l.item.from)) break;
          group.push(l);
        }
      }
      for (const l of group) setQty(l, s);
    } else if (s.slot === 'COPY' && prev) {
      const src = before.slice(0, -1).reverse().find((l) => l.qty !== null);
      if (src) {
        prev.qty = src.qty;
        used.add(s);
      }
    }
  }

  for (const line of lines) {
    const { item } = line;
    const nextStart = lines.find((l) => l.item.from > item.from)?.item.from ?? Infinity;
    const q = line.qtySpan;
    const unitSpan = spans.find((s) => s.slot === 'UNIT' && ((q && s.from === q.to) || s.to === item.from || s.from === item.to));
    const explicit = line.qty !== null || !!unitSpan;
    const price = spans.find((s) => s.slot === 'AMT' && !used.has(s) && s.from >= item.to && s.from < nextStart);
    const spoken = price && tokens[price.from].value >= MIN_ITEM_PRICE ? tokens[price.from].value : 0;
    if (price) used.add(price);

    const span = tokens.slice(item.from, item.to);
    const cands = link(item.from, item.to);
    const top = cands[0] as LinkCandidate | undefined;
    const amount = line.qty ?? 1;
    if (top && top.score >= tau) {
      const close = cands.filter((c) => c.score >= top.score - delta && c.coverage >= tau);
      if (close.length >= 2) {
        disambiguations.push({
          rawName: displayName(span),
          qty: amount,
          unit: unitSpan ? tokens[unitSpan.from].raw : null,
          options: close.slice(0, MAX_OPTIONS).map((c) => ({ product_id: c.product.id, name: c.product.name, unit_price_vnd: c.product.price })),
        });
        continue;
      }
      const p = top.product;
      const ex = items.find((i) => i.productId === p.id);
      if (ex) ex.qty += amount;
      else items.push({ productId: p.id, name: p.name, price: p.price, qty: amount });
      continue;
    }
    const name = displayName(span);
    if (spoken || explicit) {
      const dup = unknown.find((u) => u.name === name && u.price === spoken);
      if (dup) dup.qty += amount;
      else unknown.push({ name, price: spoken, qty: amount });
    } else missingQuantityItems.push(name);
  }

  const order: ParsedOrder = {
    items,
    unknown,
    missingQuantityItems,
    disambiguations,
    expenses,
    normalizedText: tokens.map((t) => t.norm).join(' '),
  };

  // Gate: không đoán khi chưa hiểu câu. Số lượng chưa gắn được vào món nào, dấu hiệu quan hệ ("mỗi thứ", "cũng vậy",
  // "à không", "ba ly: …") mà tagger không gán nhãn tương ứng, hoặc tagger kém tự tin → gửi LLM / hỏi lại.
  const qtySpans = spans.filter((s) => QTY_SLOTS.has(s.slot) || s.slot === 'COPY');
  const has = (slot: Slot, from = 0) => spans.some((s) => s.slot === slot && s.from >= from);
  const markers = findMarkers(tokens, info);
  const explained = markers.every((m) => {
    switch (m.kind) {
      case 'dist':
        return has('QTYD');
      case 'copy':
        return has('COPY', m.at) || has('QTYP', m.at);
      case 'corr':
        return has('QTYC', m.at) || tokens.some((t, i) => i < m.at && info[i].isNum && labels[i] === 'O');
      case 'total':
        return labels[m.at] === 'O';
    }
  });
  // Số bị gán O mà không phải số bàn/giờ, số tổng hay số đã sửa lời: có thể là số lượng bị bỏ sót
  const droppedNumber = tokens.some(
    (t, i) =>
      info[i].isNum &&
      labels[i] === 'O' &&
      !isReferenceNumber(tokens, i) &&
      !markers.some((m) => (m.kind === 'total' && m.at === i) || (m.kind === 'corr' && m.at > i)) &&
      !(info[i].gzLen >= 2 && info[i].gzContent),
  );
  let reason: FallbackReason | undefined;
  if (qtySpans.some((s) => !used.has(s)) || droppedNumber) reason = 'unattached';
  else if (!explained) reason = 'marker';
  else if (confidence !== undefined && confidence < (opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE)) reason = 'confidence';
  else {
    const empty = !items.length && !unknown.length && !missingQuantityItems.length && !disambiguations.length && !expenses.length;
    if (empty && (labels.some((l) => l !== 'O') || info.some((x) => x.isNum))) reason = 'empty';
  }
  if (reason && reason !== 'empty') {
    const none: ParsedOrder = { items: [], unknown: [], missingQuantityItems: [], disambiguations: [], expenses: [], normalizedText: order.normalizedText };
    return { ...none, fallback: true, reason, tentative: order, confidence, tokens, labels };
  }
  return { ...order, fallback: !!reason, reason, confidence, tokens, labels };
}

export function parseOrder(text: string, products: ParseableProduct[]): ParsedOrder {
  const { items, unknown, missingQuantityItems, disambiguations, expenses, normalizedText } = parseOrderDetailed(text, products);
  return { items, unknown, missingQuantityItems, disambiguations, expenses, normalizedText };
}
