/**
 * Character-trigram inverted index with the Ukkonen count filter (plan
 * section 5.3, "Zobel layout").
 *
 * One document per (productId, string) pair: a catalog name or an alias
 * string. Documents are the padded, space-removed folded string
 * `"##" + folded(text).replace(/ /g, "") + "#"`, so a boundary trigram marks
 * each end. The index stores `trigram -> docId[]` plus `df(trigram)`.
 *
 * Candidate generation is a **count filter, never an AND**: for the query's
 * distinct trigram set it accumulates, per document, how many of the query
 * trigrams that document contains, and keeps the documents whose shared count
 * reaches τ = max(|q|, |d|) − 3 + 1 − 3K. Ukkonen's q-gram lemma lower-bounds
 * edit distance by q-gram overlap, so pruning at that bound is lossless for
 * edit distance ≤ K. When τ ≤ 0 every document sharing at least one trigram is
 * kept. Posting lists are walked, never intersected.
 *
 * Shared by `retrieverQ` (both scorers) and `retrieverAnd` (the historical
 * exact-AND control, which reuses the same index but intersects).
 */

import { folded } from './normalizer.ts';

/** q, the n-gram size. The plan fixes character trigrams. */
export const TRIGRAM_SIZE = 3;

/** `folded(text)` with every space removed: the string the trigrams are taken from. */
export function spaceRemovedFold(text: string): string {
  return folded(text).replace(/ /g, '');
}

/**
 * The padded character trigrams of an already space-removed string, in order,
 * with repeats. `s` is padded as `"##" + s + "#"`, so `"stink"` yields
 * `##s #st sti tin ink nk#`.
 */
export function paddedTrigrams(s: string): string[] {
  const padded = `##${s}#`;
  const trigrams: string[] = [];
  for (let i = 0; i + TRIGRAM_SIZE <= padded.length; i += 1) {
    trigrams.push(padded.slice(i, i + TRIGRAM_SIZE));
  }
  return trigrams;
}

/** Convenience: fold, remove spaces, then take padded trigrams. */
export function trigramsOf(text: string): string[] {
  return paddedTrigrams(spaceRemovedFold(text));
}

/**
 * Ukkonen count-filter threshold τ for a query and a document of the given
 * unpadded, space-removed lengths (plan section 5.3):
 * `τ = max(|q|, |d|) − 3 + 1 − 3K`. A document within edit distance K must
 * share at least τ trigrams with the query; τ ≤ 0 keeps every document sharing
 * at least one trigram.
 */
export function countThreshold(queryLength: number, docLength: number, maxEditDistance: number): number {
  return Math.max(queryLength, docLength) - TRIGRAM_SIZE + 1 - TRIGRAM_SIZE * maxEditDistance;
}

/** One indexed string: a catalog name or an alias string. */
export interface IndexedDoc {
  /** The product this document belongs to; a product may own several documents. */
  productId: string;
  /** Unpadded, space-removed folded length |d|. */
  length: number;
  /** Distinct padded trigrams and their term frequencies. */
  tf: Map<string, number>;
  /** Total trigram tokens, repeats included, equal to `length + 1`. */
  trigramCount: number;
}

export class TrigramIndex {
  private readonly docs: IndexedDoc[] = [];
  private readonly postings = new Map<string, number[]>();
  private readonly documentFrequency = new Map<string, number>();
  private totalTrigrams = 0;
  private idfCache: Map<string, number> | null = null;
  private idfBuiltAt = 0;

  /** Index one string for a product. Postings and `df` update synchronously. */
  addDocument(text: string, productId: string): number {
    const s = spaceRemovedFold(text);
    const trigrams = paddedTrigrams(s);
    const tf = new Map<string, number>();
    for (const trigram of trigrams) tf.set(trigram, (tf.get(trigram) ?? 0) + 1);

    const docId = this.docs.length;
    this.docs.push({ productId, length: s.length, tf, trigramCount: trigrams.length });
    this.totalTrigrams += trigrams.length;

    for (const trigram of tf.keys()) {
      let posting = this.postings.get(trigram);
      if (posting === undefined) {
        posting = [];
        this.postings.set(trigram, posting);
      }
      posting.push(docId);
      this.documentFrequency.set(trigram, (this.documentFrequency.get(trigram) ?? 0) + 1);
    }
    return docId;
  }

  /** Number of indexed documents N_docs. */
  get size(): number {
    return this.docs.length;
  }

  /** Mean trigram token count over the indexed documents; 0 when empty. */
  get avgTrigramCount(): number {
    return this.docs.length === 0 ? 0 : this.totalTrigrams / this.docs.length;
  }

  /** The document behind an internal id. */
  doc(docId: number): IndexedDoc {
    return this.docs[docId];
  }

  /** The posting list of a trigram, or `undefined` when no document has it. */
  posting(trigram: string): readonly number[] | undefined {
    return this.postings.get(trigram);
  }

  /**
   * BM25-style inverse document frequency, non-negative:
   * `ln((N − df + 0.5) / (df + 0.5) + 1)`. Recomputes the cached table lazily
   * once the document count has moved more than 5% since the last build.
   */
  idf(trigram: string): number {
    const n = this.docs.length;
    if (n === 0) return 0;
    this.refreshIdfIfStale();
    const cached = this.idfCache?.get(trigram);
    if (cached !== undefined) return cached;
    const df = this.documentFrequency.get(trigram) ?? 0;
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Candidate documents for a query, by the Ukkonen count filter. `queryTrigrams`
   * must be the query's **distinct** trigrams; `queryLength` is its unpadded,
   * space-removed length. Never intersects posting lists.
   */
  candidates(queryTrigrams: Iterable<string>, queryLength: number, maxEditDistance: number): number[] {
    const shared = new Map<number, number>();
    for (const trigram of queryTrigrams) {
      const posting = this.postings.get(trigram);
      if (posting === undefined) continue;
      for (const docId of posting) shared.set(docId, (shared.get(docId) ?? 0) + 1);
    }

    const out: number[] = [];
    for (const [docId, count] of shared) {
      if (count >= countThreshold(queryLength, this.docs[docId].length, maxEditDistance)) out.push(docId);
    }
    return out;
  }

  private refreshIdfIfStale(): void {
    const n = this.docs.length;
    if (this.idfCache !== null && Math.abs(n - this.idfBuiltAt) <= 0.05 * this.idfBuiltAt) return;
    const cache = new Map<string, number>();
    for (const [trigram, df] of this.documentFrequency) {
      cache.set(trigram, Math.log((n - df + 0.5) / (df + 0.5) + 1));
    }
    this.idfCache = cache;
    this.idfBuiltAt = n;
  }
}
