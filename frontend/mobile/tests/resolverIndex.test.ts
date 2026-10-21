/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildResolver } from '../src/lib/resolver/index.ts';
import { folded } from '../src/lib/resolver/normalizer.ts';
import type { CatalogItem, GateConfig, ResolverConfig } from '../src/lib/resolver/types.ts';

const catalog: CatalogItem[] = [
  { id: 'p1', name: 'Sting dâu chai 330ml' },
  { id: 'p2', name: 'Sting vàng chai 330ml' },
  { id: 'p3', name: 'Bia Tiger lon 330ml' },
];

function config(overrides: Partial<ResolverConfig> = {}): ResolverConfig {
  return {
    retrievers: ['E'],
    fusion: 'max',
    rrfK: 60,
    weights: {},
    topK: 5,
    qMaxEditDistance: 2,
    eBruteMax: 500,
    useUnitStoplist: false,
    ...overrides,
  };
}

/** A catalog big enough to sit above `eBruteMax`, holding one exact target. */
function largeCatalog(): CatalogItem[] {
  const items: CatalogItem[] = Array.from({ length: 600 }, (_, i) => ({ id: `b${i}`, name: `Sản phẩm số ${i} chai 330ml` }));
  items.push({ id: 'target', name: 'Sting dâu chai 330ml' });
  return items;
}

function gate(overrides: Partial<GateConfig> = {}): GateConfig {
  return {
    gate: 'G1',
    rules: { sFloor: 0.3, sAuto: 0.75, mMin: 0.05 },
    model: null,
    thetaAuto: 0.9,
    sFloor: 0.3,
    aliasMinConfirmations: 2,
    ...overrides,
  };
}

describe('buildResolver', () => {
  it('ranks the closest catalog product first', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'sting dau' });
    assert.equal(result.topK[0]?.productId, 'p1');
  });

  it('says NEW when nothing in the catalog is close', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'banh mi thit' });
    assert.equal(result.decision, 'NEW');
    assert.equal(result.productId, null);
  });

  it('says NEW on an empty catalog instead of throwing', () => {
    const resolver = buildResolver({ catalog: [], config: config(), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'sting dau' });
    assert.equal(result.decision, 'NEW');
    assert.deepEqual(result.topK, []);
    assert.equal(result.features.s1, 0);
  });

  it('fills the gate features the plan lists', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    const { features } = resolver.resolve({ rawProductSpan: 'sting dau', unit: 'chai' });
    assert.ok(features.s1 > 0, 's1');
    assert.equal(features.len_q, 2, 'len_q counts syllables');
    assert.equal(features.stt_conf, null, 'the binding exposes no token confidence');
    assert.ok(features.disp >= 0, 'disp');
    assert.ok(features.agree > 0 && features.agree <= 1, `agree ${features.agree}`);
    assert.equal(features.alias, 0, 'no alias was taught yet');
  });

  it('is deterministic across two builds and two calls', () => {
    const first = buildResolver({ catalog, config: config(), gate: gate() });
    const second = buildResolver({ catalog, config: config(), gate: gate() });
    const a = first.resolve({ rawProductSpan: 'sting dau' });
    const b = second.resolve({ rawProductSpan: 'sting dau' });
    assert.deepEqual(a, b);
    assert.deepEqual(first.resolve({ rawProductSpan: 'sting dau' }), a);
  });

  it('reports the unit as unknown when the catalog carries no unit', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    assert.equal(resolver.resolve({ rawProductSpan: 'sting dau', unit: 'chai' }).features.unit_ok, 'unknown');
  });

  it('reports a unit mismatch when the catalog does carry one', () => {
    const withUnits: CatalogItem[] = [{ id: 'p1', name: 'Sting dâu', unit: 'chai' }];
    const resolver = buildResolver({ catalog: withUnits, config: config(), gate: gate() });
    assert.equal(resolver.resolve({ rawProductSpan: 'sting dau', unit: 'lon' }).features.unit_ok, 'mismatch');
    assert.equal(resolver.resolve({ rawProductSpan: 'sting dau', unit: 'chai' }).features.unit_ok, 'ok');
  });
});

describe('buildResolver: alias feedback loop', () => {
  it('auto-applies a taught phrase only after the confirmation threshold', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    const span = 'xiting';
    assert.equal(folded(span), 'xiting');

    const before = resolver.resolve({ rawProductSpan: span });
    assert.equal(before.features.alias, 0, 'nothing taught yet');

    resolver.upsertAlias({ folded: 'xiting', productId: 'p1', confirmedCount: 1 });
    assert.equal(resolver.resolve({ rawProductSpan: span }).features.alias, 0, 'one confirmation is not trust');

    resolver.upsertAlias({ folded: 'xiting', productId: 'p1', confirmedCount: 1 });
    const after = resolver.resolve({ rawProductSpan: span });
    assert.equal(after.features.alias, 1, 'two confirmations make the alias trusted');
    assert.equal(after.decision, 'AUTO');
    assert.equal(after.productId, 'p1');
  });

  it('makes the taught phrase retrievable as soon as it is taught', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    resolver.upsertAlias({ folded: 'xiting', productId: 'p2', confirmedCount: 1 });
    assert.equal(resolver.resolve({ rawProductSpan: 'xiting' }).topK[0]?.productId, 'p2');
  });

  it('installs the seed aliases the web regexes used to hard-code', () => {
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'tai go' });
    assert.equal(result.features.alias, 1);
    assert.equal(result.topK[0]?.productId, 'p3');
  });

  it('drops a seed alias whose product this shop does not sell', () => {
    const resolver = buildResolver({
      catalog: [{ id: 'p9', name: 'Gạo ST25 5kg' }],
      config: config(),
      gate: gate(),
    });
    const result = resolver.resolve({ rawProductSpan: 'tai go' });
    assert.equal(result.features.alias, 0);
  });
});

describe('buildResolver: retriever sets', () => {
  it('runs with several retrievers and keeps their provenance', () => {
    const resolver = buildResolver({
      catalog,
      config: config({ retrievers: ['E', 'Q-bm25', 'B'], fusion: 'rrf' }),
      gate: gate(),
    });
    const result = resolver.resolve({ rawProductSpan: 'sting dau chai 330ml' });
    assert.equal(result.topK[0]?.productId, 'p1');
    assert.deepEqual(Object.keys(result.topK[0].ranks).sort(), ['B', 'E', 'Q-bm25']);
  });

  it('prunes a short prefix query in Q, which is the count filter working as specified', () => {
    // "sting dau" is 10 edits away from "sting dau chai 330ml", so the K=2
    // bound prunes it. Q is lossless for edit distance <= K, not for arbitrary
    // prefixes of a catalog name — a real limitation for short spoken spans.
    const resolver = buildResolver({ catalog, config: config({ retrievers: ['Q-bm25'] }), gate: gate() });
    const short = resolver.resolve({ rawProductSpan: 'sting dau' });
    assert.deepEqual(short.topK, []);
    assert.equal(short.decision, 'NEW');

    const full = resolver.resolve({ rawProductSpan: 'sting dau chai 330ml' });
    assert.equal(full.topK[0]?.productId, 'p1');
  });

  it('exposes the AND control as its own retriever name', () => {
    const resolver = buildResolver({ catalog, config: config({ retrievers: ['AND'] }), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'sting dau chai 330ml' });
    assert.deepEqual(Object.keys(result.topK[0]?.ranks ?? {}), ['AND']);
  });

  it('drops a candidate from the AND control as soon as one character is mis-heard', () => {
    // This contrast is the reason the plan rejects pure AND filtering: Q keeps
    // the candidate, AND loses it.
    const resolver = buildResolver({ catalog, config: config({ retrievers: ['AND'] }), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'sting dau chai 330ml'.replace('chai', 'chqi') });
    assert.deepEqual(result.topK, []);
    assert.equal(result.decision, 'NEW');
  });

  it('brute-forces above eBruteMax when the config names no Q to prune with', () => {
    // Regression: the candidate provider was injected even when no Q retriever
    // existed, so it always returned [] and E scored nothing above eBruteMax.
    // The resolver reported "no match" for a catalog E's own contract says it
    // will scan, which silently emptied every E-only row of the bake-off.
    const resolver = buildResolver({ catalog: largeCatalog(), config: config({ retrievers: ['E'], eBruteMax: 500 }), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'Sting dâu chai 330ml' });
    assert.equal(result.topK[0]?.productId, 'target');
  });

  it('still reaches the same product through Q when Q is configured', () => {
    const resolver = buildResolver({ catalog: largeCatalog(), config: config({ retrievers: ['E', 'Q-bm25'], eBruteMax: 500 }), gate: gate() });
    const result = resolver.resolve({ rawProductSpan: 'Sting dâu chai 330ml' });
    assert.equal(result.topK[0]?.productId, 'target');
  });
});
