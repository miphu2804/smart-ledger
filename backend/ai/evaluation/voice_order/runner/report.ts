/**
 * Report rendering (plan section 7.6).
 *
 * The report is the deliverable the selection rule acts on, so it is generated
 * rather than written by hand: every number here comes from a harness run, and
 * the deviations section is assembled from the same frozen rule file the
 * selection used.
 */

import { createHash } from 'node:crypto';
import type { LineOutcome } from '../lib/metrics.ts';
import { mcnemar } from '../lib/stats.ts';
import type { BakeoffRow, RowResult, Selection, SelectionRule } from './bakeoff.ts';

export interface ReportInput {
  runId: string;
  generatedAt: string;
  rule: SelectionRule;
  selection: Selection;
  results: RowResult[];
  datasetCounts: { d1: number; d2: number; d3: number; d1Dropped: number | null; d1WithoutMatchedItem: number | null };
  /** Everything the run knows to be a departure from the plan. */
  deviations: string[];
  environment: { node: string; platform: string; cpu: string };
}

/** Percent with one decimal, or a dash when the metric is not defined. */
function pct(value: number): string {
  return Number.isFinite(value) ? `${(value * 100).toFixed(1)}%` : '—';
}

/** A short, stable hash of everything that decides the numbers. */
export function configHash(input: ReportInput): string {
  const material = JSON.stringify({
    rule: input.rule,
    rows: input.results.map((result) => ({ id: result.row.id, spec: result.row.spec, gate: result.result.gate })),
    datasets: input.datasetCounts,
  });
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}

/** Coverage/risk points for the selective-prediction curve. */
export function riskCoveragePoints(outcomes: LineOutcome[], steps = 10): Array<{ coverage: number; risk: number }> {
  if (outcomes.length === 0) return [];
  const sorted = [...outcomes].sort((a, b) => b.confidence - a.confidence);
  const points: Array<{ coverage: number; risk: number }> = [];
  let errors = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    if (!(sorted[i].goldProductId !== null && sorted[i].ranked[0] === sorted[i].goldProductId)) errors += 1;
    const coverage = (i + 1) / sorted.length;
    if (i === sorted.length - 1 || Math.round(coverage * steps) > Math.round(((i === 0 ? 0 : i) / sorted.length) * steps)) {
      points.push({ coverage, risk: errors / (i + 1) });
    }
  }
  return points;
}

/** The headline table: every row, every metric the plan makes mandatory. */
function headlineTable(results: RowResult[]): string {
  const header = '| Row | Resolver | Gate | recall@3 | top-1 | MRR | FAR | FAR 95% CI | autos | ask rate | NEW P | NEW R | AURC | ECE |';
  const divider = '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map((result) => {
    const m = result.result.metrics;
    const ci = `${pct(result.result.farInterval.lo)}–${pct(result.result.farInterval.hi)}`;
    return `| ${result.row.id} | ${result.row.label} | ${result.result.gate.gate} | ${pct(m.recall3)} | ${pct(m.top1)} | ${m.mrr.toFixed(3)} | ${pct(m.far)} | ${ci} | ${m.autos} | ${pct(m.askRate)} | ${pct(m.newPrecision)} | ${pct(m.newRecall)} | ${m.aurc.toFixed(3)} | ${m.ece.toFixed(3)} |`;
  });
  return [header, divider, ...rows].join('\n');
}

/** Per-dataset and per-tag breakdowns for the two rows that matter. */
function breakdownTables(results: RowResult[]): string {
  const sections: string[] = [];
  for (const result of results) {
    sections.push(`### ${result.row.id} — ${result.row.label}`);
    const datasets = Object.entries(result.result.byDataset).sort();
    sections.push(
      ['| Dataset | lines | recall@3 | top-1 | FAR | ask rate |', '|---|---|---|---|---|---|']
        .concat(datasets.map(([name, m]) => `| ${name} | ${m.lines} | ${pct(m.recall3)} | ${pct(m.top1)} | ${pct(m.far)} | ${pct(m.askRate)} |`))
        .join('\n'),
    );
    const tags = Object.entries(result.result.byTag).sort();
    if (tags.length > 0) {
      sections.push(
        ['| Tag | lines | recall@3 | top-1 | FAR | ask rate |', '|---|---|---|---|---|---|']
          .concat(tags.map(([name, m]) => `| ${name} | ${m.lines} | ${pct(m.recall3)} | ${pct(m.top1)} | ${pct(m.far)} | ${pct(m.askRate)} |`))
          .join('\n'),
      );
    }
    sections.push('');
  }
  return sections.join('\n');
}

/** A small curve table, since a markdown report cannot draw one. */
function curveTable(result: RowResult): string {
  const points = riskCoveragePoints(result.result.outcomes);
  return ['| coverage | risk |', '|---|---|']
    .concat(points.map((point) => `| ${pct(point.coverage)} | ${pct(point.risk)} |`))
    .join('\n');
}

/** The worst lines, with the ranking that produced them. */
function galleryTable(result: RowResult): string {
  const failures = result.result.outcomes
    .filter((outcome) => (outcome.decision === 'AUTO' ? outcome.autoProductId !== outcome.goldProductId : outcome.ranked[0] !== outcome.goldProductId))
    .slice(0, 20);
  if (failures.length === 0) return 'No failing lines on the held-out split.';
  return ['| line | dataset | gold | decision | top-5 ranked |', '|---|---|---|---|---|']
    .concat(failures.map((outcome) => `| ${outcome.id} | ${outcome.dataset} | ${outcome.goldProductId ?? '(new)'} | ${outcome.decision} | ${outcome.ranked.slice(0, 5).join(', ') || '—'} |`))
    .join('\n');
}

/** Per-line correctness, keyed by record id so two rows can be paired. */
function correctnessOf(result: RowResult): Map<string, { top1: boolean; auto: boolean }> {
  const map = new Map<string, { top1: boolean; auto: boolean }>();
  for (const outcome of result.result.outcomes) {
    map.set(outcome.id, {
      top1: outcome.goldProductId !== null && outcome.ranked[0] === outcome.goldProductId,
      auto: outcome.decision === 'AUTO' && outcome.autoProductId === outcome.goldProductId,
    });
  }
  return map;
}

/**
 * Paired McNemar comparisons against R0 (plan section 7.3).
 *
 * Every row is resolved on the same held-out lines, so each pair is paired by
 * construction. The p-values are uncorrected and descriptive: the selection
 * rule does not consult them, and with this many comparisons a corrected family
 * would be the only defensible way to call any single one significant.
 */
function pairedTable(results: RowResult[]): string {
  const baseline = results.find((result) => result.row.id === 'R0');
  if (baseline === undefined) return 'No R0 row in this run, so there is nothing to pair against.';

  const base = correctnessOf(baseline);
  const rows: string[] = [];
  for (const result of results) {
    if (result === baseline) continue;
    const other = correctnessOf(result);
    const ids = [...base.keys()].filter((id) => other.has(id));
    for (const metric of ['top1', 'auto'] as const) {
      const a = ids.map((id) => (base.get(id) as { top1: boolean; auto: boolean })[metric]);
      const b = ids.map((id) => (other.get(id) as { top1: boolean; auto: boolean })[metric]);
      const paired = mcnemar(a, b);
      const name = metric === 'top1' ? 'top-1 correct' : 'AUTO correct';
      rows.push(`| ${result.row.id} vs R0 | ${name} | ${paired.b} | ${paired.c} | ${paired.p.toFixed(4)} |`);
    }
  }

  return [
    'Discordant counts over the held-out lines both rows resolved. `R0 only` means R0 got the line right and the other row did not.',
    '',
    '| Comparison | Metric | R0 only | Other only | McNemar p |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** Render the whole report. */
export function renderReport(input: ReportInput): string {
  const { selection, results } = input;
  const chosen = selection.chosen;
  const lines: string[] = [];

  lines.push(`# Voice-order resolver bake-off — ${input.runId}`);
  lines.push('');
  lines.push(`Generated ${input.generatedAt} by \`backend/ai/evaluation/voice_order/runner/run.ts\`.`);
  lines.push('');
  lines.push(`- Config hash: \`${configHash(input)}\``);
  lines.push(`- Selection rule: \`backend/ai/evaluation/voice_order/configs/selection_rule.json\` v${input.rule.version} frozen ${input.rule.frozen}, FAR budget ${pct(input.rule.farMax)}`);
  lines.push(`- Environment: Node ${input.environment.node} on ${input.environment.platform}, ${input.environment.cpu}`);
  lines.push('');
  lines.push('## Datasets');
  lines.push('');
  lines.push(`| Dataset | lines | note |`);
  lines.push('|---|---|---|');
  lines.push(`| d1 | ${input.datasetCounts.d1} | written reference transcripts segmented by parseOrder; **not recorded audio** |`);
  lines.push(`| d2 | ${input.datasetCounts.d2} | synthetic ASR noise over catalog names |`);
  lines.push(`| d3 | ${input.datasetCounts.d3} | catalog-stress families, 100–20 000 items |`);
  lines.push('');
  const { d1Dropped, d1WithoutMatchedItem } = input.datasetCounts;
  lines.push(
    d1Dropped === null || d1WithoutMatchedItem === null
      ? 'The D1 segmentation counters were not recorded for this dataset build; run `writeDatasets` to produce `backend/ai/evaluation/voice_order/data/counts.json`.'
      : `parseOrder recognised no order line in ${d1Dropped} prior records, and matched no in-catalog item in ${d1WithoutMatchedItem}.`,
  );
  lines.push('');

  lines.push('## Headline');
  lines.push('');
  lines.push(headlineTable(results));
  lines.push('');
  lines.push('FAR is wrong autos over all lines; the CI is a 95% percentile bootstrap of that rate.');
  lines.push('');

  lines.push('## Selection');
  lines.push('');
  if (chosen && selection.star) {
    lines.push(`- Best held-out recall@3 (R*): **${selection.star.row.id}** at ${pct(selection.star.result.metrics.recall3)}.`);
    lines.push(`- Chosen by the pre-registered rule (simplest within ${input.rule.recall3TolerancePp} pp recall@3 and ${input.rule.askRateTolerancePp} pp ask rate of R*): **${chosen.row.id}** — ${chosen.row.label}.`);
    lines.push(`- Its held-out numbers: recall@3 ${pct(chosen.result.metrics.recall3)}, top-1 ${pct(chosen.result.metrics.top1)}, FAR ${pct(chosen.result.metrics.far)} (95% CI ${pct(chosen.result.farInterval.lo)}–${pct(chosen.result.farInterval.hi)}), ask rate ${pct(chosen.result.metrics.askRate)}, ${chosen.result.metrics.autos} autos.`);
    lines.push(`- Rule-of-three bound on FAR from ${chosen.result.metrics.autos} autos: ${pct(chosen.result.farRuleOfThree)}.`);
  } else {
    lines.push('No row cleared the false-auto budget, so the rule selected nothing.');
  }
  lines.push('');
  lines.push(`Latency: ${selection.latencyNote}`);
  lines.push('');
  if (selection.excluded.length > 0) {
    lines.push('Excluded by the false-auto budget:');
    lines.push('');
    for (const exclusion of selection.excluded) lines.push(`- \`${exclusion.id}\`: ${exclusion.reason}`);
    lines.push('');
  }

  lines.push('## Breakdowns');
  lines.push('');
  lines.push(breakdownTables([selection.star, chosen].filter((result): result is RowResult => result !== null)));
  lines.push('');

  lines.push('## Paired comparisons');
  lines.push('');
  lines.push(pairedTable(results));
  lines.push('');

  if (chosen) {
    lines.push('## Risk–coverage');
    lines.push('');
    lines.push(`Risk at each coverage level for \`${chosen.row.id}\`. Lower is better; a resolver whose confident answers are right stays near zero until coverage approaches 1.`);
    lines.push('');
    lines.push(curveTable(chosen));
    lines.push('');
  }

  lines.push('## Latency');
  lines.push('');
  lines.push('Wall-clock milliseconds per line spent resolving, on the machine above. **This is not the plan’s device budget.**');
  lines.push('');
  lines.push('| Row | ms/line |');
  lines.push('|---|---|');
  for (const result of results) lines.push(`| ${result.row.id} | ${result.resolveMsPerLine.toFixed(3)} |`);
  lines.push('');

  if (chosen) {
    lines.push('## Failure gallery');
    lines.push('');
    lines.push(`The worst lines for \`${chosen.row.id}\` on the held-out split.`);
    lines.push('');
    lines.push(galleryTable(chosen));
    lines.push('');
  }

  lines.push('## Deviations from the plan');
  lines.push('');
  for (const deviation of input.deviations) lines.push(`- ${deviation}`);
  lines.push('');

  return `${lines.join('\n')}\n`;
}

/** Machine-readable companion to the report, for later phases. */
export function renderSummaryJson(input: ReportInput): string {
  return `${JSON.stringify(
    {
      runId: input.runId,
      generatedAt: input.generatedAt,
      configHash: configHash(input),
      datasetCounts: input.datasetCounts,
      selection: {
        star: input.selection.star?.row.id ?? null,
        chosen: input.selection.chosen?.row.id ?? null,
        excluded: input.selection.excluded,
      },
      rows: input.results.map((result) => ({
        id: result.row.id,
        label: result.row.label,
        spec: result.row.spec,
        gate: result.result.gate,
        metrics: result.result.metrics,
        farInterval: result.result.farInterval,
        farRuleOfThree: result.result.farRuleOfThree,
        resolveMsPerLine: result.resolveMsPerLine,
        byDataset: result.result.byDataset,
        byTag: result.result.byTag,
      })),
      deviations: input.deviations,
    },
    null,
    2,
  )}\n`;
}
