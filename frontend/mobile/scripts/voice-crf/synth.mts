/// <reference types="node" />
/**
 * Sinh câu train có nhãn cho CRF (brief §6) và xuất đặc trưng (do `src/lib/voiceParse/features.ts` tính) ra
 * `.data/` cho `train.py`. Câu sinh từ mẫu trên các danh mục ở `lexicon.ts` (không trùng danh mục eval), có biến thể
 * dấu, số đọc/viết, tên một phần, từ đệm, món ngoài danh mục và lỗi STT giả lập. Cũng xuất đặc trưng của bộ eval.
 *
 *   npm run voice:synth            # mặc định 8000 câu train + 1000 câu dev, seed 7
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ParseableProduct } from '../../src/lib/parseOrder';
import { catalogIndex } from '../../src/lib/voiceParse/catalog';
import { crfFeatures } from '../../src/lib/voiceParse/features';
import { analyze, type Label, type Slot } from '../../src/lib/voiceParse/tagger';
import { tokenize } from '../../src/lib/voiceParse/text';
import { OOC_ITEMS, TRAIN_CATALOGS } from './lexicon';

const args = process.argv.slice(2);
const opt = (name: string, def: number) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : def);
const N_TRAIN = opt('--train', 8000);
const N_DEV = opt('--dev', 1000);
let seed = opt('--seed', 7);

// ─── Ngẫu nhiên có seed (mulberry32) ──────────────────────────────────────────
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const chance = (p: number) => rand() < p;
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

// ─── Số đọc bằng chữ (có dấu) ─────────────────────────────────────────────────
const ONES = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
function spoken(n: number, short = false): string {
  if (n < 10) return ONES[n];
  if (n < 20) return `mười${n % 10 ? ` ${n % 10 === 5 ? 'lăm' : ONES[n % 10]}` : ''}`;
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    const unit = u === 0 ? '' : u === 5 ? 'lăm' : u === 1 ? 'mốt' : u === 4 && chance(0.3) ? 'tư' : ONES[u];
    if (short && unit) return `${ONES[t]} ${unit}`;
    return `${ONES[t]} mươi${unit ? ` ${unit}` : ''}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const r = n % 100;
    if (!r) return `${ONES[h]} trăm`;
    if (r < 10) return `${ONES[h]} trăm linh ${ONES[r]}`;
    if (short && r % 10 === 0) return `${ONES[h]} trăm ${ONES[r / 10]}`;
    return `${ONES[h]} trăm ${spoken(r)}`;
  }
  return String(n);
}

function qtyText(): string {
  const n = chance(0.7) ? int(1, 5) : chance(0.7) ? int(6, 12) : int(13, 50);
  if (chance(0.25)) return String(n);
  return spoken(n, chance(0.3));
}

function moneyText(): string {
  const style = rand();
  const k = pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 100, 120, 150, 200, 250, 300, 400, 500, 800]);
  if (style < 0.25) return `${k}k`;
  if (style < 0.35) return `${(k * 1000).toLocaleString('de-DE')}đ`;
  if (style < 0.45 && k % 10 === 0 && k <= 90) return `${spoken(k / 10)} chục ${pick(['nghìn', 'ngàn'])}`;
  if (style < 0.55) return `${spoken(int(1, 3))} triệu${chance(0.5) ? ` ${pick(['rưỡi', 'hai', 'ba', 'năm'])}` : ''}`;
  if (style < 0.62 && k < 100) return `${spoken(k)} ka`;
  return `${spoken(k)} ${pick(['nghìn', 'ngàn', 'nghìn đồng'])}`;
}

// ─── Biến thể tên món ─────────────────────────────────────────────────────────
const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
const TONES = ['̀', '́', '̉', '̃', '̣'];
/** Đổi dấu thanh của một âm tiết (STT hay nghe sai dấu). */
function retone(w: string): string {
  const d = w.normalize('NFD');
  const base = d.replace(/[̣̀́̉̃]/g, '');
  const vowel = base.search(/[aeiouy]/);
  if (vowel < 0) return w;
  // dấu thanh đứng sau dấu mũ/trăng/móc của cùng nguyên âm ("â" + huyền = "ầ")
  let at = vowel + 1;
  while (at < base.length && /[̛̂̆]/.test(base[at])) at++;
  return (base.slice(0, at) + pick(TONES) + base.slice(at)).normalize('NFC');
}
const PHONETIC: Array<[RegExp, string]> = [
  [/^s/, 'x'],
  [/^x/, 's'],
  [/^gi/, 'd'],
  [/^d/, 'gi'],
  [/^tr/, 'ch'],
  [/^ch/, 'tr'],
  [/^r/, 'd'],
];

function noisy(words: string[]): string[] {
  const out = [...words];
  const i = int(0, out.length - 1);
  const r = rand();
  if (r < 0.35) out[i] = retone(out[i]);
  else if (r < 0.55) out[i] = strip(out[i]);
  else if (r < 0.75) {
    const rule = PHONETIC.find(([re]) => re.test(out[i]) && chance(0.7));
    if (rule) out[i] = out[i].replace(rule[0], rule[1]);
  } else if (r < 0.88 && out.length >= 2 && i + 1 < out.length) out.splice(i, 2, out[i] + out[i + 1]);
  else if (out[i].length >= 5) out.splice(i, 1, out[i].slice(0, 3), out[i].slice(3));
  return out;
}

/** Cách gọi một món: đủ tên, bỏ quy cách, đầu + chữ riêng, chỉ chữ riêng; số trong tên có thể đọc thành chữ. */
function itemText(p: ParseableProduct): string {
  let words = p.name.replace(/\(.*?\)/g, ' ').toLowerCase().split(/[\s,/-]+/).filter(Boolean);
  const specAt = words.findIndex((w) => /\d/.test(w));
  const r = rand();
  if (r < 0.3 && specAt > 1) words = words.slice(0, specAt);
  else if (r < 0.5 && words.length >= 3) words = [words[0], ...words.slice(1).filter(() => chance(0.5))];
  else if (r < 0.65 && words.length >= 2) words = words.slice(1, Math.min(words.length, int(2, 3)));
  if (chance(0.5)) {
    words = words.flatMap((w) => {
      const m = w.match(/^([a-zà-ỹđ]*)(\d+)([a-zà-ỹđ]*)$/i);
      if (!m) return [w];
      const n = parseInt(m[2], 10);
      return [m[1], n < 1000 ? spoken(n, chance(0.5)) : m[2], m[3]].filter(Boolean);
    });
  }
  if (chance(0.25)) words = noisy(words);
  return words.join(' ');
}

// ─── Mẫu câu ─────────────────────────────────────────────────────────────────
type Seg = [string, Slot | null];
const PRONOUNS = ['anh', 'chị', 'em', 'cô', 'chú', 'con', 'bác', 'cháu'];
const opener = (): Seg[] => {
  const r = rand();
  if (r < 0.35) return [];
  const p = pick(PRONOUNS);
  const o = pick([
    'à', 'ờ', 'ừm', 'dạ', 'ơi', `${p} ơi`, `cho ${p}`, `lấy cho ${p}`, `bán cho ${p}`, `ghi cho ${p}`, `tính cho ${p}`,
    'khách lấy', 'lấy', 'bán', 'thêm', 'cho', 'ghi', 'à ờ', `ờ cho ${p} lấy`, `${p} lấy`, 'tính tiền', 'order',
  ]);
  return [[o, null]];
};
const closer = (): Seg[] =>
  chance(0.55) ? [] : [[pick(['nha', 'nhé', 'nha em', 'đi', 'đi em', 'luôn', 'nữa', 'thôi', 'à', 'nghen', 'nhé chị', 'luôn nha']), null]];
const UNITS = ['chai', 'lon', 'gói', 'hộp', 'bịch', 'ly', 'phần', 'tô', 'dĩa', 'cái', 'bao', 'vỉ', 'cây', 'lốc', 'thùng', 'ký', 'trái', 'ổ', 'xiên', 'tuýp', 'hũ', 'cốc', 'quả', 'chiếc', 'túi'];
const DELIMS = ['với', 'và', 'thêm', ',', 'rồi', 'với lại'];

function saleItem(products: ParseableProduct[], nameFirst: boolean): Seg[] {
  const item: Seg = [chance(0.12) ? pick(OOC_ITEMS) : itemText(pick(products)), 'ITEM'];
  const qty: Seg[] = [];
  const r = rand();
  if (r < 0.85) {
    qty.push([qtyText(), 'QTY']);
    if (chance(0.6)) qty.push([pick(UNITS), 'UNIT']);
  } else if (r < 0.93) qty.push([pick(UNITS), 'UNIT']);
  const price: Seg[] = chance(0.06) ? [[moneyText(), 'AMT']] : [];
  return nameFirst ? [item, ...qty, ...price] : [...qty, item, ...price];
}

function sale(products: ParseableProduct[]): Seg[] {
  const nameFirst = chance(0.22);
  const k = chance(0.55) ? 1 : chance(0.65) ? 2 : int(3, 4);
  const segs: Seg[] = [...opener()];
  for (let i = 0; i < k; i++) {
    if (i > 0 && chance(0.55)) segs.push([pick(DELIMS), null]);
    if (i > 0 && chance(0.1)) segs.push(...opener());
    segs.push(...saleItem(products, nameFirst));
  }
  return [...segs, ...closer()];
}

const EXP_DESC = ['điện', 'nước', 'đá', 'ga', 'gas', 'rau', 'thịt', 'internet', 'mặt bằng', 'xăng', 'ship', 'giao hàng', 'bao nilon', 'ly nhựa', 'ống hút', 'thuê nhà', 'rác', 'sửa máy', 'lương nhân viên', 'cá', 'trứng', 'gạo', 'sữa', 'cà phê', 'đường', 'than', 'chợ'];
const GOODS = ['hàng', 'bia', 'nước ngọt', 'thịt sườn', 'rau củ', 'cà phê', 'ly nhựa', 'kệ', 'tủ lạnh', 'bàn ghế', 'trái cây', 'gạo', 'đá'];

function expense(): Seg[] {
  const d = pick(EXP_DESC);
  const amt: Seg = [moneyText(), 'AMT'];
  const tail: Seg[] = chance(0.2) ? [[pick(['nha', 'nhé', 'rồi', 'đó']), null]] : [];
  switch (int(0, 7)) {
    case 0:
      return [['chi', 'EXP'], amt, [`tiền ${d}`, 'EXP'], ...tail];
    case 1:
      return [[`trả tiền ${d}`, 'EXP'], amt, ...tail];
    case 2:
      return [[`tiền ${d}`, 'EXP'], amt, ...(chance(0.5) ? ([[pick(['chi', 'chi giúp chị', 'trả rồi', 'chi nha']), 'EXP']] as Seg[]) : tail)];
    case 3:
      return [[`nhập ${pick(GOODS)} hết`, 'EXP'], amt, ...tail];
    case 4:
      return [[`mua ${pick(GOODS)} hết`, 'EXP'], amt, ...tail];
    case 5:
      return [[`${pick(['đóng', 'nộp'])} tiền ${d}`, 'EXP'], amt, ...tail];
    case 6:
      return [[`chi tiền ${d}`, 'EXP'], amt, ...tail];
    default:
      return [['trả', 'EXP'], amt, [`tiền ${d}`, 'EXP'], ...tail];
  }
}

function chat(products: ParseableProduct[]): Seg[] {
  const p = pick(PRONOUNS);
  const head = itemText(pick(products)).split(' ')[0];
  const t = pick([
    `hôm nay ${pick(['vắng', 'đông', 'ế'])} khách ${pick(['quá', 'ghê', 'thật'])}`,
    `${pick(['sáng nay', 'chiều nay', 'tối qua', 'hôm qua'])} ${pick(['trời mưa', 'bán chậm', 'bán đắt', 'mất điện'])} ${pick(['quá', 'ghê', ''])}`,
    `thôi để ${p} ${pick(['xem lại', 'tính sau', 'hỏi lại', 'nghĩ đã'])}`,
    `${pick(['đóng cửa', 'tắt đèn', 'dọn hàng', 'kiểm tiền', 'đếm lại tiền'])} ${pick(['đi em', 'giúp ' + p, 'thôi', 'nha'])}`,
    `${pick(['mai', 'lát nữa', 'tuần sau'])} ${pick(['tính tiếp', 'bán tiếp', 'đổi giá', 'nhập thêm'])} nha`,
    `${p} ${pick(['gọi điện', 'nhắn tin', 'hỏi'])} cho ${pick(PRONOUNS)} ${pick(['chưa', 'rồi', 'đi'])}`,
    `${head} ${pick(['dạo này', 'tháng này'])} ${pick(['lên giá', 'đắt', 'bán chạy'])} ${pick(['quá', 'ghê'])}`,
    `${pick(['cảm ơn', 'chào'])} ${p} nha`,
    `${pick(['đọc lại', 'xem lại', 'tính lại'])} ${pick(['sổ', 'tổng tiền', 'đơn hôm qua', 'công nợ'])} ${pick(['giúp ' + p, 'đi', ''])}`,
  ]);
  return [[t.replace(/\s+/g, ' ').trim(), null]];
}

function sentence(products: ParseableProduct[]): Seg[] {
  const r = rand();
  if (r < 0.62) return sale(products);
  if (r < 0.76) return [...opener().filter(() => chance(0.3)), ...expense()];
  if (r < 0.88) return chance(0.5) ? [...sale(products), [pick(['rồi', 'với', ',', 'xong']), null], ...expense()] : [...expense(), [pick(['rồi', ',', 'xong']), null], ...sale(products)];
  return chat(products);
}

/** Câu → token và nhãn BIO theo ký tự: token thuộc đoạn nào thì lấy nhãn của đoạn đó. */
function render(segs: Seg[], products: ParseableProduct[]) {
  let text = '';
  const ranges: Array<[number, number, Slot | null]> = [];
  for (const [s, slot] of segs) {
    if (!s) continue;
    let piece = s;
    if (chance(0.03)) piece = strip(piece);
    if (text) text += piece === ',' ? '' : ' ';
    ranges.push([text.length, text.length + piece.length, slot]);
    text += piece;
  }
  if (chance(0.25)) text = strip(text); // gõ tay không dấu
  const tokens = tokenize(text);
  const seg = tokens.map((t) => ranges.findIndex(([a, b]) => t.start >= a && t.start < b));
  const y: Label[] = tokens.map((t, i) => {
    const slot = ranges[seg[i]]?.[2];
    if (!slot || t.kind === 'sep') return 'O';
    const cont = i > 0 && seg[i - 1] === seg[i] && !(slot === 'QTY' && t.kind === 'num');
    return `${cont ? 'I' : 'B'}-${slot}` as Label;
  });
  const info = analyze(tokens, catalogIndex(products));
  return { text, x: crfFeatures(tokens, info), y };
}

const out = new URL('./.data/', import.meta.url);
mkdirSync(out, { recursive: true });
const shops = Object.keys(TRAIN_CATALOGS);
for (const [file, n] of [['train', N_TRAIN], ['dev', N_DEV]] as const) {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const products = TRAIN_CATALOGS[shops[i % shops.length]];
    lines.push(JSON.stringify(render(sentence(products), products)));
  }
  writeFileSync(new URL(`${file}.jsonl`, out), `${lines.join('\n')}\n`);
  console.log(`${file}: ${n} câu`);
}

// Đặc trưng của bộ eval (để CRF gắn nhãn và để so khớp Viterbi TS với Python)
const catalogs = JSON.parse(readFileSync(new URL('./eval/catalogs.json', import.meta.url), 'utf8')) as Record<string, ParseableProduct[]>;
const gold = readFileSync(new URL('./eval/gold.jsonl', import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const evalLines = gold.map((g: { id: string; catalog: string; text: string }) => {
  const tokens = tokenize(g.text);
  return JSON.stringify({ id: g.id, x: crfFeatures(tokens, analyze(tokens, catalogIndex(catalogs[g.catalog]))) });
});
writeFileSync(new URL('eval.jsonl', out), `${evalLines.join('\n')}\n`);
console.log(`eval: ${evalLines.length} câu`);
