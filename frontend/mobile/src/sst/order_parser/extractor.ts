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

    const itemSegmentRegex = new RegExp(
      `(?:(?:cho|thêm|bán|lấy|order)\\s+)?(\\d+(?:\\.\\d+)?|${numWordsPattern})\\s+(?:(${unitsPattern})\\s+)?([a-zA-Zà-ỹÀ-Ỹ0-9\\s]+?)(?=(?:\\s+(?:và\\s+)?(?:\\d+(?:\\.\\d+)?|${numWordsPattern})\\s+)|$)`,
      'gi'
    );

    const matches = Array.from(itemText.matchAll(itemSegmentRegex));

    if (matches && matches.length > 0) {
      for (const match of matches) {
        const qtyStr = match[1].trim();
        let unit = match[2] || null;
        let rawName = match[3].trim().replace(/^[,.-]+|[,.-]+$/g, '');
        const qty = this.parseQuantity(qtyStr);

        // Kiểm tra nếu đơn vị tính nằm dính trong rawName
        if (!unit) {
          for (const u of COMMON_UNITS) {
            const unitPrefix = new RegExp(`^${u}\\b`, 'i');
            if (unitPrefix.test(rawName)) {
              unit = u;
              rawName = rawName.replace(unitPrefix, '').trim();
              break;
            }
          }
        }

        // Tách ghi chú/tùy chỉnh (notes)
        let notes: string | null = null;
        const noteMatch = rawName.match(/\b(ít\s+đường|không\s+đường|nhiều\s+đường|không\s+đá|ít\s+đá|không\s+ớt|ít\s+cay|mang\s+về)\b/i);
        if (noteMatch) {
          notes = noteMatch[1];
          rawName = rawName.replace(noteMatch[0], '').trim();
        }

        // Dọn dẹp từ nối thừa
        let cleanName = rawName.replace(/^(?:cho|thêm|và|với)\s+/i, '');
        cleanName = cleanName.replace(/\s+(?:và|với|hoặc|kèm)$/i, '').trim();

        if (cleanName) {
          items.push({
            raw_name: cleanName,
            quantity: qty,
            unit: unit,
            notes: notes,
          });
        }
      }
    } else {
      // Không có số lượng ở đầu -> coi toàn bộ câu là 1 món số lượng 1
      let cleanName = itemText.replace(/^(?:cho|lấy|bán|order|và)\s+/i, '');
      cleanName = cleanName.replace(/\s+(?:và|với|hoặc|kèm)$/i, '').trim();
      if (cleanName && !/^\d+$/.test(cleanName)) {
        items.push({
          raw_name: cleanName,
          quantity: 1.0,
          unit: null,
          notes: null,
        });
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
