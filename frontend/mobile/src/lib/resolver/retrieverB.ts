/**
 * Retriever B — syllable-level BM25 over the folded view (plan section 5.4).
 *
 * A thin `Retriever` over `syllableBm25.ts`. Because BM25 ignores token order
 * and extra tokens contribute nothing, `"dâu sting"` and `"sting dâu"` score
 * alike, which is the whole reason B sits alongside E.
 *
 * `useUnitStoplist` turns the unit-word stoplist (data in
 * `unit_stopwords.vi.ts`) on or off; the bake-off evaluates both.
 */

import { SyllableBm25 } from './syllableBm25.ts';
import { UNIT_STOPWORDS } from './unit_stopwords.vi.ts';
import type { CatalogItem, QueryLine, RetrievalHit, Retriever } from './types.ts';

export interface RetrieverBOptions {
  /** Drop unit words (`chai`, `lon`, `gói`, …) before scoring. Default off. */
  useUnitStoplist?: boolean;
  /** BM25 term-frequency saturation. Default 1.2. */
  k1?: number;
  /** BM25 length-normalization. Default 0.75. */
  b?: number;
}

export class RetrieverB implements Retriever {
  readonly name = 'B';

  private readonly bm25: SyllableBm25;

  constructor(catalog: CatalogItem[], options: RetrieverBOptions = {}) {
    this.bm25 = new SyllableBm25({
      k1: options.k1,
      b: options.b,
      stopwords: options.useUnitStoplist ? new Set(UNIT_STOPWORDS) : undefined,
    });
    for (const item of catalog) this.bm25.addDocument(item.name, item.id);
  }

  /** Mean token count of the indexed documents — the BM25 `avg_len`. */
  get avgLength(): number {
    return this.bm25.avgLength;
  }

  retrieve(line: QueryLine, k: number): RetrievalHit[] {
    if (k <= 0) return [];
    return this.bm25.search(line.rawProductSpan, k);
  }

  /** Index one extra string for a product (catalog insert or alias upsert). */
  addDocument(text: string, productId: string): void {
    this.bm25.addDocument(text, productId);
  }
}
