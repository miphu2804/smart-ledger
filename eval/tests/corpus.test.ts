import { test } from 'node:test';
import assert from 'node:assert/strict';

import { loadCatalogs, buildD1Text, buildD2, buildSplits, buildCatalogRegistry } from '../lib/corpus.ts';
import type { EvalRecord } from '../lib/corpus.ts';

const CLOSED_VOCAB = new Set(['loanword', 'dialect', 'near_duplicate', 'multi_line', 'out_of_catalog', 'clean']);

test('corpus: loadCatalogs returns every catalog (real + D3) with stringified ids', () => {
  const catalogs = loadCatalogs();
  assert.deepEqual(
    Object.keys(catalogs).sort(),
    ['ca_phe', 'd3_100', 'd3_1000', 'd3_20000', 'd3_5000', 'quan_com', 'tap_hoa'],
  );
  assert.equal(catalogs.tap_hoa.length, 30);
  assert.equal(catalogs.ca_phe.length, 20);
  assert.equal(catalogs.quan_com.length, 18);
  assert.equal(catalogs.d3_100.length, 100);
  assert.equal(catalogs.d3_20000.length, 20000);
  for (const items of Object.values(catalogs)) {
    for (const item of items) assert.equal(typeof item.id, 'string');
  }
});

test('corpus: the registry adds the four D3 catalogs', () => {
  const registry = buildCatalogRegistry();
  assert.deepEqual(
    Object.keys(registry).sort(),
    ['ca_phe', 'd3_100', 'd3_1000', 'd3_20000', 'd3_5000', 'quan_com', 'tap_hoa'],
  );
});

test('corpus: buildD1Text emits records with a non-empty span and reports drops', () => {
  const { records, dropped, recordsWithoutMatchedItem } = buildD1Text();
  assert.ok(records.length > 0);
  assert.equal(typeof dropped, 'number');
  assert.equal(typeof recordsWithoutMatchedItem, 'number');
  for (const record of records) {
    assert.notEqual(record.line.rawProductSpan.trim(), '');
    assert.equal(record.dataset, 'd1');
    // A null gold id is only ever an out-of-catalog or ambiguous line.
    if (record.goldProductId === null) {
      assert.ok(record.tags.includes('out_of_catalog') || record.tags.includes('near_duplicate'));
    }
  }
});

test('corpus: buildD2 never emits an empty span', () => {
  const records = buildD2();
  assert.ok(records.length > 0);
  for (const record of records) {
    assert.notEqual(record.line.rawProductSpan.trim(), '', `empty span for ${record.id}`);
    assert.notEqual(record.goldProductId, null);
    for (const tag of record.tags) assert.ok(CLOSED_VOCAB.has(tag), `bad tag ${tag}`);
  }
});

test('corpus: buildSplits never leaks a family or a source set across the boundary', () => {
  const record = (
    id: string,
    dataset: 'd1' | 'd2' | 'd3',
    catalogId: string,
    category: string,
    family?: string,
  ): EvalRecord => ({
    id,
    dataset,
    catalogId,
    category,
    family,
    goldProductId: '1',
    tags: [],
    line: { rawProductSpan: 'x' },
    referenceSpan: 'x',
  });

  // Four components of equal size. `famX` spans c1::cat1 and c1::cat2, so those
  // two source sets merge into one component via the family edge.
  const records: EvalRecord[] = [
    record('a1', 'd1', 'c1', 'cat1'),
    record('a2', 'd1', 'c1', 'cat1'),
    record('a3', 'd1', 'c1', 'cat1'),
    record('a4', 'd1', 'c1', 'cat1', 'famX'),
    record('b1', 'd1', 'c1', 'cat2', 'famX'),
    record('b2', 'd1', 'c1', 'cat2'),
    record('b3', 'd1', 'c1', 'cat2'),
    record('b4', 'd1', 'c1', 'cat2'),
    record('c1', 'd2', 'c2', 'cat1'),
    record('c2', 'd2', 'c2', 'cat1'),
    record('c3', 'd2', 'c2', 'cat1'),
    record('c4', 'd2', 'c2', 'cat1'),
    record('d1', 'd3', 'd3_100', 'd3', 'famA'),
    record('d2', 'd3', 'd3_100', 'd3', 'famA'),
    record('d3', 'd3', 'd3_100', 'd3', 'famB'),
    record('d4', 'd3', 'd3_100', 'd3', 'famB'),
    record('e1', 'd1', 'c3', 'cat1'),
    record('e2', 'd1', 'c3', 'cat1'),
    record('e3', 'd1', 'c3', 'cat1'),
    record('e4', 'd1', 'c3', 'cat1'),
  ];
  const splits = buildSplits(records);

  const side = new Map<string, string>();
  for (const bucket of Object.values(splits)) {
    for (const id of bucket.calibration) side.set(id, 'calibration');
    for (const id of bucket.test) side.set(id, 'test');
  }

  // Every record appears exactly once.
  assert.equal(side.size, records.length);

  // A family never crosses the boundary.
  assert.equal(side.get('a4'), side.get('b1'), 'famX crosses the split');
  assert.equal(side.get('d1'), side.get('d2'), 'famA crosses the split');
  assert.equal(side.get('d3'), side.get('d4'), 'famB crosses the split');

  // A source set never crosses the boundary (within or across datasets).
  const sources: Array<[string, string[]]> = [
    ['c1::cat1', ['a1', 'a2', 'a3', 'a4']],
    ['c1::cat2', ['b1', 'b2', 'b3', 'b4']],
    ['c2::cat1', ['c1', 'c2', 'c3', 'c4']],
    ['d3_100::d3', ['d1', 'd2', 'd3', 'd4']],
    ['c3::cat1', ['e1', 'e2', 'e3', 'e4']],
  ];
  for (const [key, ids] of sources) {
    assert.equal(new Set(ids.map((id) => side.get(id))).size, 1, `source ${key} crosses the split`);
  }

  // Sizes are roughly 60/40 overall.
  const cal = records.filter((r) => side.get(r.id) === 'calibration').length;
  assert.ok(cal / records.length >= 0.4 && cal / records.length <= 0.85, `calibration share ${cal}/${records.length}`);
});

test('corpus: buildSplits keeps real D1/D2 source sets together', () => {
  const d1 = buildD1Text().records;
  const d2 = buildD2();
  const splits = buildSplits([...d1, ...d2]);
  const side = new Map<string, string>();
  for (const [dataset, bucket] of Object.entries(splits)) {
    for (const id of bucket.calibration) side.set(id, `${dataset}:calibration`);
    for (const id of bucket.test) side.set(id, `${dataset}:test`);
  }
  const sourceSide = new Map<string, string>();
  for (const record of [...d1, ...d2]) {
    const key = `${record.catalogId}::${record.category ?? ''}`;
    const which = (side.get(record.id) as string).split(':')[1];
    if (sourceSide.has(key)) assert.equal(sourceSide.get(key), which, `source ${key} crosses the split`);
    else sourceSide.set(key, which);
  }

  // D1 and D2 share their source sets, so they are split as one pool and each
  // reaches roughly 60/40 rather than landing entirely on one side.
  for (const dataset of ['d1', 'd2'] as const) {
    const bucket = splits[dataset];
    const share = bucket.calibration.length / (bucket.calibration.length + bucket.test.length);
    assert.ok(share >= 0.4 && share <= 0.8, `${dataset} calibration share ${share}`);
  }
});
