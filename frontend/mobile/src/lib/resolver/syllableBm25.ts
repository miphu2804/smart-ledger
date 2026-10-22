/**
 * Syllable-level BM25 scorer (plan section 5.4).
 *
 * Tokens are the whitespace-separated syllables of `folded(text)` — no
 * stemming, no stopwords of its own (Vietnamese is isolating). Because BM25
 * sums over tokens independently of position, a query matches its document
 * regardless of word order, which is exactly what retriever B exists for.
 *
 * The optional unit-word stoplist is a switch, not baked into the logic: pass
 * `stopwords` to drop those tokens, omit it to keep them. The list itself lives
 * in `unit_stopwords.vi.ts`.
 *
 * `avg_len` is the mean token count of the indexed documents, taken from the
 * catalog; it is maintained incrementally as documents are added.
 */

import { folded } from './normalizer.ts';
import type { RetrievalHit } from './types.ts';

export interface SyllableBm25Options {
  /** BM25 term-frequency saturation. Default 1.2. */
  k1?: number;
  /** BM25 length-normalization. Default 0.75. */
  b?: number;
  /** Unit words to drop before scoring; absent or empty means "keep all". */
  stopwords?: ReadonlySet<string>;
}

interface SyllableDoc {
  productId: string;
  /** Token count |d|. */
  length: number;
  /** Distinct tokens and their term frequencies. */
  tf: Map<string, number>;
}

export class SyllableBm25 {
  private readonly k1: number;
  private readonly b: number;
  private readonly stopwords: ReadonlySet<string> | undefined;
  private readonly docs: SyllableDoc[] = [];
  private readonly documentFrequency = new Map<string, number>();
  private totalLength = 0;

  constructor(options: SyllableBm25Options = {}) {
    this.k1 = options.k1 ?? 1.2;
    this.b = options.b ?? 0.75;
    this.stopwords = options.stopwords !== undefined && options.stopwords.size > 0 ? options.stopwords : undefined;
  }

  /** Fold and split into syllables, dropping stoplisted units when enabled. */
  tokenize(text: string): string[] {
    const tokens = folded(text).split(' ').filter(Boolean);
    if (this.stopwords === undefined) return tokens;
    return tokens.filter((token) => !this.stopwords!.has(token));
  }

  /** Index one string for a product; `df` and `avg_len` update synchronously. */
  addDocument(text: string, productId: string): number {
    const tokens = this.tokenize(text);
    const tf = new Map<string, number>();
    for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);

    const docId = this.docs.length;
    this.docs.push({ productId, length: tokens.length, tf });
    this.totalLength += tokens.length;
    for (const token of tf.keys()) this.documentFrequency.set(token, (this.documentFrequency.get(token) ?? 0) + 1);
    return docId;
  }

  get documentCount(): number {
    return this.docs.length;
  }

  /** Mean token count over the indexed documents; 0 when empty. */
  get avgLength(): number {
    return this.docs.length === 0 ? 0 : this.totalLength / this.docs.length;
  }

  /** Okapi IDF, non-negative: `ln((N − df + 0.5) / (df + 0.5) + 1)`. */
  idf(term: string): number {
    const n = this.docs.length;
    if (n === 0) return 0;
    const df = this.documentFrequency.get(term) ?? 0;
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  /** Score every document against a query string; best per product, best first. */
  search(text: string, k: number): RetrievalHit[] {
    if (k <= 0 || this.docs.length === 0) return [];

    const queryTf = new Map<string, number>();
    for (const token of this.tokenize(text)) queryTf.set(token, (queryTf.get(token) ?? 0) + 1);
    if (queryTf.size === 0) return [];

    const best = new Map<string, number>();
    for (const doc of this.docs) {
      const score = this.scoreDoc(queryTf, doc);
      if (score <= 0) continue;
      const previous = best.get(doc.productId);
      if (previous === undefined || score > previous) best.set(doc.productId, score);
    }

    const hits: RetrievalHit[] = [...best].map(([productId, score]) => ({ productId, score }));
    hits.sort((a, b) => b.score - a.score || (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
    return hits.slice(0, k);
  }

  private scoreDoc(queryTf: Map<string, number>, doc: SyllableDoc): number {
    const avgLength = this.avgLength;
    if (avgLength <= 0) return 0;
    const lengthNorm = this.k1 * (1 - this.b + this.b * (doc.length / avgLength));
    let score = 0;
    for (const term of queryTf.keys()) {
      const docTermFrequency = doc.tf.get(term);
      if (docTermFrequency === undefined) continue;
      score += (this.idf(term) * (docTermFrequency * (this.k1 + 1))) / (docTermFrequency + lengthNorm);
    }
    return score;
  }
}
