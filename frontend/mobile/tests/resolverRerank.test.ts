/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide } from '../src/lib/resolver/gate.ts';
import { buildResolver } from '../src/lib/resolver/index.ts';
import { normalizedWeights, Reranker } from '../src/lib/resolver/rerank.ts';
import type { Candidate, CatalogItem, GateConfig, GateFeatures, ResolverConfig } from '../src/lib/resolver/types.ts';

const candidate = (productId: string, score: number): Candidate => ({ productId, score, scores: {}, ranks: {} });

const catalog: CatalogItem[] = [
  { id: '1', name: 'Sting dâu chai 330ml', unit: 'chai' },
  { id: '2', name: 'Bia Tiger lon 330ml', unit: 'lon' },
  { id: '3', name: 'Bia Tiger Crystal lon 330ml', unit: 'lon' },
];

const config: ResolverConfig = {
  retrievers: ['Q-bm25', 'B'],
  fusion: 'rrf',
  rrfK: 60,
  weights: {},
  topK: 5,
  qMaxEditDistance: 2,
  eBruteMax: 500,
  useUnitStoplist: false,
};

const gate: GateConfig = {
  gate: 'G1',
  rules: { sFloor: 0.3, sAuto: 0.9, mMin: 0.05, agreeMin: 0 },
  model: null,
  thetaAuto: 1,
  sFloor: 0.3,
  aliasMinConfirmations: 2,
};

describe('normalizedWeights', () => {
  it('drops zero weights and sums the rest to 1', () => {
    assert.deepEqual(normalizedWeights({ E: 3, P: 0, T: 1 }), [['E', 0.75], ['T', 0.25]]);
  });

  it('returns nothing when every weight is zero', () => {
    assert.deepEqual(normalizedWeights({ E: 0 }), []);
  });
});

describe('Reranker', () => {
  it('puts the closer spelling first even when fusion ranked it second', () => {
    const reranker = new Reranker({ pool: 5, weights: { E: 1 } });
    for (const item of catalog) reranker.addDocument(item.name, item.id);
    const out = reranker.rerank({ rawProductSpan: 'bia tiger lon 330ml' }, [candidate('3', 0.03), candidate('2', 0.02)]);
    assert.equal(out[0].productId, '2');
    assert.equal(out[0].score, 1);
    assert.equal(out[0].scores.fused, 0.02, 'the fused score is kept for the report');
  });

  it('scores on an absolute scale, so a weak match stays weak', () => {
    const reranker = new Reranker({ pool: 5, weights: { E: 1 } });
    for (const item of catalog) reranker.addDocument(item.name, item.id);
    const [top] = reranker.rerank({ rawProductSpan: 'nuoc mam' }, [candidate('1', 0.03)]);
    assert.ok(top.score < 0.5, `score ${top.score}`);
  });

  it('keeps the fused order when no weight is set', () => {
    const reranker = new Reranker({ pool: 5, weights: {} });
    const fused = [candidate('3', 0.03), candidate('2', 0.02)];
    assert.deepEqual(reranker.rerank({ rawProductSpan: 'x' }, fused), fused);
  });

  it('counts a truncated span as fully covered by T', () => {
    const reranker = new Reranker({ pool: 5, weights: { T: 1 } });
    for (const item of catalog) reranker.addDocument(item.name, item.id);
    const [top] = reranker.rerank({ rawProductSpan: 'sting dâu' }, [candidate('1', 0.03)]);
    assert.equal(top.score, 1);
  });
});

describe('buildResolver with a rerank stage', () => {
  it('auto-applies an exact name and asks or refuses a product the shop does not sell', () => {
    const resolver = buildResolver({ catalog, config: { ...config, rerank: { pool: 10, weights: { E: 1 } } }, gate, seeds: [] });
    assert.equal(resolver.resolve({ rawProductSpan: 'bia tiger lon 330ml' }).decision, 'AUTO');
    assert.notEqual(resolver.resolve({ rawProductSpan: 'bia saigon chai' }).decision, 'AUTO');
  });

  it('reaches a product through an alias the shop taught', () => {
    const resolver = buildResolver({ catalog, config: { ...config, rerank: { pool: 10, weights: { E: 1 } } }, gate, seeds: [] });
    resolver.upsertAlias({ folded: 'xi ting', productId: '1', confirmedCount: 1 });
    const result = resolver.resolve({ rawProductSpan: 'xi ting' });
    assert.equal(result.topK[0].productId, '1');
    assert.equal(result.features.s1, 1);
  });
});

describe('gate order', () => {
  it('asks instead of auto-applying a trusted alias when the heard unit does not match', () => {
    const features: GateFeatures = { s1: 1, s2: 0, margin: 1, disp: 0, agree: 1, jacc: 1, unit_ok: 'mismatch', alias: 1, len_q: 2, stt_conf: null };
    assert.equal(decide(features, gate), 'ASK');
    assert.equal(decide({ ...features, unit_ok: 'ok' }, gate), 'AUTO');
  });
});
