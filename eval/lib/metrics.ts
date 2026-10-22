/**
 * Metrics for the bake-off report (plan section 7.2).
 *
 * Two families live here. The *resolution* family scores what the resolver
 * decided, and its most important member is `far`: the share of lines written
 * into the order without asking that were wrong. The *text* family scores the
 * transcript itself, which is how a change to the ASR axis is judged when the
 * only ground truth available is a reference string.
 *
 * Everything is computed from plain per-line records, so the same functions
 * serve the bake-off, the shadow-mode comparison, and the optimization loop.
 */

import type { Decision } from '../../frontend/mobile/src/lib/resolver/types.ts';
import { folded, toned } from '../../frontend/mobile/src/lib/resolver/normalizer.ts';

/** One evaluated order line, after the resolver has answered. */
export interface LineOutcome {
  id: string;
  dataset: string;
  tags: string[];
  /** Gold product, or null when the line really is out of catalog. */
  goldProductId: string | null;
  decision: Decision;
  /** What the resolver wrote, when it decided AUTO. */
  autoProductId: string | null;
  /** Ranked candidate ids, best first. The top-1 is what a ranker is judged on. */
  ranked: string[];
  /** Confidence the gate used, in [0, 1]; drives the risk-coverage curve. */
  confidence: number;
  /** Probability the gate reported, when G2 is on; drives calibration error. */
  probability?: number;
}

/** Resolution metrics over a set of lines. */
export interface ResolutionMetrics {
  lines: number;
  inCatalog: number;
  top1: number;
  recall3: number;
  mrr: number;
  /** Wrong autos divided by all lines. The primary safety metric. */
  far: number;
  /** Wrong autos, the numerator of `far`, so the rule of three can be applied. */
  wrongAutos: number;
  autos: number;
  askRate: number;
  newPrecision: number;
  newRecall: number;
  /** Area under the risk-coverage curve of `confidence`. Lower is better. */
  aurc: number;
  /** Expected calibration error over 10 bins. Only defined when probabilities exist. */
  ece: number;
  /** Extra taps the user pays: ASK counts 1, NEW counts 3. */
  tapsPerOrder: number;
}

const NEW_TAPS = 3;
const ASK_TAPS = 1;

/** Mean of an empty list is 0, not NaN, so a report never prints NaN for a rate. */
function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Whether the top-1 the resolver ranked is the gold product.
 *
 * Out-of-catalog lines have no correct in-catalog answer, so they count as
 * incorrect here and are scored by `newRecall` instead.
 */
function top1Correct(outcome: LineOutcome): boolean {
  return outcome.goldProductId !== null && outcome.ranked[0] === outcome.goldProductId;
}

/**
 * Area under the risk-coverage curve.
 *
 * Sort by confidence descending; at coverage `i/n` the risk is the error rate
 * among the `i` most confident lines. The area is the average risk over all
 * coverages, so a resolver whose confident answers are right has a small area.
 */
export function riskCoverageArea(outcomes: LineOutcome[]): number {
  if (outcomes.length === 0) return 0;
  const sorted = [...outcomes].sort((a, b) => b.confidence - a.confidence);
  let errors = 0;
  let area = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (!top1Correct(sorted[i])) errors += 1;
    area += errors / (i + 1);
  }
  return area / sorted.length;
}

/** Expected calibration error over equal-width bins of the reported probability. */
export function expectedCalibrationError(outcomes: LineOutcome[], bins = 10): number {
  const withProbability = outcomes.filter((outcome) => outcome.probability !== undefined);
  if (withProbability.length === 0) return 0;

  const buckets: LineOutcome[][] = Array.from({ length: bins }, () => []);
  for (const outcome of withProbability) {
    const p = Math.min(1, Math.max(0, outcome.probability as number));
    buckets[Math.min(bins - 1, Math.floor(p * bins))].push(outcome);
  }

  let ece = 0;
  for (const bucket of buckets) {
    if (bucket.length === 0) continue;
    const accuracy = mean(bucket.map((outcome) => (top1Correct(outcome) ? 1 : 0)));
    const confidence = mean(bucket.map((outcome) => outcome.probability as number));
    ece += (bucket.length / withProbability.length) * Math.abs(accuracy - confidence);
  }
  return ece;
}

/** Every resolution metric for one set of lines. */
export function resolutionMetrics(outcomes: LineOutcome[]): ResolutionMetrics {
  const inCatalog = outcomes.filter((outcome) => outcome.goldProductId !== null);
  const outOfCatalog = outcomes.filter((outcome) => outcome.goldProductId === null);

  const reciprocalRanks = inCatalog.map((outcome) => {
    const rank = outcome.ranked.indexOf(outcome.goldProductId as string);
    return rank === -1 ? 0 : 1 / (rank + 1);
  });

  const autos = outcomes.filter((outcome) => outcome.decision === 'AUTO');
  const wrongAutos = autos.filter((outcome) => outcome.autoProductId !== outcome.goldProductId);

  const news = outcomes.filter((outcome) => outcome.decision === 'NEW');
  const newTruePositives = news.filter((outcome) => outcome.goldProductId === null).length;

  return {
    lines: outcomes.length,
    inCatalog: inCatalog.length,
    top1: mean(inCatalog.map((outcome) => (top1Correct(outcome) ? 1 : 0))),
    recall3: mean(inCatalog.map((outcome) => (outcome.ranked.slice(0, 3).includes(outcome.goldProductId as string) ? 1 : 0))),
    mrr: mean(reciprocalRanks),
    far: outcomes.length === 0 ? 0 : wrongAutos.length / outcomes.length,
    wrongAutos: wrongAutos.length,
    autos: autos.length,
    askRate: outcomes.length === 0 ? 0 : outcomes.filter((outcome) => outcome.decision === 'ASK').length / outcomes.length,
    newPrecision: news.length === 0 ? 0 : newTruePositives / news.length,
    newRecall: outOfCatalog.length === 0 ? 0 : newTruePositives / outOfCatalog.length,
    aurc: riskCoverageArea(outcomes),
    ece: expectedCalibrationError(outcomes),
    tapsPerOrder: mean(outcomes.map((outcome) => (outcome.decision === 'ASK' ? ASK_TAPS : outcome.decision === 'NEW' ? NEW_TAPS : 0))),
  };
}

/** Group lines by an arbitrary key, for the mandatory breakdowns. */
export function groupBy<K extends string>(outcomes: LineOutcome[], key: (outcome: LineOutcome) => K): Record<K, LineOutcome[]> {
  const groups = {} as Record<K, LineOutcome[]>;
  for (const outcome of outcomes) {
    (groups[key(outcome)] ??= []).push(outcome);
  }
  return groups;
}

/** Levenshtein distance over token arrays, used for syllable-level error rates. */
export function tokenDistance(reference: string[], heard: string[]): number {
  const previous: number[] = Array.from({ length: heard.length + 1 }, (_, j) => j);
  for (let i = 1; i <= reference.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= heard.length; j += 1) {
      const saved = previous[j];
      const cost = reference[i - 1] === heard[j - 1] ? 0 : 1;
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + cost);
      diagonal = saved;
    }
  }
  return previous[heard.length];
}

/** Transcript-quality metrics over aligned (heard, reference) pairs. */
export interface TextMetrics {
  /** Syllable error rate: edits over whitespace-separated syllables. */
  ser: number;
  /** Character error rate on the toned view. */
  cer: number;
  /**
   * Tone error rate: the part of the syllable error that disappears when tones
   * are stripped. Computed as (SER on toned) - (SER on folded), so it isolates
   * tone mistakes from every other kind.
   */
  ter: number;
}

export function textMetrics(pairs: Array<{ heard: string; reference: string }>): TextMetrics {
  let syllableEdits = 0;
  let characterEdits = 0;
  let toneEdits = 0;
  let referenceSyllables = 0;
  let referenceCharacters = 0;

  for (const pair of pairs) {
    const referenceToned = toned(pair.reference);
    const heardToned = toned(pair.heard);
    const referenceSyllablesList = referenceToned.split(' ').filter(Boolean);
    const heardSyllablesList = heardToned.split(' ').filter(Boolean);

    syllableEdits += tokenDistance(referenceSyllablesList, heardSyllablesList);
    toneEdits +=
      tokenDistance(referenceSyllablesList, heardSyllablesList) -
      tokenDistance(folded(referenceToned).split(' ').filter(Boolean), folded(heardToned).split(' ').filter(Boolean));
    characterEdits += tokenDistance([...referenceToned.replace(/ /g, '')], [...heardToned.replace(/ /g, '')]);
    referenceSyllables += referenceSyllablesList.length;
    referenceCharacters += referenceToned.replace(/ /g, '').length;
  }

  return {
    ser: referenceSyllables === 0 ? 0 : syllableEdits / referenceSyllables,
    cer: referenceCharacters === 0 ? 0 : characterEdits / referenceCharacters,
    ter: referenceSyllables === 0 ? 0 : toneEdits / referenceSyllables,
  };
}

/** One order, as the gold lines and as the lines the pipeline produced. */
export interface OrderOutcome {
  id: string;
  gold: Array<{ productId: string; qty: number; unit?: string | null }>;
  got: Array<{ productId: string; qty: number; unit?: string | null }>;
}

/** A stable key for a line, so sets of lines can be compared. */
function lineKey(line: { productId: string; qty: number; unit?: string | null }): string {
  return `${line.productId}|${line.qty}|${line.unit ?? ''}`;
}

/** Share of orders whose lines match the gold exactly, as a multiset. */
export function orderExactMatch(orders: OrderOutcome[]): number {
  return mean(
    orders.map((order) => {
      const gold = order.gold.map(lineKey).sort().join(' ');
      const got = order.got.map(lineKey).sort().join(' ');
      return gold === got ? 1 : 0;
    }),
  );
}

/** Line-level F1 across orders, on the (product, qty, unit) triple. */
export function lineF1(orders: OrderOutcome[]): number {
  let truePositives = 0;
  let predicted = 0;
  let actual = 0;
  for (const order of orders) {
    const gold = new Map<string, number>();
    for (const line of order.gold) gold.set(lineKey(line), (gold.get(lineKey(line)) ?? 0) + 1);
    for (const line of order.got) {
      const key = lineKey(line);
      const remaining = gold.get(key) ?? 0;
      if (remaining > 0) {
        truePositives += 1;
        gold.set(key, remaining - 1);
      }
    }
    predicted += order.got.length;
    actual += order.gold.length;
  }
  if (predicted === 0 && actual === 0) return 1;
  if (predicted === 0 || actual === 0) return 0;
  return (2 * truePositives) / (predicted + actual);
}
