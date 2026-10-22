/**
 * The bake-off: the pre-registered matrix, the run, and the selection rule
 * (plan sections 8.1 to 8.3).
 *
 * The rule is frozen in `backend/ai/evaluation/voice_order/configs/selection_rule.json` and was written
 * before any of these numbers existed. Nothing here may quietly improve a
 * config: each row is resolved, gated and measured through the same harness
 * call, and the winner is the rule's output rather than a judgement call.
 */

import type { CatalogItem } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';
import { BaselineR0 } from '../lib/baselineR0.ts';
import type { EvalRecord, Splits } from '../lib/corpus.ts';
import { evaluate, resolveAll, stratifiedSample, tune, type ConfigResult, type ConfigSpec, type ResolvedLine } from './harness.ts';

/** One row of the matrix. */
export interface BakeoffRow {
  /** Plan name: R0 … R6, Rx. */
  id: string;
  label: string;
  spec: ConfigSpec;
}

/** Shared knobs every row is evaluated under, so the comparison is like for like. */
const BASE: Omit<ConfigSpec, 'name' | 'retrievers' | 'fusion' | 'gate'> = {
  weights: {},
  topK: 5,
  qMaxEditDistance: 2,
  eBruteMax: 500,
  useUnitStoplist: false,
  farMax: 0.01,
  aliasMinConfirmations: 2,
};

/**
 * The resolver axis of plan section 8.1.
 *
 * R0 is the current `parseOrder` matcher, kept as the baseline; Rx is the
 * rejected AND-trigram design, kept as the historical control the plan expects
 * to fail on noisy names.
 */
export function matrix(): BakeoffRow[] {
  const row = (id: string, label: string, retrievers: ConfigSpec['retrievers'], fusion: ConfigSpec['fusion'], gate: ConfigSpec['gate']): BakeoffRow => ({
    id,
    label,
    spec: { ...BASE, name: `${id}-${gate}`, retrievers, fusion, gate },
  });

  const rows: BakeoffRow[] = [
    {
      id: 'R0',
      label: 'current parseOrder matcher',
      spec: { ...BASE, name: 'R0', retrievers: [], fusion: 'max', gate: 'G1', selfGated: true },
    },
    row('R1', 'E only', ['E'], 'max', 'G1'),
    row('R2', 'Q-cos', ['Q-cos'], 'max', 'G1'),
    row('R3', 'Q-bm25', ['Q-bm25'], 'max', 'G1'),
    row('R4', 'Q + B, RRF', ['Q-bm25', 'B'], 'rrf', 'G1'),
    row('R5', 'E + Q + B, RRF', ['E', 'Q-bm25', 'B'], 'rrf', 'G1'),
    row('R5w', 'E + Q + B, weighted RRF', ['E', 'Q-bm25', 'B'], 'wrrf', 'G1'),
    row('R6', 'R5 + P', ['E', 'Q-bm25', 'B', 'P'], 'rrf', 'G1'),
    row('Rx', 'AND-trigram control', ['AND'], 'max', 'G1'),
  ];

  // Every resolver row is also run under the logistic gate, so the gate axis is
  // measured on the same resolvers rather than only on the best one.
  for (const id of ['R1', 'R3', 'R5', 'R6']) {
    const base = rows.find((candidate) => candidate.id === id) as BakeoffRow;
    rows.push({ id: `${id}-G2`, label: `${base.label}, logistic gate`, spec: { ...base.spec, name: `${id}-G2`, gate: 'G2' } });
  }

  return rows;
}

/**
 * Resolve the R0 baseline through the same record set as every other row.
 *
 * R0 needs a resolver per catalog just like the others, but it is a class of
 * its own rather than a `buildResolver` output.
 */
export function resolveR0(records: EvalRecord[], catalogs: Record<string, CatalogItem[]>, limit?: number): ResolvedLine[] {
  const selected = stratifiedSample(records, limit);
  const byCatalog = new Map<string, EvalRecord[]>();
  for (const record of selected) {
    const group = byCatalog.get(record.catalogId);
    if (group === undefined) byCatalog.set(record.catalogId, [record]);
    else group.push(record);
  }

  const resolved: ResolvedLine[] = [];
  for (const [catalogId, group] of byCatalog) {
    const resolver = new BaselineR0(catalogs[catalogId] ?? []);
    for (const record of group) resolved.push({ record, result: resolver.resolve(record.line) });
  }
  return resolved;
}

/** Records named by a split side, in dataset order. */
export function splitRecords(records: EvalRecord[], splits: Splits, side: 'calibration' | 'test'): EvalRecord[] {
  const wanted = new Set<string>();
  for (const split of Object.values(splits)) for (const id of split[side]) wanted.add(id);
  return records.filter((record) => wanted.has(record.id));
}

export interface RowResult {
  row: BakeoffRow;
  result: ConfigResult;
  /** Wall-clock milliseconds per line spent resolving, on this machine. */
  resolveMsPerLine: number;
}

export interface RunOptions {
  records: EvalRecord[];
  splits: Splits;
  catalogs: Record<string, CatalogItem[]>;
  /** Cap on lines per dataset; used to keep the 20k-item D3 catalog tractable. */
  limit?: number;
  seed?: number;
}

/**
 * Resolve, tune and measure one row.
 *
 * Tuning sees the calibration split only; every number that ends up in the
 * report comes from the test split, which the tuning never touched.
 */
export function runRow(row: BakeoffRow, options: RunOptions): RowResult {
  const calibrationRecords = splitRecords(options.records, options.splits, 'calibration');
  const testRecords = splitRecords(options.records, options.splits, 'test');

  const started = performance.now();
  const calibration =
    row.spec.selfGated === true
      ? resolveR0(calibrationRecords, options.catalogs, options.limit)
      : resolveAll(row.spec, calibrationRecords, options.catalogs, options.limit);
  const test =
    row.spec.selfGated === true
      ? resolveR0(testRecords, options.catalogs, options.limit)
      : resolveAll(row.spec, testRecords, options.catalogs, options.limit);
  const elapsed = performance.now() - started;

  const tuned = tune(row.spec, calibration);
  const result = evaluate(row.spec, tuned, test, options.seed ?? 1);

  const lines = calibration.length + test.length;
  return { row, result, resolveMsPerLine: lines === 0 ? 0 : elapsed / lines };
}

/** The frozen selection rule, as `backend/ai/evaluation/voice_order/configs/selection_rule.json` holds it. */
export interface SelectionRule {
  version: number;
  frozen: string;
  farMax: number;
  recall3TolerancePp: number;
  askRateTolerancePp: number;
  simplicityOrder: string[];
  gateSimplicityOrder: string[];
}

export interface Selection {
  /** The row with the best recall@3 among those that cleared the budget. */
  star: RowResult | null;
  /** The simplest row within tolerance of `star`. The rule's answer. */
  chosen: RowResult | null;
  excluded: Array<{ id: string; reason: string }>;
  /** Why the latency budget could not be applied, when it could not. */
  latencyNote: string;
}

/** Position of a row in the simplicity order, resolver first then gate. */
function simplicityRank(row: BakeoffRow, rule: SelectionRule): number {
  const base = row.id.replace(/-G2$/, '');
  const resolverIndex = rule.simplicityOrder.indexOf(base);
  const gateIndex = rule.gateSimplicityOrder.indexOf(row.spec.gate);
  return (resolverIndex === -1 ? rule.simplicityOrder.length : resolverIndex) * 10 + (gateIndex === -1 ? rule.gateSimplicityOrder.length : gateIndex);
}

/**
 * Apply plan section 8.3.
 *
 * Step 1 (exclude anything over a latency budget) cannot be applied: the
 * budgets are stated for a low-end Android device and this harness runs on a
 * developer machine, so it reports Node timings and says plainly that the
 * device budget is unmeasured rather than pretending the proxy is the budget.
 */
export function select(results: RowResult[], rule: SelectionRule): Selection {
  const excluded: Array<{ id: string; reason: string }> = [];
  const eligible: RowResult[] = [];

  for (const result of results) {
    if (result.result.farInterval.hi > rule.farMax) {
      excluded.push({ id: result.row.id, reason: `held-out FAR 95% upper bound ${result.result.farInterval.hi.toFixed(4)} > ${rule.farMax}` });
      continue;
    }
    eligible.push(result);
  }

  if (eligible.length === 0) {
    return {
      star: null,
      chosen: null,
      excluded,
      latencyNote: 'no row cleared the false-auto budget, so nothing could be selected',
    };
  }

  const star = eligible.reduce((best, candidate) => (candidate.result.metrics.recall3 > best.result.metrics.recall3 ? candidate : best));
  const recallFloor = star.result.metrics.recall3 - rule.recall3TolerancePp / 100;
  const askCeiling = star.result.metrics.askRate + rule.askRateTolerancePp / 100;

  const withinTolerance = eligible.filter(
    (candidate) => candidate.result.metrics.recall3 >= recallFloor && candidate.result.metrics.askRate <= askCeiling,
  );
  const chosen = withinTolerance.reduce((best, candidate) => (simplicityRank(candidate.row, rule) < simplicityRank(best.row, rule) ? candidate : best));

  return {
    star,
    chosen,
    excluded,
    latencyNote:
      'Plan section 7.4 states latency budgets for a low-end Android device. This harness measured Node wall-clock on a developer machine, so no row was excluded for latency; the device budgets remain unmeasured.',
  };
}

