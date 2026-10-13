/// <reference types="node" />
/**
 * Dò τ (điểm tối thiểu để là món trong danh mục) và δ (khoảng cách ứng viên 1–2 để tự nhận) CHỈ trên tập dev.
 * In các cặp tốt nhất; tập test không được đọc.
 *
 *   npm run voice:tune
 */
import { readFileSync } from 'node:fs';
import { parseOrder as baselineParse, type ParseableProduct } from '../../src/lib/parseOrder';
import { parseOrderDetailed } from '../../src/lib/voiceParse';
import { aggregate, type GoldCase, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const dev = readFileSync(here('./eval/gold.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as GoldCase)
  .filter((g) => g.split === 'dev');

const baseExact = dev.map((g) => scoreCase(g, baselineParse(g.text, catalogs[g.catalog])).exact);
const rows: Array<{ tau: number; delta: number; line: number; sentence: number; wrong: number; ask: number; regress: number }> = [];
for (let tau = 0.5; tau <= 0.9001; tau += 0.02) {
  for (let delta = 0.02; delta <= 0.3001; delta += 0.02) {
    const scores = dev.map((g) => scoreCase(g, parseOrderDetailed(g.text, catalogs[g.catalog], { tau, delta })));
    const m = aggregate(scores, dev);
    const regress = scores.filter((s, i) => baseExact[i] && !s.exact).length;
    rows.push({ tau, delta, line: m.lineExact, sentence: m.sentenceExact, wrong: m.wrongAcceptRate, ask: m.askRate, regress });
  }
}

// Hợp lệ: đạt mục tiêu §7 trên dev. Xếp theo exact theo món, rồi theo câu, rồi ít hỏi lại.
const ok = rows.filter((r) => r.wrong <= 0.02 && r.ask <= 0.15 && r.regress === 0);
ok.sort((a, b) => b.line - a.line || b.sentence - a.sentence || a.ask - b.ask);
const best = ok[0];
const plateau = ok.filter((r) => r.line === best.line && r.sentence === best.sentence && r.ask === best.ask);
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
console.log(`dev ${dev.length} câu; ${rows.length} cặp (τ, δ); ${ok.length} cặp đạt mục tiêu; ${plateau.length} cặp cùng điểm cao nhất`);
console.log('| τ | δ | Exact theo món | Theo câu | Tự nhận sai | Hỏi lại |\n|---|---|---|---|---|---|');
for (const r of ok.slice(0, 8)) {
  console.log(`| ${r.tau.toFixed(2)} | ${r.delta.toFixed(2)} | ${pct(r.line)} | ${pct(r.sentence)} | ${pct(r.wrong)} | ${pct(r.ask)} |`);
}
const taus = [...new Set(plateau.map((r) => r.tau))];
const deltas = [...new Set(plateau.map((r) => r.delta))];
console.log(`Vùng tốt nhất: τ ∈ [${Math.min(...taus).toFixed(2)}, ${Math.max(...taus).toFixed(2)}], δ ∈ [${Math.min(...deltas).toFixed(2)}, ${Math.max(...deltas).toFixed(2)}]`);

// Chọn điểm giữa vùng tốt nhất: nhiều cặp lân cận (±2 bước mỗi chiều) cũng tốt nhất, hoà thì gần tâm vùng hơn
const key = (t: number, d: number) => `${t.toFixed(2)}|${d.toFixed(2)}`;
const inPlateau = new Set(plateau.map((r) => key(r.tau, r.delta)));
const center = { tau: plateau.reduce((s, r) => s + r.tau, 0) / plateau.length, delta: plateau.reduce((s, r) => s + r.delta, 0) / plateau.length };
const support = (r: { tau: number; delta: number }) => {
  let n = 0;
  for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) if (inPlateau.has(key(r.tau + i * 0.02, r.delta + j * 0.02))) n++;
  return n;
};
const pickRow = [...plateau].sort(
  (a, b) => support(b) - support(a) || Math.hypot(a.tau - center.tau, a.delta - center.delta) - Math.hypot(b.tau - center.tau, b.delta - center.delta),
)[0];
console.log(`Chọn τ = ${pickRow.tau.toFixed(2)}, δ = ${pickRow.delta.toFixed(2)} (${support(pickRow)}/25 cặp lân cận cùng tốt nhất)`);
