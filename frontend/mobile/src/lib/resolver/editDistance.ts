/**
 * Damerau-Levenshtein edit distance and a length-normalized similarity
 * (plan section 5.2, retriever E).
 *
 * The distance implemented is the **optimal string alignment (OSA)** variant:
 * it counts insertions, deletions, substitutions and transpositions of two
 * adjacent characters, but it does not allow a substring to be edited more
 * than once, so it is not a true metric (the triangle inequality can fail).
 * OSA is the right cost here because the only consumer is a per-candidate
 * similarity score, not a metric-space index.
 *
 * The DP runs inside a diagonal band of half-width `maxDistance` when a bound
 * is supplied, and abandons a row as soon as every value in it already exceeds
 * the bound. Both are safe: any alignment of cost at most `maxDistance` moves
 * the (i, j) cursor off the diagonal by at most `maxDistance` in total, and DP
 * values never decrease from one row to the next, so a row whose minimum
 * exceeds the bound can never produce a completion within it.
 */

/**
 * Optimal string alignment distance between `a` and `b`.
 *
 * When `maxDistance` is provided the function may return a value strictly
 * greater than `maxDistance` (a sentinel for "farther than the bound") without
 * computing the exact distance; the caller can use this to skip a candidate.
 * When the true distance is at most `maxDistance` the returned value is exact.
 */
export function damerauLevenshtein(a: string, b: string, maxDistance?: number): number {
  const la = a.length;
  const lb = b.length;

  if (la === 0) return lb;
  if (lb === 0) return la;

  const bounded = maxDistance !== undefined && Number.isFinite(maxDistance);
  const bound = bounded ? (maxDistance as number) : Infinity;

  // A length gap alone already exceeds the bound.
  if (bounded && Math.abs(la - lb) > bound) return bound + 1;

  const band = bounded ? bound : Math.max(la, lb);
  const INF = Infinity;

  // Three rolling rows over columns 0..lb. `prev2` is row i-2, needed for the
  // transposition rule.
  let prev2: number[] = new Array(lb + 1).fill(INF);
  let prev: number[] = new Array(lb + 1).fill(INF);
  for (let j = 0; j <= lb && j <= band; j += 1) prev[j] = j;

  for (let i = 1; i <= la; i += 1) {
    const curr: number[] = new Array(lb + 1).fill(INF);
    if (i <= band) curr[0] = i;
    let rowMin = curr[0];

    const jStart = Math.max(1, i - band);
    const jEnd = Math.min(lb, i + band);
    for (let j = jStart; j <= jEnd; j += 1) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let value = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (
        i > 1 &&
        j > 1 &&
        a.charCodeAt(i - 1) === b.charCodeAt(j - 2) &&
        a.charCodeAt(i - 2) === b.charCodeAt(j - 1)
      ) {
        value = Math.min(value, prev2[j - 2] + 1);
      }
      curr[j] = value;
      if (value < rowMin) rowMin = value;
    }

    if (bounded && rowMin > bound) return bound + 1;

    prev2 = prev;
    prev = curr;
  }

  return prev[lb];
}

/**
 * Length-normalized similarity in [0, 1]: `1 - DL(a, b) / max(|a|, |b|)`.
 *
 * Both empty -> 1 (identical). Exactly one empty -> 0. Identical -> 1.
 * When `maxDistance` is supplied it is forwarded to the distance, so a pair
 * farther apart than the bound collapses to 0 instead of the exact ratio.
 */
export function similarity(a: string, b: string, maxDistance?: number): number {
  const la = a.length;
  const lb = b.length;
  if (la === 0 && lb === 0) return 1;
  if (la === 0 || lb === 0) return 0;

  const distance = damerauLevenshtein(a, b, maxDistance);
  const ratio = 1 - distance / Math.max(la, lb);
  if (ratio < 0) return 0;
  if (ratio > 1) return 1;
  return ratio;
}
