import { DisambiguationOption, ProductItem } from '../types';
import { normalizeVietnameseString } from './fuzzy_matcher';

/**
 * Phân giải tính nhập nhằng của tên món ăn ($K \rightarrow M$)
 */
export class DisambiguationResolver {
  public static findVariants(
    query: string,
    catalog: ProductItem[],
    scoredCandidates: Array<{ score: number; product: ProductItem }>
  ): DisambiguationOption[] {
    const q = normalizeVietnameseString(query);
    const qTokens = q.split(/\s+/);
    const matchingVariants: ProductItem[] = [];

    // 1. Quét tìm các sản phẩm chứa toàn bộ các từ của query làm gốc
    for (const product of catalog) {
      const pName = normalizeVietnameseString(product.name);
      const tokens = pName.split(/\s+/);

      // Nếu tất cả các từ trong query đều có trong tên sản phẩm
      if (qTokens.every((t) => tokens.includes(t))) {
        const extraTokens = tokens.filter((t) => !qTokens.includes(t) && !/^\d+$/.test(t) && !t.includes('ml'));
        if (extraTokens.length > 0) {
          matchingVariants.push(product);
        }
      }
    }

    // Nếu tìm thấy >= 2 biến thể
    if (matchingVariants.length >= 2) {
      // Kiểm tra xem query có đề cập cụ thể phân loại nào không (ví dụ "sting dâu" thì "dâu" đã xác định)
      for (const varProd of matchingVariants) {
        const varTokens = normalizeVietnameseString(varProd.name).split(/\s+/);
        const distinguishing = varTokens.filter((t) => !qTokens.includes(t) && !/^\d+$/.test(t) && !t.includes('ml'));
        if (distinguishing.some((dt) => qTokens.includes(dt))) {
          return []; // Query đã chỉ rõ loại, không bị nhập nhằng
        }
      }

      return matchingVariants.map((p) => ({
        product_id: p.id,
        name: p.name,
        unit_price_vnd: p.price_vnd,
        unit: p.unit,
        category: p.category,
      }));
    }

    // 2. Nếu top 2 candidates có điểm tương đương và chia sẻ chung tiền tố
    if (scoredCandidates.length >= 2) {
      const first = scoredCandidates[0];
      const second = scoredCandidates[1];
      if (Math.abs(first.score - second.score) < 0.08 && first.score >= 0.7) {
        const words1 = new Set(normalizeVietnameseString(first.product.name).split(/\s+/));
        const words2 = new Set(normalizeVietnameseString(second.product.name).split(/\s+/));
        const intersection = [...words1].filter((w) => words2.has(w));
        if (intersection.length >= 1) {
          return [first.product, second.product].map((p) => ({
            product_id: p.id,
            name: p.name,
            unit_price_vnd: p.price_vnd,
            unit: p.unit,
            category: p.category,
          }));
        }
      }
    }

    return [];
  }
}
