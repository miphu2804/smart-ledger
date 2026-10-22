/**
 * The resolver the voice-order experiments run: the auto-research v3 winner
 * (`eval/reports/autoresearch_v3.md`), with its gate thresholds fitted on dev
 * calibration. Change it here when a new round picks another config.
 */

import type { GateConfig, ResolverConfig } from '../../../../frontend/mobile/src/lib/resolver/types.ts';

export const WINNER_CONFIG: ResolverConfig = {
  retrievers: ['E', 'Q-bm25', 'B'],
  fusion: 'rrf',
  rrfK: 60,
  weights: {},
  topK: 5,
  qMaxEditDistance: 2,
  eBruteMax: 500,
  useUnitStoplist: false,
  rerank: { pool: 10, weights: { E: 0.45, P: 0.05, T: 0.5 } },
};

/** G1 with the winner's thresholds; an alias is trusted after `minConfirmations`. */
export function winnerGate(minConfirmations: number): GateConfig {
  return {
    gate: 'G1',
    rules: { sFloor: -Infinity, sAuto: 0.72, mMin: 0.1217, agreeMin: 1 },
    model: null,
    thetaAuto: 2,
    sFloor: -Infinity,
    aliasMinConfirmations: minConfirmations,
  };
}
