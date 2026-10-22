/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  expectedCalibrationError,
  groupBy,
  lineF1,
  orderExactMatch,
  resolutionMetrics,
  riskCoverageArea,
  textMetrics,
  tokenDistance,
  type LineOutcome,
} from '../lib/metrics.ts';

function outcome(overrides: Partial<LineOutcome> = {}): LineOutcome {
  return {
    id: 'x',
    dataset: 'd2',
    tags: ['clean'],
    goldProductId: 'p1',
    decision: 'AUTO',
    autoProductId: 'p1',
    ranked: ['p1', 'p2'],
    confidence: 0.9,
    ...overrides,
  };
}

describe('metrics: tokenDistance', () => {
  it('is zero for identical sequences and the length for disjoint ones', () => {
    assert.equal(tokenDistance(['a', 'b'], ['a', 'b']), 0);
    assert.equal(tokenDistance(['a', 'b'], ['c', 'd']), 2);
  });

  it('counts a pure insertion as one edit', () => {
    assert.equal(tokenDistance(['a', 'b'], ['a', 'x', 'b']), 1);
  });
});

describe('metrics: text quality', () => {
  it('is zero on a perfect transcript', () => {
    const metrics = textMetrics([{ heard: 'Nước mắm Nam Ngư', reference: 'Nước mắm Nam Ngư' }]);
    assert.deepEqual(metrics, { ser: 0, cer: 0, ter: 0 });
  });

  it('attributes a tone-only mistake to TER, not to the folded error rate', () => {
    // "mam" for "mắm": one syllable wrong, and it is right once tones are stripped.
    const metrics = textMetrics([{ heard: 'mam', reference: 'mắm' }]);
    assert.equal(metrics.ser, 1);
    assert.equal(metrics.ter, 1);
    assert.ok(Math.abs(metrics.cer - 1 / 3) < 1e-9, `${metrics.cer}`);
  });

  it('attributes a consonant mistake to SER but not to TER', () => {
    // "nam" for "mam": wrong folded, so no part of the error is a tone error.
    const metrics = textMetrics([{ heard: 'nam', reference: 'mam' }]);
    assert.equal(metrics.ser, 1);
    assert.equal(metrics.ter, 0);
  });

  it('averages over syllables, not utterances', () => {
    const metrics = textMetrics([{ heard: 'a b', reference: 'a b c d' }]);
    assert.equal(metrics.ser, 0.5);
  });
});

describe('metrics: resolution', () => {
  it('scores a perfect set as perfect', () => {
    const metrics = resolutionMetrics([outcome(), outcome({ id: 'y' })]);
    assert.equal(metrics.top1, 1);
    assert.equal(metrics.recall3, 1);
    assert.equal(metrics.mrr, 1);
    assert.equal(metrics.far, 0);
    assert.equal(metrics.wrongAutos, 0);
    assert.equal(metrics.askRate, 0);
    assert.equal(metrics.tapsPerOrder, 0);
  });

  it('counts a wrong auto in FAR and in the rule-of-three numerator', () => {
    const metrics = resolutionMetrics([
      outcome({ id: 'good' }),
      outcome({ id: 'bad', autoProductId: 'p2' }),
    ]);
    assert.equal(metrics.wrongAutos, 1);
    assert.equal(metrics.far, 0.5);
    assert.equal(metrics.autos, 2);
  });

  it('scores ranking by MRR and recall@3, not by the decision', () => {
    const metrics = resolutionMetrics([
      outcome({ ranked: ['p1', 'p2'], decision: 'ASK', autoProductId: null }),
      outcome({ id: 'y', ranked: ['p2', 'p1'], decision: 'ASK', autoProductId: null }),
      outcome({ id: 'z', ranked: ['p2', 'p3', 'p1'], decision: 'ASK', autoProductId: null }),
    ]);
    assert.equal(metrics.mrr, (1 + 0.5 + 1 / 3) / 3);
    assert.equal(metrics.recall3, 1);
    assert.equal(metrics.askRate, 1);
  });

  it('counts taps: ASK costs 1 and NEW costs 3', () => {
    const metrics = resolutionMetrics([
      outcome({ decision: 'AUTO' }),
      outcome({ id: 'y', decision: 'ASK', autoProductId: null }),
      outcome({ id: 'z', decision: 'NEW', autoProductId: null }),
    ]);
    assert.equal(metrics.tapsPerOrder, 4 / 3);
  });

  it('scores NEW against the out-of-catalog lines', () => {
    const metrics = resolutionMetrics([
      outcome({ id: 'a', goldProductId: null, decision: 'NEW', autoProductId: null, ranked: [] }),
      outcome({ id: 'b', goldProductId: null, decision: 'ASK', autoProductId: null, ranked: [] }),
      outcome({ id: 'c', goldProductId: 'p1', decision: 'NEW', autoProductId: null, ranked: [] }),
    ]);
    assert.equal(metrics.newPrecision, 1 / 2);
    assert.equal(metrics.newRecall, 1 / 2);
  });

  it('treats an out-of-catalog line as incorrect for top-1', () => {
    const metrics = resolutionMetrics([outcome({ goldProductId: null, ranked: ['p1'] })]);
    assert.equal(metrics.top1, 0);
  });

  it('never prints NaN for an empty set', () => {
    const metrics = resolutionMetrics([]);
    for (const [name, value] of Object.entries(metrics)) {
      assert.ok(!Number.isNaN(value as number), `${name} is NaN`);
    }
  });
});

describe('metrics: risk-coverage', () => {
  it('is zero when the most confident answers are all right', () => {
    const outcomes = [
      outcome({ id: 'a', confidence: 0.9 }),
      outcome({ id: 'b', confidence: 0.8, ranked: ['p2', 'p1'] }),
    ];
    // i=1 correct (risk 0), i=2 one error in two (risk 0.5) -> area 0.25.
    assert.equal(riskCoverageArea(outcomes), 0.25);
  });

  it('is larger when the confident answers are the wrong ones', () => {
    const confidentWrong = riskCoverageArea([
      outcome({ id: 'a', confidence: 0.9, ranked: ['p2', 'p1'] }),
      outcome({ id: 'b', confidence: 0.8 }),
    ]);
    assert.equal(confidentWrong, 0.75);
  });
});

describe('metrics: calibration', () => {
  it('is zero when confidence matches accuracy exactly', () => {
    const outcomes = [
      outcome({ id: 'a', probability: 1 }),
      outcome({ id: 'b', probability: 0, ranked: ['p2', 'p1'] }),
    ];
    assert.equal(expectedCalibrationError(outcomes), 0);
  });

  it('is positive when confidence is over-stated', () => {
    const outcomes = [
      outcome({ id: 'a', probability: 0.99, ranked: ['p2', 'p1'] }),
      outcome({ id: 'b', probability: 0.99, ranked: ['p2', 'p1'] }),
    ];
    assert.ok(expectedCalibrationError(outcomes) > 0.9);
  });

  it('ignores lines that carry no probability', () => {
    assert.equal(expectedCalibrationError([outcome()]), 0);
  });
});

describe('metrics: grouping and end-to-end', () => {
  it('groups lines by a key', () => {
    const grouped = groupBy([outcome({ tags: ['loanword'] }), outcome({ id: 'y', tags: ['clean'] })], (o) => o.tags[0]);
    assert.deepEqual(Object.keys(grouped).sort(), ['clean', 'loanword']);
  });

  it('matches orders as multisets of (product, qty, unit)', () => {
    const orders = [
      { id: 'a', gold: [{ productId: 'p1', qty: 2 }], got: [{ productId: 'p1', qty: 2 }] },
      { id: 'b', gold: [{ productId: 'p1', qty: 2 }], got: [{ productId: 'p1', qty: 3 }] },
    ];
    assert.equal(orderExactMatch(orders), 0.5);
  });

  it('scores line F1 across orders', () => {
    const orders = [
      {
        id: 'a',
        gold: [{ productId: 'p1', qty: 1 }, { productId: 'p2', qty: 1 }],
        got: [{ productId: 'p1', qty: 1 }, { productId: 'p3', qty: 1 }],
      },
    ];
    // one true positive, two predicted, two actual -> 2*1/(2+2) = 0.5
    assert.equal(lineF1(orders), 0.5);
  });

  it('gives an empty order comparison a perfect score', () => {
    assert.equal(lineF1([{ id: 'a', gold: [], got: [] }]), 1);
    assert.equal(orderExactMatch([{ id: 'a', gold: [], got: [] }]), 1);
  });
});
