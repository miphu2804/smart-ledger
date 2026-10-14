/// <reference types="node" />
/**
 * Sinh câu train có nhãn cho CRF (brief §6) và xuất đặc trưng (do `src/lib/voiceParse/features.ts` tính) ra
 * `.data/` cho `train.py`. Câu sinh từ mẫu trên các danh mục ở `lexicon.ts` (không trùng danh mục eval), có biến thể
 * dấu, số đọc/viết, tên một phần, từ đệm, món ngoài danh mục và lỗi STT giả lập. Cũng xuất đặc trưng của bộ eval.
 *
 *   npm run voice:synth                                  # mặc định 16000 câu train + 1000 câu dev, seed 7
 *   npm run voice:synth -- --out <thư mục> --holdout 1   # thêm lexout.jsonl: câu dùng 1/3 từ vựng không có trong train
 *   npm run voice:synth -- --edit 0 --lex 0 --corr 0.04 --features v1 --train 8000   # dữ liệu của model giai đoạn 3
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { ParseableProduct } from '../../src/lib/parseOrder';
import { catalogIndex } from '../../src/lib/voiceParse/catalog';
import { crfFeatures, type FeatureSet } from '../../src/lib/voiceParse/features';
import { analyze, type Label, QTY_SLOTS, type Slot } from '../../src/lib/voiceParse/tagger';
import { tokenize } from '../../src/lib/voiceParse/text';
import { OOC_ITEMS, TRAIN_CATALOGS } from './lexicon';

const args = process.argv.slice(2);
const opt = (name: string, def: number) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) : def);
const N_TRAIN = opt('--train', 16000);
const N_DEV = opt('--dev', 1000);
let seed = opt('--seed', 7);
/** Nhãn EDIT cho cụm sửa lời + câu sửa lời tổ hợp (`--edit 0`: mẫu sửa lời cũ, chỉ QTYC). */
const EDIT = opt('--edit', 1) > 0;
/** Từ vựng rộng cho xưng hô, lời mở/kết, "mỗi", "y chang", số tham chiếu, tổng (`--lex 0`: danh sách cũ). */
const LEX = opt('--lex', 1) > 0;
/** Giữ lại 1/3 từ vựng mỗi danh sách để sinh `lexout.jsonl` (đo khả năng gặp từ chưa thấy, `voice:grid --lexout`). */
const HOLDOUT = opt('--holdout', 0) > 0;
const N_LEXOUT = opt('--lexout', 1000);
const OUT_DIR = args.includes('--out') ? `${args[args.indexOf('--out') + 1].replace(/\/$/, '')}/` : './.data/';
/** Tỉ lệ câu sửa lời (phần thêm so với 4% lấy từ câu bán thường). */
const CORR = opt('--corr', 0.08);
const FEATURE_SET = args.includes('--features') ? (args[args.indexOf('--features') + 1] as FeatureSet) : 'v2';

// ─── Ngẫu nhiên có seed (mulberry32) ──────────────────────────────────────────
function rand(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
/** Phần từ vựng đang dùng khi `--holdout`: train dùng 2/3 mỗi danh sách, `lexout` dùng 1/3 còn lại. */
let lexPart: 'all' | 'train' | 'test' = 'all';
const lexPick = <T,>(xs: readonly T[]): T => {
  if (lexPart === 'all' || xs.length < 3) return pick(xs);
  return pick(xs.filter((_, i) => (i % 3 === 2) === (lexPart === 'test')));
};
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
// Từ vựng rộng (`--lex 1`, mặc định): xưng hô, lời nhờ, lời kết hay gặp khi nói tự nhiên
const PRONOUNS_X = [...PRONOUNS, 'tớ', 'mình', 'tui', 'tôi', 'tao', 'ông', 'bà', 'cậu', 'dì', 'thím', 'mợ', 'má', 'mẹ', 'bố', 'chế', 'bạn', 'ẻm', 'ảnh', 'chỉ', 'cưng'];
const CLOSERS_X = [
  'nha', 'nhé', 'nha em', 'đi', 'đi em', 'luôn', 'nữa', 'thôi', 'à', 'nghen', 'nhé chị', 'luôn nha', 'nhá', 'nhen', 'đó', 'đó nha',
  'giùm', 'giúp em', 'luôn đi', 'liền', 'lẹ nha', 'nhanh nha', 'cảm ơn', 'nha cưng', 'nghe chưa', 'vậy thôi', 'là được', 'hen',
  'nhe', 'đi nha', 'luôn nhé', 'thế thôi', 'với nha', 'nha bạn', 'được không', 'nhé em',
];
const openerX = (): Seg[] => {
  if (chance(0.3)) return [];
  const p = lexPick(PRONOUNS_X);
  const q = lexPick(PRONOUNS_X);
  const o = lexPick([
    'à', 'ờ', 'ừm', 'dạ', 'ơi', `${p} ơi`, `cho ${p}`, `lấy cho ${p}`, `bán cho ${p}`, `ghi cho ${p}`, `tính cho ${p}`, 'khách lấy',
    'lấy', 'bán', 'thêm', 'cho', 'ghi', 'à ờ', `ờ cho ${p} lấy`, `${p} lấy`, 'tính tiền', 'order', `làm ơn cho ${p}`, `${p} lấy giùm`,
    `cho ${p} xin`, `${p} ơi cho ${q}`, `ê ${p}`, 'ê', 'nè', `${p} ơi lấy`, `bán cho ${p} với`, 'cho xin', `phiền ${p}`, `ghi giùm ${p}`,
    `${p} ghi`, `${p} mua`, `mua cho ${p}`, 'làm ơn', `${p} ơi ${q} lấy`, `dạ ${p} lấy`, 'cho mình', `${p} cần`, `${p} muốn lấy`,
    `ờ ${p} ơi`, 'khách gọi', 'bàn kia gọi', `${p} order`, 'lên đơn', 'ghi đơn',
  ]);
  return [[o, null]];
};
const closerX = (): Seg[] => {
  if (chance(0.5)) return [];
  // "gỏi cuốn cho chị", "hai trà đá giùm em"
  if (chance(0.25)) return [[`${pick(['cho', 'giùm', 'giúp', 'cho', 'lấy cho'])} ${lexPick(PRONOUNS_X)}${pick(['', ' nha', ' nhé', ' với'])}`, null]];
  return [[lexPick(CLOSERS_X), null]];
};

const opener = (): Seg[] => {
  if (LEX) return openerX();
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
  LEX ? closerX() : chance(0.55) ? [] : [[pick(['nha', 'nhé', 'nha em', 'đi', 'đi em', 'luôn', 'nữa', 'thôi', 'à', 'nghen', 'nhé chị', 'luôn nha']), null]];
const UNITS = ['chai', 'lon', 'gói', 'hộp', 'bịch', 'ly', 'phần', 'tô', 'dĩa', 'cái', 'bao', 'vỉ', 'cây', 'lốc', 'thùng', 'ký', 'trái', 'ổ', 'xiên', 'tuýp', 'hũ', 'cốc', 'quả', 'chiếc', 'túi'];
const DELIMS = ['với', 'và', 'thêm', ',', 'rồi', 'với lại'];

/** Bổ ngữ sau tên món, không thuộc tên: "trà tắc KHÔNG ĐƯỜNG", "cà phê ÍT ĐÁ". */
const MODIFIERS = ['không đường', 'ít đường', 'ít đá', 'nhiều đá', 'không đá', 'ít ngọt', 'không hành', 'nhiều sữa', 'mang về', 'để riêng', 'loại nhỏ', 'cho nóng'];

function saleItem(products: ParseableProduct[], nameFirst: boolean): Seg[] {
  const item: Seg[] = [[chance(0.12) ? pick(OOC_ITEMS) : itemText(pick(products)), 'ITEM']];
  if (chance(0.08)) item.push([pick(MODIFIERS), null]);
  const qty: Seg[] = [];
  const r = rand();
  if (r < 0.85) {
    qty.push([qtyText(), 'QTY']);
    if (chance(0.6)) qty.push([pick(UNITS), 'UNIT']);
  } else if (r < 0.93) qty.push([pick(UNITS), 'UNIT']);
  const price: Seg[] = chance(0.06) ? [[moneyText(), 'AMT']] : [];
  return nameFirst ? [...item, ...qty, ...price] : [...qty, ...item, ...price];
}

/** Chỉ nói tên món, không số lượng ("gỏi cuốn cho chị", "trà đào đi em"). */
function bare(products: ParseableProduct[]): Seg[] {
  return [...(chance(0.5) ? opener() : []), [chance(0.35) ? pick(OOC_ITEMS) : itemText(pick(products)), 'ITEM'], ...(chance(0.15) ? ([[pick(MODIFIERS), null]] as Seg[]) : []), ...closer()];
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

// ─── Câu có quan hệ số lượng (nhãn QTYP/QTYD/QTYC/COPY, số không phải số lượng gán O) ─────────
const item = (products: ParseableProduct[]): Seg => [chance(0.08) ? pick(OOC_ITEMS) : itemText(pick(products)), 'ITEM'];
const unitSeg = (p = 0.6): Seg[] => (chance(p) ? [[pick(UNITS), 'UNIT']] : []);
const LIST_SEP = [',', 'với', 'và', '', 'với lại'];
function list(products: ParseableProduct[], n: number): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < n; i++) {
    if (i > 0) {
      const sep = pick(LIST_SEP);
      if (sep) out.push([sep, null]);
    }
    out.push(item(products));
  }
  return out;
}
const tail = (products: ParseableProduct[]): Seg[] =>
  chance(0.3) ? [[pick([',', 'với', 'thêm', 'rồi']), null], ...saleItem(products, chance(0.2))] : [];

const EACH_X = [
  'mỗi thứ', 'mỗi loại', 'mỗi cái', 'mỗi món', 'mỗi thứ là', 'mỗi loại là', 'mỗi thứ một', 'mỗi thứ lấy', 'mỗi món là', 'mỗi loại lấy',
  'từng món', 'mỗi bên', 'mỗi thứ cho', 'mỗi cái là', 'mỗi món lấy', 'cái nào cũng', 'món nào cũng', 'loại nào cũng',
];
function distributiveX(products: ParseableProduct[]): Seg[] {
  // "mỗi tô hai", "mỗi ly ba": loại từ sau "mỗi" thay cho "thứ/loại"
  const each = chance(0.35) ? `mỗi ${pick(UNITS)}` : lexPick(EACH_X);
  const n = int(2, 3);
  switch (int(0, 4)) {
    case 0: // "coca, pepsi mỗi thứ ba lon"
      return [...opener(), ...list(products, n), [each, null], [qtyText(), 'QTYD'], ...unitSeg(), ...tail(products), ...closer()];
    case 1: // "mỗi loại hai gói hảo hảo với omachi", "mỗi thứ hai, gạo tám với dầu ăn"
      return [...opener(), [each.replace(/ (là|một|lấy|cho)$/, ''), null], [qtyText(), 'QTYD'], ...unitSeg(), ...(chance(0.4) ? ([[pick([',', ':', 'là']), null]] as Seg[]) : []), ...list(products, n), ...closer()];
    case 2: // "ba ly mỗi loại: bạc xỉu, cacao"
      return [...opener(), [qtyText(), 'QTYD'], ...unitSeg(0.8), [lexPick(EACH_X).replace(/ (là|một|lấy|cho)$/, ''), null], [pick([',', '', 'là', ':']), null], ...list(products, n), ...closer()];
    case 3: // "phở gà phở bò mỗi tô hai"
      return [...opener(), ...list(products, n), [`mỗi ${pick(UNITS)}`, null], [qtyText(), 'QTYD'], ...tail(products), ...closer()];
    default: // "coca với pepsi đều hai lon"
      return [...opener(), ...list(products, n), [pick(['đều', 'đều là', 'cũng đều', 'đều lấy', 'hết thảy đều']), null], [qtyText(), 'QTYD'], ...unitSeg(), ...closer()];
  }
}

function distributive(products: ParseableProduct[]): Seg[] {
  if (LEX) return distributiveX(products);
  const each = pick(['mỗi thứ', 'mỗi loại', 'mỗi cái', 'mỗi món', 'mỗi thứ là', 'mỗi loại là', 'mỗi thứ một', 'mỗi thứ lấy']);
  const n = int(2, 3);
  switch (int(0, 3)) {
    case 0: // "coca, pepsi mỗi thứ ba lon"
      return [...opener(), ...list(products, n), [each, null], [qtyText(), 'QTYD'], ...unitSeg(), ...tail(products), ...closer()];
    case 1: // "mỗi loại hai gói hảo hảo với omachi"
      return [...opener(), [each.replace(/ (là|một|lấy)$/, ''), null], [qtyText(), 'QTYD'], ...unitSeg(), ...list(products, n), ...closer()];
    case 2: // "ba ly mỗi loại: bạc xỉu, cacao"
      return [...opener(), [qtyText(), 'QTYD'], ...unitSeg(0.8), [pick(['mỗi loại', 'mỗi thứ', 'mỗi món']), null], [pick([',', '', 'là']), null], ...list(products, n), ...closer()];
    default: // "coca với pepsi đều hai lon"
      return [...opener(), ...list(products, n), [pick(['đều', 'đều là', 'cũng đều']), null], [qtyText(), 'QTYD'], ...unitSeg(), ...closer()];
  }
}

const COPY_X = [
  'cũng vậy', 'cũng thế', 'y vậy', 'giống vậy', 'cũng như vậy', 'cũng y chang', 'cũng vậy luôn', 'y chang', 'y như vậy', 'như trên',
  'y hệt', 'giống y vậy', 'cũng giống', 'như cũ', 'cũng thế luôn', 'tương tự', 'giống như trên', 'y chang vậy', 'cũng bấy nhiêu',
  'nhiêu đó luôn', 'cũng nhiêu đó', 'cũng y vậy', 'giống hệt', 'như vậy luôn',
];
function copyQtyX(products: ParseableProduct[]): Seg[] {
  const first: Seg[] = chance(0.3) ? [item(products), [qtyText(), 'QTY'], ...unitSeg()] : [[qtyText(), 'QTY'], ...unitSeg(), item(products)];
  const sep: Seg = [pick([',', 'còn', 'rồi', '', 'với', ', còn', 'thêm']), null];
  if (chance(0.5)) return [...opener(), ...first, sep, item(products), [lexPick(COPY_X), 'COPY'], ...closer()];
  return [...opener(), ...first, sep, item(products), [lexPick(['cũng', 'thì cũng', 'cũng lấy', 'cũng là', 'cũng cho', 'thì cũng lấy']), null], [qtyText(), 'QTYP'], ...unitSeg(0.4), ...closer()];
}

function copyQty(products: ParseableProduct[]): Seg[] {
  if (LEX) return copyQtyX(products);
  // món đầu luôn có số lượng để "cũng vậy" có cái mà chép
  const first: Seg[] = chance(0.3) ? [item(products), [qtyText(), 'QTY'], ...unitSeg()] : [[qtyText(), 'QTY'], ...unitSeg(), item(products)];
  const sep: Seg = [pick([',', 'còn', 'rồi', '', 'với']), null];
  if (chance(0.5)) {
    return [...opener(), ...first, sep, item(products), [pick(['cũng vậy', 'cũng thế', 'y vậy', 'giống vậy', 'cũng như vậy', 'cũng y chang', 'cũng vậy luôn']), 'COPY'], ...closer()];
  }
  return [...opener(), ...first, sep, item(products), [pick(['cũng', 'thì cũng', 'cũng lấy']), null], [qtyText(), 'QTYP'], ...unitSeg(0.4), ...closer()];
}

function correction(products: ParseableProduct[]): Seg[] {
  const marker = pick(['à không', 'à nhầm', 'à lộn', 'ờ không', 'nhầm', 'không phải', 'à mà thôi', 'à không phải']);
  switch (int(0, 2)) {
    case 0: // "hai gói hảo hảo, à không, ba gói"
      return [...opener(), [qtyText(), 'QTY'], ...unitSeg(), item(products), [`${pick([',', ''])} ${marker}${pick([',', ''])}`.trim(), null], [qtyText(), 'QTYC'], ...unitSeg(0.5), ...closer()];
    case 1: // "lấy ba chai à nhầm hai chai nước mắm"
      return [...opener(), [qtyText(), null], ...(chance(0.6) ? ([[pick(UNITS), null]] as Seg[]) : []), [marker, null], [qtyText(), 'QTY'], ...unitSeg(), item(products), ...closer()];
    default: // "một bạc xỉu, thôi đổi thành hai"
      return [...opener(), [qtyText(), 'QTY'], ...unitSeg(), item(products), [pick([', thôi đổi thành', ', sửa lại', ', đổi thành', 'à không lấy']), null], [qtyText(), 'QTYC'], ...unitSeg(0.4), ...closer()];
  }
}

const REF_X = ['bàn', 'bàn số', 'phòng', 'phòng số', 'quầy', 'quầy số', 'kệ', 'kệ số', 'tầng', 'lầu', 'lô', 'dãy', 'xe số', 'khu', 'ghế số', 'số bàn', 'cửa số', 'số phòng', 'ghi số bàn'];
function referencesX(products: ParseableProduct[]): Seg[] {
  const num = () => (chance(0.5) ? spoken(int(1, 12)) : String(int(1, 20)));
  const ref: Seg[] = chance(0.15)
    ? [['lúc', null], [spoken(int(1, 11)), null], ['giờ', null]]
    : chance(0.15)
      ? [[lexPick(['bàn', 'phòng', 'bàn số']), null], [num(), null], [lexPick(['có', 'được', 'đi', 'ngồi']), null], [num(), null], ['người', null]]
      : [[lexPick(REF_X), null], [num(), null]];
  switch (int(0, 3)) {
    case 0: {
      // "cho bàn năm hai cà phê muối" (số bàn liền số lượng), "quầy số hai, một cây xúc xích"
      const body = sale(products).filter(([t]) => t);
      const first = body.findIndex(([, sl]) => sl !== null);
      return [[pick(['cho', 'ghi', '', 'lên', 'ở']), null], ...ref, ...(chance(0.3) ? ([[',', null]] as Seg[]) : []), ...body.slice(first > 0 && chance(0.6) ? first : 0)];
    }
    case 1: // "hai cà phê muối cho bàn năm"
      return [...sale(products), [pick(['cho', 'mang ra', 'ở', '', ',', 'để ở']), null], ...ref];
    case 2: // "quầy số hai, một cây xúc xích, kệ số bốn"
      return [...ref, [',', null], ...sale(products), [',', null], [lexPick(REF_X), null], [num(), null], ...closer()];
    default: // "bún bò huế cho hai người"
      return [...opener(), item(products), [pick(['cho', '']), null], [qtyText(), 'QTYP'], ['người', 'UNIT'], ...(chance(0.3) ? ([['ăn', null]] as Seg[]) : []), ...closer()];
  }
}

function references(products: ParseableProduct[]): Seg[] {
  if (LEX) return referencesX(products);
  const n = String(int(1, 20));
  const ref: Seg[] = pick([
    [['bàn', null], [chance(0.5) ? spoken(int(1, 12)) : n, null]],
    [['bàn số', null], [chance(0.5) ? spoken(int(1, 12)) : n, null]],
    [['phòng', null], [n, null]],
    [['lúc', null], [spoken(int(1, 11)), null], ['giờ', null]],
  ] as Seg[][]);
  switch (int(0, 2)) {
    case 0: // "cho bàn năm hai cà phê muối"
      return [[pick(['cho', 'ghi', '', 'lên']), null], ...ref, ...sale(products).filter(([t]) => t)];
    case 1: // "hai cà phê muối cho bàn năm"
      return [...sale(products), [pick(['cho', 'mang ra', 'ở', '']), null], ...ref];
    default: // "bún bò huế cho hai người"
      return [...opener(), item(products), [pick(['cho', '']), null], [qtyText(), 'QTYP'], ['người', 'UNIT'], ...(chance(0.3) ? ([['ăn', null]] as Seg[]) : []), ...closer()];
  }
}

function totalThenSplitX(products: ParseableProduct[]): Seg[] {
  const r = rand();
  const head: Seg[] =
    r < 0.4
      ? [[qtyText(), null], ...(chance(0.7) ? ([[pick(['ly', 'món', 'phần', 'cái', 'chai', 'gói', 'tô', 'thứ']), null]] as Seg[]) : [])]
      : r < 0.75
        ? [[lexPick(['tổng cộng', 'tất cả', 'hết thảy', 'tổng', 'cả thảy', 'tất cả là', 'gồm', 'tổng cộng là']), null], [qtyText(), null], [pick(['món', 'thứ', 'cái', 'ly', 'phần']), null]]
        : [[lexPick(['chia ra', 'gồm có', 'bao gồm', 'cụ thể', 'kể ra', 'liệt kê', 'gồm những']), null]];
  const parts: Seg[] = [];
  for (let i = 0; i < int(2, 3); i++) parts.push(...(i ? ([[pick(['', ',', 'với']), null]] as Seg[]) : []), ...saleItem(products, false).filter(([, sl]) => sl !== 'AMT'));
  return [...opener(), ...head, [pick([',', ':', 'gồm', 'là', 'trong đó', 'gồm có']), null], ...parts.filter(([t]) => t !== ''), ...closer()];
}

function totalThenSplit(products: ParseableProduct[]): Seg[] {
  if (LEX) return totalThenSplitX(products);
  const head: Seg[] = chance(0.5)
    ? [[qtyText(), null], ...(chance(0.7) ? ([[pick(['ly', 'món', 'phần', 'cái', 'chai']), null]] as Seg[]) : [])]
    : [[pick(['tổng cộng', 'tất cả', 'hết thảy']), null], [qtyText(), null], [pick(['món', 'thứ', 'cái', 'ly']), null]];
  const parts: Seg[] = [];
  for (let i = 0; i < int(2, 3); i++) parts.push(...(i ? ([[pick(['', ',', 'với']), null]] as Seg[]) : []), ...saleItem(products, false).filter(([, sl]) => sl !== 'AMT'));
  return [...opener(), ...head, [pick([',', ':', 'gồm', 'là']), null], ...parts.filter(([t]) => t !== ''), ...closer()];
}

function topicOrder(products: ParseableProduct[]): Seg[] {
  const out: Seg[] = [...opener()];
  for (let i = 0; i < int(1, 3); i++) {
    if (i > 0) out.push([pick([',', 'còn', ', còn', 'với']), null]);
    out.push(item(products), [pick(['thì', 'là', 'nè', 'đó', 'thì lấy']), null], [qtyText(), 'QTY'], ...unitSeg());
  }
  return [...out, ...closer()];
}

// ─── Sửa lời (`--edit 1`, mặc định): cụm sửa lời gán EDIT; món nói lại / đổi món / sửa số ghép theo mọi kiểu câu ─────
const EDIT_TERMS = [
  'à không', 'à nhầm', 'à lộn', 'ờ không', 'nhầm', 'không phải', 'à mà thôi', 'à không phải', 'ờ sai', 'sai rồi', 'à sai', 'khoan',
  'à khoan', 'khoan đã', 'ý lộn', 'ý nhầm', 'à quên', 'không không', 'à mà nhầm', 'nhầm rồi', 'lộn rồi', 'ấy chết', 'chết', 'à chết',
  'nói lại', 'à nói lại', 'xin lỗi', 'à xin lỗi', 'không đúng', 'ờ nhầm', 'ờ lộn', 'ơ không', 'à thôi', 'đổi lại', 'đổi thành',
  'sửa lại', 'thôi đổi thành', 'à mà không', 'ờ à không', 'à ý là', 'ý là', 'à đâu', 'ờ mà', 'không', 'thôi', 'thôi lấy',
];
function repair(products: ParseableProduct[]): Seg[] {
  const term = (): Seg => [chance(0.06) ? pick(['ờ', 'à', 'ơ']) : lexPick(EDIT_TERMS), 'EDIT'];
  const sep = (): Seg[] => (chance(0.5) ? [[',', null]] : []);
  const ooc = chance(0.08) ? pick(OOC_ITEMS) : null;
  const p = pick(products);
  const name = (q: ParseableProduct) => ooc ?? itemText(q);
  const line = (text: string, nameFirst: boolean): Seg[] => {
    const q: Seg[] = [[qtyText(), 'QTY'], ...unitSeg()];
    return nameFirst ? [[text, 'ITEM'], ...q] : [...q, [text, 'ITEM']];
  };
  const nf = chance(0.35);
  const head: Seg[] = [...opener(), ...(chance(0.3) ? [...saleItem(products, chance(0.2)), [pick([',', 'với', 'và']), null] as Seg] : [])];
  switch (int(0, 5)) {
    case 0:
    case 1: // sửa số: "hai gói hảo hảo, à không, ba gói", "trứng gà một vỉ à không hai vỉ"
      return [...head, ...line(name(p), nf), ...sep(), term(), ...sep(), [qtyText(), 'QTYC'], ...unitSeg(0.5), ...tail(products), ...closer()];
    case 2: // sửa số trước khi nói món: "lấy ba chai à nhầm hai chai nước mắm"
      return [...head, [qtyText(), null], ...(chance(0.6) ? ([[pick(UNITS), null]] as Seg[]) : []), term(), [qtyText(), 'QTY'], ...unitSeg(), [name(p), 'ITEM'], ...tail(products), ...closer()];
    case 3: // nói lại món với số mới: "ba trà đá à không năm trà đá", "sữa chua đá hai ly, à mà nhầm sữa chua đá năm ly"
      return [...head, ...line(name(p), nf), ...sep(), term(), ...sep(), ...line(name(p), chance(0.7) ? nf : !nf), ...tail(products), ...closer()];
    case 4: {
      // đổi món, giữ số cũ hoặc nói số mới: "hai phở gà, à nhầm phở bò", "… phở bò, ba tô"
      const other = chance(0.08) ? pick(OOC_ITEMS) : itemText(pick(products));
      const changed: Seg[] = chance(0.4)
        ? line(other, nf)
        : [[other, 'ITEM'], ...(chance(0.4) ? ([[',', null], [qtyText(), 'QTYC'], ...unitSeg(0.6)] as Seg[]) : [])];
      return [...head, ...line(name(p), nf), ...sep(), term(), ...sep(), ...changed, ...tail(products), ...closer()];
    }
    default: {
      // nói lại một món trước đó: "một bánh mì thịt, hai ốp la, khoan, bánh mì thịt năm cái"
      const a = name(p);
      return [...opener(), ...line(a, nf), [pick([',', 'với', 'và']), null], ...saleItem(products, nf), ...sep(), term(), ...sep(), ...line(chance(0.5) ? a : name(p), chance(0.5)), ...closer()];
    }
  }
}

function sentence(products: ParseableProduct[]): Seg[] {
  const r = rand();
  const c = CORR - 0.04; // phần câu sửa lời thêm vào, lấy từ câu bán thường
  if (r < 0.06) return distributive(products);
  if (r < 0.1) return copyQty(products);
  if (r < 0.14 + c) return EDIT ? repair(products) : correction(products);
  if (r < 0.17 + c) return references(products);
  if (r < 0.19 + c) return totalThenSplit(products);
  if (r < 0.22 + c) return topicOrder(products);
  if (r < 0.25 + c) return bare(products);
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
    const cont = i > 0 && seg[i - 1] === seg[i] && !(QTY_SLOTS.has(slot) && t.kind === 'num');
    return `${cont ? 'I' : 'B'}-${slot}` as Label;
  });
  const info = analyze(tokens, catalogIndex(products));
  return { text, x: crfFeatures(tokens, info, FEATURE_SET), y };
}

const out = new URL(OUT_DIR, import.meta.url);
mkdirSync(out, { recursive: true });
const shops = Object.keys(TRAIN_CATALOGS);
if (HOLDOUT) lexPart = 'train';
for (const [file, n] of [['train', N_TRAIN], ['dev', N_DEV]] as const) {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) {
    const products = TRAIN_CATALOGS[shops[i % shops.length]];
    lines.push(JSON.stringify(render(sentence(products), products)));
  }
  writeFileSync(new URL(`${file}.jsonl`, out), `${lines.join('\n')}\n`);
  console.log(`${file}: ${n} câu`);
}
if (HOLDOUT) {
  // Câu có quan hệ số lượng / sửa lời, chỉ dùng 1/3 từ vựng không có trong train
  lexPart = 'test';
  const kinds = [distributive, copyQty, EDIT ? repair : correction, references, totalThenSplit];
  const lines: string[] = [];
  for (let i = 0; i < N_LEXOUT; i++) {
    const shop = shops[i % shops.length];
    const products = TRAIN_CATALOGS[shop];
    lines.push(JSON.stringify({ shop, ...render(kinds[i % kinds.length](products), products) }));
  }
  writeFileSync(new URL('lexout.jsonl', out), `${lines.join('\n')}\n`);
  console.log(`lexout: ${N_LEXOUT} câu (từ vựng giữ lại)`);
  lexPart = 'all';
}
writeFileSync(new URL('meta.json', out), `${JSON.stringify({ features: FEATURE_SET, args })}\n`);

// Đặc trưng của bộ eval (để CRF gắn nhãn và để so khớp Viterbi TS với Python)
const catalogs = JSON.parse(readFileSync(new URL('./eval/catalogs.json', import.meta.url), 'utf8')) as Record<string, ParseableProduct[]>;
const gold = ['./eval/gold.jsonl', './eval/free.jsonl'].flatMap((f) =>
  readFileSync(new URL(f, import.meta.url), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)),
);
const evalLines = gold.map((g: { id: string; catalog: string; text: string }) => {
  const tokens = tokenize(g.text);
  return JSON.stringify({ id: g.id, x: crfFeatures(tokens, analyze(tokens, catalogIndex(catalogs[g.catalog])), FEATURE_SET) });
});
writeFileSync(new URL('eval.jsonl', out), `${evalLines.join('\n')}\n`);
console.log(`eval: ${evalLines.length} câu`);
