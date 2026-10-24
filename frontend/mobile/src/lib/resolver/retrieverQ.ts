/**
 * Retriever Q — character-trigram retrieval with two interchangeable scorers
 * (plan section 5.3).
 *
 * Candidate generation is the Ukkonen count filter in `trigramIndex.ts`
 * (lossless for edit distance ≤ `qMaxEditDistance`, start 2). Candidates are
 * then scored one of two ways, so the bake-off can pit them against each other:
 *
 *   `cos`  — IDF-weighted cosine between the query's and the document's trigram
 *            term-frequency vectors.
 *   `bm25` — Okapi BM25 over trigram "tokens" with k1 = 1.2, b = 0.75 and
 *            `avg_len` = the mean trigram count of the indexed documents, taken
 *            from the catalog (never a corpus default).
 *
 * One document per (productId, string) pair; a product's score is the best over
 * its documents. Ranking is deterministic: score descending, then productId
 * ascending.
 */

import { TrigramIndex, paddedTrigrams, spaceRemovedFold } from './trigramIndex.ts';
import type { IndexedDoc } from './trigramIndex.ts';
import type { CatalogItem, QueryLine, RetrievalHit, Retriever } from './types.ts';

export type QScorer = 'cos' | 'bm25';

export interface RetrieverQOptions {
  /** Which scoring variant to use. */
  scorer: QScorer;
  /** Max edit distance the count filter guarantees lossless for. Default 2. */
  qMaxEditDistance?: number;
  /**
   * Configured candidate count for this retriever (the harness's uniform
   * option shape). `retrieve` honours the explicit `k` argument of the frozen
   * `Retriever` contract; this value is the retriever's default.
   */
  topK?: number;
}

const BM25_K1 = 1.2;
const BM25_B = 0.75;

export class RetrieverQ implements Retriever {
  readonly name: 'Q-cos' | 'Q-bm25';
  readonly topK: number;

  private readonly scorer: QScorer;
  private readonly maxEditDistance: number;
  private readonly index = new TrigramIndex();

  constructor(catalog: CatalogItem[], options: RetrieverQOptions) {
    this.scorer = options.scorer;
    this.name = options.scorer === 'cos' ? 'Q-cos' : 'Q-bm25';
    this.maxEditDistance = options.qMaxEditDistance ?? 2;
    this.topK = options.topK ?? 5;
    for (const item of catalog) this.index.addDocument(item.name, item.id);
  }

  /** Mean trigram count of the indexed documents — the BM25 `avg_len`. */
  get avgTrigramCount(): number {
    return this.index.avgTrigramCount;
  }

  retrieve(line: QueryLine, k: number): RetrievalHit[] {
    if (k <= 0) return [];
    const s = spaceRemovedFold(line.rawProductSpan);
    if (s === '') return [];

    const queryTf = new Map<string, number>();
    for (const trigram of paddedTrigrams(s)) queryTf.set(trigram, (queryTf.get(trigram) ?? 0) + 1);
    const distinct = [...queryTf.keys()];

    const candidateDocs = this.index.candidates(distinct, s.length, this.maxEditDistance);

    const best = new Map<string, number>();
    for (const docId of candidateDocs) {
      const doc = this.index.doc(docId);
      const score = this.scorer === 'cos' ? this.cosineScore(queryTf, doc) : this.bm25Score(queryTf, distinct, doc);
      const previous = best.get(doc.productId);
      if (previous === undefined || score > previous) best.set(doc.productId, score);
    }

    const hits: RetrievalHit[] = [...best].map(([productId, score]) => ({ productId, score }));
    return rankHits(hits, k);
  }

  /** Index one extra string for a product (catalog insert or alias upsert). */
  addDocument(text: string, productId: string): void {
    this.index.addDocument(text, productId);
  }

  removeDocument(text: string, productId: string): boolean {
    return this.index.removeDocument(text, productId);
  }

  /** IDF-weighted cosine between the query's and the document's trigram tf vectors. */
  private cosineScore(queryTf: Map<string, number>, doc: IndexedDoc): number {
    let dot = 0;
    let queryNorm = 0;
    let docNorm = 0;
    for (const [trigram, queryTermFrequency] of queryTf) {
      const weight = queryTermFrequency * this.index.idf(trigram);
      queryNorm += weight * weight;
      const docTermFrequency = doc.tf.get(trigram);
      if (docTermFrequency !== undefined) dot += weight * docTermFrequency * this.index.idf(trigram);
    }
    for (const [trigram, docTermFrequency] of doc.tf) {
      const weight = docTermFrequency * this.index.idf(trigram);
      docNorm += weight * weight;
    }
    if (queryNorm <= 0 || docNorm <= 0) return 0;
    return dot / Math.sqrt(queryNorm * docNorm);
  }

  /** Okapi BM25 over the distinct query trigrams, saturated per document. */
  private bm25Score(queryTf: Map<string, number>, distinct: string[], doc: IndexedDoc): number {
    const avgLength = this.index.avgTrigramCount;
    if (avgLength <= 0) return 0;
    const lengthNorm = BM25_K1 * (1 - BM25_B + BM25_B * (doc.trigramCount / avgLength));
    let score = 0;
    for (const trigram of distinct) {
      const docTermFrequency = doc.tf.get(trigram);
      if (docTermFrequency === undefined) continue;
      score += (this.index.idf(trigram) * (docTermFrequency * (BM25_K1 + 1))) / (docTermFrequency + lengthNorm);
    }
    return score;
  }
}

/** Best first: score descending, then productId ascending. */
function rankHits(hits: RetrievalHit[], k: number): RetrievalHit[] {
  hits.sort((a, b) => b.score - a.score || (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0));
  return hits.slice(0, k);
}
