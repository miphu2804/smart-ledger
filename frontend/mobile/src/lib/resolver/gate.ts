/**
 * The gate: turns retrieval evidence into AUTO / ASK / NEW (plan section 5.6).
 *
 * Two decision variants ship. G1 is a rule chain whose thresholds the harness
 * grid-searches. G2 is a small logistic regression over the same features,
 * whose weights and isotonic calibration map arrive as JSON, so inference is
 * one dot product and a table lookup with no runtime dependency.
 *
 * Both variants answer the same question — "is the top-1 candidate safe to
 * write into the order without asking?" — and both are tuned to minimize the
 * ask rate subject to a false-auto budget.
 */

import type { Decision, GateConfig, GateFeatures, GateModel } from './types.ts';
import { GATE_FEATURE_ORDER } from './types.ts';

/**
 * The numeric feature vector for `GateModel.weights`, in the frozen order.
 *
 * `unit_ok` is tri-state and becomes 1 / 0 / -1 for ok / unknown / mismatch.
 * A missing `stt_conf` becomes 0: the binding does not expose token confidence
 * today, so the weight fitted on it will be fitted on a constant unless the
 * binding starts reporting it.
 */
export function featureVector(features: GateFeatures): number[] {
  const unit = features.unit_ok === 'ok' ? 1 : features.unit_ok === 'mismatch' ? -1 : 0;
  const values: Record<(typeof GATE_FEATURE_ORDER)[number], number> = {
    s1: features.s1,
    margin: features.margin,
    disp: features.disp,
    agree: features.agree,
    jacc: features.jacc,
    unit_ok: unit,
    alias: features.alias,
    len_q: features.len_q,
    stt_conf: features.stt_conf ?? 0,
  };
  return GATE_FEATURE_ORDER.map((name) => values[name]);
}

/** Piecewise-linear interpolation over a monotone map, clamped at both ends. */
function calibrate(raw: number, map: GateModel['calibration']): number {
  if (map.length === 0) return raw;
  if (raw <= map[0][0]) return map[0][1];
  for (let i = 1; i < map.length; i += 1) {
    const [x1, y1] = map[i - 1];
    const [x2, y2] = map[i];
    if (raw <= x2) {
      if (x2 === x1) return y2;
      return y1 + ((raw - x1) / (x2 - x1)) * (y2 - y1);
    }
  }
  return map[map.length - 1][1];
}

/** The calibrated probability that the top-1 candidate is correct, under G2. */
export function gateProbability(features: GateFeatures, model: GateModel): number {
  const vector = featureVector(features);
  let logit = model.bias;
  for (let i = 0; i < vector.length; i += 1) logit += (model.weights[i] ?? 0) * vector[i];
  const raw = 1 / (1 + Math.exp(-logit));
  return calibrate(raw, model.calibration);
}

/**
 * The decision for one line.
 *
 * Both variants test in the order the plan lists them, which is load-bearing:
 * an alias hit auto-applies even when the fused score is low, and under G2 a
 * confident probability auto-applies even when the score floor would say NEW.
 * The harness measures whether that ordering is right; changing it is a change
 * to the algorithm, not to its parameters.
 */
export function decide(features: GateFeatures, config: GateConfig): Decision {
  if (config.gate === 'G2' && config.model) {
    if (gateProbability(features, config.model) >= config.thetaAuto) return 'AUTO';
    if (features.s1 < config.sFloor) return 'NEW';
    return 'ASK';
  }

  if (features.alias === 1) return 'AUTO';
  if (features.s1 < config.rules.sFloor) return 'NEW';
  if (
    features.s1 >= config.rules.sAuto &&
    features.margin >= config.rules.mMin &&
    features.agree === 1 &&
    features.unit_ok !== 'mismatch'
  ) {
    return 'AUTO';
  }
  return 'ASK';
}
