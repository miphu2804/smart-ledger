/**
 * Traces one random spoken order through the real parser and resolver, step by
 * step, for the pipeline walkthrough (`reports/pipeline-walkthrough.html`).
 *
 * The sentence is built from two items of a fixture catalog, each read with
 * synthetic ASR noise, so it is what the STT step could hand over; STT itself
 * does not run here. Every number in the output comes from the library code.
 *
 *   node backend/ai/evaluation/voice_order/trace_utterance.ts [--seed 123] [--out trace.json]
 */

import { writeFileSync } from 'node:fs';

import { parseOrder } from '../../../../frontend/mobile/src/lib/parseOrder.ts';
import { buildResolver } from '../../../../frontend/mobile/src/lib/resolver/index.ts';
import { folded, phon, toned } from '../../../../frontend/mobile/src/lib/resolver/normalizer.ts';
import { Reranker } from '../../../../frontend/mobile/src/lib/resolver/rerank.ts';
import type { CatalogItem, QueryLine } from '../../../../frontend/mobile/src/lib/resolver/types.ts';
import { readPriorCatalogs } from './lib/corpus.ts';
import { mulberry32 } from './lib/stats.ts';
import { synthesize } from './lib/synth.ts';
import { WINNER_CONFIG, winnerGate } from './pipeline.ts';

const CATALOG = 'tap_hoa';
const NUMBER_WORDS = ['một', 'hai', 'ba', 'bốn', 'năm'];

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function main(): void {
  const seed = Number(arg('seed') ?? Math.floor(Math.random() * 1e9));
  const rng = mulberry32(seed);
  const catalog = readPriorCatalogs()[CATALOG];
  const nameOf = (id: string | null) => catalog.find((item) => item.id === id)?.name ?? null;

  const picked = pickTwo(catalog, rng);
  const spoken = picked.map((item, index) => ({
    item,
    qty: 1 + Math.floor(rng() * NUMBER_WORDS.length),
    heard: synthesize(item.name, { seed: seed + index }),
  }));
  const sentence = `cho ${spoken.map((s) => `${NUMBER_WORDS[s.qty - 1]} ${s.heard.text}`).join(' với ')}`;

  // An empty catalog makes the parser return every line as unknown: the spoken
  // span and quantity, which is all the resolver takes.
  const parsed = parseOrder(sentence, []);
  const resolver = buildResolver({ catalog, config: WINNER_CONFIG, gate: winnerGate(2), seeds: [] });
  const signals = signalReaders(catalog);

  const lines = parsed.unknown.map((line) => {
    // The parser can drop or merge lines, so each line is matched back to the
    // item whose heard text contains its span, not by position.
    const source = spoken.find((s) => folded(s.heard.text).includes(folded(line.name)));
    const query: QueryLine = { rawProductSpan: line.name, qty: line.qty, unit: null };
    const result = resolver.resolve(query);
    const top = result.topK.map((candidate) => ({
      productId: candidate.productId,
      name: nameOf(candidate.productId),
      reranked: candidate.score,
      rrf: candidate.scores.fused,
      retrieverScores: Object.fromEntries(Object.entries(candidate.scores).filter(([name]) => name !== 'fused')),
      ranks: candidate.ranks,
      E: signals.E.rerank(query, [candidate])[0].score,
      P: signals.P.rerank(query, [candidate])[0].score,
      T: signals.T.rerank(query, [candidate])[0].score,
    }));
    const gold = source?.item.id ?? null;
    return {
      spoken: source ? { said: source.item.name, qty: source.qty, heard: source.heard.text, noise: source.heard.rules } : null,
      parsed: { span: line.name, qty: line.qty },
      views: { toned: toned(line.name), folded: folded(line.name), phon: phon(line.name) },
      top,
      features: result.features,
      decision: result.decision,
      chosen: nameOf(result.productId),
      gold: nameOf(gold),
      afterTwoConfirmations: gold === null ? null : confirmTwice(resolver, query, gold, nameOf),
    };
  });

  const trace = { seed, catalog: CATALOG, catalogSize: catalog.length, sentence, normalized: parsed.normalizedText, lines };
  const out = arg('out');
  if (out) writeFileSync(out, JSON.stringify(trace, null, 1));
  console.log(JSON.stringify(trace, null, 1));
}

/** Two distinct items, picked by the seeded generator. */
function pickTwo(catalog: CatalogItem[], rng: () => number): CatalogItem[] {
  const first = Math.floor(rng() * catalog.length);
  let second = Math.floor(rng() * (catalog.length - 1));
  if (second >= first) second += 1;
  return [catalog[first], catalog[second]];
}

/** One single-signal reranker per signal, so each signal is read off the library's own code. */
function signalReaders(catalog: CatalogItem[]): Record<'E' | 'P' | 'T', Reranker> {
  const readers = {} as Record<'E' | 'P' | 'T', Reranker>;
  for (const signal of ['E', 'P', 'T'] as const) {
    readers[signal] = new Reranker({ pool: 1, weights: { [signal]: 1 } });
    for (const item of catalog) readers[signal].addDocument(item.name, item.id);
  }
  return readers;
}

/** The same line after the shop picked `gold` for it twice, as the alias table learns it. */
function confirmTwice(
  resolver: ReturnType<typeof buildResolver>,
  query: QueryLine,
  gold: string,
  nameOf: (id: string | null) => string | null,
): { decision: string; chosen: string | null; alias: number } {
  for (let i = 0; i < 2; i += 1) resolver.upsertAlias({ folded: folded(query.rawProductSpan), productId: gold, confirmedCount: 1 });
  const result = resolver.resolve(query);
  return { decision: result.decision, chosen: nameOf(result.productId), alias: result.features.alias };
}

main();
