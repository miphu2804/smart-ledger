/// <reference types="node" />
/**
 * Eval một lệnh cho bộ parse giọng nói (brief §7): in bảng chỉ số của baseline `parseOrder` và của PoC trên dev/test.
 *
 *   npm run voice:eval                       # bảng chỉ số dev + test, độ trễ trên catalog 1.000 món
 *   npm run voice:eval -- --failures dev     # in câu sai của tập dev (chỉ soát lỗi trên dev, không trên test)
 *
 * Bộ câu là câu tự soạn (eval/gold.jsonl), chưa phải câu thật của người dùng.
 */
import { readFileSync } from 'node:fs';
import { parseOrder as baselineParse, type ParseableProduct } from '../../src/lib/parseOrder';
import { crfTagger, parseOrderDetailed as pocParse } from '../../src/lib/voiceParse';
import type { CrfModel } from '../../src/lib/voiceParse/crf';
import { bigCatalog } from './lexicon';
import { aggregate, type CaseScore, type GoldCase, type Metrics, type ScoredResult, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const gold = readFileSync(here('./eval/gold.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as GoldCase);

type Parser = (text: string, products: ParseableProduct[]) => ScoredResult;
const crfModel = JSON.parse(readFileSync(here('../../src/lib/voiceParse/crf-model.json'), 'utf8')) as CrfModel;
const crf = crfTagger(crfModel);
const PARSERS: Record<string, Parser> = {
  baseline: baselineParse,
  poc: (t, p) => pocParse(t, p),
  'poc-crf': (t, p) => pocParse(t, p, { tagger: crf }),
};
const COLUMNS = Object.keys(PARSERS);

const args = process.argv.slice(2);
const failuresSplit = args.includes('--failures') ? (args[args.indexOf('--failures') + 1] ?? 'dev') : null;
const failuresParser = args.includes('--parser') ? args[args.indexOf('--parser') + 1] : 'poc';

const scores: Record<string, CaseScore[]> = {};
for (const [name, parse] of Object.entries(PARSERS)) {
  scores[name] = gold.map((g) => scoreCase(g, parse(g.text, catalogs[g.catalog])));
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const ROWS: Array<[string, (m: Metrics) => string, string]> = [
  ['Exact match theo món (mọi dòng)', (m) => pct(m.lineExact), '≥ 90%'],
  ['  chỉ món trong danh mục', (m) => pct(m.catalogLineExact), ''],
  ['Exact match theo câu', (m) => pct(m.sentenceExact), 'báo cáo'],
  ['Sai mà vẫn tự nhận (dòng)', (m) => `${pct(m.wrongAcceptRate)} (${m.wrongAccepted}/${m.accepted})`, '≤ 2%'],
  ['  câu có tự nhận sai', (m) => pct(m.wrongAcceptSentenceRate), ''],
  ['Fallback hoặc hỏi lại (câu)', (m) => pct(m.askRate), '≤ 15%'],
  ['Khoản chi đúng số tiền', (m) => pct(m.expenseExact), ''],
];

function table(split: 'dev' | 'test') {
  const idx = gold.map((g, i) => (g.split === split ? i : -1)).filter((i) => i >= 0);
  const golds = idx.map((i) => gold[i]);
  const metrics = Object.fromEntries(Object.entries(scores).map(([n, s]) => [n, aggregate(idx.map((i) => s[i]), golds)]));
  const regress = (n: string) => idx.filter((i) => scores.baseline[i].exact && !scores[n][i].exact);
  const fixed = (n: string) => idx.filter((i) => !scores.baseline[i].exact && scores[n][i].exact).length;
  const regressions = regress('poc');
  const others = COLUMNS.slice(1);
  console.log(`\n## ${split} (${idx.length} câu, ${golds.reduce((n, g) => n + g.lines.length, 0)} dòng vàng)\n`);
  console.log(`| Chỉ số | ${COLUMNS.join(' | ')} | Mục tiêu |\n|---|${COLUMNS.map(() => '---|').join('')}---|`);
  for (const [label, f, target] of ROWS) console.log(`| ${label} | ${COLUMNS.map((n) => f(metrics[n])).join(' | ')} | ${target} |`);
  console.log(`| Câu từ đúng thành sai (so với baseline) | — | ${others.map((n) => regress(n).length).join(' | ')} | 0 |`);
  console.log(`| Câu từ sai thành đúng | — | ${others.map(fixed).join(' | ')} | |`);
  // Chỉ in câu bị hỏng của dev: soát lỗi trên test là tune theo test
  if (regressions.length && split === 'dev') console.log(`\nCâu bị hỏng: ${regressions.map((i) => gold[i].id).join(', ')}`);
  return { metrics, regressions: regressions.length };
}

function byCategory(split: 'dev' | 'test') {
  const cats = [...new Set(gold.filter((g) => g.split === split).map((g) => g.category))].sort();
  console.log(`\nExact match theo câu, từng nhóm (${split}):\n`);
  console.log(`| Nhóm | Số câu | ${COLUMNS.join(' | ')} |\n|---|---|${COLUMNS.map(() => '---|').join('')}`);
  for (const c of cats) {
    const idx = gold.map((g, i) => (g.split === split && g.category === c ? i : -1)).filter((i) => i >= 0);
    const rate = (n: string) => pct(idx.filter((i) => scores[n][i].exact).length / idx.length);
    console.log(`| ${c} | ${idx.length} | ${COLUMNS.map(rate).join(' | ')} |`);
  }
}

function latency() {
  const products = bigCatalog(catalogs.tap_hoa, 1000);
  const texts = gold.filter((g) => g.split === 'test').map((g) => g.text);
  console.log(`\n## Độ trễ parse trên Node ${process.version}, catalog ${products.length} món, ${texts.length} câu test\n`);
  console.log('| Parser | Dựng index (câu đầu) | Lượt đầu P95 | P50 | P95 | Max |\n|---|---|---|---|---|---|');
  const quantile = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  for (const [name, parse] of Object.entries(PARSERS)) {
    const fresh = products.map((p) => ({ ...p }));
    const t0 = performance.now();
    parse(texts[0], fresh);
    const first = performance.now() - t0;
    // Lượt đầu: mỗi câu một lần, bộ nhớ đệm từ còn lạnh (gần với câu mới của người dùng)
    const firstPass = texts.map((t) => {
      const s = performance.now();
      parse(t, fresh);
      return performance.now() - s;
    });
    const times: number[] = [];
    for (let k = 0; k < 10; k++) {
      for (const t of texts) {
        const s = performance.now();
        parse(t, fresh);
        times.push(performance.now() - s);
      }
    }
    const ms = (x: number) => `${x.toFixed(3)} ms`;
    console.log(
      `| ${name} | ${first.toFixed(2)} ms | ${ms(quantile(firstPass, 0.95))} | ${ms(quantile(times, 0.5))} | ${ms(quantile(times, 0.95))} | ${ms(Math.max(...times))} |`,
    );
  }
}

if (failuresSplit) {
  for (const [i, g] of gold.entries()) {
    const s = scores[failuresParser][i];
    if (g.split !== failuresSplit || s.exact) continue;
    console.log(`${g.id} [${g.category}] ${JSON.stringify(g.text)}\n    ${s.problems.join('; ')}${g.note ? `\n    note: ${g.note}` : ''}`);
  }
} else {
  console.log(`# Voice parse eval — ${gold.length} câu tự soạn (dev ${gold.filter((g) => g.split === 'dev').length}, test ${gold.filter((g) => g.split === 'test').length})`);
  table('dev');
  const test = table('test');
  byCategory('test');
  latency();
  process.exitCode = test.regressions ? 1 : 0;
}
