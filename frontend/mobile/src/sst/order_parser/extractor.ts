import { ExtractedExpense, ExtractedItem, OrderIntent } from '../types';

const VIETNAMESE_NUMBERS: Record<string, number> = {
  một: 1, mốt: 1, hai: 2, ba: 3, bốn: 4, tư: 4, năm: 5,
  sáu: 6, bảy: 7, tám: 8, chín: 9, mười: 10,
  'mười một': 11, 'mười hai': 12, 'mười ba': 13, 'mười bốn': 14, 'mười lăm': 15,
  'mười sáu': 16, 'mười bảy': 17, 'mười tám': 18, 'mười chín': 19, 'hai mươi': 20,
  nửa: 0.5, rưỡi: 0.5, chục: 10,
};

const COMMON_UNITS = [
  'ổ', 'ly', 'cốc', 'hộp', 'chai', 'lon', 'cây', 'phần', 'suất',
  'gói', 'bịch', 'tô', 'dĩa', 'đĩa', 'cái', 'bình', 'tách', 'bao',
];

/**
 * 4. POS Order Extractor (Client-Side)
 * Bóc tách Intent, Items (số lượng, quy cách, tên món, ghi chú) và Expenses từ văn bản chuẩn hóa.
 */
export class ClientOrderExtractor {
  public extract(text: string): {
    intent: OrderIntent;
    items: ExtractedItem[];
    expenses: ExtractedExpense[];
  } {
    const cleaned = text.trim();
    if (!cleaned) {
      return { intent: 'UNKNOWN', items: [], expenses: [] };
    }

    const items: ExtractedItem[] = [];
    const expenses: ExtractedExpense[] = [];
    let itemText = cleaned;

    // 1. Bóc tách khoản chi tiền (Expenses)
    const expenseRegex = /(?:chi|trả|mua|lấy)\s+(\d+k|\d+\s*(?:ngàn|nghìn|k|vnd|đ))\s*(?:tiền|cho)?\s*([^,;]+)?/i;
    const expenseMatch = itemText.match(expenseRegex);

    if (expenseMatch) {
      const amtStr = expenseMatch[1];
      const desc = (expenseMatch[2] || '').trim();
      const amount = this.parseAmount(amtStr);
      expenses.push({ category: desc || 'Chi tiền', amount_vnd: amount, notes: null });

      // Cắt bỏ phần chi phí khỏi text đơn hàng
      itemText = itemText.replace(expenseMatch[0], ' ').trim();
    }

    // 2. Bóc tách từng dòng món hàng (Items)
    const sortedNumKeys = Object.keys(VIETNAMESE_NUMBERS).sort((a, b) => b.length - a.length);
    const numWordsPattern = sortedNumKeys.join('|');
    const unitsPattern = COMMON_UNITS.join('|');

    // Tách các phân đoạn theo dấu phẩy hoặc từ nối (và, với, kèm, cùng, thêm)
    const rawSegments = itemText
      .split(/,|\s+(?:và|với|kèm|cùng)\s+/i)
      .map((s) => s.trim())
      .filter(Boolean);

    // Regex dạng Suffix độc lập: [Tên món] [Số lượng] [Đơn vị?] (vd: "cà phê sữa một ly", "bánh mì 2 ổ")
    const standaloneSuffixRegex = new RegExp(
      `^(?:(?:cho|thêm|bán|lấy|order)\\s+)?([a-zA-Zà-ỹÀ-Ỹ\\s]+?)\\s+(\\d+(?:\\.\\d+)?|${numWordsPattern})\\s*(${unitsPattern})?$`,
      'i'
    );

    // Regex tìm tất cả các vị trí số lượng trong câu
    const numberAnchorRegex = new RegExp(
      `(?<=^|\\s)(?:(?:cho|thêm|bán|lấy|order)\\s+)?(\\d+(?:\\.\\d+)?|${numWordsPattern})(?=\\s+|$)`,
      'gi'
    );

    for (const seg of rawSegments) {
      // 1. Kiểm tra nếu toàn bộ phân đoạn là câu đảo ngữ [Tên món] [Số lượng] (vd: "cà phê sữa một ly")
      const suffixMatch = seg.match(standaloneSuffixRegex);
      if (suffixMatch && suffixMatch[1].trim() && !numberAnchorRegex.test(suffixMatch[1].trim())) {
        const rawName = suffixMatch[1].trim();
        const qty = this.parseQuantity(suffixMatch[2]);
        const unit = suffixMatch[3] || null;
        this.pushExtractedItem(items, rawName, qty, unit, true);
        continue;
      }

      // 2. Tìm tất cả các mốc số lượng trong phân đoạn
      const numMatches = Array.from(seg.matchAll(numberAnchorRegex));
      let matchedAny = false;

      if (numMatches.length > 0) {
        for (let i = 0; i < numMatches.length; i++) {
          const currentMatch = numMatches[i];
          const qtyStr = currentMatch[1].trim();
          const qty = this.parseQuantity(qtyStr);
          const startIndex = (currentMatch.index ?? 0) + currentMatch[0].length;
          const nextIndex = i + 1 < numMatches.length ? (numMatches[i + 1].index ?? seg.length) : seg.length;

          let chunk = seg.substring(startIndex, nextIndex).trim();

          // Tách đơn vị tính nếu đứng ngay đầu chunk (vd: "ly cà phê sữa" -> unit = "ly", name = "cà phê sữa")
          let unit: string | null = null;
          for (const u of COMMON_UNITS) {
            const uRegex = new RegExp(`^${u}\\b`, 'i');
            if (uRegex.test(chunk)) {
              unit = u;
              chunk = chunk.replace(uRegex, '').trim();
              break;
            }
          }

          // Xử lý trường hợp số đứng sau tên món ở đầu câu (vd: "cà phê sữa 1 ly 2 bánh mì")
          if (!chunk && i === 0 && (currentMatch.index ?? 0) > 0) {
            chunk = seg.substring(0, currentMatch.index).trim();
          }

          chunk = chunk.replace(/^[,.-]+|[,.-]+$/g, '').trim();

          if (chunk && !/^\d+$/.test(chunk)) {
            matchedAny = true;
            this.pushExtractedItem(items, chunk, qty, unit, true);
          }
        }
      }

      // 3. Nếu không tìm thấy số lượng nào trong phân đoạn -> câu chỉ có tên món thiếu số lượng
      if (!matchedAny) {
        let cleanName = seg.replace(/^(?:cho|lấy|bán|order|và|thêm|với)\s+/i, '');
        cleanName = cleanName.replace(/\s+(?:và|với|hoặc|kèm)$/i, '').trim();
        if (cleanName && !/^\d+$/.test(cleanName)) {
          this.pushExtractedItem(items, cleanName, 0, null, false);
        }
      }
    }

    let intent: OrderIntent = 'SALE';
    if (expenses.length > 0 && items.length > 0) {
      intent = 'MIXED';
    } else if (expenses.length > 0 && items.length === 0) {
      intent = 'EXPENSE';
    }

    return { intent, items, expenses };
  }

  private pushExtractedItem(
    items: ExtractedItem[],
    rawName: string,
    quantity: number,
    unit: string | null,
    hasQuantity: boolean
  ): void {
    let cleanName = rawName.trim().replace(/^[,.-]+|[,.-]+$/g, '');

    // Kiểm tra nếu đơn vị tính nằm dính trong rawName
    if (!unit) {
      for (const u of COMMON_UNITS) {
        const unitPrefix = new RegExp(`^${u}\\b`, 'i');
        if (unitPrefix.test(cleanName)) {
          unit = u;
          cleanName = cleanName.replace(unitPrefix, '').trim();
          break;
        }
      }
    }

    // Tách ghi chú/tùy chỉnh (notes)
    let notes: string | null = null;
    const noteMatch = cleanName.match(
      /\b(ít\s+đường|không\s+đường|nhiều\s+đường|không\s+đá|ít\s+đá|không\s+ớt|ít\s+cay|mang\s+về)\b/i
    );
    if (noteMatch) {
      notes = noteMatch[1];
      cleanName = cleanName.replace(noteMatch[0], '').trim();
    }

    // Dọn dẹp từ nối thừa
    cleanName = cleanName.replace(/^(?:cho|thêm|và|với|lấy|bán|order)\s+/i, '');
    cleanName = cleanName.replace(/\s+(?:và|với|hoặc|kèm)$/i, '').trim();

    if (cleanName && !/^\d+$/.test(cleanName)) {
      items.push({
        raw_name: cleanName,
        quantity: hasQuantity ? Math.max(1, quantity) : 0,
        has_quantity: hasQuantity,
        unit: unit,
        notes: notes,
      });
    }
  }

  private parseQuantity(valStr: string): number {
    const s = valStr.toLowerCase().trim();
    if (VIETNAMESE_NUMBERS[s] !== undefined) {
      return VIETNAMESE_NUMBERS[s];
    }
    const num = parseFloat(s);
    return isNaN(num) ? 1.0 : num;
  }

  private parseAmount(amtStr: string): number {
    const s = amtStr.toLowerCase().replace(/[\s,.]+/g, '');
    if (s.includes('k') || s.includes('ngàn') || s.includes('nghìn')) {
      const match = s.match(/\d+/);
      return match ? parseInt(match[0], 10) * 1000 : 0;
    }
    const match = s.match(/\d+/);
    return match ? parseInt(match[0], 10) : 0;
  }
}
