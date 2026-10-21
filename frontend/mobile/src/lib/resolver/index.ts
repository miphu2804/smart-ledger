/**
 * Resolver assembly (plan sections 3, 5 and 9).
 *
 * `buildResolver` is the composition root: it builds every retriever once from
 * the catalog, wires the alias table in front of them, and returns the handle
 * the app and the harness both call. Everything below it is pure; the only
 * state is the catalog and alias table this function is handed.
 *
 * The feedback loop closes here. When a shop corrects a match, `upsertAlias`
 * both records the correction and indexes the corrected phrase as an extra
 * document, so the next utterance that sounds like it reaches the right
 * product without waiting for a rebuild.
 */

import { AliasTable } from './alias.ts';
import { decide, gateProbability } from './gate.ts';
import { fuse, scalesOf } from './fusion.ts';
import { folded } from './normalizer.ts';
import { SEED_ALIASES, type SeedAlias } from './seed_aliases.vi.ts';
import { RetrieverAnd } from './retrieverAnd.ts';
import { RetrieverB } from './retrieverB.ts';
import { RetrieverE } from './retrieverE.ts';
import { RetrieverP } from './retrieverP.ts';
import { RetrieverQ } from './retrieverQ.ts';
import type {
  AliasEntry,
  CatalogItem,
  GateConfig,
  GateFeatures,
  QueryLine,
  ResolveResult,
  Resolver,
  ResolverConfig,
  Retriever,
} from './types.ts';

export interface BuildResolverOptions {
  catalog: CatalogItem[];
  config: ResolverConfig;
  gate: GateConfig;
  /** Aliases already confirmed by this shop. */
  aliases?: AliasEntry[];
  /** Seed aliases to install when their product is in the catalog. Defaults to the web regex cases. */
  seeds?: SeedAlias[];
}

/** Syllables in the folded span, which is what `len_q` counts. */
function syllableCount(text: string): number {
  return folded(text).split(' ').filter(Boolean).length;
}

/** Jaccard overlap of two id lists taken as sets. */
function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const id of setA) if (setB.has(id)) intersection += 1;
  return intersection / (setA.size + setB.size - intersection);
}

/** Population standard deviation, used for the `disp` feature. */
function dispersion(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

/** Build every retriever the config names, in the config's order. */
function buildRetrievers(catalog: CatalogItem[], config: ResolverConfig): Retriever[] {
  // E and P need candidate ids once the catalog is too large to brute-force, and
  // Q is the cheap filter the plan puts in front of them. The retriever instance
  // is resolved lazily because the list below is still being filled.
  //
  // Whether to inject the provider at all is decided up front from the config:
  // an E-only config has no Q to ask, and a provider that always returns [] would
  // make E score nothing above `eBruteMax` and report that as "no match" rather
  // than brute-forcing as its own contract says it will.
  const built: Retriever[] = [];
  const qName = config.retrievers.find((name) => name.startsWith('Q'));
  const provider =
    qName === undefined
      ? undefined
      : (line: QueryLine, k: number): string[] =>
          built.find((retriever) => retriever.name === qName)?.retrieve(line, k).map((hit) => hit.productId) ?? [];

  for (const name of config.retrievers) {
    switch (name) {
      case 'E':
        built.push(new RetrieverE(catalog, { eBruteMax: config.eBruteMax, candidates: provider }));
        break;
      case 'P':
        built.push(new RetrieverP(catalog, { pBruteMax: config.eBruteMax, candidates: provider }));
        break;
      case 'Q-cos':
        built.push(new RetrieverQ(catalog, { scorer: 'cos', qMaxEditDistance: config.qMaxEditDistance, topK: config.topK }));
        break;
      case 'Q-bm25':
        built.push(new RetrieverQ(catalog, { scorer: 'bm25', qMaxEditDistance: config.qMaxEditDistance, topK: config.topK }));
        break;
      case 'B':
        built.push(new RetrieverB(catalog, { useUnitStoplist: config.useUnitStoplist }));
        break;
      case 'AND':
        built.push(new RetrieverAnd(catalog));
        break;
    }
  }
  return built;
}

/**
 * Seed aliases whose product is actually in this catalog.
 *
 * A seed names a product loosely ("Bia Tiger"), while the catalog row is
 * spelled out ("Bia Tiger lon 330ml"), so an exact folded-name match is not
 * enough. A seed is installed only when exactly one catalog item matches, by
 * exact name or by name prefix: when two flavours of the same brand match,
 * picking one would be a guess, and the shop never taught the resolver which.
 */
function installSeeds(catalog: CatalogItem[], seeds: SeedAlias[], trustedAt: number): AliasEntry[] {
  const names = catalog.map((item) => ({ id: item.id, folded: folded(item.name) }));

  const entries: AliasEntry[] = [];
  for (const seed of seeds) {
    const needle = folded(seed.productName);
    const exact = names.filter((entry) => entry.folded === needle);
    const matches = exact.length > 0 ? exact : names.filter((entry) => entry.folded.startsWith(needle));
    if (matches.length === 1) {
      entries.push({ folded: seed.folded, productId: matches[0].id, confirmedCount: trustedAt });
    }
  }
  return entries;
}

/**
 * Build the resolver handle.
 *
 * The returned `resolve` is synchronous and does no I/O, which is what lets it
 * run on the orb-release path; the harness calls the same function offline.
 */
export function buildResolver(options: BuildResolverOptions): Resolver {
  const { catalog, config, gate } = options;

  // `max` picks the largest score, so a config that mixes a bounded similarity
  // with an unbounded BM25 sum would let the wider axis decide every ranking.
  // No shipped row mixes them; refusing here keeps a future one from silently
  // measuring the wrong thing.
  const scales = scalesOf(config.retrievers);
  if (config.fusion === 'max' && scales.length > 1) {
    throw new Error(`max fusion needs every retriever on one score scale, got ${scales.join(' and ')}`);
  }

  const retrievers = buildRetrievers(catalog, config);
  const productById = new Map(catalog.map((item) => [item.id, item]));

  // The shop's own confirmations are the better evidence, so they are laid over
  // the seeds rather than under them: a seed must never overwrite what this shop
  // taught the resolver. An alias whose product is no longer in the catalog is
  // dropped, because indexing it would let a deleted product be auto-applied.
  const known = new Set(catalog.map((item) => item.id));
  const table = new AliasTable([
    ...installSeeds(catalog, options.seeds ?? SEED_ALIASES, gate.aliasMinConfirmations),
    ...(options.aliases ?? []).filter((entry) => known.has(entry.productId)),
  ]);

  // Which (phrase, product) pairs are already documents. Repeating a confirmation
  // must not add the same document twice, which would skew the retrievers'
  // document frequencies, but pointing a phrase at a *different* product must
  // index it, or the correction never takes effect.
  //
  // The document a re-pointed phrase had for its old product is left where it is:
  // removing one needs an index delete the retrievers do not have. Trust is
  // decided by the alias table, so a stale document can only add a candidate.
  const indexed = new Set<string>();
  function indexAlias(entry: AliasEntry): void {
    const key = `${entry.productId}|${entry.folded}`;
    if (indexed.has(key)) return;
    indexed.add(key);
    for (const retriever of retrievers) retriever.addDocument(entry.folded, entry.productId);
  }
  for (const entry of table.entries()) indexAlias(entry);

  function resolve(line: QueryLine): ResolveResult {
    const hits: Record<string, { productId: string; score: number }[]> = {};
    for (const retriever of retrievers) hits[retriever.name] = retriever.retrieve(line, config.topK);

    const topK = fuse(hits, config);
    const top1 = topK[0];
    const s1 = top1?.score ?? 0;
    // A missing runner-up is the strongest possible margin, not the weakest. The
    // old default of `s1` made `margin` 0, so the one result with nothing to be
    // confused with could never clear the gate's margin rule.
    const s2 = topK[1]?.score ?? 0;

    const returning = retrievers.filter((retriever) => (hits[retriever.name] ?? []).length > 0);
    const agreeing = returning.filter((retriever) => hits[retriever.name][0].productId === top1?.productId);
    const eHits = hits.E ?? [];
    const qName = Object.keys(hits).find((name) => name.startsWith('Q'));
    const qHits = qName ? hits[qName] : undefined;

    const spanFolded = folded(line.rawProductSpan);
    const aliasEntry = table.lookup(spanFolded);
    const aliasTrusted = table.isTrusted(spanFolded, gate.aliasMinConfirmations);

    const unit = line.unit ?? null;
    const candidateUnit = top1 ? (productById.get(top1.productId)?.unit ?? null) : null;
    // Catalog units arrive toned ("hộp", "gói") while the spoken unit is folded
    // ("hop", "goi"), so comparing them raw called every same-unit pair a
    // mismatch and the gate then refused to auto-apply any of them.
    const unitOk: GateFeatures['unit_ok'] =
      unit === null || candidateUnit === null ? 'unknown' : folded(unit) === folded(candidateUnit) ? 'ok' : 'mismatch';

    const features: GateFeatures = {
      s1,
      s2,
      margin: s1 - s2,
      disp: dispersion(topK.map((candidate) => candidate.score)),
      agree: returning.length === 0 ? 0 : agreeing.length / returning.length,
      // Only E and Q are compared, per the plan's definition of `jacc`. With
      // one of them absent there is no disagreement to measure, so it is 1.
      jacc: eHits.length === 0 || qHits === undefined ? 1 : jaccard(eHits.map((hit) => hit.productId), qHits.map((hit) => hit.productId)),
      unit_ok: unitOk,
      alias: aliasTrusted && aliasEntry !== undefined && aliasEntry.productId === top1?.productId ? 1 : 0,
      len_q: syllableCount(line.rawProductSpan),
      stt_conf: null,
    };

    const decision = decide(features, gate);
    return { decision, productId: decision === 'AUTO' ? (top1?.productId ?? null) : null, topK, features };
  }

  function upsertAlias(entry: AliasEntry): void {
    table.confirm(entry.folded, entry.productId);
    indexAlias(entry);
  }

  return { resolve, upsertAlias };
}

/** The probability the gate reported for a result, when G2 is in use. */
export function probabilityOf(result: ResolveResult, gate: GateConfig): number | undefined {
  if (gate.gate !== 'G2' || !gate.model) return undefined;
  return gateProbability(result.features, gate.model);
}
