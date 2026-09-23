import { ExtractedItem, MatchedItem, ProductItem } from '../types';
import { DisambiguationResolver } from './disambiguation';

export function normalizeVietnameseString(str: string): string {
  if (!str) return '';
  return str.toLowerCase().trim().normalize('NFC');
}

/**
 * Tính toán độ tương đồng Levenshtein Ratio (0.0 - 1.0)
 */
export function calculateLevenshteinRatio(s1: string, s2: string): number {
  const a = normalizeVietnameseString(s1);
  const b = normalizeVietnameseString(s2);
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0.0;

  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  const distance = matrix[b.length][a.length];
  const maxLen = Math.max(a.length, b.length);
  return Math.max(0, 1.0 - distance / maxLen);
}

/**
 * Tính Token Sort Ratio (so khớp tập từ không phụ thuộc thứ tự)
 */
export function calculateTokenSortRatio(s1: string, s2: string): number {
  const tokens1 = normalizeVietnameseString(s1).split(/\s+/).sort().join(' ');
  const tokens2 = normalizeVietnameseString(s2).split(/\s+/).sort().join(' ');
  return calculateLevenshteinRatio(tokens1, tokens2);
}

/**
 * 5. Local Menu Fuzzy Matcher (Client-Side)
 * Khớp trực tiếp với danh mục sản phẩm lưu trong máy người dùng.
 */
export class ClientFuzzyMatcher {
  private highThreshold: number;
  private mediumThreshold: number;

  constructor(highThreshold: number = 0.82, mediumThreshold: number = 0.55) {
    this.highThreshold = highThreshold;
    this.mediumThreshold = mediumThreshold;
  }

  public matchItem(item: ExtractedItem, catalog: ProductItem[]): MatchedItem {
    const rawName = item.raw_name.trim();
    const normalizedQuery = normalizeVietnameseString(rawName);

    if (!normalizedQuery || catalog.length === 0) {
      return {
        product_id: null,
        matched_name: null,
        raw_input_name: rawName,
        quantity: item.quantity,
        unit: item.unit || 'món',
        unit_price_vnd: 0,
        subtotal_vnd: 0,
        confidence: 0,
        needs_disambiguation: false,
        disambiguation_options: [],
        warning: 'Không tìm thấy thông tin món',
        notes: item.notes || null,
      };
    }

    const scoredCandidates: Array<{ score: number; product: ProductItem }> = [];

    for (const product of catalog) {
      const normProdName = normalizeVietnameseString(product.name);
      const scoreLev = calculateLevenshteinRatio(normalizedQuery, normProdName);
      const scoreSort = calculateTokenSortRatio(normalizedQuery, normProdName);

      let inclusionBonus = 0.0;
      if (normProdName.includes(normalizedQuery) || (product.aliases && product.aliases.some((a) => normalizeVietnameseString(a).includes(normalizedQuery)))) {
        inclusionBonus = 0.1;
      }

      let bestScore = Math.min(1.0, Math.max(scoreLev, scoreSort, (scoreLev + scoreSort) / 2) + inclusionBonus);

      // Check aliases
      if (product.aliases) {
        for (const alias of product.aliases) {
          const normAlias = normalizeVietnameseString(alias);
          const aliasLev = calculateLevenshteinRatio(normalizedQuery, normAlias);
          const aliasSort = calculateTokenSortRatio(normalizedQuery, normAlias);
          let aliasBest = Math.max(aliasLev, aliasSort);
          if (normalizedQuery === normAlias) aliasBest = 1.0;
          bestScore = Math.max(bestScore, aliasBest);
        }
      }

      if (bestScore >= this.mediumThreshold) {
        scoredCandidates.push({ score: bestScore, product });
      }
    }

    // Sắp xếp giảm dần theo điểm số
    scoredCandidates.sort((a, b) => b.score - a.score);

    // -------------------------------------------------------------
    // Disambiguation Check (K -> M)
    // -------------------------------------------------------------
    const disambigOptions = DisambiguationResolver.findVariants(normalizedQuery, catalog, scoredCandidates);
    if (disambigOptions.length >= 2) {
      const topScore = scoredCandidates.length > 0 ? scoredCandidates[0].score : 0.85;
      return {
        product_id: null,
        matched_name: null,
        raw_input_name: rawName,
        quantity: item.quantity,
        unit: item.unit || disambigOptions[0].unit,
        unit_price_vnd: 0,
        subtotal_vnd: 0,
        confidence: Math.round(topScore * 100) / 100,
        needs_disambiguation: true,
        disambiguation_options: disambigOptions,
        warning: `Tên món '${rawName}' có ${disambigOptions.length} biến thể trong thực đơn, vui lòng chọn loại cụ thể`,
        notes: item.notes || null,
      };
    }

    // -------------------------------------------------------------
    // Exact / High Match (K -> L)
    // -------------------------------------------------------------
    if (scoredCandidates.length > 0 && scoredCandidates[0].score >= this.highThreshold) {
      const { score, product } = scoredCandidates[0];
      const unitPrice = product.price_vnd;
      const subtotal = Math.round(item.quantity * unitPrice);

      return {
        product_id: product.id,
        matched_name: product.name,
        raw_input_name: rawName,
        quantity: item.quantity,
        unit: item.unit || product.unit,
        unit_price_vnd: unitPrice,
        subtotal_vnd: subtotal,
        confidence: Math.round(score * 100) / 100,
        needs_disambiguation: false,
        disambiguation_options: [],
        warning: null,
        notes: item.notes || null,
      };
    }

    // -------------------------------------------------------------
    // Medium Match (Khớp tương đối)
    // -------------------------------------------------------------
    if (scoredCandidates.length > 0 && scoredCandidates[0].score >= this.mediumThreshold) {
      const { score, product } = scoredCandidates[0];
      const unitPrice = product.price_vnd;
      const subtotal = Math.round(item.quantity * unitPrice);

      return {
        product_id: product.id,
        matched_name: product.name,
        raw_input_name: rawName,
        quantity: item.quantity,
        unit: item.unit || product.unit,
        unit_price_vnd: unitPrice,
        subtotal_vnd: subtotal,
        confidence: Math.round(score * 100) / 100,
        needs_disambiguation: false,
        disambiguation_options: [],
        warning: `Khớp tương đối (${Math.round(score * 100)}%) với '${product.name}', vui lòng kiểm tra lại`,
        notes: item.notes || null,
      };
    }

    // -------------------------------------------------------------
    // Unmatched (Món ngoài menu)
    // -------------------------------------------------------------
    const topScore = scoredCandidates.length > 0 ? scoredCandidates[0].score : 0;
    return {
      product_id: null,
      matched_name: null,
      raw_input_name: rawName,
      quantity: item.quantity,
      unit: item.unit || 'món',
      unit_price_vnd: 0,
      subtotal_vnd: 0,
      confidence: Math.round(topScore * 100) / 100,
      needs_disambiguation: false,
      disambiguation_options: [],
      warning: 'Món chưa có trong thực đơn quán, vui lòng nhập giá',
      notes: item.notes || null,
    };
  }
}
