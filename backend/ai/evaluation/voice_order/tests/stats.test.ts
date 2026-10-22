/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bootstrapCI,
  bootstrapCIStratified,
  bootstrapDifference,
  mcnemar,
  mcnemarExact,
  mulberry32,
  percentile,
  ruleOfThree,
} from '../lib/stats.ts';

describe('stats: seeded generator', () => {
  it('reproduces the same stream for the same seed', () => {
    const first = mulberry32(7);
    const second = mulberry32(7);
    for (let i = 0; i < 20; i += 1) assert.equal(first(), second());
  });

  it('gives different streams for different seeds', () => {
    assert.notEqual(mulberry32(1)(), mulberry32(2)());
  });
});

describe('stats: percentile', () => {
  it('returns the extremes and the median', () => {
    const ascending = [1, 2, 3, 4, 5];
    assert.equal(percentile(ascending, 0), 1);
    assert.equal(percentile(ascending, 1), 5);
    assert.equal(percentile(ascending, 0.5), 3);
  });

  it('interpolates between neighbours', () => {
    assert.equal(percentile([0, 10], 0.25), 2.5);
  });
});

describe('stats: bootstrap', () => {
  it('collapses to the point estimate when every value is equal', () => {
    const interval = bootstrapCI([1, 1, 1, 1]);
    assert.deepEqual(interval, { mean: 1, lo: 1, hi: 1 });
  });

  it('is reproducible for a given seed', () => {
    const values = [1, 0, 1, 1, 0, 1, 0, 1, 1, 1];
    assert.deepEqual(bootstrapCI(values, { seed: 3 }), bootstrapCI(values, { seed: 3 }));
  });

  it('brackets the mean and stays inside [0, 1] for a rate', () => {
    const values = Array.from({ length: 100 }, (_, i) => (i % 3 === 0 ? 1 : 0));
    const interval = bootstrapCI(values, { seed: 5 });
    assert.ok(interval.lo <= interval.mean && interval.mean <= interval.hi, JSON.stringify(interval));
    assert.ok(interval.lo >= 0 && interval.hi <= 1, JSON.stringify(interval));
  });

  it('is wider on a small sample than on a large one', () => {
    const small = bootstrapCI(Array.from({ length: 10 }, (_, i) => (i % 2)), { seed: 1 });
    const large = bootstrapCI(Array.from({ length: 1000 }, (_, i) => (i % 2)), { seed: 1 });
    assert.ok(small.hi - small.lo > large.hi - large.lo);
  });

  it('pools strata with fixed weights when stratified', () => {
    // Each stratum must vary internally, otherwise resampling cannot move the
    // pooled mean and the interval is degenerate by construction.
    const interval = bootstrapCIStratified([[1, 1, 0, 1], [0, 0, 1, 0]], { seed: 2 });
    assert.equal(interval.mean, 0.5);
    assert.ok(interval.lo < 0.5 && interval.hi > 0.5, JSON.stringify(interval));
  });

  it('gives a degenerate interval when a stratum is constant, which is correct', () => {
    const interval = bootstrapCIStratified([[1, 1, 1, 1], [0, 0, 0, 0]], { seed: 2 });
    assert.deepEqual(interval, { mean: 0.5, lo: 0.5, hi: 0.5 });
  });

  it('handles an empty input without throwing', () => {
    const interval = bootstrapCI([]);
    assert.ok(Number.isNaN(interval.mean));
  });
});

describe('stats: rule of three', () => {
  it('gives 1% at 300 decisions, which is why the report needs 300 autos', () => {
    assert.equal(ruleOfThree(300), 0.01);
  });

  it('is NaN with no decisions, rather than a false claim of zero', () => {
    assert.ok(Number.isNaN(ruleOfThree(0)));
  });
});

describe('stats: McNemar', () => {
  it('is 1 when nothing is discordant', () => {
    assert.equal(mcnemarExact(0, 0), 1);
  });

  it('matches the exact binomial tail for a one-sided sweep', () => {
    // 10 discordant pairs all favouring one system: 2 * 0.5^10.
    assert.equal(mcnemarExact(10, 0), 2 * Math.pow(0.5, 10));
  });

  it('is symmetric in its arguments', () => {
    assert.equal(mcnemarExact(7, 2), mcnemarExact(2, 7));
  });

  it('never exceeds 1', () => {
    assert.ok(mcnemarExact(1, 1) <= 1);
  });

  it('counts the discordant pairs from aligned series', () => {
    const a = [true, true, true, false];
    const b = [true, false, false, true];
    assert.deepEqual(mcnemar(a, b), { b: 2, c: 1, p: mcnemarExact(2, 1) });
  });

  it('refuses misaligned series instead of guessing', () => {
    assert.throws(() => mcnemar([true], [true, false]), /equally long/);
  });
});

describe('stats: paired bootstrap of a difference', () => {
  it('does not exclude zero when the two systems are identical', () => {
    const series = [1, 1, 0, 1, 0, 1, 1, 0];
    const result = bootstrapDifference(series, series, { seed: 4 });
    assert.equal(result.mean, 0);
    assert.equal(result.excludesZero, false);
  });

  it('excludes zero when one system wins every item', () => {
    const a = [1, 1, 1, 1, 1, 1, 1, 1];
    const b = [0, 0, 0, 0, 0, 0, 0, 0];
    const result = bootstrapDifference(a, b, { seed: 4 });
    assert.equal(result.mean, 1);
    assert.equal(result.excludesZero, true);
  });
});
