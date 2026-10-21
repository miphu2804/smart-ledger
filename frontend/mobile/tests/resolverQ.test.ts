/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { countThreshold, spaceRemovedFold, trigramsOf, TrigramIndex } from '../src/lib/resolver/trigramIndex.ts';
import { RetrieverQ } from '../src/lib/resolver/retrieverQ.ts';
import { RetrieverAnd } from '../src/lib/resolver/retrieverAnd.ts';
import { damerauLevenshtein } from '../src/lib/resolver/editDistance.ts';
import type { CatalogItem, QueryLine } from '../src/lib/resolver/types.ts';

describe('trigram index: hand-computed values (plan §5.3)', () => {
  it('pads and splits "stink" and "sting" exactly as the plan does', () => {
    assert.deepEqual(trigramsOf('stink'), ['##s', '#st', 'sti', 'tin', 'ink', 'nk#']);
    assert.deepEqual(trigramsOf('sting'), ['##s', '#st', 'sti', 'tin', 'ing', 'ng#']);
  });

  it('the pair shares 4 trigrams and is kept because τ = max(5,5) − 2 − 6 < 0', () => {
    const stink = trigramsOf('stink');
    const sting = trigramsOf('sting');
    assert.equal(stink.filter((trigram) => sting.includes(trigram)).length, 4);
    assert.equal(countThreshold(5, 5, 2), -3);
    assert.ok(countThreshold(5, 5, 2) < 0);
  });
});

describe('trigram index: Ukkonen count filter', () => {
  it('retains a document whose only difference is one mis-heard character', () => {
    const index = new TrigramIndex();
    const docId = index.addDocument('sting', 'target');
    const candidates = index.candidates(new Set(trigramsOf('stink')), 5, 2);
    assert.ok(candidates.includes(docId));
  });

  it('is lossless for edit distance ≤ 2, tested directly on hand-built pairs', () => {
    const pairs: Array<[string, string]> = [
      ['sting', 'stink'],
      ['sting dau', 'sting dâu'],
      ['nuoc mam nam ngu 500ml', 'nuoc mam nam ngu 500ml'],
      ['coca cola', 'coca colaa'],
      ['pepsi', 'pesi'],
      ['nuoc mam nam ngu', 'nuoc mam nam gu'],
      ['nuoc mam nam ngu 500ml', 'nuoc mam nam ngu 500m'],
      ['bia tiger lon 330ml', 'bia tiger lo 330ml'],
      ['coca cola lon 330ml', 'coca cola lom 330ml'],
      ['sting dau chai 330ml', 'sting dau chi 330ml'],
      // two edits each
      ['nuoc mam nam ngu 500ml', 'nuoc mam nam gu 500m'],
      ['bia tiger lon 330ml', 'bia tigr lo 330ml'],
      ['nuoc mam nam ngu', 'nuoc mam nam gi'],
      // a transposition (one edit for OSA)
      ['sting', 'sitng'],
    ];
    for (const [doc, query] of pairs) {
      const distance = damerauLevenshtein(spaceRemovedFold(doc), spaceRemovedFold(query));
      assert.ok(distance <= 2, `pair "${doc}" / "${query}" must be within 2 edits, got ${distance}`);
      const index = new TrigramIndex();
      const docId = index.addDocument(doc, 'target');
      const candidates = index.candidates(new Set(trigramsOf(query)), spaceRemovedFold(query).length, 2);
      assert.ok(candidates.includes(docId), `count filter pruned a lossless pair: "${doc}" / "${query}"`);
    }
  });

  it('does prune a document that shares too few trigrams (the filter is not a no-op)', () => {
    const index = new TrigramIndex();
    index.addDocument('nuoc mam nam ngu 500ml', 'long');
    const candidates = index.candidates(new Set(trigramsOf('bia')), 3, 2);
    assert.deepEqual(candidates, []);
  });
});

describe('retriever Q: a mis-heard character — Q keeps the candidate, AND drops it', () => {
  const catalog: CatalogItem[] = [{ id: '117', name: 'Sting dâu chai 330ml' }];
  const heard: QueryLine = { rawProductSpan: 'stink dau chai 330ml' };

  it('Q-cos still retrieves the correct product', () => {
    const hits = new RetrieverQ(catalog, { scorer: 'cos' }).retrieve(heard, 5);
    assert.equal(hits[0]?.productId, '117');
  });

  it('Q-bm25 still retrieves the correct product', () => {
    const hits = new RetrieverQ(catalog, { scorer: 'bm25' }).retrieve(heard, 5);
    assert.equal(hits[0]?.productId, '117');
  });

  it('the historical AND control drops it entirely', () => {
    assert.deepEqual(new RetrieverAnd(catalog).retrieve(heard, 5), []);
  });
});

describe('retriever Q: avg_len comes from the catalog', () => {
  const shortCatalog: CatalogItem[] = [
    { id: 'x', name: 'Bia' },
    { id: 'y', name: 'Bia hoi' },
  ];
  const longCatalog: CatalogItem[] = [
    { id: 'x', name: 'Bia' },
    { id: 'y', name: 'Bia Tiger lon 330ml' },
  ];

  it('a catalog of long names and one of short names give different avg_trigram_count', () => {
    assert.equal(new RetrieverQ(shortCatalog, { scorer: 'bm25' }).avgTrigramCount, 5.5);
    assert.equal(new RetrieverQ(longCatalog, { scorer: 'bm25' }).avgTrigramCount, 10.5);
  });

  it('pins a hand-computed avg_trigram_count (mean trigram count = |d| + 1)', () => {
    assert.equal(new RetrieverQ([{ id: 'a', name: 'ab' }], { scorer: 'bm25' }).avgTrigramCount, 3);
  });

  it('the same product scores differently under the two avg_len values', () => {
    const shortScore = new RetrieverQ(shortCatalog, { scorer: 'bm25' }).retrieve({ rawProductSpan: 'bia' }, 5);
    const longScore = new RetrieverQ(longCatalog, { scorer: 'bm25' }).retrieve({ rawProductSpan: 'bia' }, 5);
    const xShort = shortScore.find((hit) => hit.productId === 'x');
    const xLong = longScore.find((hit) => hit.productId === 'x');
    assert.ok(xShort !== undefined && xLong !== undefined);
    assert.notEqual(xShort!.score, xLong!.score);
  });
});

describe('retriever Q: degenerate cases', () => {
  const catalog: CatalogItem[] = [{ id: '1', name: 'Cà phê sữa' }];

  it('empty catalog → []', () => {
    assert.deepEqual(new RetrieverQ([], { scorer: 'cos' }).retrieve({ rawProductSpan: 'cà phê' }, 5), []);
  });

  it('a query sharing no trigram → []', () => {
    assert.deepEqual(new RetrieverQ(catalog, { scorer: 'cos' }).retrieve({ rawProductSpan: 'zzzz' }, 5), []);
  });

  it('an empty span → []', () => {
    assert.deepEqual(new RetrieverQ(catalog, { scorer: 'bm25' }).retrieve({ rawProductSpan: '   ' }, 5), []);
  });

  it('k ≤ 0 → []', () => {
    assert.deepEqual(new RetrieverQ(catalog, { scorer: 'cos' }).retrieve({ rawProductSpan: 'cà phê' }, 0), []);
  });
});

describe('retriever Q: freshness', () => {
  it('addDocument makes a new alias retrievable immediately', () => {
    const retriever = new RetrieverQ([{ id: '1', name: 'Cà phê sữa' }], { scorer: 'bm25' });
    assert.deepEqual(retriever.retrieve({ rawProductSpan: 'trà đá' }, 5), []);
    retriever.addDocument('Trà đá', '2');
    assert.equal(retriever.retrieve({ rawProductSpan: 'trà đá' }, 5)[0]?.productId, '2');
  });

  it('IDF drifts without throwing after many inserts', () => {
    const retriever = new RetrieverQ([{ id: '1', name: 'Cà phê sữa' }], { scorer: 'bm25' });
    retriever.retrieve({ rawProductSpan: 'cà phê' }, 5);
    for (let i = 0; i < 40; i += 1) retriever.addDocument(`hàng số ${i}`, `x${i}`);
    const hits = retriever.retrieve({ rawProductSpan: 'cà phê' }, 5);
    assert.equal(hits[0]?.productId, '1');
  });
});

describe('retriever Q: ranking', () => {
  it('breaks ties by ascending productId', () => {
    const catalog: CatalogItem[] = [
      { id: 'b', name: 'Bia' },
      { id: 'a', name: 'Bia' },
    ];
    const hits = new RetrieverQ(catalog, { scorer: 'cos' }).retrieve({ rawProductSpan: 'bia' }, 5);
    assert.deepEqual(hits.map((hit) => hit.productId), ['a', 'b']);
  });

  it('is deterministic across runs', () => {
    const catalog: CatalogItem[] = [
      { id: 'a', name: 'Sting dâu chai 330ml' },
      { id: 'b', name: 'Sting vàng chai 330ml' },
      { id: 'c', name: 'Bia Tiger lon 330ml' },
    ];
    const retriever = new RetrieverQ(catalog, { scorer: 'bm25' });
    const first = retriever.retrieve({ rawProductSpan: 'sting chai' }, 5);
    const second = retriever.retrieve({ rawProductSpan: 'sting chai' }, 5);
    assert.deepEqual(first, second);
  });
});
