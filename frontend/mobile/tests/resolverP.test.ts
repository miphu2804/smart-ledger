/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { similarity } from '../src/lib/resolver/editDistance.ts';
import { RetrieverP } from '../src/lib/resolver/retrieverP.ts';
import { phon } from '../src/lib/resolver/normalizer.ts';
import type { CatalogItem } from '../src/lib/resolver/types.ts';

describe('RetrieverP: phonetic key', () => {
  it('phon collapses the confused pair so "xì ting" and "sì ting" are identical', () => {
    assert.equal(phon('xì ting'), phon('sì ting'));
    assert.equal(similarity(phon('xì ting'), phon('sì ting')), 1);
  });

  it('ranks the product "Sì ting" first for the span "xì ting"', () => {
    const catalog: CatalogItem[] = [
      { id: 'siting', name: 'Sì ting' },
      { id: 'sting', name: 'Sting' },
    ];
    const r = new RetrieverP(catalog);
    const hits = r.retrieve({ rawProductSpan: 'xì ting' }, 5);
    assert.equal(hits[0].productId, 'siting');
    assert.equal(hits[0].score, 1);
    // The solid spelling is reachable but not exact under the phonetic key.
    assert.equal(hits[1].productId, 'sting');
    assert.ok(hits[1].score < hits[0].score);
  });

  it('scores the same similarity function as E, on the phon view', () => {
    const catalog: CatalogItem[] = [{ id: 'siting', name: 'Sì ting' }];
    const r = new RetrieverP(catalog);
    const hits = r.retrieve({ rawProductSpan: 'sì ting' }, 5);
    assert.equal(hits[0].score, 1);
  });
});

describe('RetrieverP: boundary and degenerate cases', () => {
  it('returns [] on an empty catalog', () => {
    const r = new RetrieverP([]);
    assert.deepEqual(r.retrieve({ rawProductSpan: 'anything' }, 5), []);
  });

  it('a span with no plausible match still returns hits, best-first, without throwing', () => {
    const catalog: CatalogItem[] = [
      { id: 'siting', name: 'Sì ting' },
      { id: 'coca', name: 'Coca Cola' },
    ];
    const r = new RetrieverP(catalog);
    const hits = r.retrieve({ rawProductSpan: 'zzz qqq' }, 5);
    assert.equal(hits.length, 2);
    assert.ok(hits[0].score >= hits[1].score);
  });

  it('addDocument makes a newly inserted alias retrievable immediately', () => {
    const r = new RetrieverP([{ id: 'a', name: 'Coca Cola' }]);
    r.addDocument('Sì ting', 'b');
    const hits = r.retrieve({ rawProductSpan: 'xì ting' }, 5);
    assert.equal(hits[0].productId, 'b');
    assert.equal(hits[0].score, 1);
  });

  it('is deterministic and breaks score ties by ascending productId', () => {
    const catalog: CatalogItem[] = [
      { id: 'b', name: 'Sì ting' },
      { id: 'a', name: 'Sì ting' },
    ];
    const r = new RetrieverP(catalog);
    const first = r.retrieve({ rawProductSpan: 'xì ting' }, 5).map((h) => h.productId);
    const second = r.retrieve({ rawProductSpan: 'xì ting' }, 5).map((h) => h.productId);
    assert.deepEqual(first, second);
    assert.deepEqual(first, ['a', 'b']);
  });

  it('uses the injected candidate provider above pBruteMax, else brute-forces', () => {
    const catalog: CatalogItem[] = [
      { id: 'siting', name: 'Sì ting' },
      { id: 'other', name: 'Other' },
    ];
    const injected = new RetrieverP(catalog, { pBruteMax: 1, candidates: () => ['other'] });
    assert.deepEqual(injected.retrieve({ rawProductSpan: 'xì ting' }, 5).map((h) => h.productId), ['other']);

    const fallback = new RetrieverP(catalog, { pBruteMax: 1 });
    assert.deepEqual(fallback.retrieve({ rawProductSpan: 'xì ting' }, 5).map((h) => h.productId), ['siting', 'other']);
  });
});
