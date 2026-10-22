/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { damerauLevenshtein, similarity } from '../src/lib/resolver/editDistance.ts';
import { RetrieverE } from '../src/lib/resolver/retrieverE.ts';
import { folded } from '../src/lib/resolver/normalizer.ts';
import type { CatalogItem } from '../src/lib/resolver/types.ts';

describe('editDistance: damerauLevenshtein', () => {
  it('pins the plan hand-computed value: "xiting" vs "sting" is DL 2', () => {
    assert.equal(damerauLevenshtein('xiting', 'sting'), 2);
  });

  it('counts a transposition of adjacent characters as one edit (OSA)', () => {
    assert.equal(damerauLevenshtein('ab', 'ba'), 1);
    assert.equal(damerauLevenshtein('form', 'from'), 1);
  });

  it('handles the trivial cases', () => {
    assert.equal(damerauLevenshtein('', ''), 0);
    assert.equal(damerauLevenshtein('abc', ''), 3);
    assert.equal(damerauLevenshtein('', 'abc'), 3);
    assert.equal(damerauLevenshtein('abc', 'abc'), 0);
  });

  it('the maxDistance early exit never changes a result within the bound', () => {
    // True distance is 2; a bound of 2 or more must return the exact value.
    assert.equal(damerauLevenshtein('xiting', 'sting', 2), 2);
    assert.equal(damerauLevenshtein('xiting', 'sting', 10), 2);
    // A bound below the true distance returns a sentinel strictly greater than it.
    assert.ok(damerauLevenshtein('xiting', 'sting', 1) > 1);
    assert.ok(damerauLevenshtein('kitten', 'sitting', 2) > 2);
    // A length gap larger than the bound short-circuits too.
    assert.ok(damerauLevenshtein('abc', 'abcdef', 1) > 1);
  });
});

describe('editDistance: similarity', () => {
  it('pins the plan hand-computed value: similarity("xiting","sting") = 0.667', () => {
    assert.equal(similarity('xiting', 'sting').toFixed(3), '0.667');
  });

  it('both empty -> 1', () => {
    assert.equal(similarity('', ''), 1);
  });

  it('one empty, the other not -> 0', () => {
    assert.equal(similarity('', 'abc'), 0);
    assert.equal(similarity('abc', ''), 0);
  });

  it('identical strings -> 1', () => {
    assert.equal(similarity('sting', 'sting'), 1);
    assert.equal(similarity('nước mắm', 'nước mắm'), 1);
  });

  it('is clamped to [0, 1]', () => {
    assert.ok(similarity('a', 'bcdefghij') >= 0);
    assert.ok(similarity('a', 'bcdefghij') <= 1);
  });
});

describe('RetrieverE', () => {
  it('scores the plan hand-computed value through retrieve', () => {
    const r = new RetrieverE([{ id: 'sting', name: 'Sting' }]);
    const hits = r.retrieve({ rawProductSpan: 'xiting' }, 5);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].productId, 'sting');
    assert.equal(hits[0].score.toFixed(3), '0.667');
  });

  it('the space-removed view is what lets "xi ting" match "sting"', () => {
    const catalog: CatalogItem[] = [
      { id: 'sting', name: 'Sting' },
      { id: 'xilanh', name: 'Xì lanh' },
    ];
    const r = new RetrieverE(catalog);
    const hits = r.retrieve({ rawProductSpan: 'xi ting' }, 5);
    assert.equal(hits[0].productId, 'sting');
    assert.equal(hits[0].score.toFixed(3), '0.667');
    assert.equal(hits[1].productId, 'xilanh');

    // On the spaced view alone the two products tie; the space-removed view is
    // what lifts "sting" above "xì lanh".
    const spaced = folded('xi ting');
    const nospace = spaced.replace(/ /g, '');
    assert.equal(similarity(spaced, folded('Sting')).toFixed(3), '0.571');
    assert.equal(similarity(spaced, folded('Xì lanh')).toFixed(3), '0.571');
    assert.equal(similarity(nospace, folded('Sting')).toFixed(3), '0.667');
    assert.equal(similarity(nospace, folded('Xì lanh').replace(/ /g, '')).toFixed(3), '0.500');
    assert.ok(
      similarity(nospace, folded('Sting')) > similarity(nospace, folded('Xì lanh').replace(/ /g, '')),
    );
  });

  it('returns [] on an empty catalog', () => {
    const r = new RetrieverE([]);
    assert.deepEqual(r.retrieve({ rawProductSpan: 'anything' }, 5), []);
  });

  it('a span with no plausible match still returns hits, best-first, without throwing', () => {
    const catalog: CatalogItem[] = [
      { id: 'sting', name: 'Sting' },
      { id: 'xilanh', name: 'Xì lanh' },
    ];
    const r = new RetrieverE(catalog);
    const hits = r.retrieve({ rawProductSpan: 'zzz qqq' }, 5);
    assert.equal(hits.length, 2);
    assert.ok(hits[0].score >= hits[1].score);
  });

  it('addDocument makes a newly inserted alias retrievable immediately', () => {
    const r = new RetrieverE([{ id: 'a', name: 'Coca Cola' }]);
    r.addDocument('Pepsi', 'b');
    const hits = r.retrieve({ rawProductSpan: 'pepsi' }, 5);
    assert.equal(hits[0].productId, 'b');
    assert.equal(hits[0].score, 1);
  });

  it('is deterministic and breaks score ties by ascending productId', () => {
    const catalog: CatalogItem[] = [
      { id: 'b', name: 'Sting' },
      { id: 'a', name: 'Sting' },
    ];
    const r = new RetrieverE(catalog);
    const first = r.retrieve({ rawProductSpan: 'sting' }, 5).map((h) => h.productId);
    const second = r.retrieve({ rawProductSpan: 'sting' }, 5).map((h) => h.productId);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ['a', 'b']);
  });

  it('uses the injected candidate provider above eBruteMax, else brute-forces', () => {
    const catalog: CatalogItem[] = [
      { id: 'sting', name: 'Sting' },
      { id: 'other', name: 'Other' },
    ];
    const injected = new RetrieverE(catalog, { eBruteMax: 1, candidates: () => ['other'] });
    assert.deepEqual(injected.retrieve({ rawProductSpan: 'sting' }, 5).map((h) => h.productId), ['other']);

    const fallback = new RetrieverE(catalog, { eBruteMax: 1 });
    assert.deepEqual(fallback.retrieve({ rawProductSpan: 'sting' }, 5).map((h) => h.productId), ['sting', 'other']);
  });
});
