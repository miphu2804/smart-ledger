/// <reference types="node" />
/**
 * Eval một lệnh cho bộ parse giọng nói (brief §7): in bảng chỉ số của baseline `parseOrder` và của PoC trên dev/test.
 *
 *   npm run voice:eval                       # bảng chỉ số dev + test, độ trễ trên catalog 1.000 món
 *   npm run voice:eval -- --failures dev     # in câu sai của tập dev (chỉ soát lỗi trên dev, không trên test)
 *   npm run voice:eval -- --asr eval/asr/chunkformer-lm.jsonl   # chấm thêm transcript của một hệ STT (lặp --asr được)
 *
 * Bộ câu là câu tự soạn, chưa phải câu thật của người dùng: `eval/gold.jsonl` (bộ chính, dev/test) và `eval/free.jsonl`
 * (câu cấu trúc tự do: "mỗi thứ", "cũng vậy", sửa lời, số bàn…; tách `free-dev`/`free-test`).
 */
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { parseOrder as baselineParse, type ParseableProduct } from '../../src/lib/parseOrder';
import { parseOrderDetailed as pocParse, ruleTagger } from '../../src/lib/voiceParse';
import { bigCatalog } from './lexicon';
import { aggregate, type CaseScore, type GoldCase, type Metrics, type ScoredResult, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const readSet = (file: string, prefix = '') =>
  readFileSync(here(file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldCase)
    .map((g) => ({ ...g, split: `${prefix}${g.split}` as GoldCase['split'] }));
const gold = [...readSet('./eval/gold.jsonl'), ...readSet('./eval/free.jsonl', 'free-')];

type Parser = (text: string, products: ParseableProduct[]) => ScoredResult;
// poc: mặc định (chỉ CRF, chọn đơn hàng qua gate trong n-best); poc+luat: thêm tagger luật dự phòng cho câu CRF bỏ;
// poc-luat: chỉ tagger luật
const PARSERS: Record<string, Parser> = {
  baseline: baselineParse,
  poc: (t, p) => pocParse(t, p),
  'poc+luat': (t, p) => pocParse(t, p, { fallbackTagger: ruleTagger }),
  'poc-luat': (t, p) => pocParse(t, p, { tagger: ruleTagger }),
};
const COLUMNS = Object.keys(PARSERS);

const args = process.argv.slice(2);
const failuresSplit = args.includes('--failures') ? (args[args.indexOf('--failures') + 1] ?? 'dev') : null;
const failuresParser = args.includes('--parser') ? args[args.indexOf('--parser') + 1] : 'poc';
const asrFiles = args.flatMap((a, i) => (a === '--asr' && args[i + 1] ? [args[i + 1]] : []));

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

function table(split: string) {
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
  if (regressions.length && split.endsWith('dev')) console.log(`\nCâu bị hỏng: ${regressions.map((i) => gold[i].id).join(', ')}`);
  return { metrics, regressions: regressions.length };
}

function byCategory(split: string) {
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

// ─── Transcript của STT (`--asr`) ──────────────────────────────────────────────
// Mỗi dòng file: {"id": "<id câu vàng>", "text": "<transcript>"}. Câu vàng được đọc lên rồi đưa qua STT; ở đây chấm WER/CER
// của transcript so với câu vàng và chấm parser PoC trên transcript (so với cùng câu khi đọc thẳng chữ vàng).

/** Âm tiết để tính WER: chữ thường, giữ dấu (dấu thanh sai là lỗi STT), bỏ dấu câu. */
const syllables = (text: string) =>
  text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

function editDistance<T>(a: T[], b: T[]): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)));
    prev = cur;
  }
  return prev[b.length];
}

function asrTable(file: string) {
  const transcripts = new Map(
    readFileSync(resolve(file), 'utf8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { id: string; text: string })
      .map((r) => [r.id, r.text] as const),
  );
  const name = basename(file).replace(/\.jsonl$/, '');
  const unknownIds = [...transcripts.keys()].filter((id) => !gold.some((g) => g.id === id));
  console.log(`\n## STT \`${name}\` (${transcripts.size} transcript${unknownIds.length ? `, ${unknownIds.length} id không có trong bộ vàng` : ''})\n`);
  console.log('Chữ vàng = parser chạy trên câu vàng; STT = parser chạy trên transcript của cùng các câu đó.\n');
  console.log('| Tập | Số câu | WER | CER | Exact theo món: chữ vàng → STT | Tự nhận sai: chữ vàng → STT | Hỏi lại: chữ vàng → STT |');
  console.log('|---|---|---|---|---|---|---|');
  for (const split of ['dev', 'test', 'free-dev', 'free-test']) {
    const idx = gold.map((g, i) => (g.split === split && transcripts.has(g.id) ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const golds = idx.map((i) => gold[i]);
    let wordErr = 0;
    let words = 0;
    let charErr = 0;
    let chars = 0;
    for (const g of golds) {
      const ref = syllables(g.text);
      const hyp = syllables(transcripts.get(g.id) ?? '');
      wordErr += editDistance(ref, hyp);
      words += ref.length;
      charErr += editDistance([...ref.join(' ')], [...hyp.join(' ')]);
      chars += ref.join(' ').length;
    }
    const oracle = aggregate(idx.map((i) => scores.poc[i]), golds);
    const heard = aggregate(golds.map((g) => scoreCase(g, pocParse(transcripts.get(g.id) ?? '', catalogs[g.catalog]))), golds);
    const arrow = (f: (m: Metrics) => string) => `${f(oracle)} → ${f(heard)}`;
    console.log(
      `| ${split} | ${idx.length} | ${pct(wordErr / words)} | ${pct(charErr / chars)} | ${arrow((m) => pct(m.lineExact))} | ${arrow((m) => pct(m.wrongAcceptRate))} | ${arrow((m) => pct(m.askRate))} |`,
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
  const count = (split: string) => gold.filter((g) => g.split === split).length;
  console.log(`# Voice parse eval — ${gold.length} câu tự soạn (dev ${count('dev')}, test ${count('test')}, free-dev ${count('free-dev')}, free-test ${count('free-test')})`);
  table('dev');
  const test = table('test');
  byCategory('test');
  for (const split of ['free-dev', 'free-test']) if (count(split)) table(split);
  if (count('free-test')) byCategory('free-test');
  for (const file of asrFiles) asrTable(file);
  if (!asrFiles.length) latency();
  process.exitCode = test.regressions ? 1 : 0;
}
