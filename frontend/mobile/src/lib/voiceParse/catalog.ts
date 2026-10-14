/**
 * L2/L4: chỉ mục của một danh mục (gazetteer n-gram, chỉ mục trigram) và bộ liên kết một cụm tên món với sản phẩm.
 *
 * Tên món được mở thành vài biến thể đọc được: "Gạo ST25 5kg" → "gao st 25 5 kg", "gao st hai muoi lam nam ky",
 * "gao st hai lam nam ky", để người nói "gạo st hai lăm" vẫn khớp. Liên kết bằng căn chỉnh từ theo thứ tự (không phải
 * túi trigram), nên "xôi gà" không khớp "Cơm gà xối mỡ" dù đủ chữ; từ sai dấu, gần âm (s/x, gi/d/r, ch/tr), sai chính tả
 * nhẹ, dính hoặc tách từ ("cocacola", "chin su") vẫn được tính điểm.
 */
import type { ParseableProduct } from '../parseOrder';
import { SPOKEN_NUMBER_RAW, type Token, tokenize } from './text';

interface NameWord {
  norm: string;
  /** Dạng có dấu, null với từ sinh ra khi đọc số ("hai muoi lam"). */
  raw: string | null;
  /** Từ thuộc quy cách (số, đơn vị đo: "500", "ml", "mi li"): chỉ khớp với số hoặc đơn vị nói ra, không khớp "mì". */
  spec?: boolean;
}

export interface CatalogEntry {
  product: ParseableProduct;
  variants: NameWord[][];
}

export interface CatalogIndex {
  entries: CatalogEntry[];
  /** n-gram (từ bỏ dấu, nối bằng dấu cách) → số sản phẩm có n-gram đó trong một biến thể tên. */
  gazetteer: Map<string, number>;
  maxGram: number;
  /** Trigram có đệm của từ → chỉ số sản phẩm. */
  trigrams: Map<string, number[]>;
  /** Mọi từ trong tên (bỏ dấu) và khoá gần âm của chúng. */
  vocab: Set<string>;
  phoneticVocab: Set<string>;
  /** Trigram → các từ trong tên có trigram đó (để tìm từ gần giống khi STT nghe sai). */
  wordTrigrams: Map<string, string[]>;
}

// ─── Đọc số trong tên ─────────────────────────────────────────────────────────

const ONES = ['khong', 'mot', 'hai', 'ba', 'bon', 'nam', 'sau', 'bay', 'tam', 'chin'];

/** 25 → "hai muoi lam" (đầy đủ) và "hai lam" (nói tắt); 330 → "ba tram ba muoi" và "ba tram ba". */
export function numberWords(n: number): string[][] {
  if (!Number.isInteger(n) || n < 0 || n >= 1_000_000) return [];
  const below100 = (x: number, inHundred: boolean): string[][] => {
    if (x === 0) return [[]];
    if (x < 10) return [inHundred ? ['linh', ONES[x]] : [ONES[x]]];
    const t = Math.floor(x / 10);
    const u = x % 10;
    const unit = u === 0 ? [] : [u === 5 ? 'lam' : u === 1 && t > 1 ? 'mot' : ONES[u]];
    if (t === 1) return [['muoi', ...unit]];
    const full = [ONES[t], 'muoi', ...unit];
    return unit.length ? [full, [ONES[t], ...unit]] : inHundred ? [full, [ONES[t]]] : [full];
  };
  const below1000 = (x: number): string[][] => {
    if (x < 100) return below100(x, false);
    const h = Math.floor(x / 100);
    return below100(x % 100, true).map((rest) => [ONES[h], 'tram', ...rest]);
  };
  if (n < 1000) return n === 0 ? [['khong']] : below1000(n);
  const k = Math.floor(n / 1000);
  const rest = n % 1000;
  const heads = below1000(k).map((h) => [...h, 'nghin']);
  if (!rest) return heads;
  return heads.flatMap((h) => below1000(rest).map((r) => [...h, ...r]));
}

const UNIT_WORDS: Record<string, string[][]> = {
  kg: [['kg'], ['ky']],
  g: [['g'], ['gam']],
  gr: [['gr'], ['gam']],
  ml: [['ml'], ['mi', 'li']],
  l: [['l'], ['lit']],
  cm: [['cm'], ['phan']],
  w: [['w'], ['oat']],
  gb: [['gb'], ['gi', 'ga']],
};

/** Tách chữ và số dính nhau ("st25" → "st", "25"), rồi sinh 3 biến thể: viết số, đọc đầy đủ, đọc tắt. */
function nameVariants(name: string): NameWord[][] {
  const out: NameWord[][] = [];
  const seen = new Set<string>();
  const add = (v: NameWord[]) => {
    const key = v.map((w) => w.norm).join(' ');
    if (v.length && !seen.has(key)) {
      seen.add(key);
      out.push(v);
    }
  };
  for (const source of [name.replace(/\(.*?\)/g, ' '), name.replace(/[()]/g, ' ')]) {
    const pieces: Array<{ norm: string; raw: string; digits: boolean }> = [];
    for (const t of tokenize(source)) {
      if (t.kind === 'sep') continue;
      const rawParts = t.raw.match(/\p{N}+|[^\p{N}]+/gu) ?? [t.raw];
      const normParts = t.kind === 'money' ? [t.raw.replace(/\D/g, '')] : (t.norm.match(/\d+|[a-z]+/g) ?? [t.norm]);
      normParts.forEach((p, i) => pieces.push({ norm: p, raw: rawParts[i] ?? p, digits: /^\d+$/.test(p) }));
    }
    const isSpec = (i: number) => pieces[i].digits || (!!UNIT_WORDS[pieces[i].norm] && i > 0 && pieces[i - 1].digits);
    add(pieces.map((p, i) => ({ norm: p.norm, raw: p.raw, spec: isSpec(i) })));
    for (const form of [0, 1]) {
      const v: NameWord[] = [];
      pieces.forEach((p, i) => {
        if (p.digits) {
          const words = numberWords(parseInt(p.norm, 10));
          for (const w of words[Math.min(form, words.length - 1)] ?? [p.norm]) v.push({ norm: w, raw: null, spec: true });
        } else if (isSpec(i)) {
          for (const w of UNIT_WORDS[p.norm][form]) v.push({ norm: w, raw: null, spec: true });
        } else v.push({ norm: p.norm, raw: p.raw });
      });
      add(v);
    }
  }
  return out;
}

// ─── Độ giống của từ ──────────────────────────────────────────────────────────

/** Khoá gần âm: gộp phụ âm đầu/cuối hay bị STT hoặc giọng vùng miền lẫn (s/x, gi/d/r, ch/tr, n/ng/nh, c/t, i/y). */
export function phonetic(w: string): string {
  return form(w).phon;
}

const trigramsOf = (w: string): string[] => {
  const s = ` ${w} `;
  const out: string[] = [];
  for (let i = 0; i + 3 <= s.length; i++) out.push(s.slice(i, i + 3));
  return out;
};

interface WordForm {
  phon: string;
  tri: Set<string>;
}

// Khoá gần âm và trigram của mỗi từ chỉ tính một lần (bộ nhớ đệm có giới hạn): đây là phần tốn nhất khi so tên.
const forms = new Map<string, WordForm>();
const sims = new Map<string, number>();
const MEMO_LIMIT = 50_000;

function form(w: string): WordForm {
  let f = forms.get(w);
  if (!f) {
    if (forms.size >= MEMO_LIMIT) forms.clear();
    const phon = w
      .replace(/^ngh/, 'ng')
      .replace(/^gh/, 'g')
      .replace(/^gi(?=[aeouy])/, 'd')
      .replace(/^r/, 'd')
      .replace(/^tr/, 'ch')
      .replace(/^x/, 's')
      .replace(/^k/, 'c')
      .replace(/y/g, 'i')
      .replace(/(ng|nh)$/, 'n')
      .replace(/ch$/, 't')
      .replace(/c$/, 't');
    f = { phon, tri: new Set(trigramsOf(w)) };
    forms.set(w, f);
  }
  return f;
}

function dice(a: string, b: string): number {
  const ta = form(a).tri;
  const tb = form(b).tri;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common++;
  return (2 * common) / (ta.size + tb.size);
}

/** Độ giống 0..1 của từ nói ra với một từ trong tên. */
function wordSim(norm: string, raw: string | null, q: NameWord): number {
  // Từ quy cách chỉ khớp với chữ số hoặc chữ không dấu/đúng dấu của từ số, đơn vị ("năm trăm ml"), không khớp "mì"
  if (q.spec && raw !== null && raw !== norm && !/^\d+$/.test(norm) && !SPOKEN_NUMBER_RAW.has(raw)) return 0;
  if (norm === q.norm) {
    if (raw === null || q.raw === null || raw === norm || raw === q.raw) return 1;
    return 0.9; // cùng chữ, sai dấu thanh (STT hay nhầm)
  }
  // Gần âm chỉ tính khi cùng dấu thanh hoặc gõ không dấu: "sỉu"/"xỉu", "dò"/"giò" được; "bàn"/"bánh" thì không
  if (raw === null || q.raw === null || raw === norm || form(norm).phon !== form(q.norm).phon) return stringSim(norm, q.norm);
  return stringSim(norm, q.norm, toneOf(raw) === toneOf(q.raw));
}

const TONE_RE = /[̣̀́̃̉]/;
const tones = new Map<string, string>();
/** Dấu thanh của một âm tiết ("" là thanh ngang), nhớ theo từ. */
function toneOf(w: string): string {
  let t = tones.get(w);
  if (t === undefined) {
    if (tones.size >= MEMO_LIMIT) tones.clear();
    tones.set(w, (t = w.normalize('NFD').match(TONE_RE)?.[0] ?? ''));
  }
  return t;
}

function stringSim(a: string, b: string, phoneticOk = true): number {
  if (a === b) return 1;
  const key = `${a}|${b}|${phoneticOk ? 1 : 0}`;
  let v = sims.get(key);
  if (v === undefined) {
    if (sims.size >= MEMO_LIMIT) sims.clear();
    if (phoneticOk && a.length >= 2 && b.length >= 2 && form(a).phon === form(b).phon) v = 0.8;
    else if (a.length < 3 || b.length < 3) v = 0;
    // Dice ≤ 2·min/(tổng) theo số trigram (= độ dài + 1): chênh độ dài quá thì không thể đạt ngưỡng
    else if ((2 * Math.min(a.length, b.length) + 2) / (a.length + b.length + 2) < 0.55) v = 0;
    else {
      const d = dice(a, b);
      v = d >= 0.55 ? d : 0;
    }
    sims.set(key, v);
  }
  return v;
}

// ─── Chỉ mục ──────────────────────────────────────────────────────────────────

const cache = new WeakMap<readonly ParseableProduct[], CatalogIndex>();
const MAX_GRAM = 6;

/** Chỉ mục của danh mục, dựng một lần cho mỗi mảng sản phẩm (màn voice giữ mảng bằng `useMemo`). */
export function catalogIndex(products: readonly ParseableProduct[]): CatalogIndex {
  const hit = cache.get(products);
  if (hit) return hit;
  const entries: CatalogEntry[] = products.map((product) => ({
    product,
    variants: [...nameVariants(product.name), ...(product.aliases ?? []).flatMap(nameVariants)],
  }));
  const gazetteer = new Map<string, number>();
  const trigrams = new Map<string, number[]>();
  const vocab = new Set<string>();
  entries.forEach((e, idx) => {
    const grams = new Set<string>();
    const tris = new Set<string>();
    for (const v of e.variants) {
      const words = v.map((w) => w.norm);
      for (const w of words) {
        vocab.add(w);
        for (const t of trigramsOf(w)) tris.add(t);
      }
      for (let i = 0; i < words.length; i++) {
        for (let n = 1; n <= MAX_GRAM && i + n <= words.length; n++) grams.add(words.slice(i, i + n).join(' '));
      }
    }
    for (const g of grams) gazetteer.set(g, (gazetteer.get(g) ?? 0) + 1);
    for (const t of tris) {
      const list = trigrams.get(t);
      if (list) list.push(idx);
      else trigrams.set(t, [idx]);
    }
  });
  const wordTrigrams = new Map<string, string[]>();
  for (const w of vocab) {
    form(w);
    for (const t of trigramsOf(w)) {
      const list = wordTrigrams.get(t);
      if (list) list.push(w);
      else wordTrigrams.set(t, [w]);
    }
  }
  const index: CatalogIndex = {
    entries,
    gazetteer,
    maxGram: MAX_GRAM,
    trigrams,
    vocab,
    phoneticVocab: new Set([...vocab].map(phonetic)),
    wordTrigrams,
  };
  cache.set(products, index);
  return index;
}

/** Từ không có trong tên nào nhưng gần giống một từ trong tên (STT nghe sai dấu/phụ âm). */
export function fuzzyInVocab(index: CatalogIndex, w: string): boolean {
  if (index.vocab.has(w)) return true;
  if (w.length >= 2 && index.phoneticVocab.has(phonetic(w))) return true;
  if (w.length < 3) return false;
  const seen = new Set<string>();
  for (const t of trigramsOf(w)) {
    for (const v of index.wordTrigrams.get(t) ?? []) {
      if (seen.has(v)) continue;
      seen.add(v);
      if (dice(w, v) >= 0.55) return true;
    }
  }
  return false;
}

// ─── Liên kết ─────────────────────────────────────────────────────────────────

export interface LinkCandidate {
  product: ParseableProduct;
  /** Phần cụm nói ra được giải thích bởi tên món, 0..1 (đại lượng chính để gate). */
  coverage: number;
  /** Phần tên món được nói tới, 0..1 (xếp hạng phụ: "gạo st25" gần "Gạo ST25 5kg" hơn tên dài hơn). */
  nameCover: number;
  score: number;
}

/** Trọng số của từ nói ra theo độ hiếm trong danh mục (IDF): từ không có trong tên nào nặng nhất, "bánh"/"trà" nhẹ. */
const idf = (index: CatalogIndex, w: string) => Math.log(1 + (2 * index.entries.length) / (2 * (index.gazetteer.get(w) ?? 0) + 1));

/** Điểm căn chỉnh tốt nhất của cụm với một biến thể tên: từ khớp theo đúng thứ tự, cho phép 1 từ ↔ 2 từ dính/tách. */
function alignScore(span: Token[], weights: number[], v: NameWord[]): number {
  const m = span.length;
  const n = v.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) {
    for (let j = 0; j <= n; j++) {
      const cur = dp[i][j];
      if (i < m && dp[i + 1][j] < cur) dp[i + 1][j] = cur;
      if (j < n && dp[i][j + 1] < cur) dp[i][j + 1] = cur;
      if (i < m && j < n) {
        const s = cur + weights[i] * wordSim(span[i].norm, span[i].raw, v[j]);
        if (dp[i + 1][j + 1] < s) dp[i + 1][j + 1] = s;
      }
      if (i < m && j + 1 < n) {
        const s = cur + weights[i] * stringSim(span[i].norm, v[j].norm + v[j + 1].norm);
        if (dp[i + 1][j + 2] < s) dp[i + 1][j + 2] = s;
      }
      if (i + 1 < m && j < n) {
        const s = cur + (weights[i] + weights[i + 1]) * stringSim(span[i].norm + span[i + 1].norm, v[j].norm);
        if (dp[i + 2][j + 1] < s) dp[i + 2][j + 1] = s;
      }
    }
  }
  return dp[m][n];
}

/** Ứng viên cho một cụm tên món, điểm giảm dần. */
export function linkSpan(index: CatalogIndex, span: Token[], limit = 30): LinkCandidate[] {
  if (!span.length) return [];
  const counts = new Map<number, number>();
  for (const t of span) {
    for (const tri of trigramsOf(t.norm)) {
      for (const idx of index.trigrams.get(tri) ?? []) counts.set(idx, (counts.get(idx) ?? 0) + 1);
    }
  }
  // Chỉ so kỹ các sản phẩm chung nhiều trigram nhất với cụm nói ra
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const floor = (ranked[0]?.[1] ?? 0) * 0.3;
  const pool = ranked.filter(([, c]) => c >= floor).slice(0, limit);
  const weights = span.map((t) => idf(index, t.norm));
  const total = weights.reduce((s, w) => s + w, 0);
  const out: LinkCandidate[] = [];
  for (const [idx] of pool) {
    const e = index.entries[idx];
    let best = 0;
    let bestVariant = e.variants[0];
    for (const v of e.variants) {
      const a = alignScore(span, weights, v);
      if (a > best) (best = a), (bestVariant = v);
    }
    if (best <= 0) continue;
    const coverage = best / total;
    const nameLen = bestVariant.reduce((s, w) => s + idf(index, w.norm), 0);
    const nameHit = bestVariant.reduce((s, w) => s + idf(index, w.norm) * Math.max(...span.map((t) => wordSim(t.norm, t.raw, w))), 0);
    const nameCover = Math.min(1, nameHit / nameLen);
    out.push({ product: e.product, coverage, nameCover, score: coverage + 0.05 * nameCover });
  }
  return out.sort((a, b) => b.score - a.score);
}
