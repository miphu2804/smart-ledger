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

  it('matches a toned catalog unit against the folded unit the ASR hands over', () => {
    // Regression: the two sides were compared raw. Catalog units are toned
    // ("hộp") and the spoken unit arrives folded ("hop"), so every same-unit
    // pair read as a mismatch and the gate refused to auto-apply any of them.
    const withUnits: CatalogItem[] = [{ id: 'p1', name: 'Sting dâu', unit: 'hộp' }];
    const resolver = buildResolver({ catalog: withUnits, config: config(), gate: gate() });
    assert.equal(resolver.resolve({ rawProductSpan: 'sting dau', unit: 'hop' }).features.unit_ok, 'ok');
    assert.equal(resolver.resolve({ rawProductSpan: 'sting dau', unit: 'lon' }).features.unit_ok, 'mismatch');
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

  it('lets the shop override a seed alias for the same phrase', () => {
    // Regression: the seed list was laid over the shop's own confirmations, so
    // a seed silently overwrote what this shop had taught the resolver.
    const resolver = buildResolver({
      catalog,
      config: config(),
      gate: gate(),
      aliases: [{ folded: 'tai go', productId: 'p1', confirmedCount: 2 }],
    });
    const result = resolver.resolve({ rawProductSpan: 'tai go' });
    assert.equal(result.features.alias, 1);
    assert.equal(result.productId, 'p1');
  });

  it('drops a taught alias whose product is no longer in the catalog', () => {
    // Regression: the entry was indexed anyway, so a deleted product could come
    // back as a candidate and be auto-applied.
    const resolver = buildResolver({
      catalog,
      config: config(),
      gate: gate(),
      aliases: [{ folded: 'xiting', productId: 'gone', confirmedCount: 5 }],
    });
    const result = resolver.resolve({ rawProductSpan: 'xiting' });
    assert.equal(result.features.alias, 0);
    assert.ok(result.topK.every((candidate) => candidate.productId !== 'gone'));
  });

  it('re-points a taught phrase at the corrected product', () => {
    // Regression: only the first sight of a phrase was indexed, so correcting a
    // phrase to another product left that product scoring the phrase on its
    // catalog name alone and the correction never took effect.
    //
    // The score is what changes, not the ranking: once both products hold the
    // phrase as a document they tie at 1 and the productId tiebreak decides, so
    // asserting on the rank would pass either way.
    const resolver = buildResolver({ catalog, config: config(), gate: gate() });
    const scoreOf = (productId: string): number =>
      resolver.resolve({ rawProductSpan: 'xiting' }).topK.find((candidate) => candidate.productId === productId)?.score ?? 0;

    resolver.upsertAlias({ folded: 'xiting', productId: 'p1', confirmedCount: 1 });
    const before = scoreOf('p2');
    resolver.upsertAlias({ folded: 'xiting', productId: 'p2', confirmedCount: 1 });
    assert.ok(scoreOf('p2') > before, 'the re-pointed product must score the phrase higher');
    assert.equal(scoreOf('p2'), 1);
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
    // RRF, not `max`: E scores a similarity in [0, 1] and Q-bm25 an unbounded
    // sum, which `max` refuses to combine (see the mixed-scale test below).
    const resolver = buildResolver({
      catalog: largeCatalog(),
      config: config({ retrievers: ['E', 'Q-bm25'], fusion: 'rrf', eBruteMax: 500 }),
      gate: gate(),
    });
    const result = resolver.resolve({ rawProductSpan: 'Sting dâu chai 330ml' });
    assert.equal(result.topK[0]?.productId, 'target');
  });

  it('brute-forces in E when Q hands back no candidate above eBruteMax', () => {
    // Regression: E only ever scored what Q passed it, so a short spoken span
    // that Q's count filter prunes ("sting dau" against "sting dau chai 330ml")
    // came back as "no match" instead of the near-exact hit E can score.
    const resolver = buildResolver({
      catalog: largeCatalog(),
      config: config({ retrievers: ['E', 'Q-bm25'], fusion: 'rrf', eBruteMax: 500 }),
      gate: gate(),
    });
    assert.equal(resolver.resolve({ rawProductSpan: 'sting dau' }).topK[0]?.productId, 'target');
  });

  it('gives a lone candidate the full margin rather than a zero one', () => {
    // Regression: the runner-up defaulted to `s1`, so a result with nothing to
    // be confused with scored margin 0 and could never clear the gate's margin
    // rule. Only the shop's own alias can auto-apply such a line.
    const resolver = buildResolver({
      catalog: [{ id: 'p1', name: 'Sting dâu chai 330ml' }],
      config: config(),
      gate: gate(),
    });
    const result = resolver.resolve({ rawProductSpan: 'sting dau chai 330ml' });
    assert.equal(result.topK.length, 1);
    assert.equal(result.features.margin, result.features.s1);
    assert.ok(result.features.margin > 0);
  });

  it('refuses `max` over retrievers that score on different scales', () => {
    // E and Q-cos are similarities in [0, 1]; Q-bm25 and B are unbounded sums.
    // Under `max` the wider axis decides every ranking, so the config would
    // silently measure one retriever plus tie-breaking from the others.
    assert.throws(
      () =>
        buildResolver({
          catalog,
          config: config({ retrievers: ['E', 'Q-bm25'], fusion: 'max' }),
          gate: gate(),
        }),
      /one score scale/,
    );
    assert.doesNotThrow(() =>
      buildResolver({
        catalog,
        config: config({ retrievers: ['E', 'P', 'Q-cos'], fusion: 'max' }),
        gate: gate(),
      }),
    );
  });
});
