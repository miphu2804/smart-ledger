/**
 * Alias learning over a simulated shop stream (PREREG section A).
 *
 * The bake-offs score each line once, against a resolver that has never been
 * corrected, so they cannot say what the alias table is worth. Here one shop
 * speaks a long stream of lines; the user's answers to ASK lines and their
 * corrections of wrong AUTO lines are fed back through `upsertAlias`, and the
 * tail of the stream is scored against a twin resolver that never learns.
 *
 *   node eval/alias/stream.ts --seeds 20261401,20261402,20261403 [--habit 0.5] [--out result.json]
 */

import { writeFileSync } from 'node:fs';

import { buildResolver } from '../../frontend/mobile/src/lib/resolver/index.ts';
import { folded } from '../../frontend/mobile/src/lib/resolver/normalizer.ts';
import type { CatalogItem, GateConfig, ResolverConfig } from '../../frontend/mobile/src/lib/resolver/types.ts';
import { mulberry32 } from '../lib/stats.ts';
import { synthesize } from '../lib/synth.ts';
import { lockboxData } from '../search/data.ts';

const STREAM = 800;
const WARMUP = 400;
const OOC_FRACTION = 0.1;
const MISTAP = 0.02;
const NOTICE_WRONG_AUTO = 0.5;
const CATALOGS = ['tap_hoa', 'ca_phe', 'quan_com', 'd3_100', 'd3_1000'];
const ARMS = [0, 1, 2, 3] as const; // 0 = no learning, else aliasMinConfirmations

const CONFIG: ResolverConfig = {
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

function gate(minConfirmations: number): GateConfig {
  return {
    gate: 'G1',
    rules: { sFloor: -Infinity, sAuto: 0.72, mMin: 0.1217, agreeMin: 1 },
    model: null,
    thetaAuto: 2,
    sFloor: -Infinity,
    aliasMinConfirmations: minConfirmations,
  };
}

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Utterance {
  span: string;
  gold: string | null;
}

interface Tally {
  lines: number;
  correctAuto: number;
  wrongAuto: number;
  wrongAutoViaAlias: number;
  ask: number;
  newLines: number;
  taps: number;
}

const emptyTally = (): Tally => ({ lines: 0, correctAuto: 0, wrongAuto: 0, wrongAutoViaAlias: 0, ask: 0, newLines: 0, taps: 0 });

/** One shop's stream: Zipf popularity, a habitual spoken form per item, 10% of items missing from the catalog. */
function shopStream(items: CatalogItem[], seed: number, habit: number): { catalog: CatalogItem[]; stream: Utterance[] } {
  const rng = mulberry32(seed);
  const order = [...items].sort((a, b) => hash(`${seed}:order:${a.id}`) - hash(`${seed}:order:${b.id}`));
  const missing = new Set(order.filter((item) => hash(`${seed}:ooc:${item.id}`) / 2 ** 32 < OOC_FRACTION).map((item) => item.id));
  const weights = order.map((_, rank) => 1 / (rank + 1));
  const total = weights.reduce((sum, w) => sum + w, 0);
  const habitual = new Map(order.map((item) => [item.id, synthesize(item.name, { seed: hash(`${seed}:habit:${item.id}`) }).text]));

  const stream: Utterance[] = [];
  for (let t = 0; t < STREAM; t += 1) {
    let pick = rng() * total;
    let index = 0;
    while (pick > weights[index] && index < weights.length - 1) pick -= weights[index++];
    const item = order[index];
    const span = rng() < habit ? habitual.get(item.id)! : synthesize(item.name, { seed: hash(`${seed}:fresh:${t}`) }).text;
    stream.push({ span, gold: missing.has(item.id) ? null : item.id });
  }
  return { catalog: items.filter((item) => !missing.has(item.id)), stream };
}

/** Replays one stream through one arm and tallies the held-out tail. */
function replay(catalog: CatalogItem[], stream: Utterance[], minConfirmations: number, seed: number): Tally {
  const rng = mulberry32(seed ^ 0x5eed);
  const resolver = buildResolver({ catalog, config: CONFIG, gate: gate(Math.max(1, minConfirmations)), seeds: [] });
  const learn = minConfirmations > 0;
  const tally = emptyTally();

  stream.forEach((utterance, t) => {
    const result = resolver.resolve({ rawProductSpan: utterance.span, qty: 1, unit: null });
    const top3 = result.topK.slice(0, 3).map((c) => c.productId);
    const scored = t >= WARMUP;
    let taught: string | null = null;
    let taps = 0;

    if (result.decision === 'AUTO') {
      if (result.productId === utterance.gold) {
        if (scored) tally.correctAuto += 1;
      } else {
        if (scored) {
          tally.wrongAuto += 1;
          if (result.features.alias === 1) tally.wrongAutoViaAlias += 1;
        }
        if (rng() < NOTICE_WRONG_AUTO) {
          taps = 2;
          taught = utterance.gold;
        }
      }
    } else {
      if (scored) result.decision === 'ASK' ? (tally.ask += 1) : (tally.newLines += 1);
      taps = result.decision === 'ASK' && utterance.gold !== null && top3.includes(utterance.gold) ? 1 : 2;
      taught = utterance.gold;
      const others = top3.filter((id) => id !== utterance.gold);
      if (taught !== null && others.length > 0 && rng() < MISTAP) taught = others[Math.floor(rng() * others.length)];
    }

    if (scored) {
      tally.lines += 1;
      tally.taps += taps;
    }
    if (learn && taught !== null) resolver.upsertAlias({ folded: folded(utterance.span), productId: taught, confirmedCount: 1 });
  });
  return tally;
}

/** One-sided 95% Clopper-Pearson upper bound, by bisection on the binomial CDF. */
function upper95(k: number, n: number): number {
  if (n === 0) return 1;
  const cdf = (p: number): number => {
    let term = (1 - p) ** n;
    let sum = term;
    for (let i = 1; i <= k; i += 1) {
      term *= ((n - i + 1) / i) * (p / (1 - p));
      sum += term;
    }
    return sum;
  };
  let lo = k / n;
  let hi = 1;
  for (let i = 0; i < 60; i += 1) {
    const mid = (lo + hi) / 2;
    if (cdf(mid) > 0.05) lo = mid;
    else hi = mid;
  }
  return hi;
}

function summary(t: Tally): Record<string, number> {
  return {
    lines: t.lines,
    correctAuto: t.correctAuto / t.lines,
    far: t.wrongAuto / t.lines,
    farUpper: upper95(t.wrongAuto, t.lines),
    wrongAuto: t.wrongAuto,
    wrongAutoViaAlias: t.wrongAutoViaAlias,
    ask: t.ask / t.lines,
    new: t.newLines / t.lines,
    tapsPerLine: t.taps / t.lines,
  };
}

function add(a: Tally, b: Tally): Tally {
  return {
    lines: a.lines + b.lines,
    correctAuto: a.correctAuto + b.correctAuto,
    wrongAuto: a.wrongAuto + b.wrongAuto,
    wrongAutoViaAlias: a.wrongAutoViaAlias + b.wrongAutoViaAlias,
    ask: a.ask + b.ask,
    newLines: a.newLines + b.newLines,
    taps: a.taps + b.taps,
  };
}

function main(): void {
  const seeds = arg('seeds', '20261401,20261402,20261403').split(',').map(Number);
  const habit = Number(arg('habit', '0.5'));
  const pooled = new Map<number, Tally>(ARMS.map((arm) => [arm, emptyTally()]));
  const rows: Array<Record<string, unknown>> = [];

  for (const seed of seeds) {
    const box = lockboxData({ lockbox: { d2Seed: seed, d3Seed: seed, oocSeed: seed, oocFraction: OOC_FRACTION } });
    for (const name of CATALOGS) {
      const items = box.catalogs[name] ?? box.catalogs[`${name}@${seed}`];
      const { catalog, stream } = shopStream(items, hash(`${seed}:${name}`), habit);
      for (const arm of ARMS) {
        const tally = replay(catalog, stream, arm, hash(`${seed}:${name}:user`));
        pooled.set(arm, add(pooled.get(arm)!, tally));
        rows.push({ seed, catalog: name, arm, ...summary(tally) });
      }
    }
  }

  const result = { habit, seeds, pooled: ARMS.map((arm) => ({ arm, ...summary(pooled.get(arm)!) })), rows };
  for (const row of result.pooled) {
    console.log(
      `arm L${row.arm}  correctAUTO ${(row.correctAuto * 100).toFixed(1)}%  FAR ${(row.far * 100).toFixed(2)}% (UB ${(row.farUpper * 100).toFixed(2)}%, ${row.wrongAuto}, alias ${row.wrongAutoViaAlias})  ASK ${(row.ask * 100).toFixed(1)}%  taps ${row.tapsPerLine.toFixed(2)}`,
    );
  }
  const out = arg('out', '');
  if (out) writeFileSync(out, JSON.stringify(result, null, 1));
}

main();
