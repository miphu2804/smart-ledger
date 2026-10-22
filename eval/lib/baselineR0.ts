/**
 * R0 baseline adapter — the plan's current `parseOrder` matcher, scored on the
 * same `QueryLine`s every resolver sees (plan section 8.1).
 *
 * `parseOrder` takes a whole utterance and returns `ParsedOrder`, not a
 * `QueryLine` answer, so this adapter **reconstructs a minimal utterance** from
 * the line ("<qty> <unit> <span>") and runs the real matcher on it. That
 * reconstruction is an approximation: it drops the surrounding phrase, so R0's
 * numbers here are indicative, not an exact replay of the in-app pipeline. It is
 * also why R0 is compared to the resolvers as a decision (AUTO/ASK/NEW), not on
 * fused scores.
 *
 * `parseOrder`'s product type wants a `price`; the frozen `CatalogItem` has
 * none, so every product is passed with `price: 0`. Matching does not use price
 * (only the price-splitting path does), so this does not change the decision.
 */

import { parseOrder } from '../../frontend/mobile/src/lib/parseOrder.ts';
import type { ParseableProduct } from '../../frontend/mobile/src/lib/parseOrder.ts';
import type { CatalogItem, Decision, GateFeatures, QueryLine, ResolveResult } from '../../frontend/mobile/src/lib/resolver/types.ts';

/** The minimum utterance that carries the line's quantity, unit and span. */
export function reconstructUtterance(line: QueryLine): string {
  const parts: string[] = [];
  if (line.qty !== undefined && line.qty !== null) parts.push(String(line.qty));
  if (line.unit) parts.push(line.unit);
  parts.push(line.rawProductSpan);
  return parts.join(' ').trim();
}

/** Query length in syllables (whitespace-separated), the one gate feature R0 can compute. */
function syllableCount(span: string): number {
  return span.trim().split(/\s+/).filter(Boolean).length;
}

/** R0 as a resolver handle: constructed once from the catalog, then queried. */
export class BaselineR0 {
  readonly name = 'R0';

  private readonly products: ParseableProduct[];

  constructor(catalog: CatalogItem[]) {
    this.products = catalog.map((item) => ({ id: item.id, name: item.name, price: 0 }));
  }

  resolve(line: QueryLine): ResolveResult {
    const parsed = parseOrder(reconstructUtterance(line), this.products);
    const disambiguations = parsed.disambiguations ?? [];

    let decision: Decision;
    let productId: string | null = null;
    if (disambiguations.length > 0) {
      decision = 'ASK';
    } else if (parsed.items.length === 1) {
      decision = 'AUTO';
      productId = String(parsed.items[0].productId);
    } else if (parsed.items.length === 0) {
      decision = 'NEW';
    } else {
      // Two or more catalog items in one line: R0 offers no ordering, so ask.
      decision = 'ASK';
    }

    const features: GateFeatures = {
      // R0 has no gate features: it produces no fused score, no ranking and no
      // retriever agreement, so every score/agreement field is a placeholder.
      s1: 0,
      s2: 0,
      margin: 0,
      disp: 0,
      agree: 0,
      jacc: 0,
      unit_ok: 'unknown', // R0 has no gate features
      alias: 0, // R0 has no gate features
      len_q: syllableCount(line.rawProductSpan),
      stt_conf: null, // R0 has no gate features
    };

    return { decision, productId, topK: [], features };
  }
}
