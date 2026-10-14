/**
 * PoC parse giọng nói L1–L4 (xem docs/development/voice-parse-poc-brief.md), giữ nguyên interface `parseOrder`:
 * L1 `tokenize` (chuẩn hoá + ITN tiền) → L2 chỉ mục danh mục → L3 gắn nhãn BIO → ghép slot {qty, unit, item}
 * → L4 liên kết tên món + gate: tự nhận / hỏi chọn biến thể (`disambiguations`) / món chưa có trong danh mục.
 */
import type { LineItem } from '../../data/types';
import type { DisambiguationItem, ParseableProduct, ParsedExpenseItem, ParsedOrder } from '../parseOrder';
import { type CatalogIndex, catalogIndex, type LinkCandidate, linkSpan } from './catalog';
import { type CrfModel, marginals, nBest, sequenceProb, viterbi } from './crf';
import crfModelJson from './crf-model.json';
import { crfFeatures, sentenceShape, shapeBigrams } from './features';
import { analyze, findMarkers, isReferenceNumber, type Label, QTY_SLOTS, ruleTag, type Slot, type TokenInfo } from './tagger';
import { quantityValue, type Token, tokenize } from './text';
import { DELIMITERS, FILLER_RAW, FILLER_WORDS, UNIT_WORDS } from './lexicon';

/** Kết quả của tagger: nhãn BIO; tagger CRF trả thêm xác suất của chuỗi nhãn và xác suất biên của nhãn O. */
export interface TagResult {
  labels: Label[];
  /** P(labels | câu). */
  prob?: number;
  /** k chuỗi nhãn tốt nhất (giảm dần, gồm cả `labels`) và xác suất; chỉ tính khi `prob` chưa đủ ngưỡng. */
  nbest?: () => Array<{ labels: Label[]; prob: number }>;
  /** P(nhãn O | câu) ở token i: số bị gán O mà CRF chắc chắn thì không coi là số lượng bị bỏ sót (tính khi cần). */
  pOutside?: (i: number) => number;
  /** Số cặp lớp liền nhau của khung câu (`sentenceShape`) không có trong câu train của model; không đo được thì bỏ trống. */
  novelty?: number;
}
export type Tagger = (tokens: Token[], index: CatalogIndex, info: TokenInfo[]) => TagResult;

export interface ParseOptions {
  /** Tagger chính: CRF (mặc định) hoặc tagger luật (`ruleTagger`), hoặc CRF với model khác (`crfTagger`). */
  tagger?: Tagger;
  /** Điểm tối thiểu để coi là món trong danh mục. */
  tau?: number;
  /** Khoảng cách tối thiểu giữa ứng viên 1 và 2 để tự nhận; gần hơn thì hỏi chọn. */
  delta?: number;
  /**
   * Độ tin cậy tối thiểu của tagger CRF: xác suất của đơn hàng đã chọn (xem `decode`); thấp hơn thì không tự nhận mà gửi
   * LLM / hỏi lại. Cũng là ngưỡng để tin một số bị CRF gán O (không phải số lượng).
   */
  minConfidence?: number;
  /**
   * Tagger thứ hai cho câu mà tagger chính không tự nhận được; kết quả vẫn qua cùng gate. Mặc định không có: dò lưới
   * (`voice:grid`) cho thấy tagger luật làm dự phòng thêm vài câu đúng nhưng tự nhận sai nhiều khi câu có từ lạ (biến
   * "thím", "xin lỗi", "dãy 3" thành món), nên chỉ để so sánh.
   */
  fallbackTagger?: Tagger;
  /**
   * Cách chọn đơn hàng từ k chuỗi nhãn tốt nhất của CRF khi chuỗi Viterbi chưa đủ tin cậy hoặc không qua gate:
   * `valid` (mặc định) chỉ xét các chuỗi qua gate cấu trúc (mọi số đều gắn được vào món, mọi dấu hiệu đều được giải
   * thích), chọn đơn hàng có tổng xác suất lớn nhất và chuẩn hoá trên các chuỗi đó; `viterbi` giữ đơn hàng của chuỗi
   * Viterbi và cộng xác suất các chuỗi ra cùng đơn hàng.
   */
  decode?: 'viterbi' | 'valid';
  /**
   * `valid`: tổng xác suất tối thiểu của các chuỗi qua gate; thấp hơn thì CRF gần như chắc câu này nằm ngoài cấu trúc nó
   * hiểu, tỉ lệ giữa các chuỗi còn lại không đáng tin.
   */
  minValidMass?: number;
  /**
   * Độ tin cậy không phân biệt tên món mới, tiêu đề khoản chi và tên trong câu hỏi chọn (mặc định bật): các phần này luôn
   * qua hộp thoại cho người dùng sửa (`voice.tsx`), chỉ món trong danh mục được ghi thẳng.
   */
  looseNames?: boolean;
  /**
   * Gate cho câu nói tự do (mặc định bật). Câu phức (từ hai số hoặc hai dòng trở lên, có số lượng quan hệ, sửa lời hay dấu
   * hiệu quan hệ) mà khung câu có cặp lớp chưa gặp khi train thì không tự nhận (`novel`): kiểu câu model chưa học thì độ
   * tin cậy CRF không đáng tin. Món trong danh mục không nhận được số nào trong câu có nói số lượng cũng không tự nhận
   * (`implicit`): thường là CRF bỏ sót "mỗi thứ", "cũng vậy"… và món đó lấy số 1. Tắt (`false`) để so với gate cũ.
   */
  freeFormGate?: boolean;
  /** Nghiên cứu (ablation, `voice:grid --ablate`): tắt gate dấu hiệu viết tay (`markers`) hoặc luật số bàn/giờ (`refs`). */
  ablate?: Array<'markers' | 'refs'>;
  /** Nghiên cứu (`voice:grid --oracle`): nhận danh sách đơn hàng ứng viên (đã gộp theo đơn hàng) của lượt CRF. */
  onCandidates?: (list: Candidate[]) => void;
}

export interface Candidate {
  mass: number;
  order: ParsedOrder;
  reason?: FallbackReason;
  /** Có món trong danh mục không nhận được số nào trong câu có nói số lượng (lấy số 1). */
  implicit?: boolean;
}

/**
 * Vì sao không tự nhận: `unattached` số lượng chưa gắn được vào món hoặc bị bỏ sót; `marker` có dấu hiệu quan hệ số lượng
 * mà tagger không giải thích; `duplicate` một món được nói hai lần (thường là sửa lời: "à nhầm", "khoan"); `implicit`
 * câu có nói số lượng mà một món trong danh mục không nhận được số nào; `confidence` CRF không chắc; `novel` câu phức có
 * khung câu model chưa gặp khi train (`freeFormGate`); `empty` không ra dòng nào.
 */
export type FallbackReason = 'empty' | 'unattached' | 'marker' | 'duplicate' | 'implicit' | 'confidence' | 'novel';

export interface DetailedParse extends ParsedOrder {
  /**
   * Không tự nhận câu này: gửi LLM (`draft_parse`) hoặc hỏi lại. Khi đó các mảng kết quả rỗng và kết quả cục bộ nằm ở
   * `tentative`. PoC chỉ đếm, chưa gọi LLM.
   */
  fallback: boolean;
  reason?: FallbackReason;
  tentative?: ParsedOrder;
  confidence?: number;
  /** Số cặp lớp của khung câu chưa gặp khi train (`TagResult.novelty`). */
  novelty?: number;
  tokens: Token[];
  labels: Label[];
}

export const ruleTagger: Tagger = (tokens, index, info) => ({ labels: ruleTag(tokens, index, info) });

/** Bọc một mảng tính chậm: chỉ tính lần đầu cần tới. */
const lazy = (make: () => number[]) => {
  let v: number[] | undefined;
  return (i: number) => (v ??= make())[i];
};

/** Tagger CRF (L3 đã train): nhãn Viterbi và xác suất của nó, k chuỗi nhãn tốt nhất (tính khi cần), P(O) từng token. */
export const crfTagger = (model: CrfModel, k = N_BEST): Tagger => {
  const seen = model.shapes && new Set(model.shapes);
  return (tokens, _index, info) => {
    const x = crfFeatures(tokens, info, model.features);
    const labels = viterbi(model, x) as Label[];
    const outside = model.labels.indexOf('O');
    return {
      labels,
      prob: sequenceProb(model, x, labels),
      nbest: () => nBest(model, x, k) as Array<{ labels: Label[]; prob: number }>,
      pOutside: lazy(() => marginals(model, x).map((m) => m[outside])),
      novelty: seen && new Set(shapeBigrams(sentenceShape(x)).filter((g) => !seen.has(g))).size,
    };
  };
};

export const DEFAULT_TAU = 0.72;
export const DEFAULT_DELTA = 0.12;
export const DEFAULT_MIN_CONFIDENCE = 0.9;
export const DEFAULT_MIN_VALID_MASS = 0.1;
/** Số chuỗi nhãn CRF xét khi tính độ tin cậy theo đơn hàng (lưới k = 32/64/128 cho cùng kết quả). */
const N_BEST = 32;
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
 * - nối hai cụm liền nhau khi cụm sau không tự chỉ một món khác ("mì ly" + "lẩu thái", "tra đào cam" + "xả");
 * - nối từ đứng ngay sau (đang gán O) khi nó làm trọn tên một món rõ ràng hơn: "hai cơm thêm" là "Cơm thêm", không phải
 *   "cơm" (mơ hồ) và từ nối "thêm".
 */
function repairItemSpans(spans: Span[], info: TokenInfo[], link: Link, tau: number, delta: number): Span[] {
  const out: Span[] = [];
  const margin = (c: LinkCandidate[]) => (c[0]?.score ?? 0) - (c[1]?.score ?? 0);
  for (const [n, s0] of spans.entries()) {
    let s = s0;
    if (s.slot === 'ITEM') {
      const next = s.to;
      if (next < info.length && spans[n + 1]?.from !== next && info[next].gzLen > 0 && !info[next].isNum) {
        const cur = link(s.from, s.to);
        const ext = link(s.from, next + 1);
        if (ext[0] && ext[0].score >= tau && ext[0].coverage >= 1 && margin(ext) >= delta && margin(ext) > margin(cur)) s = { ...s, to: next + 1 };
      }
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

/** Model CRF đã train (`npm run voice:train`). */
export const CRF_MODEL = crfModelJson as unknown as CrfModel;
const defaultCrf = crfTagger(CRF_MODEL);

/** Phần dùng chung của một câu cho mọi tagger và mọi chuỗi nhãn ứng viên. */
interface Context {
  index: CatalogIndex;
  tokens: Token[];
  info: TokenInfo[];
  link: Link;
  tau: number;
  delta: number;
  minConfidence: number;
  decode: NonNullable<ParseOptions['decode']>;
  minValidMass: number;
  looseNames: boolean;
  freeFormGate: boolean;
  ablate: Set<string>;
  onCandidates?: ParseOptions['onCandidates'];
}

/**
 * Mặc định chỉ CRF: câu CRF không tự nhận được (không chắc, số chưa gắn, dấu hiệu chưa hiểu…) thì `fallback`. Truyền
 * `tagger`/`fallbackTagger` để so sánh (`fallbackTagger: ruleTagger` là CRF trước, tagger luật gắn lại câu CRF bỏ).
 */
export function parseOrderDetailed(text: string, products: ParseableProduct[], options: ParseOptions = {}): DetailedParse {
  const opts: ParseOptions = { tagger: defaultCrf, ...options };
  const index = catalogIndex(products);
  const tokens = tokenize(text);
  const ctx: Context = {
    index,
    tokens,
    info: analyze(tokens, index),
    link: linker(index, tokens),
    tau: opts.tau ?? DEFAULT_TAU,
    delta: opts.delta ?? DEFAULT_DELTA,
    minConfidence: opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE,
    decode: opts.decode ?? 'valid',
    minValidMass: opts.minValidMass ?? DEFAULT_MIN_VALID_MASS,
    looseNames: opts.looseNames ?? true,
    freeFormGate: opts.freeFormGate ?? true,
    ablate: new Set(opts.ablate ?? []),
    onCandidates: opts.onCandidates,
  };
  const first = parseWith(ctx, opts.tagger ?? defaultCrf);
  if (!first.fallback || !opts.fallbackTagger) return first;
  // tagger dự phòng không đo được độ lạ của câu: dùng độ lạ của lượt CRF để gate câu tự do vẫn áp dụng
  const second = parseWith(ctx, opts.fallbackTagger, first.novelty);
  return second.fallback ? first : second;
}

/** Khoá của đơn hàng ghép ra (kèm lý do gate) để gộp các chuỗi nhãn ra cùng đơn hàng. */
const signature = (a: Assembled, loose: boolean) => {
  const o = a.order;
  if (!loose) return JSON.stringify([o.items, o.unknown, o.missingQuantityItems, o.disambiguations, o.expenses, a.reason]);
  return JSON.stringify([
    o.items,
    o.unknown.map((u) => [u.price, u.qty]),
    o.missingQuantityItems?.length,
    o.disambiguations?.map((d) => [d.qty, d.unit, d.options.map((x) => x.product_id)]),
    o.expenses?.map((e) => e.amount),
    a.reason,
  ]);
};

function parseWith(ctx: Context, tagger: Tagger, knownNovelty?: number): DetailedParse {
  const { tokens } = ctx;
  const tagged = tagger(tokens, ctx.index, ctx.info);
  const novelty = tagged.novelty ?? knownNovelty;
  const { prob, nbest, pOutside } = tagged;
  let labels = tagged.labels;
  let best = assemble(ctx, labels, pOutside, prob === undefined);
  let confidence = prob;
  const key = (a: Assembled) => signature(a, ctx.looseNames);
  const same = (a: Label[]) => a.length === labels.length && a.every((l, i) => l === labels[i]);
  if (confidence !== undefined && nbest && ctx.decode === 'valid' && (confidence < ctx.minConfidence || best.reason)) {
    // Gộp k chuỗi nhãn tốt nhất theo đơn hàng ghép ra; trong các đơn hàng qua gate, chọn đơn có tổng xác suất lớn nhất.
    // Độ tin cậy = xác suất của đơn đó trên tổng xác suất các chuỗi qua gate (phần ngoài k chuỗi tính là không qua được).
    const groups = new Map<string, { mass: number; a: Assembled; labels: Label[] }>();
    groups.set(key(best), { mass: confidence, a: best, labels });
    let seen = confidence;
    for (const alt of nbest()) {
      if (same(alt.labels)) continue;
      seen += alt.prob;
      const a = assemble(ctx, alt.labels, pOutside);
      const g = groups.get(key(a));
      if (g) g.mass += alt.prob;
      else groups.set(key(a), { mass: alt.prob, a, labels: alt.labels });
    }
    const all = [...groups.values()];
    ctx.onCandidates?.(all.map((g) => ({ mass: g.mass, order: g.a.order, reason: g.a.reason, implicit: g.a.implicit })));
    const valid = all.filter((g) => !g.a.reason);
    const top = valid.reduce<(typeof all)[number] | undefined>((m, g) => (!m || g.mass > m.mass ? g : m), undefined);
    if (top) {
      const validMass = valid.reduce((n, g) => n + g.mass, 0);
      best = top.a;
      labels = top.labels;
      confidence = validMass < ctx.minValidMass ? 0 : top.mass / (validMass + Math.max(0, 1 - seen));
    }
  } else if (confidence !== undefined && confidence < ctx.minConfidence && nbest) {
    // `viterbi`: cộng xác suất các chuỗi nhãn ứng viên ghép ra đúng đơn hàng của chuỗi Viterbi (cùng lý do gate).
    // Dừng sớm khi đã chắc chắn qua hoặc không thể qua ngưỡng.
    const k = key(best);
    let seen = confidence;
    for (const alt of nbest()) {
      if (confidence >= ctx.minConfidence || confidence + (1 - seen) < ctx.minConfidence) break;
      if (same(alt.labels)) continue;
      seen += alt.prob;
      if (key(assemble(ctx, alt.labels, pOutside)) === k) confidence += alt.prob;
    }
  }
  let reason: FallbackReason | undefined = best.reason;
  if (!reason && confidence !== undefined && confidence < ctx.minConfidence) reason = 'confidence';
  if (!reason && best.empty) reason = 'empty';
  const order = best.order;
  if (!reason && ctx.freeFormGate) {
    if (best.implicit) reason = 'implicit';
    else if (best.overlap) reason = 'duplicate';
    else if (novelty && isComplex(ctx, labels, order)) reason = 'novel';
  }
  if (reason && reason !== 'empty') {
    const none: ParsedOrder = { items: [], unknown: [], missingQuantityItems: [], disambiguations: [], expenses: [], normalizedText: order.normalizedText };
    return { ...none, fallback: true, reason, tentative: order, confidence, novelty, tokens, labels };
  }
  return { ...order, fallback: !!reason, reason, confidence, novelty, tokens, labels };
}

/** Câu phức: nhiều số hoặc nhiều dòng, hoặc có quan hệ số lượng / sửa lời (nhãn hay dấu hiệu). */
function isComplex(ctx: Context, labels: Label[], o: ParsedOrder): boolean {
  const lines = o.items.length + o.unknown.length + (o.missingQuantityItems?.length ?? 0) + (o.disambiguations?.length ?? 0) + (o.expenses?.length ?? 0);
  return (
    lines >= 2 ||
    ctx.info.filter((x) => x.isNum).length >= 2 ||
    labels.some((l) => /^[BI]-(QTYP|QTYD|QTYC|COPY|EDIT)$/.test(l)) ||
    findMarkers(ctx.tokens, ctx.info).length > 0
  );
}

interface Assembled {
  order: ParsedOrder;
  /** Lý do gate theo cấu trúc câu (chưa tính độ tin cậy của tagger). */
  reason?: Exclude<FallbackReason, 'confidence' | 'empty' | 'novel'>;
  /** Câu có số hoặc nhãn mà không ra dòng nào. */
  empty: boolean;
  /** Món trong danh mục không có số trong câu có nói số lượng (gate `implicit`: khi `strict`, và khi `freeFormGate`). */
  implicit: boolean;
  /** Câu hỏi chọn có lựa chọn trùng một món khác của đơn (thường là "tổng rồi kể": "hai tô phở, một bò tái một gà"). */
  overlap: boolean;
}

/**
 * Ghép slot từ một chuỗi nhãn, liên kết tên món, và kiểm tra gate theo cấu trúc câu.
 * `strict`: tagger không đo được độ tin cậy (tagger luật) thì thêm gate `implicit`, vì lỗi hay gặp của nó là biến một từ
 * lạ ("ơn", "tớ", "ăn") thành món và lấy mất số lượng của món thật, món thật còn lại thành số lượng 1.
 */
function assemble(ctx: Context, labels: Label[], pOutside?: (i: number) => number, strict = false): Assembled {
  const { tokens, info, link, tau, delta } = ctx;
  const spans = repairItemSpans(spansOf(labels), info, link, tau, delta);

  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  const missingQuantityItems: string[] = [];
  const disambiguations: DisambiguationItem[] = [];
  const expenses: ParsedExpenseItem[] = [];

  // Mệnh đề: cắt ở dấu câu và ở từ nối đã được gắn O
  // Cụm sửa lời (EDIT) nối hai mệnh đề quanh nó: "hai gói hảo hảo, à không, ba gói" là một mệnh đề
  const isEdit = (i: number) => labels[i] === 'B-EDIT' || labels[i] === 'I-EDIT';
  const clauseOf: number[] = [];
  let clause = 0;
  tokens.forEach((t, i) => {
    if ((t.kind === 'sep' || (labels[i] === 'O' && DELIMITERS.has(t.norm))) && !isEdit(i - 1) && !isEdit(i + 1)) clause++;
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
    if ((s.slot === 'QTYP' || s.slot === 'QTYC') && prev) {
      setQty(prev, s);
      // "gạo tám, ờ bốn bao, à không năm bao": số nằm giữa món và số sửa là số đã bị sửa
      if (s.slot === 'QTYC') for (const q of spans) if (QTY_SLOTS.has(q.slot) && q.from >= prev.item.to && q.to <= s.from) used.add(q);
    } else if (s.slot === 'QTYD') {
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

  // Sửa lời: món nói ngay sau cụm EDIT (cùng mệnh đề) thay cho món nói trước. Cùng món thì thay lần nói trước của món
  // đó ("ba trà đá à không năm trà đá"), khác món thì thay món ngay trước EDIT ("hai phở gà, à nhầm phở bò"); món mới
  // chưa có số thì giữ số của món cũ. EDIT không thay món nào thì phải sửa số (QTYC sau nó, hoặc số bị bỏ trước nó).
  const dropped = new Set<Line>();
  const edits = spans.filter((s) => s.slot === 'EDIT');
  let unusedEdit = false;
  const identity = (l: Line) => {
    const top = link(l.item.from, l.item.to)[0];
    return top && top.score >= tau ? `#${top.product.id}` : displayName(tokens.slice(l.item.from, l.item.to)).toLowerCase();
  };
  for (const e of edits) {
    const before = lines.filter((l) => l.item.to <= e.from && !dropped.has(l));
    const after = lines.find((l) => l.item.from >= e.to && !dropped.has(l));
    const relational = (s: Span) => s.slot !== 'QTY' && QTY_SLOTS.has(s.slot);
    if (before.length && after && after.clause === clauseOf[e.from] && !spans.some((s) => (relational(s) || s.slot === 'COPY') && s.from >= e.to && s.to <= after.item.from)) {
      const id = identity(after);
      const target = [...before].reverse().find((l) => identity(l) === id) ?? before[before.length - 1];
      if (after.qty === null) after.qty = target.qty;
      dropped.add(target);
    } else {
      const fixesQty = spans.some((s) => s.slot === 'QTYC' && s.from >= e.to);
      const cancelsNumber = tokens.some((t, i) => i < e.from && clauseOf[i] === clauseOf[e.from] && info[i].isNum && labels[i] === 'O');
      if (!fixesQty && !cancelsNumber) unusedEdit = true;
    }
  }

  let duplicate = false;
  let implicit = false;
  const anyQuantity = lines.some((l) => l.qty !== null);
  for (const line of lines) {
    if (dropped.has(line)) continue;
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
      if (line.qty === null && !unitSpan && !spoken && anyQuantity) implicit = true;
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
      if (ex) {
        ex.qty += amount;
        duplicate = true;
      } else items.push({ productId: p.id, name: p.name, price: p.price, qty: amount });
      continue;
    }
    const name = displayName(span);
    if (spoken || explicit) {
      const dup = unknown.find((u) => u.name === name && u.price === spoken);
      if (dup) {
        dup.qty += amount;
        duplicate = true;
      } else unknown.push({ name, price: spoken, qty: amount });
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
  // "à không", "ba ly: …") mà tagger không gán nhãn tương ứng, một món nói hai lần, hoặc món không có số trong câu có nói
  // số → gửi LLM / hỏi lại.
  const qtySpans = spans.filter((s) => QTY_SLOTS.has(s.slot) || s.slot === 'COPY');
  const has = (slot: Slot, from = 0) => spans.some((s) => s.slot === slot && s.from >= from);
  const markers = ctx.ablate.has('markers') ? [] : findMarkers(tokens, info);
  const explained = markers.every((m) => {
    switch (m.kind) {
      case 'dist':
        return has('QTYD');
      case 'copy':
        return has('COPY', m.at) || has('QTYP', m.at);
      case 'corr':
        return (
          has('QTYC', m.at) ||
          tokens.some((t, i) => i < m.at && info[i].isNum && labels[i] === 'O') ||
          edits.some((e) => e.from <= m.at + 1 && e.to >= m.at)
        );
      case 'total':
        return labels[m.at] === 'O';
    }
  });
  // Số bị gán O mà không phải số bàn/giờ, số tổng hay số đã sửa lời: có thể là số lượng bị bỏ sót. CRF chắc chắn số đó
  // không phải số lượng (P(O) ≥ θ: "ngày mười lăm", "số 0909", "tổng cộng năm món") thì tin CRF.
  const droppedNumber = tokens.some(
    (t, i) =>
      info[i].isNum &&
      labels[i] === 'O' &&
      !(!ctx.ablate.has('refs') && isReferenceNumber(tokens, i)) &&
      !markers.some((m) => (m.kind === 'total' && m.at === i) || (m.kind === 'corr' && m.at > i)) &&
      !edits.some((e) => e.from > i && clauseOf[e.from] === clauseOf[i]) &&
      !(info[i].gzLen >= 2 && info[i].gzContent) &&
      !(pOutside && pOutside(i) >= ctx.minConfidence),
  );
  let reason: Assembled['reason'];
  if (qtySpans.some((s) => !used.has(s)) || droppedNumber) reason = 'unattached';
  else if (!explained || unusedEdit) reason = 'marker';
  else if (duplicate) reason = 'duplicate';
  else if (implicit && strict) reason = 'implicit';
  const none = !items.length && !unknown.length && !missingQuantityItems.length && !disambiguations.length && !expenses.length;
  const asked = disambiguations.map((d) => new Set(d.options.map((o) => String(o.product_id))));
  const overlap = asked.some((ids, k) =>
    [...ids].some((id) => items.some((i) => String(i.productId) === id) || asked.some((other, j) => j !== k && other.has(id))),
  );
  return { order, reason, empty: none && (labels.some((l) => l !== 'O') || info.some((x) => x.isNum)), implicit, overlap };
}

export function parseOrder(text: string, products: ParseableProduct[]): ParsedOrder {
  const { items, unknown, missingQuantityItems, disambiguations, expenses, normalizedText } = parseOrderDetailed(text, products);
  return { items, unknown, missingQuantityItems, disambiguations, expenses, normalizedText };
}
