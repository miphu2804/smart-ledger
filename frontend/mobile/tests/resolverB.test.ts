/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RetrieverB } from '../src/lib/resolver/retrieverB.ts';
import { SyllableBm25 } from '../src/lib/resolver/syllableBm25.ts';
import type { CatalogItem } from '../src/lib/resolver/types.ts';

describe('retriever B: word order and extra words', () => {
  const catalog: CatalogItem[] = [
    { id: 'a', name: 'Sting dâu chai 330ml' },
    { id: 'b', name: 'Sting vàng chai 330ml' },
  ];

  it('"dâu sting" and "sting dâu" rank alike', () => {
    const retriever = new RetrieverB(catalog);
    const forward = retriever.retrieve({ rawProductSpan: 'dau sting' }, 5);
    const reversed = retriever.retrieve({ rawProductSpan: 'sting dau' }, 5);
    assert.deepEqual(forward, reversed);
    assert.equal(forward[0]?.productId, 'a');
  });

  it('an extra word does not change the ranking', () => {
    const retriever = new RetrieverB(catalog);
    const plain = retriever.retrieve({ rawProductSpan: 'sting dau' }, 5);
    const noisy = retriever.retrieve({ rawProductSpan: 'sting dau ngon' }, 5);
    assert.deepEqual(plain, noisy);
  });
});

describe('retriever B: unit-word stoplist is a switch', () => {
  const catalog: CatalogItem[] = [{ id: '1', name: 'Sting dâu chai 330ml' }];

  it('off: a bare unit word still matches the name that contains it', () => {
    const hits = new RetrieverB(catalog, { useUnitStoplist: false }).retrieve({ rawProductSpan: 'chai' }, 5);
    assert.equal(hits[0]?.productId, '1');
  });

  it('on: the same unit word is dropped, so there is no match', () => {
    const hits = new RetrieverB(catalog, { useUnitStoplist: true }).retrieve({ rawProductSpan: 'chai' }, 5);
    assert.deepEqual(hits, []);
  });

  it('on: dropping units does not stop a real name from matching', () => {
    const hits = new RetrieverB(catalog, { useUnitStoplist: true }).retrieve({ rawProductSpan: 'sting dau chai' }, 5);
    assert.equal(hits[0]?.productId, '1');
  });

  it('on: a word that is also a real name is not dropped', () => {
    // Regression: "lon" (lợn, pork), "goi" (gỏi), "cai" (cải), "can" (cần tây),
    // "loc" (lọc), "phan" (phấn), "to" (tỏ), "bao" (bánh bao), "hu" (hủ tiếu),
    // "vi" (vị) and "binh" (bình) were stoplisted as unit words, so a product
    // named by one of them could not be matched at all.
    for (const name of ['Lợn', 'Gỏi', 'Cải', 'Bao', 'Hủ', 'Vị', 'Bình']) {
      const one = [{ id: '1', name }];
      const hits = new RetrieverB(one, { useUnitStoplist: true }).retrieve({ rawProductSpan: name.toLowerCase() }, 5);
      assert.equal(hits[0]?.productId, '1', `${name} must still be retrievable`);
    }
  });
});

describe('retriever B: avg_len comes from the catalog', () => {
  const shortCatalog: CatalogItem[] = [
    { id: 'x', name: 'Bia' },
    { id: 'y', name: 'Bia hoi' },
  ];
  const longCatalog: CatalogItem[] = [
    { id: 'x', name: 'Bia' },
    { id: 'y', name: 'Bia Tiger lon 330ml' },
  ];

  it('a catalog of long names and one of short names give different avg_len', () => {
    assert.equal(new RetrieverB(shortCatalog).avgLength, 1.5);
    assert.equal(new RetrieverB(longCatalog).avgLength, 2.5);
  });

  it('pins a hand-computed avg_len (mean syllable count)', () => {
    assert.equal(new RetrieverB([{ id: 'a', name: 'bia' }]).avgLength, 1);
    assert.equal(new RetrieverB([{ id: 'a', name: 'bia tiger lon' }]).avgLength, 3);
  });

  it('the same product scores differently under the two avg_len values', () => {
    const shortScore = new RetrieverB(shortCatalog).retrieve({ rawProductSpan: 'bia' }, 5);
    const longScore = new RetrieverB(longCatalog).retrieve({ rawProductSpan: 'bia' }, 5);
    const xShort = shortScore.find((hit) => hit.productId === 'x');
    const xLong = longScore.find((hit) => hit.productId === 'x');
    assert.ok(xShort !== undefined && xLong !== undefined);
    assert.notEqual(xShort!.score, xLong!.score);
  });

  it('SyllableBm25 reports the catalog mean directly', () => {
    const bm25 = new SyllableBm25();
    bm25.addDocument('bia', 'a');
    bm25.addDocument('bia tiger lon', 'b');
    assert.equal(bm25.avgLength, 2);
  });
});

describe('retriever B: degenerate cases', () => {
  const catalog: CatalogItem[] = [{ id: '1', name: 'Cà phê sữa' }];

  it('empty catalog → []', () => {
    assert.deepEqual(new RetrieverB([]).retrieve({ rawProductSpan: 'cà phê' }, 5), []);
  });

  it('a query sharing no token → []', () => {
    assert.deepEqual(new RetrieverB(catalog).retrieve({ rawProductSpan: 'zzz' }, 5), []);
  });

  it('an empty span → []', () => {
    assert.deepEqual(new RetrieverB(catalog).retrieve({ rawProductSpan: '   ' }, 5), []);
  });

  it('k ≤ 0 → []', () => {
    assert.deepEqual(new RetrieverB(catalog).retrieve({ rawProductSpan: 'cà phê' }, 0), []);
  });
});

describe('retriever B: freshness', () => {
  it('addDocument makes a new alias retrievable immediately', () => {
    const retriever = new RetrieverB([{ id: '1', name: 'Cà phê sữa' }]);
    assert.deepEqual(retriever.retrieve({ rawProductSpan: 'trà đá' }, 5), []);
    retriever.addDocument('Trà đá', '2');
    assert.equal(retriever.retrieve({ rawProductSpan: 'trà đá' }, 5)[0]?.productId, '2');
  });
});

describe('retriever B: ranking', () => {
  it('breaks ties by ascending productId', () => {
    const catalog: CatalogItem[] = [
      { id: 'b', name: 'Bia' },
      { id: 'a', name: 'Bia' },
    ];
    const hits = new RetrieverB(catalog).retrieve({ rawProductSpan: 'bia' }, 5);
    assert.deepEqual(hits.map((hit) => hit.productId), ['a', 'b']);
  });

  it('is deterministic across runs', () => {
    const catalog: CatalogItem[] = [
      { id: 'a', name: 'Sting dâu chai 330ml' },
      { id: 'b', name: 'Sting vàng chai 330ml' },
      { id: 'c', name: 'Bia Tiger lon 330ml' },
    ];
    const retriever = new RetrieverB(catalog);
    const first = retriever.retrieve({ rawProductSpan: 'sting chai' }, 5);
    const second = retriever.retrieve({ rawProductSpan: 'sting chai' }, 5);
    assert.deepEqual(first, second);
  });
});
