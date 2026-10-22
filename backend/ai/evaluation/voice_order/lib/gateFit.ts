/**
 * Fitting the gate (plan sections 5.6, 9A.1 and 9B.1).
 *
 * The gate has parameters, and parameters have to come from somewhere. G1's
 * thresholds are grid-searched against the stated objective; G2 is a logistic
 * regression whose probability is then recalibrated. Both fit on the
 * calibration split only — the lockbox never touches this file.
 *
 * Fitting lives in `backend/ai/evaluation/voice_order/` and never ships: the app loads the resulting JSON.
 */

import type { GateFeatures, GateModel, GateRules } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';
import { featureVector } from '../../../../../frontend/mobile/src/lib/resolver/gate.ts';
import { mulberry32 } from './stats.ts';

/** One calibration line, reduced to what the gate can see. */
export interface TuningLine {
  /** Gold product, or null for a genuinely out-of-catalog line. */
  goldProductId: string | null;
  /** The resolver's top-1 candidate, or null when it returned none. */
  top1: string | null;
  features: GateFeatures;
}

/** Whether the resolver's top-1 was the gold product. */
export function top1Correct(line: TuningLine): boolean {
  return line.goldProductId !== null && line.top1 === line.goldProductId;
}

export interface RuleScore {
  askRate: number;
  /** Lines the gate sent to NEW, where the user gets no candidate at all. */
  newRate: number;
  /** NEW decisions on lines whose gold item is in the catalog. */
  newsInCatalog: number;
  /**
   * Fraction of lines the gate left unanswered: every ask, plus a refusal on a
   * line whose gold item is in the catalog. Both are counted over all lines.
   *
   * This, not `askRate`, is what the tuning minimizes, and a NEW on a line whose
   * item really is out of catalog is free: refusing an item the shop does not
   * sell is the right answer, not a failure to answer. Counting every NEW as a
   * failure instead, which this file did until 2026-10-21, rewards turning one
   * into an AUTO; since an auto on an out-of-catalog line is always wrong, the
   * search spent its whole false-auto budget there and drove the score floor
   * below every reachable value. See `docs/voice-resolution/DISCOVERY.md`.
   *
   * Minimizing `askRate` alone is the plan's wording and is degenerate: a gate
   * that answers NEW to everything has zero asks and zero false autos. This
   * objective is degenerate in a smaller way — an ask and an in-catalog refusal
   * cost the same, so the search is indifferent between them, and the tie-break
   * below is the only thing that keeps the ask channel open.
   */
  unansweredRate: number;
  /** Wrong autos over all lines. The constraint the objective is subject to. */
  far: number;
  autos: number;
  wrongAutos: number;
  /** Correct autos, the thing the ask rate is buying. */
  correctAutos: number;
}

/**
 * Score a G1 rule set on a set of lines.
 *
 * Alias trust is already folded into `features.alias` by the resolver, so this
 * replays the same rule order the shipped gate uses and counts the outcomes.
 */
export function scoreRules(lines: TuningLine[], rules: GateRules): RuleScore {
  let asks = 0;
  let news = 0;
  let newsInCatalog = 0;
  let autos = 0;
  let wrongAutos = 0;

  for (const line of lines) {
    let auto: boolean;
    if (line.features.alias === 1) {
      auto = true;
    } else if (line.features.s1 < rules.sFloor) {
      auto = false;
    } else {
      auto =
        line.features.s1 >= rules.sAuto &&
        line.features.margin >= rules.mMin &&
        line.features.agree === 1 &&
        line.features.unit_ok !== 'mismatch';
    }

    if (auto) {
      autos += 1;
      // An alias auto is judged like any other: the alias may point at the
      // wrong product, and that is exactly the mistake FAR must catch.
      if (!top1Correct(line)) wrongAutos += 1;
    } else if (line.features.s1 >= rules.sFloor) {
      asks += 1;
    } else {
      news += 1;
      if (line.goldProductId !== null) newsInCatalog += 1;
    }
  }

  const n = lines.length;
  const askRate = n === 0 ? 0 : asks / n;
  const newRate = n === 0 ? 0 : news / n;
  return {
    askRate,
    newRate,
    newsInCatalog,
    unansweredRate: n === 0 ? 0 : (asks + newsInCatalog) / n,
    far: n === 0 ? 0 : wrongAutos / n,
    autos,
    wrongAutos,
    correctAutos: autos - wrongAutos,
  };
}

export interface TuneOptions {
  /** False-auto budget the search is not allowed to exceed. Plan start value 1%. */
  farMax: number;
  /** Candidate thresholds for each rule. */
  grid?: { sFloor: number[]; sAuto: number[]; mMin: number[] };
}

/**
 * Candidate thresholds at evenly spaced quantiles of the observed values, plus
 * one point beyond each end.
 *
 * A fixed 0–1 grid cannot serve every fusion: F1 (`max`) produces a raw
 * similarity, while F2/F3 (`rrf`) produce `1/(rrfK + rank)` ≈ 0.016. A grid
 * whose lowest auto threshold is 0.3 never fires on an RRF score, so the tuner
 * sees no achievable auto and falls back to a gate that answers NEW to
 * everything. Searching the values the config actually produces fixes that
 * without special-casing any fusion.
 */
export function quantiles(values: number[], count: number): number[] {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 1];

  const picks = new Set<number>();
  for (let i = 1; i <= count; i += 1) picks.add(sorted[Math.round((i / (count + 1)) * (sorted.length - 1))]);

  const low = sorted[0];
  const span = sorted[sorted.length - 1] - low || 1;
  picks.add(low - span * 0.01); // below every observed value: nothing is NEW
  picks.add(sorted[sorted.length - 1] + span * 0.01); // above every one: everything is NEW
  return [...picks].sort((a, b) => a - b);
}

/** Search candidates taken from the calibration split's own feature distribution. */
function defaultGrid(lines: TuningLine[]): { sFloor: number[]; sAuto: number[]; mMin: number[] } {
  const scores = lines.map((line) => line.features.s1);
  const margins = lines.map((line) => line.features.margin);
  return {
    sFloor: quantiles(scores, 7),
    sAuto: quantiles(scores, 10),
    mMin: [0, ...quantiles(margins, 5).filter((value) => value > 0)],
  };
}

/**
 * Grid-search the G1 thresholds.
 *
 * Objective: leave as few lines unanswered as possible, subject to
 * FAR <= `farMax`. An ask anywhere and a refusal on an in-catalog line both
 * count; a refusal on a line the shop cannot answer does not, because that is
 * the right answer. See `RuleScore.unansweredRate` for why neither the ask rate
 * alone nor a count of every refusal will do.
 *
 * Ties go to the rule set that writes fewer wrong autos, then to the one that
 * refuses fewer lines, then to the higher auto threshold and the higher score
 * floor, so the choice is deterministic and errs toward asking rather than to a
 * guess.
 */
export function tuneGateRules(lines: TuningLine[], options: TuneOptions): { rules: GateRules; score: RuleScore } {
  const grid = options.grid ?? defaultGrid(lines);

  let best: { rules: GateRules; score: RuleScore } | null = null;
  for (const sFloor of grid.sFloor) {
    for (const sAuto of grid.sAuto) {
      for (const mMin of grid.mMin) {
        const rules: GateRules = { sFloor, sAuto, mMin };
        const score = scoreRules(lines, rules);
        if (score.far > options.farMax) continue;
        if (best === null || better(score, rules, best.score, best.rules)) best = { rules, score };
      }
    }
  }
  // Nothing cleared the budget. Fall back to asking about everything: the gate
  // that answers NEW to everything also writes no wrong autos and asks nothing,
  // which looks like success while resolving nothing at all.
  if (best === null) {
    const rules: GateRules = {
      sFloor: Math.min(...grid.sFloor),
      sAuto: Math.max(...grid.sAuto),
      mMin: Math.max(...grid.mMin),
    };
    return { rules, score: scoreRules(lines, rules) };
  }
  return best;
}

function better(score: RuleScore, rules: GateRules, bestScore: RuleScore, bestRules: GateRules): boolean {
  if (score.unansweredRate !== bestScore.unansweredRate) return score.unansweredRate < bestScore.unansweredRate;
  if (score.wrongAutos !== bestScore.wrongAutos) return score.wrongAutos < bestScore.wrongAutos;
  // Same coverage and the same mistakes: prefer asking over declaring NEW. An
  // ask offers candidates; a NEW refuses without offering anything, so when the
  // data cannot tell them apart the recoverable answer wins.
  if (score.newRate !== bestScore.newRate) return score.newRate < bestScore.newRate;
  if (rules.sAuto !== bestRules.sAuto) return rules.sAuto > bestRules.sAuto;
  return rules.sFloor > bestRules.sFloor;
}

/**
 * Fit a logistic regression by gradient descent.
 *
 * Features are standardized internally and the standardization is folded back
 * into the weights before returning, so `GateModel` keeps its plain
 * weights-plus-bias shape and inference in the app stays one dot product.
 * Starting from zeros with a fixed schedule makes the fit reproducible.
 */
export function fitLogistic(
  rows: number[][],
  labels: number[],
  options: { epochs?: number; learningRate?: number; l2?: number } = {},
): { weights: number[]; bias: number } {
  const epochs = options.epochs ?? 2000;
  const learningRate = options.learningRate ?? 0.5;
  const l2 = options.l2 ?? 1e-3;
  const dimension = rows[0]?.length ?? 0;
  if (rows.length === 0 || dimension === 0) return { weights: new Array(dimension).fill(0), bias: 0 };

  const means = new Array(dimension).fill(0);
  const deviations = new Array(dimension).fill(0);
  for (let d = 0; d < dimension; d += 1) {
    let sum = 0;
    for (const row of rows) sum += row[d];
    means[d] = sum / rows.length;
    let variance = 0;
    for (const row of rows) variance += (row[d] - means[d]) ** 2;
    deviations[d] = Math.sqrt(variance / rows.length);
  }

  const scaled = rows.map((row) => row.map((value, d) => (deviations[d] > 0 ? (value - means[d]) / deviations[d] : 0)));
  const weights = new Array(dimension).fill(0);
  let bias = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const gradient = new Array(dimension).fill(0);
    let biasGradient = 0;
    for (let i = 0; i < scaled.length; i += 1) {
      let logit = bias;
      for (let d = 0; d < dimension; d += 1) logit += weights[d] * scaled[i][d];
      const error = 1 / (1 + Math.exp(-logit)) - labels[i];
      for (let d = 0; d < dimension; d += 1) gradient[d] += error * scaled[i][d];
      biasGradient += error;
    }
    for (let d = 0; d < dimension; d += 1) {
      weights[d] -= learningRate * (gradient[d] / scaled.length + l2 * weights[d]);
    }
    bias -= learningRate * (biasGradient / scaled.length);
  }

  // Undo the standardization: w . (x - mean)/std == (w/std) . x - w . mean/std.
  const folded = new Array(dimension).fill(0);
  let foldedBias = bias;
  for (let d = 0; d < dimension; d += 1) {
    if (deviations[d] > 0) {
      folded[d] = weights[d] / deviations[d];
      foldedBias -= (weights[d] * means[d]) / deviations[d];
    }
  }
  return { weights: folded, bias: foldedBias };
}

/**
 * Isotonic calibration by pool-adjacent-violators.
 *
 * Returns `(raw, calibrated)` breakpoints for the monotone map the app
 * interpolates. The map is built from the sorted empirical probabilities, so
 * it can only ever move a probability toward what the data showed.
 */
export function fitIsotonic(raw: number[], labels: number[], maxPoints = 200): Array<[number, number]> {
  const pairs = raw
    .map((value, i) => ({ raw: value, label: labels[i] }))
    .sort((a, b) => a.raw - b.raw || a.label - b.label);
  if (pairs.length === 0) return [];

  interface Block {
    sum: number;
    count: number;
    lo: number;
    hi: number;
  }
  const blocks: Block[] = [];
  for (const pair of pairs) {
    blocks.push({ sum: pair.label, count: 1, lo: pair.raw, hi: pair.raw });
    while (blocks.length > 1 && blocks[blocks.length - 2].sum / blocks[blocks.length - 2].count > blocks[blocks.length - 1].sum / blocks[blocks.length - 1].count) {
      const last = blocks.pop() as Block;
      const previous = blocks[blocks.length - 1];
      previous.sum += last.sum;
      previous.count += last.count;
      previous.hi = last.hi;
    }
  }

  const points: Array<[number, number]> = blocks.map((block) => [block.hi, block.sum / block.count]);
  // The map must cover the whole raw range so interpolation never extrapolates.
  points.unshift([blocks[0].lo, blocks[0].sum / blocks[0].count]);
  if (points.length <= maxPoints) return points;

  const step = Math.ceil(points.length / maxPoints);
  const thinned = points.filter((_, index) => index % step === 0);
  if (thinned[thinned.length - 1] !== points[points.length - 1]) thinned.push(points[points.length - 1]);
  return thinned;
}

/**
 * Fit the whole G2 model on calibration lines.
 *
 * The logistic fit and the calibration map are fitted on the same split here.
 * That is the plan's arrangement (fit on calibration, report on the held-out
 * split); a caller that wants a separate calibration slice should split first
 * and call this twice.
 */
export function fitGateModel(lines: TuningLine[], options: { epochs?: number; learningRate?: number; l2?: number } = {}): GateModel {
  const rows = lines.map((line) => featureVector(line.features));
  const labels = lines.map((line) => (top1Correct(line) ? 1 : 0));
  const { weights, bias } = fitLogistic(rows, labels, options);

  const raw = rows.map((row) => 1 / (1 + Math.exp(-(bias + row.reduce((sum, value, d) => sum + weights[d] * value, 0)))));
  const calibration = fitIsotonic(raw, labels);
  return { weights, bias, calibration };
}

/**
 * Choose `thetaAuto` for a fitted model.
 *
 * Same objective as G1: leave as few lines unanswered as possible while FAR
 * stays inside budget, counting an ask anywhere and a refusal on an in-catalog
 * line. Only the probability threshold is searched — the weights are already
 * fitted.
 */
export function tuneTheta(
  lines: TuningLine[],
  model: GateModel,
  options: { farMax: number; sFloor: number; candidates?: number[] },
): { thetaAuto: number; far: number; askRate: number; unansweredRate: number; newRate: number } {
  const candidates = options.candidates ?? Array.from({ length: 20 }, (_, i) => (i + 1) / 20);
  const probabilities = lines.map((line) => {
    const row = featureVector(line.features);
    let logit = model.bias;
    for (let d = 0; d < row.length; d += 1) logit += (model.weights[d] ?? 0) * row[d];
    return 1 / (1 + Math.exp(-logit));
  });

  let best: { thetaAuto: number; far: number; askRate: number; unansweredRate: number; newRate: number; wrongAutos: number } | null = null;
  for (const thetaAuto of candidates) {
    let autos = 0;
    let wrongAutos = 0;
    let asks = 0;
    let news = 0;
    let newsInCatalog = 0;
    lines.forEach((line, i) => {
      if (probabilities[i] >= thetaAuto) {
        autos += 1;
        if (!top1Correct(line)) wrongAutos += 1;
      } else if (line.features.s1 >= options.sFloor) {
        asks += 1;
      } else {
        news += 1;
        if (line.goldProductId !== null) newsInCatalog += 1;
      }
    });
    const n = lines.length;
    const far = n === 0 ? 0 : wrongAutos / n;
    if (far > options.farMax) continue;
    const askRate = n === 0 ? 0 : asks / n;
    const newRate = n === 0 ? 0 : news / n;
    const unansweredRate = n === 0 ? 0 : (asks + newsInCatalog) / n;
    const candidate = { thetaAuto, askRate, newRate, unansweredRate, wrongAutos };
    if (best === null || betterTheta(candidate, best)) best = { ...candidate, far };
  }
  if (best === null) return { thetaAuto: 1, far: 0, askRate: 1, unansweredRate: 1, newRate: 1 };
  return { thetaAuto: best.thetaAuto, far: best.far, askRate: best.askRate, unansweredRate: best.unansweredRate, newRate: best.newRate };
}

/**
 * On a tie in the unanswered rate and the false-auto count, prefer the lower
 * NEW rate and then the higher threshold. The higher threshold auto-applies fewer
 * lines, which is the safe direction when the data cannot tell the candidates
 * apart.
 */
function betterTheta(
  candidate: { unansweredRate: number; newRate: number; wrongAutos: number; thetaAuto: number },
  best: { unansweredRate: number; newRate: number; wrongAutos: number; thetaAuto: number },
): boolean {
  if (candidate.unansweredRate !== best.unansweredRate) return candidate.unansweredRate < best.unansweredRate;
  if (candidate.wrongAutos !== best.wrongAutos) return candidate.wrongAutos < best.wrongAutos;
  if (candidate.newRate !== best.newRate) return candidate.newRate < best.newRate;
  return candidate.thetaAuto > best.thetaAuto;
}

/** A deterministic shuffle, for splitting calibration data reproducibly. */
export function shuffleInPlace<T>(items: T[], seed: number): T[] {
  const random = mulberry32(seed);
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
