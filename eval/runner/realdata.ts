/**
 * Evaluate the resolver on a real shop catalogue with hand-labelled spans
 * (plan sections 7.1 and 7.6).
 *
 * The bake-off's D1 is not recorded audio. `eval/lib/corpus.ts` says so itself,
 * and it is worse than it sounds: an in-catalogue D1 span is the catalogue name
 * `parseOrder` matched, so D1 sits at the ceiling for every resolver and cannot
 * tell two of them apart. This runner takes the other road. It reads a catalogue
 * exported from a real shop and a set of lines a person labelled while listening
 * to the speaker, so the numbers describe spans somebody actually heard.
 *
 *   node eval/runner/realdata.ts --catalog CATALOG.json --lines LINES.jsonl \
 *     [--row R2] [--gate sFloor,sAuto,mMin] [--out DIR] [--run-id ID] [--seed N]
 *
 * `--catalog` takes either a flat `CatalogItem[]` or the registry shape
 * `{ "<catalogId>": CatalogItem[] }`. `--lines` is JSONL; the format is in
 * `eval/data/real/README.md`.
 *
 * What this measures: retrieval and gating on labelled spans. What it cannot:
 * ASR. The span is transcribed by the labeller, so the speech recogniser is out
 * of the loop, and plan section 7.1's D1 audio and the whole P5 axis stay
 * unmeasured. The report says this at the top rather than in a footnote.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildResolver } from '../../frontend/mobile/src/lib/resolver/index.ts';
import type { CatalogItem, GateConfig } from '../../frontend/mobile/src/lib/resolver/types.ts';
import type { EvalRecord } from '../lib/corpus.ts';
import { resolutionMetrics, type LineOutcome } from '../lib/metrics.ts';
import { bootstrapCI } from '../lib/stats.ts';
import { matrix, type BakeoffRow } from './bakeoff.ts';
import { outcomeOf, resolverConfigOf, tune, type ConfigSpec, type ResolvedLine } from './harness.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORTS = join(REPO, 'eval/reports');

/**
 * Below this many lines the runner refuses to fit the gate.
 *
 * `tuneGateRules` grid-searches three thresholds and picks whatever answers the
 * most in-catalog lines on the lines it is given. On a handful of lines that search has
 * nothing to constrain it: a five-line example in this repository produced
 * `sFloor -0.01`, a floor below every score, which turned a product the shop does
 * not sell into an `ASK` instead of the `NEW` it should be. A report whose gate
 * was fitted on too few lines is not a weak measurement, it is a wrong one, so
 * the runner asks for thresholds instead of inventing them.
 */
export const MIN_TUNE_LINES = 30;

/** The dataset name these lines carry, so a report cannot be mistaken for a bake-off run. */
export const REAL_DATASET = 'real';

/**
 * One labelled line.
 *
 * `span` is what the speaker said for the product, as a person transcribed it —
 * not what a matcher produced. `goldProductId` is the product they meant, or
 * `null` when the shop does not sell it.
 */
export interface RealLine {
  id: string;
  span: string;
  goldProductId: string | null;
  qty?: number;
  unit?: string | null;
  /** Free-form: speaker, dialect, device, recording id. Never parsed. */
  note?: string;
}

interface Args {
  catalogPath: string;
  linesPath: string;
  rowId: string;
  gate?: { sFloor: number; sAuto: number; mMin: number };
  outDir: string;
  runId: string;
  seed: number;
}

/** Parse the flags this runner takes. Unknown flags are ignored, as in `run.ts`. */
export function parseArgs(argv: string[]): Args {
  const args: Args = {
    catalogPath: '',
    linesPath: '',
    rowId: 'R2',
    outDir: REPORTS,
    runId: `realdata_${new Date().toISOString().slice(0, 10)}`,
    seed: 1,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--catalog') args.catalogPath = resolve(value);
    else if (flag === '--lines') args.linesPath = resolve(value);
    else if (flag === '--row') args.rowId = value;
    else if (flag === '--gate') args.gate = parseGate(value);
    else if (flag === '--out') args.outDir = resolve(value);
    else if (flag === '--run-id') args.runId = value;
    else if (flag === '--seed') args.seed = Number(value);
    else continue;
    i += 1;
  }
  if (!args.catalogPath) throw new Error('--catalog is required');
  if (!args.linesPath) throw new Error('--lines is required');
  return args;
}

/** `sFloor,sAuto,mMin` from the command line. */
export function parseGate(value: string): { sFloor: number; sAuto: number; mMin: number } {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    throw new Error(`--gate wants three numbers "sFloor,sAuto,mMin", got ${JSON.stringify(value)}`);
  }
  return { sFloor: parts[0], sAuto: parts[1], mMin: parts[2] };
}

/**
 * Read the catalogue, accepting either a flat list or the registry shape.
 *
 * A shop export is naturally a flat list of products; the registry shape is what
 * the bake-off uses. Accepting both keeps the export step to "whatever Core
 * returns" instead of a transformation someone has to write and get wrong.
 */
export function readCatalog(path: string): { catalogId: string; items: CatalogItem[] } {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as CatalogItem[] | Record<string, CatalogItem[]>;
  if (Array.isArray(parsed)) return { catalogId: 'shop', items: parsed };
  const ids = Object.keys(parsed);
  if (ids.length !== 1) {
    throw new Error(`--catalog holds ${ids.length} catalogues; this runner evaluates one shop, so export exactly one`);
  }
  return { catalogId: ids[0], items: parsed[ids[0]] };
}

/** Read the JSONL label set. */
export function readLines(path: string): RealLine[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as RealLine);
}

/**
 * Every label must name a product the catalogue holds, or the numbers are
 * meaningless.
 *
 * A gold id that is not in the catalogue can only be produced by a stale export
 * or a typo, and it would score as a miss for every resolver while looking like
 * a resolver failure. This is the one check worth failing the whole run over.
 */
export function validateLabels(lines: RealLine[], catalog: CatalogItem[]): void {
  const known = new Set(catalog.map((item) => item.id));
  const missing = lines.filter((line) => line.goldProductId !== null && !known.has(line.goldProductId));
  if (missing.length > 0) {
    const sample = missing.slice(0, 5).map((line) => `${line.id}→${line.goldProductId}`).join(', ');
    throw new Error(
      `${missing.length} of ${lines.length} labels name a product the catalogue does not hold (${sample}). ` +
        'Re-export the catalogue, or fix the labels: a stale label scores as a resolver miss.',
    );
  }
}

/** The bake-off row to evaluate, rejecting the ones that are not resolver configs. */
export function rowOf(id: string): BakeoffRow {
  const row = matrix().find((candidate) => candidate.id === id);
  if (row === undefined) {
    throw new Error(`unknown row ${id}; the matrix holds ${matrix().map((candidate) => candidate.id).join(', ')}`);
  }
  if (row.spec.selfGated === true || row.spec.retrievers.length === 0) {
    throw new Error(`row ${id} is not a resolver configuration: it is ${row.label}. Evaluate a resolver row instead.`);
  }
  return row;
}

/**
 * A gate that never auto-applies, used only to harvest ranking and features.
 *
 * The ranking does not depend on the thresholds, so resolving once with this gate
 * and then replaying the decision rule over the cached features is the same
 * shortcut the bake-off takes, and for the same reason.
 */
function harvestGate(spec: ConfigSpec): GateConfig {
  return {
    gate: spec.gate,
    rules: { sFloor: 1.01, sAuto: 1.01, mMin: 1.01 },
    model: null,
    thetaAuto: 1.01,
    sFloor: 1.01,
    aliasMinConfirmations: spec.aliasMinConfirmations,
  };
}

/** The resolver's own record shape, built from a labelled line. */
function toRecord(line: RealLine, catalogId: string): EvalRecord {
  return {
    id: line.id,
    dataset: REAL_DATASET,
    catalogId,
    goldProductId: line.goldProductId,
    tags: [],
    // A hand-labelled span has no pre-noise original: the labeller wrote down
    // what they heard, which is the same string the resolver is scored on.
    line: { rawProductSpan: line.span, qty: line.qty, unit: line.unit ?? null },
    referenceSpan: line.span,
  };
}

export interface RealDataResult {
  row: BakeoffRow;
  gate: GateConfig;
  /** True when the thresholds were fitted on the same lines being reported. */
  gateTunedOnTheseLines: boolean;
  metrics: ReturnType<typeof resolutionMetrics>;
  farInterval: { mean: number; lo: number; hi: number };
  outcomes: LineOutcome[];
  lines: RealLine[];
  catalog: CatalogItem[];
  catalogId: string;
}

/** Resolve, gate and measure the labelled set. */
export function evaluateRealData(args: Args): RealDataResult {
  const { catalogId, items } = readCatalog(args.catalogPath);
  const lines = readLines(args.linesPath);
  if (lines.length === 0) throw new Error(`${args.linesPath} holds no lines`);
  validateLabels(lines, items);

  if (args.gate === undefined && lines.length < MIN_TUNE_LINES) {
    throw new Error(
      `${lines.length} lines is too few to fit the gate (minimum ${MIN_TUNE_LINES}); pass --gate sFloor,sAuto,mMin ` +
        'with thresholds fitted on another shop, or collect more lines. Fitting on this set would produce ' +
        'thresholds the data cannot constrain.',
    );
  }

  const row = rowOf(args.rowId);
  const spec = row.spec;
  const resolver = buildResolver({ catalog: items, config: resolverConfigOf(spec), gate: harvestGate(spec) });
  const resolved: ResolvedLine[] = lines.map((line) => ({
    record: toRecord(line, catalogId),
    result: resolver.resolve({ rawProductSpan: line.span, qty: line.qty, unit: line.unit ?? null }),
  }));

  const tuned = tune(spec, resolved);
  const gateTunedOnTheseLines = args.gate === undefined;
  const gate: GateConfig = args.gate === undefined ? tuned.config : { ...tuned.config, rules: args.gate, sFloor: args.gate.sFloor };

  const outcomes = resolved.map((line) => outcomeOf(line, gate, false));
  const wrongAutos = outcomes.map((outcome) => (outcome.decision === 'AUTO' && outcome.autoProductId !== outcome.goldProductId ? 1 : 0));

  return {
    row,
    gate,
    gateTunedOnTheseLines,
    metrics: resolutionMetrics(outcomes),
    farInterval: bootstrapCI(wrongAutos, { seed: args.seed }),
    outcomes,
    lines,
    catalog: items,
    catalogId,
  };
}

const pct = (value: number): string => `${(value * 100).toFixed(1)}%`;
const round = (value: number, digits: number): string => value.toFixed(digits);

/** The markdown report. */
export function renderReport(result: RealDataResult, args: Args): string {
  const { metrics, outcomes, lines, catalog } = result;
  const nameOf = new Map(catalog.map((item) => [item.id, item.name]));
  const byId = new Map(lines.map((line) => [line.id, line]));

  const out: string[] = [];
  out.push(`# Real-catalogue resolver run — ${args.runId}`);
  out.push('');
  out.push(`Generated ${new Date().toISOString()} by \`eval/runner/realdata.ts\`.`);
  out.push('');
  out.push('**What this is not.** The spans below were transcribed by a person, not by the speech recogniser, so');
  out.push('this measures retrieval and gating only. It does not measure ASR, and it does not replace plan section');
  out.push('7.1\'s D1 audio or the P5 axis, neither of which exists in this repository.');
  out.push('');
  out.push(`- Catalogue: \`${args.catalogPath}\` (${catalog.length} products)`);
  out.push(`- Lines: \`${args.linesPath}\` (${lines.length})`);
  out.push(`- Row: ${result.row.id} — ${result.row.label}`);
  out.push(
    `- Gate: ${
      result.gateTunedOnTheseLines
        ? `tuned on these same ${lines.length} lines (sFloor ${result.gate.rules.sFloor}, sAuto ${result.gate.rules.sAuto}, mMin ${result.gate.rules.mMin}). These numbers are therefore optimistic: pass \`--gate\` with thresholds fitted elsewhere to remove the optimism.`
        : `frozen from the command line (sFloor ${result.gate.rules.sFloor}, sAuto ${result.gate.rules.sAuto}, mMin ${result.gate.rules.mMin})`
    }`,
  );
  out.push(`- Environment: Node ${process.version} on ${platform()} ${release()}, ${cpus()[0]?.model ?? 'unknown'}`);
  out.push('');
  out.push('## Headline');
  out.push('');
  out.push('| lines | in catalogue | top-1 | recall@3 | MRR | FAR | FAR 95% CI | autos | ask rate | taps/order |');
  out.push('|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|');
  out.push(
    `| ${metrics.lines} | ${metrics.inCatalog} | ${pct(metrics.top1)} | ${pct(metrics.recall3)} | ${round(metrics.mrr, 3)} | ${pct(metrics.far)} | ${pct(result.farInterval.lo)}–${pct(result.farInterval.hi)} | ${metrics.autos} | ${pct(metrics.askRate)} | ${round(metrics.tapsPerOrder, 2)} |`,
  );
  out.push('');
  out.push('FAR is wrong autos over all lines; the interval is a 95% percentile bootstrap of that rate.');
  out.push('');
  out.push('## Every line');
  out.push('');
  out.push('| id | heard | meant | decision | resolver picked | gold rank | s1 | note |');
  out.push('|---|---|---|---|---|---|---:|---|');
  for (const outcome of outcomes) {
    const line = byId.get(outcome.id);
    const rank = outcome.goldProductId === null ? '—' : String(outcome.ranked.indexOf(outcome.goldProductId) + 1 || 'miss');
    const picked = outcome.autoProductId === null ? (outcome.ranked[0] ? nameOf.get(outcome.ranked[0]) ?? outcome.ranked[0] : '—') : nameOf.get(outcome.autoProductId) ?? outcome.autoProductId;
    const gold = outcome.goldProductId === null ? '*(not sold)*' : nameOf.get(outcome.goldProductId) ?? outcome.goldProductId;
    out.push(
      `| ${outcome.id} | ${line?.span ?? ''} | ${gold} | ${outcome.decision} | ${picked} | ${rank} | ${round(outcome.confidence, 3)} | ${line?.note ?? ''} |`,
    );
  }
  out.push('');
  out.push('`gold rank` is where the intended product sat in the resolver\'s ranking; `miss` means it was not in the');
  out.push('top-K at all. A row with `ASK` and rank 1 is the resolver finding the right product and declining to write');
  out.push('it, which is the safe failure; a row with `AUTO` and a wrong pick is the one that costs money.');
  out.push('');
  out.push('## Filling this in');
  out.push('');
  out.push('A real run needs a catalogue export and a labelled set. See `eval/data/real/README.md`. Until both exist,');
  out.push('the only set in the repository is the three-product example, which measures the runner and nothing else.');
  out.push('');
  return out.join('\n');
}

/** Run and write the report. */
export function main(argv: string[] = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  const result = evaluateRealData(args);
  const markdown = renderReport(result, args);

  mkdirSync(args.outDir, { recursive: true });
  const path = join(args.outDir, `${args.runId}.md`);
  writeFileSync(path, markdown);
  process.stderr.write(
    `real-data run: ${result.metrics.lines} lines, recall@3 ${pct(result.metrics.recall3)}, top-1 ${pct(result.metrics.top1)}, FAR ${pct(result.metrics.far)}, ask ${pct(result.metrics.askRate)}\nwrote ${path}\n`,
  );
}

main();
