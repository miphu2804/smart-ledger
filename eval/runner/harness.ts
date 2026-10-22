/**
 * The bake-off harness core (plan sections 7 and 8).
 *
 * One job: given a resolver configuration, produce the numbers the report
 * needs — and produce them the way the plan demands, with the gate tuned on
 * the calibration split and every headline number measured on the held-out
 * split that tuning never saw.
 *
 * Resolving a line is the expensive part, and the gate's thresholds do not
 * change which candidates come back. So each line is resolved exactly once,
 * its features are cached, and tuning then replays only the decision rule over
 * those cached features.
 */

import { buildResolver } from '../../frontend/mobile/src/lib/resolver/index.ts';
import { decide, gateProbability } from '../../frontend/mobile/src/lib/resolver/gate.ts';
import type {
  CatalogItem,
  Decision,
  FusionName,
  GateConfig,
  GateName,
  ResolveResult,
  ResolverConfig,
  RetrieverName,
} from '../../frontend/mobile/src/lib/resolver/types.ts';
import type { EvalRecord, Splits } from '../lib/corpus.ts';
import { fitGateModel, quantiles, top1Correct, tuneGateRules, tuneTheta, type TuningLine } from '../lib/gateFit.ts';
import { resolutionMetrics, type LineOutcome, type ResolutionMetrics } from '../lib/metrics.ts';
import { bootstrapCI, ruleOfThree } from '../lib/stats.ts';

/** Everything that varies between bake-off configs. */
export interface ConfigSpec {
  name: string;
  retrievers: RetrieverName[];
  fusion: FusionName;
  weights: Record<string, number>;
  topK: number;
  qMaxEditDistance: number;
  eBruteMax: number;
  useUnitStoplist: boolean;
  gate: GateName;
  /** False-auto budget the gate is tuned against. */
  farMax: number;
  aliasMinConfirmations: number;
  /**
   * R0 decides for itself: `parseOrder` returns a decision, not features, so
   * there is nothing for a gate to tune. Its placeholder features are never
   * fed to `decide`.
   */
  selfGated?: boolean;
}

/** The gate thresholds chosen on the calibration split. */
export interface TunedGate {
  config: GateConfig;
  /** FAR the tuning itself achieved, on calibration only. */
  calibrationFar: number;
}

/** One line, resolved once, with everything the gate and the metrics need. */
export interface ResolvedLine {
  record: EvalRecord;
  result: ResolveResult;
}

/** Build the resolver config a spec describes. */
export function resolverConfigOf(spec: ConfigSpec): ResolverConfig {
  return {
    retrievers: spec.retrievers,
    fusion: spec.fusion,
    rrfK: 60,
    weights: spec.weights,
    topK: spec.topK,
    qMaxEditDistance: spec.qMaxEditDistance,
    eBruteMax: spec.eBruteMax,
    useUnitStoplist: spec.useUnitStoplist,
  };
}

/** A gate that never auto-applies, used only to harvest features. */
function provisionalGate(spec: ConfigSpec): GateConfig {
  return {
    gate: spec.gate,
    rules: { sFloor: 1.01, sAuto: 1.01, mMin: 1.01 },
    model: null,
    thetaAuto: 1.01,
    sFloor: 1.01,
    aliasMinConfirmations: spec.aliasMinConfirmations,
  };
}

/**
 * Take at most `limit` records from each dataset, keeping each dataset's shape.
 *
 * The sample has to be per dataset, not over the pooled set: D3 is 26 100 of the
 * 28 202 records, so a flat sample of 40 would be 35 D3 lines and five of
 * everything else, and the headline number would then describe D3 while looking
 * like it describes the corpus.
 */
export function stratifiedSample(records: EvalRecord[], limit?: number): EvalRecord[] {
  if (limit === undefined) return records;
  const byDataset = new Map<string, EvalRecord[]>();
  for (const record of records) {
    const group = byDataset.get(record.dataset);
    if (group === undefined) byDataset.set(record.dataset, [record]);
    else group.push(record);
  }

  const sampled: EvalRecord[] = [];
  for (const group of byDataset.values()) {
    if (group.length <= limit) {
      sampled.push(...group);
      continue;
    }
    const step = group.length / limit;
    for (let i = 0; i < limit; i += 1) sampled.push(group[Math.floor(i * step)]);
  }
  return sampled;
}

/**
 * Resolve every record once, building one resolver per catalog.
 *
 * `limit` caps the lines taken from each dataset, so the 20k-item D3 catalog can
 * be measured without resolving twenty thousand lines.
 */
export function resolveAll(spec: ConfigSpec, records: EvalRecord[], catalogs: Record<string, CatalogItem[]>, limit?: number): ResolvedLine[] {
  const selected = stratifiedSample(records, limit);
  const byCatalog = new Map<string, EvalRecord[]>();
  for (const record of selected) {
    const group = byCatalog.get(record.catalogId);
    if (group === undefined) byCatalog.set(record.catalogId, [record]);
    else group.push(record);
  }

  const resolved: ResolvedLine[] = [];
  for (const [catalogId, group] of byCatalog) {
    const catalog = catalogs[catalogId] ?? [];
    const resolver = buildResolver({ catalog, config: resolverConfigOf(spec), gate: provisionalGate(spec) });
    for (const record of group) {
      resolved.push({ record, result: resolver.resolve(record.line) });
    }
  }
  return resolved;
}

/** The tuning view of a resolved line. */
function asTuningLine(line: ResolvedLine): TuningLine {
  return {
    goldProductId: line.record.goldProductId,
    top1: line.result.topK[0]?.productId ?? null,
    features: line.result.features,
  };
}

/** Calibration lines as the tuning view. */
export function tuningLines(lines: ResolvedLine[]): TuningLine[] {
  return lines.map(asTuningLine);
}

/**
 * Tune the gate on the calibration split.
 *
 * G1 grid-searches its three thresholds. G2 fits the logistic weights and its
 * calibration map, then searches the probability threshold and the score floor
 * jointly, because the plan's G2 has both.
 */
export function tune(spec: ConfigSpec, calibration: ResolvedLine[]): TunedGate {
  const lines = tuningLines(calibration);
  const aliasMinConfirmations = spec.aliasMinConfirmations;

  // R0 has no gate to tune; its thresholds are placeholders so the gate config
  // stays well-formed for callers that expect one.
  if (spec.selfGated) {
    const rules = { sFloor: 1.01, sAuto: 1.01, mMin: 1.01 };
    return {
      config: { gate: spec.gate, rules, model: null, thetaAuto: 1.01, sFloor: 1.01, aliasMinConfirmations },
      calibrationFar: 0,
    };
  }

  if (spec.gate === 'G2') {
    const model = fitGateModel(lines);
    // The score floor is searched over the scores this config actually produces,
    // for the same reason as the G1 grid: an RRF score lives near 0.016, where a
    // fixed 0–0.5 list would put every line on the same side of every floor.
    const sFloors = quantiles(lines.map((line) => line.features.s1), 5).filter((value) => value > 0);
    let best: { sFloor: number; thetaAuto: number; unansweredRate: number; newRate: number; far: number } | null = null;
    for (const sFloor of sFloors) {
      const tuned = tuneTheta(lines, model, { farMax: spec.farMax, sFloor });
      // Same objective as the G1 grid: leave as few lines unanswered as
      // possible, counting an ask anywhere and a refusal on an in-catalog line,
      // and prefer an ask over a NEW on a tie.
      const better =
        best === null ||
        tuned.unansweredRate < best.unansweredRate ||
        (tuned.unansweredRate === best.unansweredRate && (tuned.far < best.far || (tuned.far === best.far && tuned.newRate < best.newRate)));
      if (better) {
        best = { sFloor, thetaAuto: tuned.thetaAuto, unansweredRate: tuned.unansweredRate, newRate: tuned.newRate, far: tuned.far };
      }
    }
    const chosen = best ?? { sFloor: 0, thetaAuto: 1, unansweredRate: 1, newRate: 1, far: 0 };
    return {
      config: { gate: 'G2', rules: { sFloor: chosen.sFloor, sAuto: 1, mMin: 0 }, model, thetaAuto: chosen.thetaAuto, sFloor: chosen.sFloor, aliasMinConfirmations },
      calibrationFar: chosen.far,
    };
  }

  const tuned = tuneGateRules(lines, { farMax: spec.farMax });
  return {
    config: {
      gate: 'G1',
      rules: tuned.rules,
      model: null,
      thetaAuto: 1,
      sFloor: tuned.rules.sFloor,
      aliasMinConfirmations,
    },
    calibrationFar: tuned.score.far,
  };
}

/** Turn a resolved line into a scored outcome under the tuned gate. */
export function outcomeOf(line: ResolvedLine, gate: GateConfig, selfGated = false): LineOutcome {
  const { result, record } = line;

  if (selfGated) {
    // R0 carries no ranking, so its own pick is the only candidate there is.
    // Its confidence is a constant, which makes its risk-coverage curve
    // meaningless — the report says so rather than inventing a score.
    return {
      id: record.id,
      dataset: record.dataset,
      tags: record.tags,
      goldProductId: record.goldProductId,
      decision: result.decision,
      autoProductId: result.productId,
      ranked: result.productId === null ? [] : [result.productId],
      confidence: 0,
    };
  }

  const decision: Decision = decide(result.features, gate);
  return {
    id: record.id,
    dataset: record.dataset,
    tags: record.tags,
    goldProductId: record.goldProductId,
    decision,
    autoProductId: decision === 'AUTO' ? (result.topK[0]?.productId ?? null) : null,
    ranked: result.topK.map((candidate) => candidate.productId),
    confidence: result.features.s1,
    probability: gate.gate === 'G2' && gate.model ? gateProbability(result.features, gate.model) : undefined,
  };
}

export interface ConfigResult {
  spec: ConfigSpec;
  gate: GateConfig;
  metrics: ResolutionMetrics;
  /** 95% bootstrap interval of FAR, plus the rule-of-three bound on the autos seen. */
  farInterval: { mean: number; lo: number; hi: number };
  farRuleOfThree: number;
  outcomes: LineOutcome[];
  /** Per-tag and per-dataset breakdowns, which the report must show. */
  byTag: Record<string, ResolutionMetrics>;
  byDataset: Record<string, ResolutionMetrics>;
}

/** Apply the tuned gate to the held-out split and measure it. */
export function evaluate(spec: ConfigSpec, tuned: TunedGate, test: ResolvedLine[], seed = 1): ConfigResult {
  const outcomes = test.map((line) => outcomeOf(line, tuned.config, spec.selfGated));

  const wrongAutoFlags = outcomes.map((outcome) => (outcome.decision === 'AUTO' && outcome.autoProductId !== outcome.goldProductId ? 1 : 0));
  const farInterval = bootstrapCI(wrongAutoFlags, { seed });

  const tags = new Set(outcomes.flatMap((outcome) => outcome.tags));
  const datasets = new Set(outcomes.map((outcome) => outcome.dataset));

  return {
    spec,
    gate: tuned.config,
    metrics: resolutionMetrics(outcomes),
    farInterval,
    farRuleOfThree: ruleOfThree(outcomes.filter((outcome) => outcome.decision === 'AUTO').length),
    outcomes,
    byTag: Object.fromEntries([...tags].map((tag) => [tag, resolutionMetrics(outcomes.filter((outcome) => outcome.tags.includes(tag)))])),
    byDataset: Object.fromEntries([...datasets].map((dataset) => [dataset, resolutionMetrics(outcomes.filter((outcome) => outcome.dataset === dataset))])),
  };
}

/** The records a split names, in dataset order. */
export function splitRecords(records: EvalRecord[], splits: Splits, side: 'calibration' | 'test'): EvalRecord[] {
  const wanted = new Set<string>();
  for (const split of Object.values(splits)) {
    for (const id of split[side]) wanted.add(id);
  }
  return records.filter((record) => wanted.has(record.id));
}

/** Correctness per line, aligned across two runs of the same split, for McNemar. */
export function correctnessVector(outcomes: LineOutcome[]): boolean[] {
  return outcomes.map((outcome) => outcome.goldProductId !== null && outcome.ranked[0] === outcome.goldProductId);
}

/** How many calibration lines actually carry a gold product. */
export function inCatalogCount(lines: ResolvedLine[]): number {
  return lines.filter((line) => line.record.goldProductId !== null).length;
}

/** Whether a resolved line's top-1 was gold, exposed for tests and the report. */
export function lineIsCorrect(line: ResolvedLine): boolean {
  return top1Correct(asTuningLine(line));
}
