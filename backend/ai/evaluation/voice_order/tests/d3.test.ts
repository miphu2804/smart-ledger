import { test } from 'node:test';
import assert from 'node:assert/strict';

import { D3_SIZES, generateD3Catalog, buildD3, buildD3CatalogRegistry } from '../lib/d3.ts';
import type { CatalogItem } from '../../../../../frontend/mobile/src/lib/resolver/types.ts';

/** The three slots a D3 name is built from. */
function slots(item: CatalogItem): { brand: string; flavour: string; size: string } {
  const size = item.name.split(' ').pop() as string;
  const flavour = item.name.slice((item.brand as string).length + 1, item.name.length - size.length - 1);
  return { brand: item.brand as string, flavour, size };
}

function familyGroups(items: CatalogItem[]): Map<string, CatalogItem[]> {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const key = item.family as string;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

test('d3: catalog sizes are exactly as requested', () => {
  for (const n of D3_SIZES) {
    assert.equal(generateD3Catalog(n, 0).length, n);
  }
});

test('d3: the registry holds four catalogs keyed d3_<N>', () => {
  const registry = buildD3CatalogRegistry(0);
  assert.deepEqual(Object.keys(registry).sort(), ['d3_100', 'd3_1000', 'd3_20000', 'd3_5000']);
  assert.equal(registry.d3_100.length, 100);
  assert.equal(registry.d3_20000.length, 20000);
});

test('d3: generation is deterministic given a seed', () => {
  const a = generateD3Catalog(1000, 7);
  const b = generateD3Catalog(1000, 7);
  assert.deepEqual(a, b);
  const c = generateD3Catalog(1000, 8);
  assert.notDeepEqual(a, c);
});

test('d3: families are real near-duplicates (share a brand, some pair differs in one slot)', () => {
  for (const n of [100, 1000]) {
    const items = generateD3Catalog(n, 0);
    const groups = familyGroups(items);
    assert.ok(groups.size >= 2, `expected several families at N=${n}`);

    let largest: CatalogItem[] = [];
    for (const group of groups.values()) if (group.length > largest.length) largest = group;
    assert.ok(largest.length >= 2, `expected a family with >= 2 members at N=${n}`);

    // Every member of a family shares the brand.
    for (const item of largest) assert.equal(item.brand, largest[0].brand);

    // Some pair differs in exactly one slot (same brand, one of flavour/size equal).
    let oneSlotPair = false;
    for (let i = 0; i < largest.length && !oneSlotPair; i += 1) {
      for (let j = i + 1; j < largest.length && !oneSlotPair; j += 1) {
        const a = slots(largest[i]);
        const b = slots(largest[j]);
        const sameFlavour = a.flavour === b.flavour;
        const sameSize = a.size === b.size;
        if (sameFlavour !== sameSize) oneSlotPair = true;
      }
    }
    assert.ok(oneSlotPair, `no one-slot pair in a family at N=${n}`);
  }
});

test('d3: every record has a gold id from its own catalog and a non-empty span', () => {
  const records = buildD3(0);
  assert.equal(records.length, D3_SIZES.reduce((sum, n) => sum + n, 0));
  const registry = buildD3CatalogRegistry(0);
  for (const record of records) {
    assert.notEqual(record.line.rawProductSpan.trim(), '');
    const ids = new Set(registry[record.catalogId].map((i) => i.id));
    assert.ok(record.goldProductId !== null && ids.has(record.goldProductId));
    assert.equal(record.family, record.family); // present
  }
});
