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

/**
 * Bộ đặc trưng; model ghi bộ nó được train (`CrfModel.features`). `v2` thêm đặc trưng lặp lại: từ này có được nói lại
 * ở sau / đã nói ở trước trong câu không (dấu hiệu sửa lời: "ba trà đá à không năm TRÀ ĐÁ").
 */
export type FeatureSet = 'v1' | 'v2' | 'nolex';

/** Danh sách đặc trưng dạng chuỗi "tên=giá trị" cho cả câu; thứ tự cố định để tổng điểm giống hệt CRFsuite. */
export function crfFeatures(tokens: Token[], info: TokenInfo[], set: FeatureSet = 'v1'): string[][] {
  const loc = tokens.map((t, i) => local(t, info[i]));
  if (set === 'nolex') {
    // Nghiên cứu (ablation): bỏ đặc trưng lấy từ danh sách từ viết tay (đơn vị, từ đệm, động từ bán, từ nối, từ chi)
    for (const f of loc) for (const k of ['unit', 'fill', 'sale', 'delim', 'expw']) delete f[k];
  }
  if (set === 'v2' || set === 'nolex') {
    const words = tokens.map((t, i) => (t.kind === 'word' && (set === 'nolex' || !info[i].isFiller) ? t.norm : ''));
    loc.forEach((f, i) => {
      const w = words[i];
      f.rep = w && words.indexOf(w, i + 1) > i ? '1' : '0';
      f.prv = w && i > 0 && words.lastIndexOf(w, i - 1) >= 0 ? '1' : '0';
    });
  }
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
      for (const k of keys) if (g[k] !== undefined) out.push(`${d}:${k}=${g[k]}`);
    }
    if (i > 0) out.push(`-1|0:w=${loc[i - 1].w}|${f.w}`, `-1|0:gz=${loc[i - 1].gz}|${f.gz}`);
    if (i + 1 < n) out.push(`0|1:w=${f.w}|${loc[i + 1].w}`, `0|1:gz=${f.gz}|${loc[i + 1].gz}`);
    if (i > 0 && i + 1 < n) out.push(`-1|1:num=${loc[i - 1].num}|${loc[i + 1].num}`);
    return [...new Set(out)];
  });
}

/**
 * Khung câu cho gate câu nói tự do: mỗi token thành một lớp (`,` dấu câu, `$` tiền, `#` số, `I` chữ của tên món trong
 * danh mục, `U` đơn vị), từ khác giữ nguyên; các `I` liền nhau gộp một. Tính từ đặc trưng CRF nên câu train và câu mới
 * được trừu tượng hoá giống hệt nhau: "cho chị hai gói hảo hảo" → `cho chi # U I`.
 */
export function sentenceShape(x: string[][]): string[] {
  const out: string[] = [];
  for (const fs of x) {
    const get = (k: string) => fs.find((f) => f.startsWith(`${k}=`))?.slice(k.length + 1) ?? '';
    const gz = get('gz');
    const kind = get('k');
    const c =
      kind === 'sep' ? ',' : kind === 'money' ? '$' : get('num') !== '0' ? '#' : gz[0] !== '0' && gz.endsWith('c') ? 'I' : get('unit') === '1' ? 'U' : get('w');
    if (!(c === 'I' && out[out.length - 1] === 'I')) out.push(c);
  }
  return out;
}

/** Các cặp lớp liền nhau của khung câu, kể cả đầu (`^`) và cuối câu (`$$`). */
export function shapeBigrams(shape: string[]): string[] {
  const p = ['^', ...shape, '$$'];
  return p.slice(1).map((c, i) => `${p[i]} ${c}`);
}
