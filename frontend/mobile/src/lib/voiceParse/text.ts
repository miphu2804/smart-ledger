/**
 * L1 của bộ parse giọng nói: tách token có giữ vị trí ký tự, dạng có dấu (`raw`) và bỏ dấu (`norm`), rồi gom số tiền
 * (đọc bằng chữ hoặc viết "20k") thành một token `money` (ITN). Số lượng ("hai", "mười hai", "3") giữ nguyên để tagger
 * quyết định là số lượng hay là một phần tên món ("gạo tám thơm", "st hai lăm").
 */
import { DIGIT_WORDS, fold, isThousandWord, parseSpokenRun } from '../parseOrder';

export type TokenKind = 'word' | 'num' | 'money' | 'sep';

export interface Token {
  /** Chữ thường, còn dấu tiếng Việt (giữ được "chị" khác "chi", "trả" khác "trà"). */
  raw: string;
  /** Bỏ dấu, chỉ còn a-z0-9; token tiền là `<money>`, dấu câu là `,`. */
  norm: string;
  kind: TokenKind;
  /** Giá trị số của `num` và `money`; 0 với loại khác. */
  value: number;
  /** Vị trí trong câu gốc (đã `normalize('NFC')`), để gắn nhãn câu train theo ký tự. */
  start: number;
  end: number;
}

const TOKEN_RE = /[\p{L}\p{M}\p{N}]+(?:[.,]\p{N}+[\p{L}\p{M}]*)*|[,;.!?\n]+/gu;
const NUM_RE = /^\d+(?:[.,]\d+)*$/;
const DIGIT_MONEY_RE = /^(\d+(?:[.,]\d+)*)(k|ka|nghin|ngan|tr|trieu|d|dong)$/;
const MONEY_SCALE: Record<string, number> = { k: 1000, ka: 1000, nghin: 1000, ngan: 1000, tr: 1_000_000, trieu: 1_000_000, d: 1, dong: 1 };

/** "1.500.000" → 1500000 (dấu ngăn hàng nghìn); "1,5" → 1.5. */
export function digitValue(s: string): number {
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(s)) return parseInt(s.replace(/[.,]/g, ''), 10);
  return parseFloat(s.replace(',', '.'));
}

/** Các từ đọc số (đã bỏ dấu) có thể đứng trong một cụm số. */
export const SPOKEN_NUMBER_WORDS = new Set([...Object.keys(DIGIT_WORDS), 'muoi', 'chuc', 'tram', 'linh', 'le', 'ruoi', 'nghin', 'ngan', 'trieu']);
/** Cách viết có dấu của các từ số: "tấm", "lâm", "sau" có dấu khác thì không phải số ("cơm tấm"). */
export const SPOKEN_NUMBER_RAW = new Set([
  'một', 'mốt', 'hai', 'ba', 'bốn', 'tư', 'năm', 'lăm', 'nhăm', 'sáu', 'bảy', 'bẩy', 'tám', 'chín',
  'mười', 'mươi', 'chục', 'trăm', 'linh', 'lẻ', 'rưỡi', 'nghìn', 'ngàn', 'triệu',
]);
const SPOKEN_START = new Set([...Object.keys(DIGIT_WORDS), 'muoi', 'tram']);
const SCALE: Record<string, number> = { nghin: 1000, ngan: 1000, trieu: 1_000_000 };

/** Gõ không dấu ("tam") thì chưa biết, coi như có thể là số; có dấu thì phải đúng cách viết của từ số. */
const spokenSpelling = (t: Token) => t.raw === t.norm || SPOKEN_NUMBER_RAW.has(t.raw);
export const isSpokenNumber = (t: Token | undefined): boolean =>
  !!t && t.kind === 'word' && SPOKEN_NUMBER_WORDS.has(t.norm) && spokenSpelling(t);
const isNumberLike = (t: Token | undefined): boolean => !!t && (t.kind === 'num' || isSpokenNumber(t));

/**
 * Giá trị một cụm số đọc bằng chữ. Như `parseSpokenRun` của parseOrder, thêm cách nói tắt sau hàng nghìn/triệu:
 * "một triệu hai" = 1.200.000, "năm nghìn rưỡi" = 5.500, "hai trăm tư" = 240.
 */
export function spokenValue(words: string[]): { value: number; scaled: boolean } | null {
  const n = words.length;
  if (n >= 3 && words[n - 1] in DIGIT_WORDS && SCALE[words[n - 2]]) {
    const head = parseSpokenRun(words.slice(0, n - 1));
    if (head) return { value: head.value + DIGIT_WORDS[words[n - 1]] * (SCALE[words[n - 2]] / 10), scaled: true };
  }
  return parseSpokenRun(words);
}

/** Cụm số kết thúc ở đâu nếu bắt đầu ở `i` (không gộp "ba hai mươi": "ba" là số lượng, "hai mươi" là số khác). */
export function numberRunEnd(tokens: Token[], i: number): number {
  let j = i + 1;
  while (j < tokens.length && isNumberLike(tokens[j])) {
    const w = tokens[j].norm;
    const startsNew = w in DIGIT_WORDS && tokens[j - 1].norm in DIGIT_WORDS && ['muoi', 'chuc', 'tram'].includes(tokens[j + 1]?.norm ?? '');
    if (startsNew || tokens[j].kind === 'num' || tokens[j - 1].kind === 'num') break;
    j++;
  }
  return j;
}

function rawTokens(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    const raw = m[0].toLowerCase();
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (/^[,;.!?\n]+$/.test(raw)) {
      out.push({ raw, norm: ',', kind: 'sep', value: 0, start, end });
      continue;
    }
    const norm = fold(raw).replace(/[^a-z0-9.,]/g, '');
    if (!norm) continue;
    const money = norm.match(DIGIT_MONEY_RE);
    if (NUM_RE.test(norm)) out.push({ raw, norm, kind: 'num', value: digitValue(norm), start, end });
    else if (money) out.push({ raw, norm: '<money>', kind: 'money', value: Math.round(digitValue(money[1]) * MONEY_SCALE[money[2]]), start, end });
    else if (/^(?:[a-z]+\d+|\d+[a-z]+)$/.test(norm)) {
      // "st25", "5kg", "330ml": tách chữ và số để khớp tên món như khi đọc rời ("st hai lăm", "năm ký")
      const cut = norm.search(/\d/) === 0 ? norm.search(/[a-z]/) : norm.search(/\d/);
      const head = norm.slice(0, cut);
      const tail = norm.slice(cut);
      const piece = (n: string, r: string, s0: number, e0: number): Token =>
        /^\d+$/.test(n) ? { raw: r, norm: n, kind: 'num', value: parseInt(n, 10), start: s0, end: e0 } : { raw: r, norm: n, kind: 'word', value: 0, start: s0, end: e0 };
      out.push(piece(head, raw.slice(0, cut), start, start + cut), piece(tail, raw.slice(cut), start + cut, end));
    } else out.push({ raw, norm: norm.replace(/[.,]/g, ''), kind: 'word', value: 0, start, end });
  }
  return out;
}

/** Câu → token. Mọi số tiền (đọc hoặc viết) thành một token `money`; cụm số không kèm đơn vị tiền giữ nguyên. */
export function tokenize(input: string): Token[] {
  const text = input.normalize('NFC');
  const toks = rawTokens(text);
  const out: Token[] = [];
  const merge = (from: number, to: number, value: number): Token => ({
    raw: text.slice(toks[from].start, toks[to - 1].end).toLowerCase(),
    norm: '<money>',
    kind: 'money',
    value,
    start: toks[from].start,
    end: toks[to - 1].end,
  });
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    const startsNumber = t.kind === 'num' || (isSpokenNumber(t) && SPOKEN_START.has(t.norm));
    if (!startsNumber) {
      out.push(t);
      i++;
      continue;
    }
    if (t.kind === 'num') {
      const next = toks[i + 1];
      if (next?.kind === 'word' && (MONEY_SCALE[next.norm] || isThousandWord(next.norm, toks[i + 2]?.norm))) {
        out.push(merge(i, i + 2, Math.round(t.value * (MONEY_SCALE[next.norm] ?? 1000))));
        i += 2;
      } else if (Number.isInteger(t.value) && t.value >= 1000) {
        // 20000 viết trơn từ 4 chữ số trở lên là tiền, không phải số lượng (như parseOrder)
        out.push({ ...t, norm: '<money>', kind: 'money' });
        i++;
      } else {
        out.push(t);
        i++;
      }
      continue;
    }
    const j = numberRunEnd(toks, i);
    const num = spokenValue(toks.slice(i, j).map((x) => x.norm));
    const next = toks[j];
    let end = -1;
    let value = 0;
    if (num?.scaled) {
      value = num.value;
      end = next?.norm === 'dong' || next?.norm === 'd' ? j + 1 : j;
    } else if (num && next && isThousandWord(next.norm, toks[j + 1]?.norm) && next.raw !== 'cà') {
      value = num.value * 1000;
      end = j + 1;
    } else if (num && (next?.norm === 'dong' || next?.norm === 'd')) {
      value = num.value;
      end = j + 1;
    }
    if (end > 0 && value >= 1) {
      out.push(merge(i, end, value));
      i = end;
    } else {
      for (let k = i; k < j; k++) out.push(toks[k]);
      i = j;
    }
  }
  return out;
}

/** Giá trị số lượng của một cụm token số ("mười hai" → 12, "3" → 3); null nếu không đọc được. */
export function quantityValue(tokens: Token[]): number | null {
  if (tokens.length === 1 && tokens[0].kind === 'num') return tokens[0].value > 0 ? tokens[0].value : null;
  const n = spokenValue(tokens.map((t) => t.norm));
  return n && n.value > 0 && Number.isInteger(n.value) ? n.value : null;
}
