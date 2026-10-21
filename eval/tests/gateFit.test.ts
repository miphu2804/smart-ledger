/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  fitGateModel,
  fitIsotonic,
  fitLogistic,
  scoreRules,
  shuffleInPlace,
  tuneGateRules,
  tuneTheta,
  type TuningLine,
} from '../lib/gateFit.ts';
import { GATE_FEATURE_ORDER, type GateFeatures, type GateRules } from '../../frontend/mobile/src/lib/resolver/types.ts';

function base(s1: number, extra: Partial<GateFeatures>): GateFeatures {
  return { s1, s2: s1, margin: 0.4, disp: 0, agree: 1, jacc: 1, unit_ok: 'ok', alias: 0, len_q: 3, stt_conf: null, ...extra };
}

/** The resolver ranked the gold product first. */
function right(s1: number, extra: Partial<GateFeatures> = {}): TuningLine {
  return { goldProductId: 'p1', top1: 'p1', features: base(s1, extra) };
}

/** The resolver ranked something else first. */
function wrong(s1: number, extra: Partial<GateFeatures> = {}): TuningLine {
  return { goldProductId: 'p1', top1: 'p2', features: base(s1, extra) };
}

/** The line really has no catalog answer, so no in-catalog top-1 can be right. */
function outOfCatalog(s1: number, extra: Partial<GateFeatures> = {}): TuningLine {
  return { goldProductId: null, top1: 'p1', features: base(s1, extra) };
}

const RULES: GateRules = { sFloor: 0.3, sAuto: 0.8, mMin: 0.05 };

describe('gateFit: scoreRules', () => {
  const lines = [
    right(0.9),
    right(0.4, { margin: 0.01 }),
    wrong(0.9),
    outOfCatalog(0.1),
    wrong(0.2),
  ];

  it('replays the shipped rule order and counts the outcomes', () => {
    const score = scoreRules(lines, RULES);
    assert.equal(score.autos, 2, 'the two high-score lines auto-apply');
    assert.equal(score.wrongAutos, 1);
    assert.equal(score.correctAutos, 1);
    assert.equal(score.askRate, 1 / 5);
    assert.equal(score.far, 1 / 5);
  });

  it('sends a line under the score floor to NEW rather than ASK', () => {
    const score = scoreRules([outOfCatalog(0.1)], RULES);
    assert.equal(score.askRate, 0);
    assert.equal(score.autos, 0);
  });

  it('auto-applies a trusted alias whatever the score', () => {
    const score = scoreRules([right(0.01, { alias: 1 })], RULES);
    assert.equal(score.autos, 1);
    assert.equal(score.correctAutos, 1);
  });

  it('counts a wrong alias auto as a false auto', () => {
    const score = scoreRules([wrong(0.99, { alias: 1 })], RULES);
    assert.equal(score.autos, 1);
    assert.equal(score.wrongAutos, 1);
  });

  it('refuses to auto-apply on a unit mismatch or a thin margin', () => {
    assert.equal(scoreRules([right(0.99, { unit_ok: 'mismatch' })], RULES).autos, 0);
    assert.equal(scoreRules([right(0.99, { margin: 0.001 })], RULES).autos, 0);
    assert.equal(scoreRules([right(0.99, { agree: 0.5 })], RULES).autos, 0);
  });

  it('never reports NaN on an empty set', () => {
    assert.deepEqual(scoreRules([], RULES), {
      askRate: 0,
      newRate: 0,
      nonAutoRate: 0,
      far: 0,
      autos: 0,
      wrongAutos: 0,
      correctAutos: 0,
    });
  });
});

describe('gateFit: tuneGateRules', () => {
  const lines = [
    right(0.9),
    right(0.4, { margin: 0.01 }),
    wrong(0.9),
    outOfCatalog(0.1),
    wrong(0.2),
  ];

  it('answers as many lines as possible inside the false-auto budget', () => {
    const tuned = tuneGateRules(lines, { farMax: 0.25 });
    assert.ok(tuned.score.far <= 0.25, `far ${tuned.score.far}`);
    // The budget affords exactly one wrong auto, so the tuner spends it on the
    // third line and answers the first two silently; the two low-score lines are
    // asked about rather than declared NEW, because nothing here is below the
    // noise floor.
    assert.equal(tuned.score.autos, 3);
    assert.equal(tuned.score.askRate, 0.4);
    assert.equal(tuned.score.newRate, 0);
  });

  it('does not dodge into NEW when auto-applying is achievable', () => {
    // The objective used to be the ask rate alone, which made NEW a free way to
    // dodge: a gate that answered NEW to everything had zero asks and zero
    // false autos, so the search returned it and the row resolved nothing while
    // reporting FAR 0. NEW is a failure to answer as much as an ask is.
    const obvious = [right(0.9), right(0.9), right(0.9), right(0.9), outOfCatalog(0.05)];
    const tuned = tuneGateRules(obvious, { farMax: 0.2 });
    // The budget tolerates one wrong auto, and the objective spends it: five
    // answers with one mistake beats four answers with none.
    assert.ok(tuned.score.far <= 0.2, `far ${tuned.score.far}`);
    assert.equal(tuned.score.autos, 5, 'the tuner chose silence over answering');
  });

  it('prefers an ask over a NEW when both cost the same', () => {
    // Two lines with the same features and opposite outcomes: the gate cannot
    // tell them apart, so nothing may be auto-applied. Coverage and mistakes
    // are then equal for every remaining rule set, and the tie must go to the
    // ask, which still hands the user candidates, over the NEW, which does not.
    const identical = [right(0.9), wrong(0.9)];
    const tuned = tuneGateRules(identical, { farMax: 0 });
    assert.equal(tuned.score.autos, 0);
    assert.equal(tuned.score.newRate, 0, 'both lines should be asked about, not refused');
    assert.equal(tuned.score.askRate, 1);
  });

  it('buys safety when the budget forbids the only wrong auto', () => {
    const tuned = tuneGateRules(lines, { farMax: 0.1 });
    assert.ok(tuned.score.far <= 0.1, `far ${tuned.score.far}`);
    assert.equal(tuned.score.wrongAutos, 0);
    // The two identical-featured lines cannot be told apart, so the tuner must
    // stop auto-applying both of them.
    assert.ok(tuned.score.askRate > 0, 'safety costs an ask');
  });

  it('is deterministic', () => {
    assert.deepEqual(tuneGateRules(lines, { farMax: 0.25 }), tuneGateRules(lines, { farMax: 0.25 }));
  });

  it('falls back to a conservative rule set when no combination fits the budget', () => {
    const tuned = tuneGateRules([wrong(0.99)], { farMax: 0 });
    assert.ok(tuned.score.far <= 0, `far ${tuned.score.far}`);
    assert.equal(tuned.score.autos, 0);
  });
});

describe('gateFit: fitLogistic', () => {
  it('learns the direction of a separable feature', () => {
    const { weights, bias } = fitLogistic([[0], [1], [2], [3]], [0, 0, 1, 1]);
    assert.equal(weights.length, 1);
    assert.ok(weights[0] > 0, `weight ${weights[0]}`);
    const p = (x: number) => 1 / (1 + Math.exp(-(bias + weights[0] * x)));
    assert.ok(p(3) > p(0), `${p(3)} vs ${p(0)}`);
    assert.ok(p(3) > 0.5 && p(0) < 0.5);
  });

  it('gives a constant feature a zero weight instead of dividing by zero', () => {
    const rows = [[1, 0], [1, 1], [1, 2], [1, 3]];
    const { weights } = fitLogistic(rows, [0, 0, 1, 1]);
    assert.equal(weights[0], 0, 'the constant column carries no signal');
    assert.ok(Number.isFinite(weights[1]));
  });

  it('is reproducible', () => {
    const rows = [[0], [1], [2], [3]];
    assert.deepEqual(fitLogistic(rows, [0, 0, 1, 1]), fitLogistic(rows, [0, 0, 1, 1]));
  });

  it('handles an empty design matrix', () => {
    assert.deepEqual(fitLogistic([], []), { weights: [], bias: 0 });
  });
});

describe('gateFit: fitIsotonic', () => {
  it('returns a non-decreasing map that spans the observed range', () => {
    const points = fitIsotonic([0.1, 0.2, 0.8, 0.9], [0, 0, 1, 1]);
    assert.ok(points.length >= 2);
    for (let i = 1; i < points.length; i += 1) {
      assert.ok(points[i][1] >= points[i - 1][1], `not monotone at ${i}`);
    }
    assert.equal(points[0][1], 0);
    assert.equal(points[points.length - 1][1], 1);
  });

  it('pools a reversal into one constant block', () => {
    const points = fitIsotonic([0.9, 0.1], [0, 1]);
    assert.deepEqual(points, [[0.1, 0.5], [0.9, 0.5]]);
  });

  it('returns nothing for no data', () => {
    assert.deepEqual(fitIsotonic([], []), []);
  });
});

describe('gateFit: fitGateModel and tuneTheta', () => {
  const lines = [
    right(0.9), right(0.85), right(0.8), right(0.75),
    wrong(0.3), wrong(0.25), wrong(0.2), wrong(0.15),
  ];

  it('fits one weight per gate feature and a calibration map', () => {
    const model = fitGateModel(lines);
    assert.equal(model.weights.length, GATE_FEATURE_ORDER.length);
    assert.ok(Number.isFinite(model.bias));
    assert.ok(model.calibration.length > 0);
  });

  it('learns that a higher score means a likelier correct top-1', () => {
    const model = fitGateModel(lines);
    const index = GATE_FEATURE_ORDER.indexOf('s1');
    assert.ok(model.weights[index] > 0, `s1 weight ${model.weights[index]}`);
  });

  it('picks a threshold inside the false-auto budget', () => {
    const model = fitGateModel(lines);
    const tuned = tuneTheta(lines, model, { farMax: 0.1, sFloor: 0.3 });
    assert.ok(tuned.thetaAuto > 0 && tuned.thetaAuto <= 1, `theta ${tuned.thetaAuto}`);
    assert.ok(tuned.far <= 0.1, `far ${tuned.far}`);
  });

  it('prefers the higher threshold when the ask rate ties', () => {
    // Every threshold that auto-applies nothing ties on ask rate, so the tie
    // must be broken toward the safer end of the range rather than the first
    // candidate the search happened to try.
    const model = fitGateModel([wrong(0.9), wrong(0.8)]);
    const tuned = tuneTheta([wrong(0.9), wrong(0.8)], model, { farMax: 0, sFloor: 0.3 });
    assert.equal(tuned.thetaAuto, 1);
    assert.equal(tuned.far, 0);
  });
});

describe('gateFit: shuffleInPlace', () => {
  it('permutes deterministically and loses nothing', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const first = shuffleInPlace([...items], 11);
    const second = shuffleInPlace([...items], 11);
    assert.deepEqual(first, second);
    assert.deepEqual([...first].sort((a, b) => a - b), items);
    assert.notDeepEqual(first, items, 'a shuffle that changes nothing is suspicious');
  });
});
