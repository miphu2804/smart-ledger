/**
 * Đặc trưng của CRF cho từng token (brief §5 L3). Chỉ tính ở đây, bằng TS: script train xuất đặc trưng này ra file cho
 * Python, nên lúc train và lúc chạy trên máy dùng đúng một bộ đặc trưng.
 */
import { DELIMITERS } from './lexicon';
import { isSaleVerb, type TokenInfo } from './tagger';
import type { Token } from './text';

const EXPENSE_WORDS = new Set(['chi', 'tra', 'nop', 'nhap', 'dong', 'tien', 'het', 'mua', 'phi', 'thanh', 'toan', 'coc']);

const bucket = (n: number, edges: number[]) => {
  let i = 0;
  while (i < edges.length && n > edges[i]) i++;
  return String(i);
};

/** Đặc trưng riêng của một token (không kèm ngữ cảnh). */
function local(t: Token, x: TokenInfo): Record<string, string> {
  return {
    w: t.norm,
    r: t.kind === 'word' ? t.raw : t.norm,
    k: t.kind,
    acc: t.kind !== 'word' ? '-' : t.raw === t.norm ? '0' : '1',
    num: x.isNum ? (t.kind === 'num' ? 'd' : 'w') : '0',
    unit: x.isUnit ? '1' : '0',
    fill: x.isFiller ? '1' : '0',
    sale: t.kind === 'word' && isSaleVerb(t) ? '1' : '0',
    delim: DELIMITERS.has(t.norm) ? '1' : '0',
    expw: EXPENSE_WORDS.has(t.norm) ? '1' : '0',
    gz: `${bucket(x.gzLen, [0, 1, 2])}${x.gzBegin ? 'B' : 'I'}${x.gzContent ? 'c' : ''}`,
    df: bucket(x.df, [0, 1, 4]),
    voc: x.inVocab ? '1' : '0',
  };
}

const CONTEXT_KEYS = ['w', 'num', 'unit', 'fill', 'gz', 'sale', 'expw', 'k'];

/** Danh sách đặc trưng dạng chuỗi "tên=giá trị" cho cả câu; thứ tự cố định để tổng điểm giống hệt CRFsuite. */
export function crfFeatures(tokens: Token[], info: TokenInfo[]): string[][] {
  const loc = tokens.map((t, i) => local(t, info[i]));
  const n = tokens.length;
  return loc.map((f, i) => {
    const out: string[] = ['bias'];
    for (const [k, v] of Object.entries(f)) out.push(`${k}=${v}`);
    for (const d of [-2, -1, 1, 2]) {
      const g = loc[i + d];
      if (!g) {
        out.push(`${d}:${d < 0 ? 'BOS' : 'EOS'}`);
        continue;
      }
      // ±1 thêm dạng có dấu: "bàn năm" (số bàn) khác "bán năm" (bán năm cái)
      const keys = Math.abs(d) === 1 ? [...CONTEXT_KEYS, 'r'] : ['w', 'num', 'gz'];
      for (const k of keys) out.push(`${d}:${k}=${g[k]}`);
    }
    if (i > 0) out.push(`-1|0:w=${loc[i - 1].w}|${f.w}`, `-1|0:gz=${loc[i - 1].gz}|${f.gz}`);
    if (i + 1 < n) out.push(`0|1:w=${f.w}|${loc[i + 1].w}`, `0|1:gz=${f.gz}|${loc[i + 1].gz}`);
    if (i > 0 && i + 1 < n) out.push(`-1|1:num=${loc[i - 1].num}|${loc[i + 1].num}`);
    return [...new Set(out)];
  });
}
