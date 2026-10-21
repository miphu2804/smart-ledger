/**
 * CLI entry point for the bake-off.
 *
 * Thin on purpose: it parses arguments, loads the frozen datasets, runs the
 * matrix and writes the report. All the logic lives in `bakeoff.ts`,
 * `harness.ts` and `report.ts`.
 *
 *   node eval/runner/run.ts [--limit N] [--rows R1,R3] [--out DIR] [--seed N]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCatalogRegistry, type CatalogRegistry, type DatasetCounts, type EvalRecord, type Splits } from '../lib/corpus.ts';
import { matrix, runRow, select, type BakeoffRow, type RowResult, type SelectionRule } from './bakeoff.ts';
import { renderReport, renderSummaryJson, type ReportInput } from './report.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const DATA = join(REPO, 'eval/data');
const REPORTS = join(REPO, 'eval/reports');

interface Args {
  limit?: number;
  rows?: string[];
  outDir: string;
  seed: number;
  runId: string;
}

/** Parse the handful of flags this runner takes. */
export function parseArgs(argv: string[]): Args {
  const args: Args = { outDir: REPORTS, seed: 1, runId: `bakeoff_${new Date().toISOString().slice(0, 10)}` };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--limit') args.limit = Number(value);
    else if (flag === '--rows') args.rows = value.split(',').map((id) => id.trim()).filter(Boolean);
    else if (flag === '--out') args.outDir = resolve(value);
    else if (flag === '--seed') args.seed = Number(value);
    else if (flag === '--run-id') args.runId = value;
    else continue;
    i += 1;
  }
  return args;
}

/** Read one JSONL dataset. */
function readJsonl(path: string): EvalRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvalRecord);
}

/**
 * The dataset counters the corpus builder wrote.
 *
 * Absent when the datasets were built before the counters were persisted. The
 * report then says they were not recorded rather than printing a zero it cannot
 * back up.
 */
function readCounts(): Partial<DatasetCounts> {
  try {
    return JSON.parse(readFileSync(join(DATA, 'counts.json'), 'utf8')) as DatasetCounts;
  } catch {
    return {};
  }
}

/**
 * What D2 actually exercises, measured from the dataset rather than asserted.
 *
 * The plan adds the truncation case because a speaker says "Sting dâu" and the
 * catalog row says "Sting dâu chai 330ml". That case is a minority of D2, and a
 * reader comparing D2 scores needs to know how much of D2 tests it.
 */
function d2Composition(records: EvalRecord[], catalogs: CatalogRegistry): string | null {
  const nameOf = new Map<string, string>();
  for (const items of Object.values(catalogs)) for (const item of items) nameOf.set(item.id, item.name);

  const d2 = records.filter((record) => record.dataset === 'd2');
  if (d2.length === 0) return null;

  let shorter = 0;
  let truncated = 0;
  for (const record of d2) {
    const span = record.line.rawProductSpan;
    const reference = nameOf.get(record.goldProductId ?? '') ?? '';
    if (reference.length - span.length >= 4) shorter += 1;
    const refTokens = reference.split(/\s+/);
    const spanTokens = span.split(/\s+/).filter(Boolean);
    if (spanTokens.length < refTokens.length && refTokens.slice(0, spanTokens.length).join(' ') === spanTokens.join(' ')) truncated += 1;
  }

  return `D2 is ${shorter} of ${d2.length} lines a spoken span at least four characters shorter than the catalog name, and ${truncated} of those are an exact truncation of it ("Coca-Cola lon 330ml" heard as "Coca-Cola"). The rest are same-length noise. A resolver that fails only on heavy truncation would score well on D2 on little evidence.`;
}

/**
 * The plan's departures from its own plan, assembled here so the report states
 * them next to the numbers they affect rather than in a separate document.
 */
export function deviationsOf(records: EvalRecord[], catalogs: CatalogRegistry): string[] {
  const deviations = [
    'D1 is written reference transcripts, not recorded audio. No audio exists in this repository, so plan section 7.1’s D1 and the whole P5 STT axis (greedy vs beam vs hotwords, silence pad, overlapped processing) could not be run.',
    'Because an in-catalog D1 span is the catalog name `parseOrder` matched, D1 scores at the ceiling for every resolver. It validates the pipeline and detects regressions; it does not discriminate. D2 carries the discrimination.',
    'D2 confusion-rule weights are start values, not fitted to real ASR output: fitting them needs D1 transcripts, which do not exist. They are data in `eval/lib/synth_rules.vi.ts` and are the first thing to re-fit when recordings arrive.',
    'Plan section 7.3 requires breakdowns by region, environment, device tier and catalog-size bucket. These datasets carry no speaker, region or environment metadata — D1 has no recorded audio at all — so the report breaks down by dataset and by noise tag instead. The catalog-size axis is still covered, by D3’s four catalogs of 100 to 20 000 items.',
    'Plan section 7.5’s Qdrant Edge parity oracle was not run. Qdrant Edge is a beta Python/Rust package, and this harness is pure TypeScript with no new dependencies by design; the parity test has no implementation.',
    'Plan section 8.3 step 1 excludes configs over a latency budget measured on a low-end Android device. This harness measured Node wall-clock instead, so no row was excluded for latency.',
    'The resolver library lives at `frontend/mobile/src/lib/resolver/`, not the plan’s `packages/resolver/`. This repository is not a monorepo and has no `packages/` directory; `frontend/mobile/src/lib/` is where the frozen `types.ts` already sits.',
    '`RetrieverE`/`RetrieverP` default `eBruteMax` to 5000, following the frozen type in `types.ts`; plan section 5.2 prose says 500. The value is a config knob and the bake-off sets it explicitly.',
    'F1 (`max`) fuses raw scores rather than max-normalized ones. Max-normalizing forces every query’s top-1 to exactly 1, which makes `s1` constant and the gate’s score floor unreachable — an unmatched line would look as confident as a perfect one.',
    'Seed aliases install by unique exact-or-prefix name match, because a seed names a product loosely ("Bia Tiger") while the catalog row spells it out ("Bia Tiger lon 330ml"). An ambiguous seed is dropped rather than guessed.',
    '`eBruteMax` is 500 for every row, the plan’s start value. It is the catalog size at or below which `RetrieverE` and `RetrieverP` score every item; above it they score only the ids Q hands them. E-only and P-only rows have no Q, so they scan the whole catalog, and that is why their D3 timings are far above the others rather than a retriever-quality difference.',
    'D3 is sampled. The full catalog of 26 100 records against a 20 000-item catalog makes an unpruned brute-force scan take longer than the whole rest of the matrix, so `--limit` caps the lines taken from each dataset. The catalogs themselves are never sampled: every D3 line still searches a 100-, 1 000-, 5 000- or 20 000-item catalog, which is the axis D3 exists to stress. D1 and D2 are under the cap and are complete.',
    '`RetrieverE` and `RetrieverP` received a candidate provider even when the config named no Q retriever. That provider returned an empty list, so above `eBruteMax` they scored nothing and reported it as "no match". Fixed in `frontend/mobile/src/lib/resolver/index.ts`; every E-only and P-only row in this report is measured after that fix.',
  ];

  const d2 = d2Composition(records, catalogs);
  if (d2 !== null) deviations.push(d2);
  return deviations;
}

/** Run the matrix and write both report artifacts. */
export function main(argv: string[] = process.argv.slice(2)): void {
  const args = parseArgs(argv);
  const catalogs = buildCatalogRegistry();
  const counts = readCounts();
  const records = [readJsonl(join(DATA, 'd1.jsonl')), readJsonl(join(DATA, 'd2.jsonl')), readJsonl(join(DATA, 'd3.jsonl'))].flat();
  const splits = JSON.parse(readFileSync(join(DATA, 'splits.json'), 'utf8')) as Splits;
  const rule = JSON.parse(readFileSync(join(REPO, 'eval/configs/selection_rule.json'), 'utf8')) as SelectionRule;

  const rows: BakeoffRow[] = matrix().filter((row) => args.rows === undefined || args.rows.includes(row.id));
  const results: RowResult[] = [];
  for (const row of rows) {
    process.stderr.write(`running ${row.id} … `);
    const result = runRow(row, { records, splits, catalogs, limit: args.limit, seed: args.seed });
    results.push(result);
    process.stderr.write(`recall@3 ${(result.result.metrics.recall3 * 100).toFixed(1)}% far ${(result.result.metrics.far * 100).toFixed(1)}%\n`);
  }

  const input: ReportInput = {
    runId: args.runId,
    generatedAt: new Date().toISOString(),
    rule,
    selection: select(results, rule),
    results,
    datasetCounts: {
      d1: counts.d1 ?? records.filter((record) => record.dataset === 'd1').length,
      d2: counts.d2 ?? records.filter((record) => record.dataset === 'd2').length,
      d3: counts.d3 ?? records.filter((record) => record.dataset === 'd3').length,
      d1Dropped: counts.d1Dropped ?? null,
      d1WithoutMatchedItem: counts.d1WithoutMatchedItem ?? null,
    },
    deviations: deviationsOf(records, catalogs),
    environment: { node: process.version, platform: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? 'unknown' },
  };

  mkdirSync(args.outDir, { recursive: true });
  const markdown = join(args.outDir, `${args.runId}.md`);
  writeFileSync(markdown, renderReport(input));
  writeFileSync(join(args.outDir, `${args.runId}.json`), renderSummaryJson(input));
  process.stderr.write(`\nwrote ${markdown}\n`);
}

main();
