/**
 * Dataset loaders and builders for the offline eval harness (plan section 7.1).
 *
 * All builders are pure functions returning the `CONTRACT.md` record shape.
 * `writeDatasets` is the one function with side effects: it writes the JSON /
 * JSONL artifacts the harness reads under `backend/ai/evaluation/voice_order/data/`.
 *
 * Datasets:
 *   D1-text — the written reference transcripts, segmented by the real
 *             `parseOrder`, as the clean-text condition. There is no recorded
 *             audio in this repository, so this is NOT real ASR data.
 *   D2      — the clean product spans (the gold product's name) rewritten by
 *             the `synth.ts` confusion simulator; isolates noise from
 *             segmentation.
 *   D3      — one record per item of each synthetic stress catalog, name
 *             lightly noised (see `d3.ts`).
 *
 * `parseOrder` exposes no per-line product substring (its `ParsedOrder` has no
 * `rawProductSpan`), so D1-text takes the span for an in-catalog gold line from
 * the matched catalog name and the span for a non-catalog gold line from
 * `parseOrder`'s `unknown` / `disambiguations` / `missingQuantityItems` output.
 * See `backend/ai/evaluation/voice_order/notes/agent-c-data.md` for the full reasoning.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { parseOrder } from '../../../../../frontend/mobile/src/lib/parseOrder.ts';
import type { CatalogItem } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';
import { synthesize, rulesToTags } from './synth.ts';
import { buildD3, buildD3CatalogRegistry } from './d3.ts';

export type DatasetId = 'd1' | 'd2' | 'd3';

/** One eval record, per `CONTRACT.md`. `rules` and `category` are optional extensions. */
export interface EvalRecord {
  id: string;
  dataset: DatasetId;
  catalogId: string;
  /** `null` means the gold product is out of catalog (gold NEW). */
  goldProductId: string | null;
  /** Near-duplicate family, when the item has one. */
  family?: string;
  tags: string[];
  /** Fired confusion rules (D2/D3). The closed-vocabulary tags live in `tags`. */
  rules?: string[];
  /** Source set for the split (`catalog::category`). */
  category?: string;
  line: { rawProductSpan: string; qty?: number; unit?: string | null };
  referenceSpan: string;
}

export type CatalogRegistry = Record<string, CatalogItem[]>;

/** Shape of one line in `prior_*.jsonl`. */
interface PriorGoldLine {
  product_id: number | null;
  qty?: number | null;
  options?: number[];
}

/** Shape of one record in `prior_*.jsonl`. */
export interface PriorRecord {
  id: string;
  split?: string;
  catalog: string;
  category: string;
  text: string;
  lines: PriorGoldLine[];
  expenses?: unknown[];
  note?: string;
}

/** A catalog item as `prior_catalogs.json` stores it (numeric id, with price). */
export interface RawCatalogItem {
  id: number;
  name: string;
  price: number;
}

const DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const PRIOR_CATALOGS = join(DATA_DIR, 'prior_catalogs.json');
const PRIOR_CORPUS_FILES = ['prior_free.jsonl', 'prior_free2.jsonl', 'prior_gold.jsonl', 'prior_holdout3.jsonl'];

// ─── Loaders ─────────────────────────────────────────────────────────────────

/** The three real catalogs as stored, keeping numeric ids and prices. */
export function readPriorCatalogsRaw(): Record<string, RawCatalogItem[]> {
  return JSON.parse(readFileSync(PRIOR_CATALOGS, 'utf8')) as Record<string, RawCatalogItem[]>;
}

/** The three real catalogs with ids stringified into the frozen `CatalogItem` shape. */
export function readPriorCatalogs(): CatalogRegistry {
  const raw = readPriorCatalogsRaw();
  const registry: CatalogRegistry = {};
  for (const [catalogId, items] of Object.entries(raw)) {
    registry[catalogId] = items.map((item) => ({ id: String(item.id), name: item.name }));
  }
  return registry;
}

/** Every prior corpus record, in file order. */
export function readPriorRecords(): PriorRecord[] {
  const records: PriorRecord[] = [];
  for (const file of PRIOR_CORPUS_FILES) {
    const text = readFileSync(join(DATA_DIR, file), 'utf8').trim();
    if (!text) continue;
    for (const line of text.split('\n')) records.push(JSON.parse(line) as PriorRecord);
  }
  return records;
}

/**
 * The full catalog registry the harness reads: the three real catalogs plus the
 * four D3 stress catalogs, ids stringified into the frozen `CatalogItem` shape.
 * A pure read — it does not write `backend/ai/evaluation/voice_order/data/catalogs.json`; `writeDatasets`
 * owns that side effect. (Thin alias of `buildCatalogRegistry`; the name stays
 * because `runner/run.ts` imports it.)
 */
export function loadCatalogs(): CatalogRegistry {
  return buildCatalogRegistry();
}

/** The full registry the harness reads: three real catalogs plus four D3 catalogs. */
export function buildCatalogRegistry(): CatalogRegistry {
  return { ...readPriorCatalogs(), ...buildD3CatalogRegistry() };
}

/** Write `backend/ai/evaluation/voice_order/data/catalogs.json`. */
export function writeCatalogRegistry(path = join(DATA_DIR, 'catalogs.json')): void {
  writeFileSync(path, JSON.stringify(buildCatalogRegistry()));
}

// ─── D1-text ─────────────────────────────────────────────────────────────────

export interface D1TextResult {
  records: EvalRecord[];
  /** Records with at least one gold line that `parseOrder` recognised nothing in. */
  dropped: number;
  /** Records with at least one gold line that `parseOrder` matched no in-catalog item in. */
  recordsWithoutMatchedItem: number;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((x) => set.has(x));
}

/**
 * D1-text: one record per gold line, with the span supplied by `parseOrder`.
 *
 * A record is dropped (and counted) when `parseOrder` recognises no order line
 * at all. In-catalog gold lines take the matched catalog name as their span;
 * non-catalog gold lines (ambiguous ones carry `options`, out-of-catalog ones do
 * not) take the spoken name `parseOrder` reported for them.
 */
export function buildD1Text(): D1TextResult {
  const raw = readPriorCatalogsRaw();
  const records: EvalRecord[] = [];
  let dropped = 0;
  let recordsWithoutMatchedItem = 0;

  for (const record of readPriorRecords()) {
    const catalog = raw[record.catalog];
    if (!catalog) continue;
    if (record.lines.length === 0) continue; // nothing to score

    const catalogNames = new Map(catalog.map((item) => [item.id, item.name]));
    const parsed = parseOrder(record.text, catalog);
    const disambiguations = parsed.disambiguations ?? [];
    const recognized =
      parsed.items.length + parsed.unknown.length + disambiguations.length + (parsed.missingQuantityItems?.length ?? 0);
    if (recognized === 0) {
      dropped += 1;
      continue;
    }
    if (parsed.items.length === 0) recordsWithoutMatchedItem += 1;

    // Spoken-name pool for non-catalog gold lines, in a stable order.
    const pool: Array<{ name: string; options: string[] | null }> = [
      ...disambiguations.map((d) => ({ name: d.rawName, options: d.options.map((o) => String(o.product_id)) })),
      ...parsed.unknown.map((u) => ({ name: u.name, options: null })),
      ...(parsed.missingQuantityItems ?? []).map((name) => ({ name, options: null })),
    ];
    const used = new Set<number>();

    record.lines.forEach((line, index) => {
      let span: string;
      let goldProductId: string | null;
      let tags: string[];
      if (line.product_id !== null) {
        span = catalogNames.get(line.product_id) ?? record.text;
        goldProductId = String(line.product_id);
        tags = [];
      } else {
        goldProductId = null;
        tags = line.options ? ['near_duplicate'] : ['out_of_catalog'];
        let pick = -1;
        if (line.options) {
          const wanted = line.options.map(String);
          pick = pool.findIndex((entry, i) => !used.has(i) && entry.options !== null && sameSet(entry.options, wanted));
        }
        if (pick < 0) pick = pool.findIndex((_, i) => !used.has(i));
        if (pick >= 0) {
          used.add(pick);
          span = pool[pick].name;
        } else {
          span = record.text;
        }
      }
      records.push({
        id: `d1-${record.id}-${index}`,
        dataset: 'd1',
        catalogId: record.catalog,
        goldProductId,
        category: record.category,
        tags,
        line: { rawProductSpan: span, qty: line.qty ?? undefined, unit: null },
        referenceSpan: span,
      });
    });
  }

  return { records, dropped, recordsWithoutMatchedItem };
}

// ─── D2 ──────────────────────────────────────────────────────────────────────

/** Deterministic 32-bit string hash, for per-record seeds. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * D2: the clean product span (the gold product's name) rewritten by the
 * confusion simulator, one record per in-catalog gold line. Non-catalog gold
 * lines are skipped — D2 isolates noise on clean catalog names, not segmentation.
 */
export function buildD2(seed = 20260101): EvalRecord[] {
  const raw = readPriorCatalogsRaw();
  const records: EvalRecord[] = [];
  for (const record of readPriorRecords()) {
    const catalog = raw[record.catalog];
    if (!catalog) continue;
    const catalogNames = new Map(catalog.map((item) => [item.id, item.name]));
    record.lines.forEach((line, index) => {
      if (line.product_id === null) return;
      const name = catalogNames.get(line.product_id);
      if (name === undefined) return;
      const result = synthesize(name, { seed: seed + hashString(record.id) + index });
      records.push({
        id: `d2-${record.id}-${index}`,
        dataset: 'd2',
        catalogId: record.catalog,
        goldProductId: String(line.product_id),
        category: record.category,
        tags: rulesToTags(result.rules),
        rules: result.rules,
        line: { rawProductSpan: result.text, qty: line.qty ?? undefined, unit: null },
        referenceSpan: name,
      });
    });
  }
  return records;
}

// ─── Splits ──────────────────────────────────────────────────────────────────

export type Splits = Record<string, { calibration: string[]; test: string[] }>;

/** The seed that draws the second holdout, `backend/ai/evaluation/voice_order/data/splits_lockbox2.json`. */
export const LOCKBOX2_SEED = 20261021;

/**
 * Union-find over one pool of records, then a greedy 60/40 assignment of whole
 * components.
 *
 * A seed moves the calibration/test boundary and reorders the components, and
 * the greedy fill below takes a prefix of the ordered list, so the two together
 * land on a different set. Both matter: a boundary shift alone only moves the
 * components sitting at the edge, and D3's four catalogs are unequal enough
 * that its boundary cannot move at all.
 *
 * Leaving the seed out reproduces the frozen `splits.json` exactly, because it
 * keeps the comparator that drew that file. That is load-bearing rather than
 * tidy: `writeDatasets` rewrites `splits.json` from this function.
 *
 * The seeded draw is a second partition of the same families, not fresh data,
 * and it exists because a hypothesis formed after reading the first holdout
 * cannot be confirmed on it. It is not fully unseen either — the two draws
 * share families, and 1059 of the 1544 test lines bakeoff_v3 scored on the
 * seeded draw were already test lines of the frozen one. D3 is the extreme
 * case: its four catalogs are atomic source sets and largest-first is what
 * keeps it balanced, so its sides do not change at all and its numbers are a
 * re-measurement rather than fresh evidence.
 */
function splitPool(records: EvalRecord[], seed?: number): Map<string, boolean> {
  const parent = new Map<string, string>();
  for (const record of records) parent.set(record.id, record.id);
  const find = (x: string): string => {
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const firstByFamily = new Map<string, string>();
  const firstBySource = new Map<string, string>();
  for (const record of records) {
    if (record.family) {
      // A near-duplicate family is scoped to its catalog: two items in
      // different catalogs are not each other's hard negatives. D3 reuses the
      // same brand slug across its four catalogs, so a global key would merge
      // every D3 record into one component and collapse the split.
      const familyKey = `${record.catalogId}::${record.family}`;
      const seen = firstByFamily.get(familyKey);
      if (seen) union(record.id, seen);
      else firstByFamily.set(familyKey, record.id);
    }
    const sourceKey = `${record.catalogId}::${record.category ?? ''}`;
    const seenSource = firstBySource.get(sourceKey);
    if (seenSource) union(record.id, seenSource);
    else firstBySource.set(sourceKey, record.id);
  }

  const components = new Map<string, string[]>();
  for (const record of records) {
    const root = find(record.id);
    const list = components.get(root);
    if (list) list.push(record.id);
    else components.set(root, [record.id]);
  }

  // The order components are offered to the calibration side in decides the
  // partition, because the fill below takes a prefix of it.
  //
  // Largest-first is what balances a pool of a few very unequal components:
  // D3's four catalogs are 100, 1 000, 5 000 and 20 000 records, and under any
  // other order the test side is either nearly empty or holds the whole
  // 20 000-item catalog. A pool with many similar components balances under any
  // order, and D1+D2 is 69 of them, so a seed can genuinely re-draw that one.
  const byLargest = components.size <= 8;
  const ordered = [...components.values()]
    .map((ids) => ({ ids, min: ids.reduce((a, b) => (a < b ? a : b)) }))
    .sort((a, b) => {
      // Without a seed this is exactly the comparator that drew the frozen
      // `splits.json`, and it has to stay that way: `writeDatasets` regenerates
      // that file from this function, so any other order silently re-partitions
      // a split the plan marks as protected.
      if (seed === undefined) return b.ids.length - a.ids.length || (a.min < b.min ? -1 : a.min > b.min ? 1 : 0);
      if (byLargest && b.ids.length !== a.ids.length) return b.ids.length - a.ids.length;
      return hashString(`${seed}:${a.min}`) - hashString(`${seed}:${b.min}`) || (a.min < b.min ? -1 : 1);
    });

  // Without a seed this is the plan's 60/40 exactly. A seed shifts it by up to
  // six points and reorders the components by hash; the reordering is what does
  // most of the re-partitioning, since the fill below takes a prefix.
  const share = seed === undefined ? 0.6 : 0.6 + ((hashString(String(seed)) % 13) - 6) / 100;
  const target = Math.round(records.length * share);
  const side = new Map<string, boolean>();
  let calCount = 0;
  for (const component of ordered) {
    const isCalibration = calCount < target;
    for (const id of component.ids) side.set(id, isCalibration);
    if (isCalibration) calCount += component.ids.length;
  }
  return side;
}

/**
 * Group split, ~60/40, by product family **and** by source set
 * (`catalog::category`): a family or a source set never lands on both sides.
 *
 * Datasets whose source sets overlap (D1 and D2, both built from the same
 * corpus) are split as one **pool**, so a source is never on both sides across
 * them. Independent datasets (D3) are split on their own — otherwise one
 * 20 000-item catalog, being a single atomic source set, would swallow the
 * whole global calibration budget and leave the other datasets unbalanced.
 */
export function buildSplits(records: EvalRecord[], seed?: number): Splits {
  // Union datasets that share any source set.
  const dsParent = new Map<string, string>();
  for (const record of records) if (!dsParent.has(record.dataset)) dsParent.set(record.dataset, record.dataset);
  const dsFind = (x: string): string => {
    let root = x;
    while (dsParent.get(root) !== root) root = dsParent.get(root) as string;
    return root;
  };
  const dsUnion = (a: string, b: string): void => {
    const ra = dsFind(a);
    const rb = dsFind(b);
    if (ra !== rb) dsParent.set(ra, rb);
  };
  const sourceOwner = new Map<string, string>();
  for (const record of records) {
    const key = `${record.catalogId}::${record.category ?? ''}`;
    const owner = sourceOwner.get(key);
    if (owner) dsUnion(owner, record.dataset);
    else sourceOwner.set(key, record.dataset);
  }

  const pools = new Map<string, EvalRecord[]>();
  for (const record of records) {
    const pool = dsFind(record.dataset);
    const list = pools.get(pool);
    if (list) list.push(record);
    else pools.set(pool, [record]);
  }

  const side = new Map<string, boolean>();
  for (const pool of pools.values()) {
    for (const [id, isCalibration] of splitPool(pool, seed)) side.set(id, isCalibration);
  }

  const splits: Splits = {};
  for (const record of records) {
    const bucket = (splits[record.dataset] ??= { calibration: [], test: [] });
    (side.get(record.id) ? bucket.calibration : bucket.test).push(record.id);
  }
  return splits;
}

// ─── Artifact writing ────────────────────────────────────────────────────────

function writeJsonl(path: string, records: EvalRecord[]): void {
  writeFileSync(path, `${records.map((r) => JSON.stringify(r)).join('\n')}\n`);
}

export interface DatasetCounts {
  d1: number;
  d2: number;
  d3: number;
  d1Dropped: number;
  d1WithoutMatchedItem: number;
}

/** Build every dataset and write the artifacts the harness reads. */
export function writeDatasets(outDir = DATA_DIR): DatasetCounts {
  writeCatalogRegistry(join(outDir, 'catalogs.json'));

  const d1 = buildD1Text();
  const d2 = buildD2();
  const d3 = buildD3();

  writeJsonl(join(outDir, 'd1.jsonl'), d1.records);
  writeJsonl(join(outDir, 'd2.jsonl'), d2);
  writeJsonl(join(outDir, 'd3.jsonl'), d3);
  const all = [...d1.records, ...d2, ...d3];
  writeFileSync(join(outDir, 'splits.json'), JSON.stringify(buildSplits(all), null, 0));
  writeFileSync(join(outDir, 'splits_lockbox2.json'), JSON.stringify(buildSplits(all, LOCKBOX2_SEED), null, 0));

  // The D1 counters never leave `buildD1Text` otherwise, so persist them here
  // for the runner to read instead of hardcoding a placeholder.
  const counts: DatasetCounts = {
    d1: d1.records.length,
    d2: d2.length,
    d3: d3.length,
    d1Dropped: d1.dropped,
    d1WithoutMatchedItem: d1.recordsWithoutMatchedItem,
  };
  writeFileSync(join(outDir, 'counts.json'), `${JSON.stringify(counts, null, 2)}\n`);
  return counts;
}
