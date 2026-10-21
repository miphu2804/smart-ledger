/**
 * Fusion of several retrievers into one candidate list (plan section 5.5).
 *
 * Retrievers score on incomparable scales: E and Q-cos are already in [0, 1],
 * while Q-bm25 and B are unbounded BM25 sums. So each variant normalizes in the
 * way the plan names for it, and the harness evaluates which normalization
 * survives contact with the data.
 *
 * Every variant produces the same output shape: a productId, a fused score
 * comparable only within one query, and the per-retriever score and rank that
 * produced it. The gate reads those, and the failure gallery in the report
 * prints them.
 */

import type { Candidate, RetrievalHit, ResolverConfig } from './types.ts';

/**
 * The score scale each retriever reports on.
 *
 * `max` compares scores across retrievers, which only means something within one
 * scale: a BM25 sum runs unbounded while a similarity sits in [0, 1], so the
 * wider axis would decide every ranking and the other retriever would only break
 * ties. The plan's F1 is a max over one scale, and a mixed set would need a
 * normalization the plan does not define.
 */
export const RETRIEVER_SCALE: Record<string, string> = {
  E: 'similarity',
  P: 'similarity',
  'Q-cos': 'similarity',
  'Q-bm25': 'bm25',
  B: 'bm25',
  AND: 'trigram-coverage',
};

/** The distinct score scales a retriever set spans, sorted. */
export function scalesOf(names: string[]): string[] {
  return [...new Set(names.map((name) => RETRIEVER_SCALE[name] ?? `unknown:${name}`))].sort();
}

/** One retriever's hits, best first. */
export type RetrieverHits = Record<string, RetrievalHit[]>;

/**
 * Raw scores, keyed by product.
 *
 * `max` fusion deliberately does **not** max-normalize. Dividing by each
 * retriever's own maximum forces the best hit of every query to exactly 1, so
 * `s1` becomes a constant and the gate's score floor can never fire: an
 * unmatched line would look exactly as confident as a perfect one. The plan's
 * wording ("max of normalized scores") still holds where it can — E, P and
 * Q-cos already score in [0, 1] — and the harness fits the gate thresholds in
 * whatever scale the configured retrievers produce.
 */
function rawScores(hits: RetrievalHit[]): Map<string, number> {
  const scores = new Map<string, number>();
  for (const hit of hits) scores.set(hit.productId, hit.score);
  return scores;
}

/** Stretch every score onto [0, 1]; a list with one distinct score maps to 1. */
function minMaxNormalize(hits: RetrievalHit[]): Map<string, number> {
  const normalized = new Map<string, number>();
  let min = Infinity;
  let max = -Infinity;
  for (const hit of hits) {
    if (hit.score < min) min = hit.score;
    if (hit.score > max) max = hit.score;
  }
  const spread = max - min;
  for (const hit of hits) normalized.set(hit.productId, spread > 0 ? (hit.score - min) / spread : 1);
  return normalized;
}

/** 1-based rank of each product within one retriever's list. */
function ranksOf(hits: RetrievalHit[]): Map<string, number> {
  const ranks = new Map<string, number>();
  hits.forEach((hit, index) => ranks.set(hit.productId, index + 1));
  return ranks;
}

/**
 * Fuse per-retriever hit lists into candidates, best first.
 *
 * Ties on the fused score break by ascending `productId`, so a rerun on the
 * same input reproduces the ranking exactly.
 */
export function fuse(hits: RetrieverHits, config: ResolverConfig): Candidate[] {
  const names = Object.keys(hits).filter((name) => hits[name].length > 0);
  const weightOf = (name: string) => config.weights[name] ?? 1;

  const scaled: Record<string, Map<string, number>> = {};
  const ranks: Record<string, Map<string, number>> = {};
  for (const name of names) {
    scaled[name] = config.fusion === 'linear' ? minMaxNormalize(hits[name]) : rawScores(hits[name]);
    ranks[name] = ranksOf(hits[name]);
  }

  const candidates = new Map<string, Candidate>();
  for (const name of names) {
    for (const hit of hits[name]) {
      let candidate = candidates.get(hit.productId);
      if (!candidate) {
        candidate = { productId: hit.productId, score: 0, scores: {}, ranks: {} };
        candidates.set(hit.productId, candidate);
      }
      candidate.scores[name] = hit.score;
      candidate.ranks[name] = ranks[name].get(hit.productId) as number;
    }
  }

  for (const candidate of candidates.values()) {
    candidate.score = fuseScore(candidate, names, scaled, ranks, config, weightOf);
  }

  return [...candidates.values()]
    .sort((a, b) => (b.score - a.score) || (a.productId < b.productId ? -1 : a.productId > b.productId ? 1 : 0))
    .slice(0, config.topK);
}

/** One candidate's fused score under the configured variant. */
function fuseScore(
  candidate: Candidate,
  names: string[],
  scaled: Record<string, Map<string, number>>,
  ranks: Record<string, Map<string, number>>,
  config: ResolverConfig,
  weightOf: (name: string) => number,
): number {
  let total = 0;
  for (const name of names) {
    const rank = ranks[name].get(candidate.productId);
    if (rank === undefined) continue;
    switch (config.fusion) {
      case 'max':
        total = Math.max(total, scaled[name].get(candidate.productId) ?? 0);
        break;
      case 'rrf':
        total += 1 / (config.rrfK + rank);
        break;
      case 'wrrf':
        total += weightOf(name) / (config.rrfK + rank);
        break;
      case 'linear':
        total += weightOf(name) * (scaled[name].get(candidate.productId) ?? 0);
        break;
    }
  }
  return total;
}
