/**
 * Auto-research loop for the resolver (plan section 9, P9).
 *
 * Nothing about the pipeline is chosen here by hand. The loop searches the
 * space the protocol froze (`eval/configs/autoresearch_protocol.json`):
 * which retrievers build the shortlist, how long the shortlist is, how the
 * rerank weighs its signals, and the gate's thresholds. Every candidate
 * config is fitted on the dev calibration side and judged on the dev test
 * side by the protocol's objective. The winner is then re-run end to end
 * through `buildResolver`, the same call the app makes, and scored once on a
 * lockbox drawn from seeds no earlier run used.
 *
 *   node eval/search/autoresearch.ts [--out DIR] [--run-id ID] [--smoke N]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cpus, platform, release } from 'node:os';

import { buildResolver } from '../../frontend/mobile/src/lib/resolver/index.ts';
import { Reranker } from '../../frontend/mobile/src/lib/resolver/rerank.ts';
import type {
  Candidate,
  CatalogItem,
  GateConfig,
  GateRules,
  RerankSignal,
  ResolverConfig,
  RetrieverName,
} from '../../frontend/mobile/src/lib/resolver/types.ts';
import { decide } from '../../frontend/mobile/src/lib/resolver/gate.ts';
import type { EvalRecord } from '../lib/corpus.ts';
import { matrix } from '../runner/bakeoff.ts';
import { evaluate, resolveAll, splitRecords, stratifiedSample, tune } from '../runner/harness.ts';
import { devData, lockboxData, REPO } from './data.ts';

// ─── Statistics ──────────────────────────────────────────────────────────────

function logChoose(n: number, k: number): number {
  let total = 0;
  for (let i = 1; i <= k; i += 1) total += Math.log(n - k + i) - Math.log(i);
  return total;
}

/** P(X <= k) for X ~ Binomial(n, p). */
export function binomCdf(k: number, n: number, p: number): number {
  if (p <= 0) return 1;
  if (p >= 1) return k >= n ? 1 : 0;
  let total = 0;
  for (let i = 0; i <= k; i += 1) total += Math.exp(logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, total);
}

/** One-sided Clopper-Pearson upper bound on a rate, at level 1 - alpha. */
export function clopperPearsonUpper(k: number, n: number, alpha = 0.05): number {
  if (n === 0) return 1;
  let lo = k / n;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (binomCdf(k, n, mid) > alpha) lo = mid;
    else hi = mid;
  }
  return hi;
}

// ─── Shortlists and signals, computed once ───────────────────────────────────

const MAX_POOL = 20;
const SIGNALS: RerankSignal[] = ['E', 'P', 'T', 'R'];

interface Line {
  record: EvalRecord;
  /** Fused shortlist, best first, up to MAX_POOL. */
  cands: Candidate[];
  /** E, P, T per candidate, aligned with `cands`. */
  signals: Array<Record<'E' | 'P' | 'T', number>>;
  /** Retrievers that returned anything, and the id each ranked first. */
  firsts: Record<string, string>;
}

function baseConfig(retrievers: RetrieverName[], topK: number): ResolverConfig {
  return { retrievers, fusion: 'rrf', rrfK: 60, weights: {}, topK, qMaxEditDistance: 2, eBruteMax: 500, useUnitStoplist: false };
}

const PROVISIONAL: GateConfig = {
  gate: 'G1',
  rules: { sFloor: 2, sAuto: 2, mMin: 2 },
  model: null,
  thetaAuto: 2,
  sFloor: 2,
  aliasMinConfirmations: 2,
};

function byCatalog(records: EvalRecord[]): Map<string, EvalRecord[]> {
  const groups = new Map<string, EvalRecord[]>();
  for (const record of records) {
    const group = groups.get(record.catalogId);
    if (group) group.push(record);
    else groups.set(record.catalogId, [record]);
  }
  return groups;
}

/** Single-signal rerankers per catalog, so each signal is read off the library's own code. */
function signalReaders(catalog: CatalogItem[]): Record<'E' | 'P' | 'T', Reranker> {
  const readers = {} as Record<'E' | 'P' | 'T', Reranker>;
  for (const signal of ['E', 'P', 'T'] as const) {
    readers[signal] = new Reranker({ pool: MAX_POOL, weights: { [signal]: 1 } });
    for (const item of catalog) readers[signal].addDocument(item.name, item.id);
  }
  return readers;
}

function shortlist(retrievers: RetrieverName[], records: EvalRecord[], catalogs: Record<string, CatalogItem[]>): { lines: Line[]; msPerLine: number } {
  const lines: Line[] = [];
  let elapsed = 0;
  for (const [catalogId, group] of byCatalog(records)) {
    const catalog = catalogs[catalogId] ?? [];
    const resolver = buildResolver({ catalog, config: baseConfig(retrievers, MAX_POOL), gate: PROVISIONAL, seeds: [] });
    const readers = signalReaders(catalog);
    for (const record of group) {
      const started = performance.now();
      const result = resolver.resolve(record.line);
      elapsed += performance.now() - started;
      const cands = result.topK;
      const perSignal = Object.fromEntries(
        (['E', 'P', 'T'] as const).map((signal) => [signal, new Map(readers[signal].rerank(record.line, cands).map((c) => [c.productId, c.score]))]),
      ) as Record<'E' | 'P' | 'T', Map<string, number>>;
      const firsts: Record<string, string> = {};
      for (const cand of cands) for (const [name, rank] of Object.entries(cand.ranks)) if (rank === 1) firsts[name] = cand.productId;
      lines.push({
        record,
        cands,
        signals: cands.map((c) => ({ E: perSignal.E.get(c.productId) ?? 0, P: perSignal.P.get(c.productId) ?? 0, T: perSignal.T.get(c.productId) ?? 0 })),
        firsts,
      });
    }
  }
  return { lines, msPerLine: elapsed / Math.max(1, lines.length) };
}

// ─── One config, applied to cached shortlists ────────────────────────────────

type Weights = Partial<Record<RerankSignal, number>>;

interface Spec {
  retrievers: RetrieverName[];
  pool: number;
  /** Empty means no rerank: the fused RRF score is the gate's score. */
  weights: Weights;
}

interface Row {
  gold: string | null;
  ranked: string[];
  s1: number;
  margin: number;
  agree: number;
  dataset: string;
}

function rowsOf(lines: Line[], spec: Spec): Row[] {
  const entries = Object.entries(spec.weights).filter(([, w]) => (w ?? 0) > 0) as Array<[RerankSignal, number]>;
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  return lines.map((line) => {
    const n = Math.min(spec.pool, line.cands.length);
    const scored = line.cands.slice(0, n).map((cand, index) => {
      if (total === 0) return { id: cand.productId, score: cand.score, index };
      let score = 0;
      for (const [signal, w] of entries) {
        const value = signal === 'R' ? (n <= 1 ? 1 : 1 - index / (n - 1)) : line.signals[index][signal];
        score += (w / total) * value;
      }
      return { id: cand.productId, score, index };
    });
    scored.sort((a, b) => b.score - a.score || a.index - b.index);
    const returning = Object.values(line.firsts);
    const top = scored[0]?.id;
    return {
      gold: line.record.goldProductId,
      ranked: scored.slice(0, 5).map((s) => s.id),
      s1: scored[0]?.score ?? 0,
      margin: (scored[0]?.score ?? 0) - (scored[1]?.score ?? 0),
      agree: returning.length === 0 ? 0 : returning.filter((id) => id === top).length / returning.length,
      dataset: line.record.dataset,
    };
  });
}

// ─── Gate fitting by Learn then Test ─────────────────────────────────────────

function quantileValues(values: number[], count: number): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  const out = new Set<number>();
  for (let i = 0; i <= count; i += 1) out.add(sorted[Math.min(sorted.length - 1, Math.floor((i / count) * (sorted.length - 1)))]);
  return [...out];
}

function decideRow(row: Row, rules: GateRules): 'AUTO' | 'ASK' | 'NEW' {
  if (row.s1 < rules.sFloor) return 'NEW';
  if (row.s1 >= rules.sAuto && row.margin >= rules.mMin && row.agree >= (rules.agreeMin ?? 1)) return 'AUTO';
  return 'ASK';
}

/**
 * Pick the auto rule on calibration with a finite-sample FAR guarantee.
 *
 * Each (mMin, agreeMin) pair is a path; along a path the thresholds run from
 * strict to lenient and are tested in that fixed order, stopping at the first
 * one whose binomial p-value for "FAR > farMax" exceeds delta / paths. That is
 * Learn then Test's fixed-sequence procedure with a Bonferroni split over
 * paths, so the selected rule's FAR is <= farMax with probability >= 1 - delta.
 */
export function fitGate(rows: Row[], farMax: number, delta: number): GateRules {
  const n = rows.length;
  const mMins = [0, ...quantileValues(rows.map((r) => r.margin), 4)].filter((v, i, a) => a.indexOf(v) === i);
  const agreeMins = [0, 0.5, 1];
  const sAutos = quantileValues(rows.map((r) => r.s1), 60).sort((a, b) => b - a);
  const paths = mMins.length * agreeMins.length;

  let best: GateRules = { sAuto: Infinity, mMin: 0, agreeMin: 1, sFloor: -Infinity };
  let bestCorrect = -1;
  const bySignal = [...rows].sort((a, b) => b.s1 - a.s1);
  for (const mMin of mMins) {
    for (const agreeMin of agreeMins) {
      // Walk the lines from the highest score down once per path, so each
      // threshold costs only the lines it newly admits.
      const eligible = bySignal.filter((row) => row.margin >= mMin && row.agree >= agreeMin);
      let cursor = 0;
      let wrong = 0;
      let correct = 0;
      for (const sAuto of sAutos) {
        while (cursor < eligible.length && eligible[cursor].s1 >= sAuto) {
          if (eligible[cursor].ranked[0] === eligible[cursor].gold) correct += 1;
          else wrong += 1;
          cursor += 1;
        }
        if (binomCdf(wrong, n, farMax) > delta / paths) break;
        if (correct > bestCorrect) {
          bestCorrect = correct;
          best = { sAuto, mMin, agreeMin, sFloor: -Infinity };
        }
      }
    }
  }

  // The floor only moves lines between ASK and NEW; it never creates an AUTO.
  let bestFloor = -Infinity;
  let bestCost = Infinity;
  for (const sFloor of [-Infinity, ...quantileValues(rows.map((r) => r.s1), 60)]) {
    if (sFloor > best.sAuto) continue;
    const rules = { ...best, sFloor };
    let cost = 0;
    for (const row of rows) {
      const decision = decideRow(row, rules);
      if (decision === 'ASK' || (decision === 'NEW' && row.gold !== null)) cost += 1;
    }
    if (cost < bestCost) {
      bestCost = cost;
      bestFloor = sFloor;
    }
  }
  return { ...best, sFloor: bestFloor };
}

interface Metrics {
  n: number;
  correctAuto: number;
  autos: number;
  wrongAutos: number;
  far: number;
  farUpper: number;
  askRate: number;
  newRate: number;
  wrongNew: number;
  top1: number;
  recall3: number;
  oocFar: number;
}

function measure(rows: Row[], rules: GateRules): Metrics {
  let autos = 0;
  let wrongAutos = 0;
  let asks = 0;
  let news = 0;
  let wrongNew = 0;
  let top1 = 0;
  let recall3 = 0;
  let inCat = 0;
  let ooc = 0;
  let oocWrong = 0;
  for (const row of rows) {
    const decision = decideRow(row, rules);
    if (row.gold !== null) {
      inCat += 1;
      if (row.ranked[0] === row.gold) top1 += 1;
      if (row.ranked.slice(0, 3).includes(row.gold)) recall3 += 1;
    } else ooc += 1;
    if (decision === 'AUTO') {
      autos += 1;
      if (row.ranked[0] !== row.gold) {
        wrongAutos += 1;
        if (row.gold === null) oocWrong += 1;
      }
    } else if (decision === 'ASK') asks += 1;
    else {
      news += 1;
      if (row.gold !== null) wrongNew += 1;
    }
  }
  const n = rows.length;
  return {
    n,
    correctAuto: (autos - wrongAutos) / n,
    autos: autos / n,
    wrongAutos,
    far: wrongAutos / n,
    farUpper: clopperPearsonUpper(wrongAutos, n),
    askRate: asks / n,
    newRate: news / n,
    wrongNew: wrongNew / n,
    top1: inCat ? top1 / inCat : 0,
    recall3: inCat ? recall3 / inCat : 0,
    oocFar: ooc ? oocWrong / ooc : 0,
  };
}

// ─── The search ──────────────────────────────────────────────────────────────

interface Trial {
  spec: Spec;
  rules: GateRules;
  val: Metrics;
  objective: number;
  stage: string;
}

function objectiveOf(val: Metrics, farMax: number): number {
  // Infeasible configs rank below every feasible one, ordered by how far over they are.
  return val.farUpper <= farMax ? val.correctAuto : -val.farUpper;
}

function better(a: Trial, b: Trial | undefined): boolean {
  if (!b) return true;
  if (a.objective !== b.objective) return a.objective > b.objective;
  if (a.val.recall3 !== b.val.recall3) return a.val.recall3 > b.val.recall3;
  const sa = Object.values(a.spec.weights).filter((w) => (w ?? 0) > 0).length;
  const sb = Object.values(b.spec.weights).filter((w) => (w ?? 0) > 0).length;
  if (sa !== sb) return sa < sb;
  return a.spec.pool < b.spec.pool;
}

function simplex(step: number): Weights[] {
  const units = Math.round(1 / step);
  const out: Weights[] = [];
  const rec = (index: number, left: number, acc: number[]) => {
    if (index === SIGNALS.length - 1) {
      acc.push(left);
      const weights: Weights = {};
      SIGNALS.forEach((signal, i) => {
        if (acc[i] > 0) weights[signal] = acc[i] * step;
      });
      out.push(weights);
      acc.pop();
      return;
    }
    for (let u = 0; u <= left; u += 1) {
      acc.push(u);
      rec(index + 1, left - u, acc);
      acc.pop();
    }
  };
  rec(0, units, []);
  return out;
}

function keyOf(spec: Spec): string {
  const w = SIGNALS.map((s) => (spec.weights[s] ?? 0).toFixed(2)).join(',');
  return `${spec.retrievers.join('+')}|${spec.pool}|${w}`;
}

function label(spec: Spec): string {
  const w = SIGNALS.filter((s) => (spec.weights[s] ?? 0) > 0).map((s) => `${s} ${(spec.weights[s] as number).toFixed(2)}`).join(', ');
  return `${spec.retrievers.join(' + ')} → pool ${spec.pool} → ${w || 'no rerank (RRF score)'}`;
}

function main(): void {
  const argv = process.argv.slice(2);
  const arg = (flag: string, fallback: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : fallback;
  };
  const outDir = resolve(arg('--out', join(REPO, 'eval/reports')));
  const runId = arg('--run-id', 'autoresearch_v1');
  const protocol = JSON.parse(readFileSync(join(REPO, 'eval/configs/autoresearch_protocol.json'), 'utf8'));
  const { farMax, lttDelta: delta } = protocol;
  // `--smoke N` caps dev lines and stops before the lockbox, so the pipeline
  // can be checked without spending the lockbox's single read.
  const smoke = argv.includes('--smoke') ? Number(arg('--smoke', '40')) : undefined;
  const limit = smoke ?? (protocol.dev.limitPerDataset as number);
  const log = (message: string) => console.error(`[${new Date().toISOString().slice(11, 19)}] ${message}`);

  const dev = devData(protocol);
  const calRecords = stratifiedSample(splitRecords(dev.records, dev.splits, 'calibration'), limit);
  const valRecords = stratifiedSample(splitRecords(dev.records, dev.splits, 'test'), limit);
  log(`dev: ${calRecords.length} calibration lines, ${valRecords.length} test lines`);

  const retrieverSets = protocol.searchSpace.candidateRetrievers as RetrieverName[][];
  const cache = new Map<string, { cal: Line[]; val: Line[]; msPerLine: number }>();
  for (const retrievers of retrieverSets) {
    const cal = shortlist(retrievers, calRecords, dev.catalogs);
    const val = shortlist(retrievers, valRecords, dev.catalogs);
    cache.set(retrievers.join('+'), { cal: cal.lines, val: val.lines, msPerLine: (cal.msPerLine + val.msPerLine) / 2 });
    log(`shortlist ${retrievers.join('+')}: ${((cal.msPerLine + val.msPerLine) / 2).toFixed(2)} ms/line`);
  }

  const trials = new Map<string, Trial>();
  const run = (spec: Spec, stage: string): Trial => {
    const key = keyOf(spec);
    const seen = trials.get(key);
    if (seen) return seen;
    const lines = cache.get(spec.retrievers.join('+'))!;
    const rules = fitGate(rowsOf(lines.cal, spec), farMax, delta);
    const val = measure(rowsOf(lines.val, spec), rules);
    const trial: Trial = { spec, rules, val, objective: objectiveOf(val, farMax), stage };
    trials.set(key, trial);
    return trial;
  };

  // Stage 1: the whole coarse grid.
  const weightGrid = [{}, ...simplex(protocol.searchSpace.stage1WeightStep)];
  for (const retrievers of retrieverSets) {
    for (const pool of protocol.searchSpace.pool as number[]) {
      for (const weights of weightGrid) run({ retrievers, pool, weights }, 'grid');
    }
  }
  const ranked = () => [...trials.values()].sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  log(`stage 1: ${trials.size} configs; best ${label(ranked()[0].spec)} at ${(ranked()[0].objective * 100).toFixed(1)}%`);

  // Stage 2: coordinate ascent on the weights from the three best, moving 0.05 between two signals.
  for (const start of ranked().slice(0, 3)) {
    let current = start;
    for (let iteration = 0; iteration < 60; iteration += 1) {
      let next: Trial | undefined;
      for (const to of SIGNALS) {
        for (const from of SIGNALS) {
          if (to === from) continue;
          const have = current.spec.weights[from] ?? 0;
          if (have < 0.05 - 1e-9) continue;
          const weights: Weights = { ...current.spec.weights, [from]: +(have - 0.05).toFixed(2), [to]: +((current.spec.weights[to] ?? 0) + 0.05).toFixed(2) };
          for (const signal of SIGNALS) if ((weights[signal] ?? 0) <= 1e-9) delete weights[signal];
          const trial = run({ ...current.spec, weights }, 'ascent');
          if (better(trial, next)) next = trial;
        }
      }
      if (!next || !better(next, current)) break;
      current = next;
    }
  }
  const winner = ranked()[0];
  log(`stage 2: ${trials.size} configs; winner ${label(winner.spec)} at ${(winner.objective * 100).toFixed(1)}%`);

  // Re-run the winner through the library API, to prove the search measured what ships.
  const shippedConfig: ResolverConfig = { ...baseConfig(winner.spec.retrievers, 5), rerank: Object.keys(winner.spec.weights).length ? { pool: winner.spec.pool, weights: winner.spec.weights } : undefined };
  const shippedGate: GateConfig = { ...PROVISIONAL, rules: winner.rules, sFloor: winner.rules.sFloor, thetaAuto: 2 };
  const apiRows = (records: EvalRecord[], catalogs: Record<string, CatalogItem[]>) => {
    const rows: Row[] = [];
    let elapsed = 0;
    for (const [catalogId, group] of byCatalog(records)) {
      const resolver = buildResolver({ catalog: catalogs[catalogId] ?? [], config: shippedConfig, gate: shippedGate, seeds: [] });
      for (const record of group) {
        const started = performance.now();
        const result = resolver.resolve(record.line);
        elapsed += performance.now() - started;
        // The API decides for itself; the row keeps its decision via its features.
        if (decide(result.features, shippedGate) !== result.decision) throw new Error('gate disagreement');
        rows.push({ gold: record.goldProductId, ranked: result.topK.map((c) => c.productId), s1: result.features.s1, margin: result.features.margin, agree: result.features.agree, dataset: record.dataset });
      }
    }
    return { rows, msPerLine: elapsed / Math.max(1, rows.length) };
  };
  const apiVal = apiRows(valRecords, dev.catalogs);
  const apiValMetrics = measure(apiVal.rows, winner.rules);
  log(`API re-run on dev test: correct autos ${(apiValMetrics.correctAuto * 100).toFixed(1)}% (search said ${(winner.val.correctAuto * 100).toFixed(1)}%)`);

  if (smoke !== undefined) {
    log('smoke run: stopping before the lockbox');
    return;
  }

  // The lockbox, once: the winner through the API, and R4 with its own tuner.
  const box = lockboxData(protocol);
  const boxRecords = stratifiedSample(box.records, protocol.lockbox.limitPerDataset);
  log(`lockbox: ${boxRecords.length} lines`);
  const boxWinner = apiRows(boxRecords, box.catalogs);
  const winnerBox = measure(boxWinner.rows, winner.rules);
  const winnerBoxBy = Object.fromEntries(['d2', 'd3', 'ooc'].map((d) => [d, measure(boxWinner.rows.filter((r) => r.dataset === d), winner.rules)]));

  const r4 = matrix().find((row) => row.id === 'R4')!;
  const r4Tuned = tune(r4.spec, resolveAll(r4.spec, calRecords, dev.catalogs));
  const startedR4 = performance.now();
  const r4BoxLines = resolveAll(r4.spec, boxRecords, box.catalogs);
  const r4Ms = (performance.now() - startedR4) / Math.max(1, r4BoxLines.length);
  const r4Box = evaluate(r4.spec, r4Tuned, r4BoxLines);
  const r4Rows: Row[] = r4BoxLines.map((line) => ({ gold: line.record.goldProductId, ranked: line.result.topK.map((c) => c.productId), s1: line.result.features.s1, margin: line.result.features.margin, agree: line.result.features.agree, dataset: line.record.dataset }));
  const r4Rules = r4Tuned.config.rules;
  const r4Measured = measure(r4Rows, { ...r4Rules, agreeMin: 1 });
  const r4By = Object.fromEntries(['d2', 'd3', 'ooc'].map((d) => [d, measure(r4Rows.filter((r) => r.dataset === d), { ...r4Rules, agreeMin: 1 })]));
  log(`lockbox winner correct autos ${(winnerBox.correctAuto * 100).toFixed(1)}% FAR ${(winnerBox.far * 100).toFixed(2)}%; R4 ${(r4Measured.correctAuto * 100).toFixed(1)}% FAR ${(r4Measured.far * 100).toFixed(2)}%`);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const pct2 = (v: number) => `${(v * 100).toFixed(2)}%`;
  const metricRow = (name: string, m: Metrics, ms?: number) =>
    `| ${name} | ${m.n} | ${pct(m.correctAuto)} | ${pct(m.autos)} | ${pct2(m.far)} (${m.wrongAutos}) | ${pct2(m.farUpper)} | ${pct(m.askRate)} | ${pct(m.newRate)} | ${pct(m.wrongNew)} | ${pct(m.top1)} | ${pct(m.recall3)} | ${pct(m.oocFar)} |${ms === undefined ? '' : ` ${ms.toFixed(2)} |`}`;
  const header = '| Config | lines | correct AUTO | AUTO | FAR (wrong) | FAR 95% upper | ASK | NEW | in-catalog NEW | top-1 | recall@3 | OOC auto-applied |';
  const sep = '|---|---|---|---|---|---|---|---|---|---|---|---|';
  const top = ranked().slice(0, 10);
  const byRetrievers = retrieverSets.map((set) => {
    const best = ranked().find((t) => t.spec.retrievers.join('+') === set.join('+'))!;
    return metricRow(label(best.spec), best.val);
  });
  const noRerank = ranked().find((t) => Object.keys(t.spec.weights).length === 0)!;

  const report = `# Resolver auto-research — ${runId}

Generated ${new Date().toISOString()} by \`eval/search/autoresearch.ts\` on Node ${process.version}, ${platform()} ${release()}, ${cpus()[0]?.model ?? 'unknown CPU'}.
Protocol: \`eval/configs/autoresearch_protocol.json\` v${protocol.version}, frozen ${protocol.frozen}. FAR budget ${pct(farMax)}, LTT delta ${delta}.

## Winner

**${label(winner.spec)}**, gate sAuto ${winner.rules.sAuto.toFixed(4)}, mMin ${winner.rules.mMin.toFixed(4)}, agreeMin ${winner.rules.agreeMin}, sFloor ${Number.isFinite(winner.rules.sFloor) ? winner.rules.sFloor.toFixed(4) : '-inf'}.

Chosen from ${trials.size} configs (${[...trials.values()].filter((t) => t.stage === 'grid').length} on the grid, the rest by coordinate ascent) by the protocol's objective on the dev test side. Re-run through \`buildResolver\`: dev-test correct AUTO ${pct(apiValMetrics.correctAuto)} against ${pct(winner.val.correctAuto)} in the search.

## Lockbox (scored once)

Fresh D2 noise (seed ${protocol.lockbox.d2Seed}), fresh D3 catalogs (seed ${protocol.lockbox.d3Seed}) and out-of-catalog lines (seed ${protocol.lockbox.oocSeed}, ${pct(protocol.lockbox.oocFraction)} of each catalog removed). Gate thresholds are the dev-calibration ones, unchanged. D1 is not here: it cannot be regenerated.

${header} ms/line |
${sep}---|
${metricRow('Winner', winnerBox, boxWinner.msPerLine)}
${metricRow('R4 (bakeoff_v3 pick, its own tuner)', r4Measured, r4Ms)}

By dataset:

${header}
${sep}
${['d2', 'd3', 'ooc'].map((d) => metricRow(`Winner, ${d}`, winnerBoxBy[d])).join('\n')}
${['d2', 'd3', 'ooc'].map((d) => metricRow(`R4, ${d}`, r4By[d])).join('\n')}

R4's harness evaluation on the same lines, for cross-checking: FAR ${pct2(r4Box.metrics.far)}, ask rate ${pct(r4Box.metrics.askRate)}, recall@3 ${pct(r4Box.metrics.recall3)}.

## Dev test side: top 10 configs

${header}
${sep}
${top.map((t) => metricRow(label(t.spec), t.val)).join('\n')}

Best per shortlist retriever set:

${header}
${sep}
${byRetrievers.join('\n')}

Best config without a rerank: ${label(noRerank.spec)}.

${header}
${sep}
${metricRow(label(noRerank.spec), noRerank.val)}

## Shortlist cost

${retrieverSets.map((set) => `- ${set.join(' + ')}: ${cache.get(set.join('+'))!.msPerLine.toFixed(2)} ms/line to fuse a ${MAX_POOL}-candidate shortlist`).join('\n')}

Node wall-clock on the machine above, not the plan's low-end Android budget.

## Caveats

- The dev test side was read by bakeoff_v3 and is read by every config here; it is a dev set. Only the lockbox is a holdout, and only for synthetic noise: D2 reuses the real catalogs' names with new noise, D3 and OOC use catalogs generated from a new seed. Neither is recorded speech.
- No line carries a spoken unit, so \`unit_ok\` never fires, and no shop alias exists, so alias learning is not exercised.
- Out-of-catalog lines here are the hardest kind: a sibling of the asked-for item is always in the catalog.
`;
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, `${runId}.md`), report);
  writeFileSync(
    join(outDir, `${runId}.json`),
    JSON.stringify({ winner: { spec: winner.spec, rules: winner.rules, devTest: winner.val, apiDevTest: apiValMetrics, lockbox: winnerBox, lockboxBy: winnerBoxBy }, r4: { lockbox: r4Measured, lockboxBy: r4By }, trials: [...trials.values()].map((t) => ({ key: keyOf(t.spec), stage: t.stage, objective: t.objective, rules: t.rules, val: t.val })) }, (_k, v) => (v === Infinity ? 'Infinity' : v === -Infinity ? '-Infinity' : v), 1),
  );
  log(`wrote ${join(outDir, `${runId}.md`)}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
