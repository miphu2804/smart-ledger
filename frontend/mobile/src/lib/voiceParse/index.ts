import { type ParseableProduct, type ParsedOrder, parseOrder as baselineParseOrder } from '../parseOrder';

export interface DetailedParse extends ParsedOrder {
  fallback: boolean;
}

export function parseOrderDetailed(text: string, products: ParseableProduct[]): DetailedParse {
  return { ...baselineParseOrder(text, products), fallback: false };
}

export function parseOrder(text: string, products: ParseableProduct[]): ParsedOrder {
  return parseOrderDetailed(text, products);
}
