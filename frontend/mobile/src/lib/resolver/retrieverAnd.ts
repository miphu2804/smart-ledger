/**
 * Retriever AND — the historical exact-AND control (plan section 2).
 *
 * A document must contain **every** query trigram: this is the classic AND
 * n-gram filter the plan explicitly rejects, kept only so the bake-off can show
 * what the rejected design costs. A single mis-heard character removes the
 * correct candidate, because the trigram that character creates is absent from
 * the true document.
 *
 * Implemented faithfully and cheaply on the shared `trigramIndex.ts`: walk each
 * distinct query trigram's posting list, count how many the document holds, and
 * keep only documents whose count equals the query's distinct-trigram count —
 * exactly the intersection of the posting lists. Every survivor ties, so the
 * ranking is by `productId` ascending. Do not "fix" it.
 */

import { TrigramIndex, paddedTrigrams, spaceRemovedFold } from './trigramIndex.ts';
import type { CatalogItem, QueryLine, RetrievalHit, Retriever } from './types.ts';

export class RetrieverAnd implements Retriever {
  readonly name = 'AND';

  private readonly index = new TrigramIndex();

  constructor(catalog: CatalogItem[]) {
    for (const item of catalog) this.index.addDocument(item.name, item.id);
  }

  retrieve(line: QueryLine, k: number): RetrievalHit[] {
    if (k <= 0) return [];
    const s = spaceRemovedFold(line.rawProductSpan);
    if (s === '') return [];

    const distinct = [...new Set(paddedTrigrams(s))];
    if (distinct.length === 0) return [];

    const shared = new Map<number, number>();
    for (const trigram of distinct) {
      const posting = this.index.posting(trigram);
      // A query trigram no document holds makes the AND empty.
      if (posting === undefined) return [];
      for (const docId of posting) shared.set(docId, (shared.get(docId) ?? 0) + 1);
    }

    const needed = distinct.length;
    const best = new Map<string, number>();
    for (const [docId, count] of shared) {
      if (count !== needed) continue;
      const productId = this.index.doc(docId).productId;
      if (!best.has(productId)) best.set(productId, needed);
    }

    const hits: RetrievalHit[] = [...best].map(([productId, score]) => ({ productId, score }));
    hits.sort((a, b) => b.score - a.score || (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
    return hits.slice(0, k);
  }

  /** Index one extra string for a product (catalog insert or alias upsert). */
  addDocument(text: string, productId: string): void {
    this.index.addDocument(text, productId);
  }

  removeDocument(text: string, productId: string): boolean {
    return this.index.removeDocument(text, productId);
  }
}
