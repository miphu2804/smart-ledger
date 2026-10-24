/**
 * Retriever P — similarity over the phonetic-key view (plan section 5.5).
 *
 * P scores the same `1 - DL / max(|a|, |b|)` similarity as E, but on the
 * `phon` view: initials and codas the ASR and dialect variation confuse
 * (`x/s`, `ch/tr`, `d/gi/r/v`, `c/k/q`, `n/ng`, `t/c`) collapse onto one form,
 * so a span written "xì ting" reaches a catalog spelling "Sì ting" exactly.
 *
 * Kept a separate file and class from E because the bake-off enables and
 * disables P independently. Same constructor shape, determinism rule and
 * `addDocument` behaviour as E.
 */

import { phon } from './normalizer.ts';
import { similarity } from './editDistance.ts';
import type { CatalogItem, QueryLine, RetrievalHit, Retriever } from './types.ts';

/** How many ids P asks a candidate provider for when the catalog is too large to brute-force. */
const P_CANDIDATES = 50;

/** Options for `RetrieverP`. */
export interface RetrieverPOptions {
  /** Catalog size at or below which P scores every item. Default 5000. */
  pBruteMax?: number;
  /**
   * Candidate provider used when the catalog exceeds `pBruteMax`. Returns
   * product ids to score; `k` is how many are requested. Absent -> brute force.
   */
  candidates?: (line: QueryLine, k: number) => string[];
}

export class RetrieverP implements Retriever {
  readonly name = 'P';

  private readonly pBruteMax: number;
  private readonly candidates?: (line: QueryLine, k: number) => string[];
  private readonly docs = new Map<string, string[]>();
  private readonly ids: string[] = [];

  constructor(catalog: CatalogItem[], options: RetrieverPOptions = {}) {
    this.pBruteMax = options.pBruteMax ?? 5000;
    this.candidates = options.candidates;
    for (const item of catalog) this.addDocument(item.name, item.id);
  }

  /** Index one extra string for a product (catalog insert or alias upsert). */
  addDocument(text: string, productId: string): void {
    let bucket = this.docs.get(productId);
    if (bucket === undefined) {
      bucket = [];
      this.docs.set(productId, bucket);
      this.ids.push(productId);
    }
    bucket.push(phon(text));
  }

  /** Remove the most recently added string of `productId` equal to `text` once normalized. */
  removeDocument(text: string, productId: string): boolean {
    const bucket = this.docs.get(productId);
    const target = phon(text);
    const index = bucket?.findLastIndex((doc) => doc === target) ?? -1;
    if (bucket === undefined || index < 0) return false;
    bucket.splice(index, 1);
    if (bucket.length === 0) {
      this.docs.delete(productId);
      this.ids.splice(this.ids.indexOf(productId), 1);
    }
    return true;
  }

  retrieve(line: QueryLine, k: number): RetrievalHit[] {
    if (k <= 0 || this.ids.length === 0) return [];

    const query = phon(line.rawProductSpan);
    const candidates = this.candidateIds(line);
    const hits: RetrievalHit[] = [];
    for (const productId of candidates) {
      const bucket = this.docs.get(productId);
      if (bucket === undefined) continue;
      let best = -1;
      for (const doc of bucket) {
        const score = similarity(query, doc);
        if (score > best) best = score;
      }
      hits.push({ productId, score: best });
    }

    hits.sort((x, y) => y.score - x.score || (x.productId < y.productId ? -1 : x.productId > y.productId ? 1 : 0));
    return hits.slice(0, k);
  }

  /**
   * The product ids to score: whole catalog when small, else the injected provider.
   *
   * Same reason as E: the trigram filter drops a short span that is a prefix of
   * a longer name, so products whose phonetic key starts with the span's are
   * always added, and an empty result still means scan rather than miss.
   */
  private candidateIds(line: QueryLine): string[] {
    if (this.ids.length <= this.pBruteMax) return this.ids;
    if (this.candidates === undefined) return this.ids;
    const ids = new Set(this.candidates(line, P_CANDIDATES));
    const prefix = phon(line.rawProductSpan);
    if (prefix !== '') {
      for (const [productId, bucket] of this.docs) {
        if (bucket.some((doc) => doc.startsWith(prefix))) ids.add(productId);
      }
    }
    return ids.size === 0 ? this.ids : [...ids];
  }
}
