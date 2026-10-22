/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fuse } from '../src/lib/resolver/fusion.ts';
import type { ResolverConfig } from '../src/lib/resolver/types.ts';

function config(overrides: Partial<ResolverConfig> = {}): ResolverConfig {
  return {
    retrievers: ['E', 'Q-bm25'],
    fusion: 'rrf',
    rrfK: 60,
    weights: {},
    topK: 5,
    qMaxEditDistance: 2,
    eBruteMax: 500,
    useUnitStoplist: false,
    ...overrides,
  };
}

function close(actual: number, expected: number, message?: string) {
  assert.ok(Math.abs(actual - expected) < 1e-9, message ?? `${actual} !== ${expected}`);
}

describe('fusion: RRF', () => {
  // E returns [A, B, C]; Q returns [C, D]. With k = 60:
  //   C = 1/63 + 1/61 = 0.032266458495966692
  //   A = 1/61        = 0.01639344262295082
  //   B = 1/62        = 0.016129032258064516
  //   D = 1/62        = 0.016129032258064516
  const hits = {
    E: [
      { productId: 'A', score: 0.9 },
      { productId: 'B', score: 0.8 },
      { productId: 'C', score: 0.7 },
    ],
    'Q-bm25': [
      { productId: 'C', score: 12 },
      { productId: 'D', score: 9 },
    ],
  };

  it('sums 1/(k + rank) and ranks C first', () => {
    const fused = fuse(hits, config());
    assert.deepEqual(
      fused.map((candidate) => candidate.productId),
      ['C', 'A', 'B', 'D'],
    );
    close(fused[0].score, 1 / 63 + 1 / 61, 'C score');
    close(fused[1].score, 1 / 61, 'A score');
  });

  it('keeps each retriever score and 1-based rank for the failure gallery', () => {
    const fused = fuse(hits, config());
    const c = fused.find((candidate) => candidate.productId === 'C');
    assert.deepEqual(c?.ranks, { E: 3, 'Q-bm25': 1 });
    assert.deepEqual(c?.scores, { E: 0.7, 'Q-bm25': 12 });
  });

  it('breaks a fused-score tie by ascending productId', () => {
    const tied = {
      E: [{ productId: 'zz', score: 1 }],
      Q: [{ productId: 'aa', score: 1 }],
    };
    const fused = fuse(tied, config());
    assert.deepEqual(
      fused.map((candidate) => candidate.productId),
      ['aa', 'zz'],
    );
  });

  it('truncates to topK', () => {
    const fused = fuse(hits, config({ topK: 2 }));
    assert.equal(fused.length, 2);
  });

  it('is deterministic across runs', () => {
    const first = fuse(hits, config()).map((candidate) => candidate.productId);
    const second = fuse(hits, config()).map((candidate) => candidate.productId);
    assert.deepEqual(first, second);
  });
});

describe('fusion: weighted RRF', () => {
  it('scales each retriever by its weight', () => {
    const hits = {
      E: [{ productId: 'A', score: 1 }],
      Q: [{ productId: 'B', score: 1 }],
    };
    const fused = fuse(hits, config({ fusion: 'wrrf', weights: { E: 1, Q: 3 } }));
    assert.deepEqual(
      fused.map((candidate) => candidate.productId),
      ['B', 'A'],
    );
    close(fused[0].score, 3 / 61, 'B score');
  });
});

describe('fusion: max', () => {
  it('takes the best raw score across retrievers, without max-normalizing', () => {
    const hits = {
      E: [
        { productId: 'A', score: 0.5 },
        { productId: 'B', score: 1 },
      ],
      Q: [{ productId: 'A', score: 4 }],
    };
    const fused = fuse(hits, config({ fusion: 'max' }));
    // A is E's worst (0.5) but Q's only hit (4), so A wins on the raw maximum.
    assert.equal(fused[0].productId, 'A');
    close(fused[0].score, 4);
    close(fused[1].score, 1);
  });

  it('keeps s1 informative, so the gate floor can still fire', () => {
    // Max-normalizing would force the top hit of every query to 1 and make
    // s1 constant, which would make the score floor dead.
    const weak = fuse({ E: [{ productId: 'A', score: 0.2 }] }, config({ fusion: 'max' }));
    assert.equal(weak[0].score, 0.2);
  });
});

describe('fusion: linear', () => {
  it('blends min-max normalized scores by weight', () => {
    const hits = {
      E: [
        { productId: 'A', score: 0.9 },
        { productId: 'B', score: 0.1 },
      ],
      Q: [
        { productId: 'B', score: 10 },
        { productId: 'A', score: 0 },
      ],
    };
    const fused = fuse(hits, config({ fusion: 'linear', weights: { E: 1, Q: 1 } }));
    // A: E 1.0 + Q 0.0 = 1.0; B: E 0.0 + Q 1.0 = 1.0 -> tie broken by id.
    assert.deepEqual(
      fused.map((candidate) => candidate.productId),
      ['A', 'B'],
    );
    close(fused[0].score, 1);
  });
});

describe('fusion: degenerate input', () => {
  it('returns [] when every retriever is empty', () => {
    assert.deepEqual(fuse({ E: [], Q: [] }, config()), []);
  });

  it('ignores a retriever that returned nothing', () => {
    const fused = fuse({ E: [{ productId: 'A', score: 1 }], Q: [] }, config());
    assert.deepEqual(fused.map((candidate) => candidate.productId), ['A']);
    assert.deepEqual(fused[0].ranks, { E: 1 });
  });
});
