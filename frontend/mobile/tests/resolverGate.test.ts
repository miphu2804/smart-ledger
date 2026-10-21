/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decide, featureVector, gateProbability } from '../src/lib/resolver/gate.ts';
import type { GateConfig, GateFeatures, GateModel } from '../src/lib/resolver/types.ts';

function features(overrides: Partial<GateFeatures> = {}): GateFeatures {
  return {
    s1: 0.9,
    s2: 0.5,
    margin: 0.4,
    disp: 0.1,
    agree: 1,
    jacc: 1,
    unit_ok: 'ok',
    alias: 0,
    len_q: 3,
    stt_conf: null,
    ...overrides,
  };
}

function g1(overrides: Partial<GateConfig['rules']> = {}): GateConfig {
  return {
    gate: 'G1',
    rules: { sFloor: 0.35, sAuto: 0.8, mMin: 0.1, ...overrides },
    model: null,
    thetaAuto: 0.9,
    sFloor: 0.35,
    aliasMinConfirmations: 2,
  };
}

/** A model whose only live weight is `s1`, so the raw probability is sigmoid(s1). */
function s1Only(overrides: Partial<GateModel> = {}): GateModel {
  return { weights: [1, 0, 0, 0, 0, 0, 0, 0, 0], bias: 0, calibration: [], ...overrides };
}

describe('gate: featureVector', () => {
  it('orders the features exactly as GATE_FEATURE_ORDER declares', () => {
    assert.deepEqual(
      featureVector(features({ s1: 1, margin: 2, disp: 3, agree: 4, jacc: 5, alias: 1, len_q: 7, stt_conf: 8 })),
      [1, 2, 3, 4, 5, 1, 1, 7, 8],
    );
  });

  it('maps the tri-state unit_ok to 1 / 0 / -1', () => {
    const unit = (unit_ok: GateFeatures['unit_ok']) => featureVector(features({ unit_ok }))[5];
    assert.equal(unit('ok'), 1);
    assert.equal(unit('unknown'), 0);
    assert.equal(unit('mismatch'), -1);
  });

  it('substitutes 0 for a missing stt_conf', () => {
    assert.equal(featureVector(features({ stt_conf: null }))[8], 0);
    assert.equal(featureVector(features({ stt_conf: 0.75 }))[8], 0.75);
  });
});

describe('gate: G1 rules', () => {
  it('auto-applies a confirmed alias even when the score floor would say NEW', () => {
    assert.equal(decide(features({ alias: 1, s1: 0.01 }), g1()), 'AUTO');
  });

  it('says NEW below the score floor', () => {
    assert.equal(decide(features({ s1: 0.2 }), g1()), 'NEW');
  });

  it('auto-applies when score, margin, agreement and unit all hold', () => {
    assert.equal(decide(features(), g1()), 'AUTO');
  });

  it('asks when the retrievers disagree on the top-1', () => {
    assert.equal(decide(features({ agree: 0.5 }), g1()), 'ASK');
  });

  it('asks when the margin is too thin', () => {
    assert.equal(decide(features({ margin: 0.01 }), g1()), 'ASK');
  });

  it('asks when the parsed unit contradicts the candidate unit', () => {
    assert.equal(decide(features({ unit_ok: 'mismatch' }), g1()), 'ASK');
  });

  it('still auto-applies when the unit is merely unknown', () => {
    assert.equal(decide(features({ unit_ok: 'unknown' }), g1()), 'AUTO');
  });

  it('asks when the score is below the auto threshold but above the floor', () => {
    assert.equal(decide(features({ s1: 0.6 }), g1()), 'ASK');
  });
});

describe('gate: G2 logistic', () => {
  function g2(model: GateModel, thetaAuto = 0.5): GateConfig {
    return { gate: 'G2', rules: { sFloor: 0.35, sAuto: 0.8, mMin: 0.1 }, model, thetaAuto, sFloor: 0.35, aliasMinConfirmations: 2 };
  }

  it('computes the raw probability as sigmoid(s1) when only s1 has a weight', () => {
    const p = gateProbability(features({ s1: 0 }), s1Only());
    assert.ok(Math.abs(p - 0.5) < 1e-9, `${p}`);
  });

  it('auto-applies above theta', () => {
    assert.equal(decide(features({ s1: 2 }), g2(s1Only())), 'AUTO');
  });

  it('asks when the probability is low but the score clears the floor', () => {
    // bias -2 puts the probability under theta while s1 stays above sFloor.
    assert.equal(decide(features({ s1: 0.4 }), g2(s1Only({ bias: -2 }))), 'ASK');
  });

  it('says NEW when the probability is low and the score is under the floor', () => {
    assert.equal(decide(features({ s1: -5 }), g2(s1Only())), 'NEW');
  });

  it('interpolates the calibration map piecewise and clamps at both ends', () => {
    const model = s1Only({ calibration: [[0.4, 0], [0.6, 1]] });
    const at = (s1: number) => gateProbability(features({ s1 }), model);
    assert.ok(Math.abs(at(0) - 0.5) < 1e-9, `midpoint: ${at(0)}`);
    assert.equal(at(5), 1, 'above the top breakpoint clamps to 1');
    assert.equal(at(-5), 0, 'below the bottom breakpoint clamps to 0');
  });

  it('falls back to the raw probability when the calibration map is empty', () => {
    assert.ok(Math.abs(gateProbability(features({ s1: 0 }), s1Only()) - 0.5) < 1e-9);
  });

  it('uses G1 when the config names G2 but ships no model', () => {
    const config = g2(s1Only());
    assert.equal(decide(features({ alias: 1, s1: 0.01 }), { ...config, model: null }), 'AUTO');
  });
});
