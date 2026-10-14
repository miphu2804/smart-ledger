/**
 * L3: gắn nhãn BIO cho token. `analyze` tính thông tin gazetteer dùng chung cho tagger luật và cho đặc trưng CRF.
 *
 * Nhãn: QTY UNIT ITEM AMT EXP O, và các nhãn quan hệ của số lượng mà chỉ CRF gán:
 * - QTYP: số lượng của món đứng TRƯỚC ("trà vải cũng HAI", "bún bò cho HAI người");
 * - QTYD: một số lượng cho cả danh sách món ("coca, pepsi mỗi thứ BA lon");
 * - QTYC: sửa số lượng món vừa nói ("hai gói hảo hảo, à không, BA gói");
 * - COPY: lấy lại số lượng của món trước ("pepsi CŨNG VẬY");
 * - EDIT: cụm sửa lời ("hai phở gà, À NHẦM phở bò"): món nói ngay sau thay cho món nói trước.
 * Số không phải số lượng (bàn năm, lúc tám giờ, tổng "ba ly:" trước khi kể từng món) gán O.
 */
import { type CatalogIndex, fuzzyInVocab } from './catalog';
import { CHAT_RAW, DELIMITERS, FILLER_RAW, FILLER_WORDS, REF_AFTER_RAW, SALE_VERBS, SALE_VERBS_RAW, TEA_WORDS, UNIT_RAW, UNIT_WORDS } from './lexicon';
import { isSpokenNumber, numberRunEnd, SPOKEN_NUMBER_WORDS, type Token } from './text';

export const SLOTS = ['QTY', 'QTYP', 'QTYD', 'QTYC', 'COPY', 'EDIT', 'UNIT', 'ITEM', 'AMT', 'EXP'] as const;
export type Slot = (typeof SLOTS)[number];
export type Label = 'O' | `B-${Slot}` | `I-${Slot}`;
/** Các nhãn số lượng (thường và quan hệ). */
export const QTY_SLOTS: ReadonlySet<Slot> = new Set(['QTY', 'QTYP', 'QTYD', 'QTYC']);

export interface TokenInfo {
  /** Độ dài n-gram dài nhất của tên món phủ token (0 = không có trong tên nào). */
  gzLen: number;
  /** Token mở đầu n-gram đó. */
  gzBegin: boolean;
  /** n-gram đó có chữ thật của tên (không chỉ số/đơn vị/từ đệm): "nam ngu" có, "mot ky" không. */
  gzContent: boolean;
  /** Số sản phẩm có từ này trong tên. */
  df: number;
  /** Có trong tên món, hoặc gần giống một từ trong tên (STT nghe sai). */
  inVocab: boolean;
  isNum: boolean;
  isUnit: boolean;
  isFiller: boolean;
}

export const isUnitToken = (t: Token) => t.kind === 'word' && UNIT_WORDS.has(t.norm) && (t.raw === t.norm || UNIT_RAW.has(t.raw));
export const isNumToken = (t: Token) => (t.kind === 'num' && t.value > 0 && t.value < 1000) || isSpokenNumber(t);
const isContentWord = (w: string) => !/^\d+$/.test(w) && !SPOKEN_NUMBER_WORDS.has(w) && !UNIT_WORDS.has(w) && !FILLER_WORDS.has(w);
/** Động từ bán: có dấu thì phải đúng cách viết ("mưa" không phải "mua"). */
export const isSaleVerb = (t: Token) => SALE_VERBS.has(t.norm) && (t.raw === t.norm || SALE_VERBS_RAW.has(t.raw));

export function analyze(tokens: Token[], index: CatalogIndex): TokenInfo[] {
  const n = tokens.length;
  const info: TokenInfo[] = tokens.map((t) => ({
    gzLen: 0,
    gzBegin: false,
    gzContent: false,
    df: t.kind === 'sep' || t.kind === 'money' ? 0 : (index.gazetteer.get(t.norm) ?? 0),
    inVocab: t.kind === 'word' && fuzzyInVocab(index, t.norm),
    isNum: isNumToken(t),
    isUnit: isUnitToken(t),
    isFiller: t.kind === 'word' && (FILLER_RAW.has(t.raw) || CHAT_RAW.has(t.raw) || (t.raw === t.norm && FILLER_WORDS.has(t.norm))),
  }));
  for (let i = 0; i < n; i++) {
    let len = 0;
    let key = '';
    for (let k = i; k < n && k - i < index.maxGram; k++) {
      if (tokens[k].kind === 'sep' || tokens[k].kind === 'money') break;
      key = key ? `${key} ${tokens[k].norm}` : tokens[k].norm;
      if (!index.gazetteer.has(key)) break;
      len = k - i + 1;
    }
    if (!len) continue;
    const content = tokens.slice(i, i + len).some((t) => isContentWord(t.norm));
    for (let k = i; k < i + len; k++) {
      const cur = info[k];
      if (len > cur.gzLen || (len === cur.gzLen && content && !cur.gzContent)) {
        cur.gzLen = len;
        cur.gzBegin = k === i;
        cur.gzContent = content;
      }
    }
  }
  return info;
}

// ─── Tagger luật (không train) ────────────────────────────────────────────────

/** Từ mở đầu khoản chi ở vị trí i (theo parseOrder, thêm "nhập", "đóng tiền", "tiền … <số tiền>"). */
function expenseTrigger(tokens: Token[], i: number): boolean {
  const t = tokens[i];
  const next = tokens[i + 1];
  switch (t.norm) {
    case 'chi':
      if (t.raw === 'chị') return false;
      return !!next && (next.kind === 'money' || ['tien', 'mua', 'ra', 'phi', 'het'].includes(next.norm));
    case 'tra':
      if (t.raw === 'trà') return false;
      if (t.raw === 'trả') return true;
      return !(next && TEA_WORDS.has(next.norm));
    case 'nop':
    case 'nhap':
    case 'phi':
      return true;
    case 'dong':
      return next?.norm === 'tien';
    case 'thanh':
      return next?.norm === 'toan';
    case 'dat':
      return next?.norm === 'coc' || next?.norm === 'hang';
    case 'mua':
      return true;
    case 'tien':
      return true;
    default:
      return false;
  }
}

/** Mệnh đề: cắt ở dấu câu và từ nối không nằm trong tên món ("cơm thêm" giữ nguyên). */
export function clauseRanges(tokens: Token[], info: TokenInfo[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from = 0;
  for (let i = 0; i <= tokens.length; i++) {
    const afterVerb = tokens[i]?.norm === 'them' && i > 0 && (isSaleVerb(tokens[i - 1]) || ['mua', 'nhap'].includes(tokens[i - 1].norm));
    const cut =
      i === tokens.length ||
      tokens[i].kind === 'sep' ||
      (DELIMITERS.has(tokens[i].norm) && !afterVerb && !(info[i].gzLen >= 2 && info[i].gzContent));
    if (!cut) continue;
    if (i > from) out.push([from, i]);
    from = i + 1;
  }
  return out;
}

export type MarkerKind = 'dist' | 'copy' | 'corr' | 'total';

/**
 * Dấu hiệu câu có quan hệ số lượng mà ghép slot thông thường không hiểu: "mỗi thứ/loại/cái/món" (một số cho nhiều món),
 * "cũng vậy", "cũng hai" (lấy lại số), "à không", "à nhầm", "đổi thành" (sửa lời), "ba ly: hai … một …" (tổng rồi kể).
 */
export function findMarkers(tokens: Token[], info: TokenInfo[]): Array<{ kind: MarkerKind; at: number }> {
  const out: Array<{ kind: MarkerKind; at: number }> = [];
  const w = (i: number) => tokens[i]?.norm ?? '';
  const raw = (i: number) => tokens[i]?.raw ?? '';
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'sep') {
      // "ba ly: hai sữa đá một đen đá": số (+ đơn vị) rồi dấu câu rồi số nữa
      let j = i - 1;
      if (j >= 0 && info[j].isUnit) j--;
      if (j >= 0 && info[j].isNum && info[i + 1]?.isNum && j === 0) out.push({ kind: 'total', at: j });
      continue;
    }
    if (w(i) === 'moi' && (raw(i) === 'mỗi' || raw(i) === 'moi') && ['thu', 'loai', 'cai', 'mon', 'nguoi', 'phan', 'ly', 'chai', 'goi', 'lon'].includes(w(i + 1))) {
      out.push({ kind: 'dist', at: i });
    } else if (w(i) === 'deu' && (raw(i) === 'đều' || raw(i) === 'deu') && (info[i + 1]?.isNum || info[i + 2]?.isNum)) {
      out.push({ kind: 'dist', at: i });
    } else if (w(i) === 'cung' && (raw(i) === 'cũng' || raw(i) === 'cung') && (['vay', 'the', 'nhu', 'y', 'giong'].includes(w(i + 1)) || info[i + 1]?.isNum)) {
      out.push({ kind: 'copy', at: i });
    } else if ((w(i) === 'y' || w(i) === 'giong') && ['vay', 'nhu', 'the'].includes(w(i + 1))) {
      out.push({ kind: 'copy', at: i });
    } else if (['a', 'o', 'u'].includes(w(i)) && ['khong', 'nham', 'lon'].includes(w(i + 1)) && raw(i + 1) !== 'lon') {
      out.push({ kind: 'corr', at: i });
    } else if ((w(i) === 'nham' && raw(i) !== 'nhâm') || (w(i) === 'khong' && w(i + 1) === 'phai') || (w(i) === 'doi' && w(i + 1) === 'thanh') || (w(i) === 'sua' && w(i + 1) === 'lai')) {
      if (!out.some((m) => m.kind === 'corr' && m.at >= i - 1)) out.push({ kind: 'corr', at: i });
    }
  }
  return out;
}

/** Số đứng sau "bàn", "bàn số", "phòng", "lúc" hoặc trước "giờ": là số bàn/phòng/giờ, không phải số lượng. */
export function isReferenceNumber(tokens: Token[], i: number): boolean {
  const prev = tokens[i - 1];
  const prev2 = tokens[i - 2];
  const next = tokens[i + 1];
  if (prev && REF_AFTER_RAW.has(prev.raw)) return true;
  if (prev?.norm === 'so' && prev.raw !== 'sợ' && prev2 && REF_AFTER_RAW.has(prev2.raw)) return true;
  return !!next && (next.raw === 'giờ' || next.raw === 'gio' || next.raw === 'h');
}

export function ruleTag(tokens: Token[], index: CatalogIndex, info = analyze(tokens, index)): Label[] {
  const slot: Array<Slot | null> = tokens.map(() => null);
  const reference = new Set<number>();
  const protectedName = (k: number) => info[k].gzLen >= 2 && info[k].gzContent;
  const skip = (k: number) => (info[k].isFiller || reference.has(k)) && !protectedName(k);

  for (const [a, b] of clauseRanges(tokens, info)) {
    for (let k = a; k < b; k++) if (tokens[k].kind === 'money') slot[k] = 'AMT';

    // Khoản chi: từ mở đầu tới hết mệnh đề, cần có số tiền ≥ 1.000 trong mệnh đề
    const hasMoney = tokens.slice(a, b).some((t) => t.kind === 'money' && t.value >= 1000);
    if (hasMoney) {
      for (let p = a; p < b; p++) {
        if (!expenseTrigger(tokens, p)) continue;
        const prev = tokens[p - 1];
        const afterItem = p > a && (prev.kind === 'money' || (info[p - 1].gzLen > 0 && !info[p - 1].isFiller));
        const atStart = tokens.slice(a, p).every((t, o) => info[a + o].isFiller);
        if (!atStart && !afterItem) continue;
        // "tiền" chỉ mở khoản chi khi đứng đầu mệnh đề; "mua"/"tiền" + món trong kho có số lượng là bán hàng
        if (tokens[p].norm === 'tien' && !atStart) continue;
        if (tokens[p].norm === 'mua' && tokens.slice(p + 1, b).some((_, o) => protectedName(p + 1 + o) || info[p + 1 + o].isNum)) continue;
        for (let k = p; k < b; k++) slot[k] = tokens[k].kind === 'money' ? 'AMT' : 'EXP';
        break;
      }
    }

    // Số lượng: số (chữ số ≤ 3 chữ số hoặc cụm đọc số) không nằm trong tên món
    for (let k = a; k < b; k++) {
      if (slot[k] || !info[k].isNum || protectedName(k)) continue;
      if (isReferenceNumber(tokens, k)) {
        reference.add(k); // "bàn năm hai cà phê": "năm" là số bàn, "hai" là số lượng
        continue;
      }
      if (tokens[k].kind === 'num') {
        slot[k] = 'QTY';
        continue;
      }
      const end = Math.min(numberRunEnd(tokens, k), b);
      for (let m = k; m < end; m++) if (!protectedName(m)) slot[m] = 'QTY';
      k = end - 1;
    }

    // Đơn vị: ngay sau số lượng, hoặc ngay trước tên món khi không nói số ("lấy chai nước mắm")
    for (let k = a; k < b; k++) {
      if (slot[k] || !info[k].isUnit || protectedName(k)) continue;
      const afterQty = k > a && slot[k - 1] === 'QTY';
      const beforeName = k + 1 < b && !slot[k + 1] && (info[k + 1].inVocab || info[k + 1].gzLen > 0);
      if (afterQty || beforeName) slot[k] = 'UNIT';
    }

    // Tên món: cụm từ liền nhau còn lại (bỏ từ đệm ở hai đầu), có neo: số lượng/đơn vị kề bên, động từ bán, hoặc
    // khớp tên món trong danh mục bằng ≥ 2 từ
    let k = a;
    while (k < b) {
      if (slot[k] || skip(k)) {
        k++;
        continue;
      }
      let e = k;
      while (e < b && !slot[e] && !reference.has(e) && !(info[e].isFiller && !protectedName(e) && !(info[e].inVocab && e > k))) e++;
      while (e > k && skip(e - 1)) e--;
      if (e === k) {
        k++;
        continue;
      }
      let before = k - 1;
      while (before >= a && !slot[before] && info[before].isFiller && !isSaleVerb(tokens[before])) before--;
      const anchoredBefore = before >= a && (slot[before] === 'QTY' || slot[before] === 'UNIT' || isSaleVerb(tokens[before]));
      let after = e;
      while (after < b && !slot[after] && info[after].isFiller) after++;
      // "muối thì một gói": từ đệm giữa tên và số lượng vẫn neo được
      const anchoredAfter = after < b && slot[after] === 'QTY';
      const strong = tokens.slice(k, e).some((_, o) => protectedName(k + o)) || (e - k === 1 && info[k].df === 1 && e - k === b - a);
      const known = tokens.slice(k, e).some((_, o) => info[k + o].inVocab);
      if (anchoredBefore || anchoredAfter || (strong && known)) {
        for (let m = k; m < e; m++) slot[m] = 'ITEM';
      }
      k = e;
    }

    // Mệnh đề chỉ có một cụm danh từ ngắn ("gỏi cuốn cho chị", "chè đậu xanh"): là món, chưa nói số lượng (như parseOrder)
    if (tokens.slice(a, b).every((_, o) => !slot[a + o])) {
      const content = [];
      for (let m = a; m < b; m++) if (!skip(m) && tokens[m].kind === 'word') content.push(m);
      const contiguous = content.length > 0 && content[content.length - 1] - content[0] === content.length - 1;
      if (contiguous && content.length <= 3) for (const m of content) slot[m] = 'ITEM';
    }
  }

  // BIO: mỗi số lượng/đơn vị/tên món/khoản chi liền nhau là một cụm
  return slot.map((s, i) => {
    if (!s) return 'O';
    return (i > 0 && slot[i - 1] === s && !(s === 'QTY' && tokens[i].kind === 'num') ? `I-${s}` : `B-${s}`) as Label;
  });
}
