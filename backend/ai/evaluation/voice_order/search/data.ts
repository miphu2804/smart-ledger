/**
 * Data for the auto-research loop: the dev set the search may read, and a
 * lockbox drawn from seeds nobody has used, scored once.
 *
 * The bake-off datasets hold 72 out-of-catalog lines, all in D1, so the false
 * autos that cost a shop money (writing a product it does not sell) are barely
 * measured. `buildOoc` adds them: it removes a share of a catalog's items and
 * asks for those items by a noised name, so the nearest remaining product is
 * usually a sibling flavour or size. That is the hard case, on purpose.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CatalogItem } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';
import { buildCatalogRegistry, buildD2, readPriorCatalogs, type CatalogRegistry, type EvalRecord, type Splits } from '../lib/corpus.ts';
import { buildD3, buildD3CatalogRegistry } from '../lib/d3.ts';
import { hashString } from '../lib/stats.ts';
import { rulesToTags, synthesize } from '../lib/synth.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(HERE, '../../../../..');
const DATA = join(REPO, 'backend/ai/evaluation/voice_order/data');

export interface Dataset {
  records: EvalRecord[];
  catalogs: CatalogRegistry;
}

/**
 * Out-of-catalog lines: for each source catalog, drop `fraction` of its items
 * (chosen by seeded hash) into a reduced catalog, and ask for each dropped item.
 */
export function buildOoc(sources: CatalogRegistry, seed: number, fraction: number): Dataset {
  const records: EvalRecord[] = [];
  const catalogs: CatalogRegistry = {};
  for (const [sourceId, items] of Object.entries(sources)) {
    const dropped = (item: CatalogItem) => hashString(`${seed}:${sourceId}:${item.id}`) / 2 ** 32 < fraction;
    const catalogId = `${sourceId}__ooc${seed}`;
    catalogs[catalogId] = items.filter((item) => !dropped(item));
    items.filter(dropped).forEach((item, index) => {
      const result = synthesize(item.name, { seed: seed + hashString(`${catalogId}:${index}`) });
      records.push({
        id: `ooc-${catalogId}-${item.id}`,
        dataset: 'ooc' as EvalRecord['dataset'],
        catalogId,
        goldProductId: null,
        tags: ['out_of_catalog', ...rulesToTags(result.rules)],
        rules: result.rules,
        category: `ooc::${sourceId}`,
        line: { rawProductSpan: result.text, qty: 1, unit: null },
        referenceSpan: item.name,
      });
    });
  }
  return { records, catalogs };
}

function readJsonl(path: string): EvalRecord[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as EvalRecord);
}

/** OOC lines go to calibration or test by catalog-item hash, 60/40 like the plan's split. */
function oocSplits(records: EvalRecord[], seed: number): Splits {
  const calibration: string[] = [];
  const test: string[] = [];
  for (const record of records) (hashString(`split:${seed}:${record.id}`) / 2 ** 32 < 0.6 ? calibration : test).push(record.id);
  return { ooc: { calibration, test } };
}

/** The dev set: the bake-off datasets under the lockbox2 partition, plus OOC lines. */
export function devData(protocol: { dev: { splits: string; oocSeed: number; oocFraction: number } }): Dataset & { splits: Splits } {
  const base = [readJsonl(join(DATA, 'd1.jsonl')), readJsonl(join(DATA, 'd2.jsonl')), readJsonl(join(DATA, 'd3.jsonl'))].flat();
  const catalogs = buildCatalogRegistry();
  const ooc = buildOoc(catalogs, protocol.dev.oocSeed, protocol.dev.oocFraction);
  const splits = JSON.parse(readFileSync(join(REPO, protocol.dev.splits), 'utf8')) as Splits;
  return {
    records: [...base, ...ooc.records],
    catalogs: { ...catalogs, ...ooc.catalogs },
    splits: { ...splits, ...oocSplits(ooc.records, protocol.dev.oocSeed) },
  };
}

/** The lockbox: fresh D2 noise, fresh D3 catalogs, and OOC lines over both. */
export function lockboxData(protocol: { lockbox: { d2Seed: number; d3Seed: number; oocSeed: number; oocFraction: number } }): Dataset {
  const { d2Seed, d3Seed, oocSeed, oocFraction } = protocol.lockbox;
  const prior = readPriorCatalogs();
  const d3Catalogs = Object.fromEntries(Object.entries(buildD3CatalogRegistry(d3Seed)).map(([id, items]) => [`${id}@${d3Seed}`, items]));
  const d3 = buildD3(d3Seed).map((record) => ({ ...record, id: `${record.id}@${d3Seed}`, catalogId: `${record.catalogId}@${d3Seed}` }));
  const d2 = buildD2(d2Seed).map((record) => ({ ...record, id: `${record.id}@${d2Seed}` }));
  const ooc = buildOoc({ ...prior, ...d3Catalogs }, oocSeed, oocFraction);
  return {
    records: [...d2, ...d3, ...ooc.records],
    catalogs: { ...prior, ...d3Catalogs, ...ooc.catalogs },
  };
}
