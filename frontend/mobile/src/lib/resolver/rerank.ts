/**
 * Second-stage rerank: re-score the fused shortlist on an absolute scale.
 *
 * RRF fuses ranks and throws away how well each candidate actually matched,
 * so its `s1` cannot tell an exact hit from a weak one that every retriever
 * happened to put first. The gate needs that difference: it is exactly the
 * out-of-catalog and near-duplicate case. This stage keeps the retrievers for
 * recall and re-scores only their shortlist with bounded similarities, so the
 * score the gate reads means the same thing for every query.
 *
 * Every signal is in [0, 1] and the weights are normalized to sum to 1, so the
 * reranked score is in [0, 1] too. Which signals matter, and how much, is
 * config: the eval search picks the weights, nothing here prefers one.
 *
 *   E  edit similarity of the folded views, spaces kept and removed
 *   P  edit similarity of the phonetic keys
 *   T  share of the query's syllables found in the candidate (truncation)
 *   R  the candidate's position in the fused list, 1 for the first
 */

import { similarity } from './editDistance.ts';
import { folded, phon } from './normalizer.ts';
import type { Candidate, QueryLine, RerankConfig, RerankSignal } from './types.ts';

interface Doc {
  spaced: string;
  nospace: string;
  phon: string;
  syllables: Set<string>;
}

function docOf(text: string): Doc {
  const spaced = folded(text);
  return {
    spaced,
    nospace: spaced.replace(/ /g, ''),
    phon: phon(text),
    syllables: new Set(spaced.split(' ').filter(Boolean)),
  };
}

/** The weights over the signals they name, summing to 1; all-zero means none. */
export function normalizedWeights(weights: Partial<Record<RerankSignal, number>>): Array<[RerankSignal, number]> {
  const entries = (Object.entries(weights) as Array<[RerankSignal, number]>).filter(([, weight]) => weight > 0);
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  return total > 0 ? entries.map(([signal, weight]) => [signal, weight / total]) : [];
}

export class Reranker {
  private readonly docs = new Map<string, Doc[]>();
  private readonly weights: Array<[RerankSignal, number]>;
  private readonly config: RerankConfig;

  constructor(config: RerankConfig) {
    this.config = config;
    this.weights = normalizedWeights(config.weights);
  }

  /** Index one string for a product: its catalog name, or an alias the shop taught. */
  addDocument(text: string, productId: string): void {
    let bucket = this.docs.get(productId);
    if (bucket === undefined) {
      bucket = [];
      this.docs.set(productId, bucket);
    }
    bucket.push(docOf(text));
  }

  /** How many fused candidates the reranker wants to see. */
  get pool(): number {
    return this.config.pool;
  }

  /**
   * Re-score `fused` (best first) and return it best first by the new score.
   *
   * A product's score is its best document's, so an alias can carry a product
   * whose catalog name sounds nothing like the span. Ties keep the fused order.
   */
  rerank(line: QueryLine, fused: Candidate[]): Candidate[] {
    if (this.weights.length === 0) return fused;
    const query = docOf(line.rawProductSpan);
    const n = fused.length;

    const rescored = fused.map((candidate, index) => {
      const bucket = this.docs.get(candidate.productId) ?? [];
      let best = 0;
      for (const doc of bucket) {
        let score = 0;
        for (const [signal, weight] of this.weights) score += weight * signalOf(signal, query, doc, index, n);
        if (score > best) best = score;
      }
      return { candidate: { ...candidate, score: best, scores: { ...candidate.scores, fused: candidate.score } }, index };
    });

    rescored.sort((a, b) => b.candidate.score - a.candidate.score || a.index - b.index);
    return rescored.map((entry) => entry.candidate);
  }
}

function signalOf(signal: RerankSignal, query: Doc, doc: Doc, index: number, n: number): number {
  switch (signal) {
    case 'E':
      return Math.max(similarity(query.spaced, doc.spaced), similarity(query.nospace, doc.nospace));
    case 'P':
      return similarity(query.phon, doc.phon);
    case 'T': {
      if (query.syllables.size === 0) return 0;
      let found = 0;
      for (const syllable of query.syllables) if (doc.syllables.has(syllable)) found += 1;
      return found / query.syllables.size;
    }
    case 'R':
      return n <= 1 ? 1 : 1 - index / (n - 1);
  }
}
