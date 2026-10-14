/// <reference types="node" />
/**
 * Chuỗi parser trên máy (System 1) → LLM (System 2): chất lượng đầu-cuối và độ trễ của từng cấu hình, để chọn điểm cân
 * bằng giữa chất lượng và độ trễ.
 *
 *   npm run voice:cascade -- --llm scripts/voice-crf/.data/llm/default.jsonl [--llm <file khác>]
 *   npm run voice:cascade -- --escalated scripts/voice-crf/.data/llm/escalated.txt
 *   npm run voice:cascade -- --grid --llm <file có LLM cho mọi câu>   # lưới cấu hình parser, mỗi cấu hình → LLM
 *
 * `--escalated` ghi id các câu mà gate cũ hoặc gate câu tự do chặn, theo thứ tự ưu tiên khi ngân sách LLM nhỏ (bộ giữ kín
 * 3, gold test, câu tự do 2, câu tự do, gold dev), để `llm.py --ids` chỉ gọi những câu này.
 * File LLM do `llm.py` ghi (DraftService của backend/ai). Mỗi file LLM cho các cấu hình:
 * - chỉ trên máy, gate cũ / gate câu tự do: câu bị chặn thì hỏi lại người dùng (không tính là đúng);
 * - gate cũ / gate câu tự do → LLM: câu bị chặn gửi LLM;
 * - chỉ LLM (chỉ khi mọi câu trong bộ đều có kết quả LLM).
 * Đơn hàng của LLM: dòng khớp danh mục → món; dòng model báo mơ hồ → hỏi chọn trong cả danh mục; dòng không khớp hoặc
 * chưa chắc → món ngoài danh mục; khoản chi lấy từ chế độ EXPENSE. LLM lỗi hoặc quá hạn thì tính như hỏi lại.
 * Độ trễ một câu = parse trên máy (đo ở đây, Node) + LLM nếu gửi đi (SALE và EXPENSE gọi song song: lấy lần lâu hơn).
 * Bộ giữ kín chỉ in số tổng.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { DisambiguationItem, ParseableProduct, ParsedExpenseItem } from '../../src/lib/parseOrder';
import type { LineItem } from '../../src/data/types';
import {
  CRF_MODEL,
  crfTagger,
  type DetailedParse,
  type ParseOptions,
  parseOrderDetailed,
  ruleTagger,
} from '../../src/lib/voiceParse';
import { aggregate, type CaseScore, type GoldCase, type ScoredResult, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const readJsonl = <T,>(file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);
const readSet = (file: string, prefix = '') =>
  existsSync(here(file))
    ? readJsonl<GoldCase>(here(file).pathname).map((g) => ({ ...g, split: `${prefix}${g.split}` as GoldCase['split'] }))
    : [];
const gold = [
  ...readSet('./eval/gold.jsonl'),
  ...readSet('./eval/free.jsonl', 'free-'),
  ...readSet('./eval/free2.jsonl', 'free2-'),
  ...readSet('./eval/holdout3.jsonl', 'hold3-'),
];

interface LlmMode {
  ms: number;
  error?: string;
  tokens?: { input: number; output: number; reasoning: number; requests: number };
  lines?: Array<{ text: string; qty: number; product_id: number | null; ambiguous: boolean }>;
  items?: Array<{ product_id: number | null; name: string; qty: number; unit_price: number | null }>;
}
interface LlmRow {
  id: string;
  model: string;
  effort: string;
  sale: LlmMode;
  expense: LlmMode;
}

/** Đơn hàng của LLM theo kiểu `ParsedOrder`, hoặc `fallback` khi model lỗi. */
function llmOrder(row: LlmRow | undefined, products: ParseableProduct[]): ScoredResult {
  const none = { items: [], unknown: [], missingQuantityItems: [], disambiguations: [], expenses: [], normalizedText: '' };
  if (!row || row.sale.error || row.expense.error) return { ...none, fallback: true };
  const items: LineItem[] = [];
  const unknown: LineItem[] = [];
  const disambiguations: DisambiguationItem[] = [];
  // matching bỏ dòng có số lượng ≤ 0, các dòng còn lại khớp thứ tự với `items`
  const kept = (row.sale.lines ?? []).filter((l) => l.qty > 0);
  (row.sale.items ?? []).forEach((it, k) => {
    const qty = Math.max(1, Math.round(it.qty));
    if (it.product_id !== null) items.push({ productId: it.product_id, name: it.name, price: it.unit_price ?? 0, qty });
    else if (kept[k]?.ambiguous) {
      disambiguations.push({
        rawName: it.name,
        qty,
        unit: null,
        options: products.map((p) => ({ product_id: p.id, name: p.name, unit_price_vnd: p.price })),
      });
    } else unknown.push({ name: it.name, price: 0, qty });
  });
  const expenses: ParsedExpenseItem[] = (row.expense.items ?? [])
    .filter((e) => e.unit_price !== null)
    .map((e) => ({ title: e.name, amount: e.unit_price as number, category: 'khac' }));
  return { ...none, items, unknown, disambiguations, expenses, fallback: false };
}
const llmMs = (row: LlmRow | undefined) => (row ? Math.max(row.sale.ms, row.expense.ms) : 0);

// Parse trên máy một lần cho mỗi câu (gate cũ và gate câu tự do), đo thời gian sau một lượt khởi động
const local = gold.map((g) => {
  const products = catalogs[g.catalog];
  parseOrderDetailed(g.text, products);
  const time = (f: () => DetailedParse) => {
    const s = performance.now();
    const r = f();
    return { r, ms: performance.now() - s };
  };
  return {
    old: time(() => parseOrderDetailed(g.text, products, { freeFormGate: false })),
    neu: time(() => parseOrderDetailed(g.text, products)),
  };
});

const args = process.argv.slice(2);
const escalatedOut = args[args.indexOf('--escalated') + 1];
if (args.includes('--escalated') && escalatedOut) {
  const PRIORITY = ['hold3-test', 'test', 'free2-dev', 'free-test', 'free-dev', 'dev'];
  const ids = PRIORITY.flatMap((split) =>
    gold.filter((g, i) => g.split === split && (local[i].old.r.fallback || local[i].neu.r.fallback)).map((g) => g.id),
  );
  writeFileSync(resolve(escalatedOut), `${ids.join('\n')}\n`);
  const per = PRIORITY.map((split) => `${split} ${gold.filter((g) => g.split === split && ids.includes(g.id)).length}`).join(
    ', ',
  );
  console.log(`${ids.length}/${gold.length} câu bị chặn (${per}) → ${escalatedOut}`);
  process.exit(0);
}
const llmFiles = args.flatMap((a, i) => (a === '--llm' && args[i + 1] ? [args[i + 1]] : []));
if (!llmFiles.length) {
  console.error('Cần ít nhất một --llm <file> do llm.py ghi.');
  process.exit(1);
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const quantile = (xs: number[], p: number) =>
  [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))] ?? 0;
const SPLITS = ['dev', 'test', 'free-dev', 'free-test', 'free2-dev', 'hold3-test'];

if (args.includes('--grid')) {
  // Lưới của `voice:grid` (giải mã × θ × ν × tagger dự phòng × tên) × gate, mỗi cấu hình gửi câu bị chặn sang LLM (file
  // --llm đầu tiên). Chọn trên pool đã soát lỗi (dev, free-dev, free-test, free2-dev) theo câu đúng hết, rồi ít dòng sai,
  // rồi ít gửi LLM; test và bộ giữ kín 3 chỉ in cho cấu hình chọn được và cấu hình mặc định, số tổng.
  const rows = new Map(readJsonl<LlmRow>(resolve(llmFiles[0])).map((r) => [r.id, r]));
  const POOL = new Set(['dev', 'free-dev', 'free-test', 'free2-dev']);
  const tagger = crfTagger(CRF_MODEL, 32);
  const grid: Array<[string, ParseOptions]> = [];
  for (const freeFormGate of [true, false])
    for (const fb of ['none', 'rule'] as const)
      for (const looseNames of [true, false])
        for (const theta of [0.7, 0.8, 0.85, 0.9, 0.95]) {
          const name = `${freeFormGate ? 'gate tự do' : 'gate cũ'} θ${theta}${fb === 'rule' ? ' +luật' : ''}${looseNames ? '' : ' tên chặt'}`;
          const base: ParseOptions = {
            tagger,
            fallbackTagger: fb === 'rule' ? ruleTagger : undefined,
            looseNames,
            minConfidence: theta,
            freeFormGate,
          };
          grid.push([`${name} viterbi`, { ...base, decode: 'viterbi' }]);
          for (const nu of [0.1, 0.3, 0.5]) grid.push([`${name} valid ν${nu}`, { ...base, minValidMass: nu }]);
        }
  const run = (opts: ParseOptions, keep: (split: string) => boolean) => {
    const idx = gold.map((g, i) => (keep(g.split) ? i : -1)).filter((i) => i >= 0);
    const picks = idx.map((i) => {
      const s = performance.now();
      const r = parseOrderDetailed(gold[i].text, catalogs[gold[i].catalog], opts);
      const ms = performance.now() - s;
      if (!r.fallback) return { r, ms, llm: false };
      const row = rows.get(gold[i].id);
      return { r: llmOrder(row, catalogs[gold[i].catalog]), ms: ms + llmMs(row), llm: true };
    });
    const m = aggregate(
      idx.map((i, k) => scoreCase(gold[i], picks[k].r)),
      idx.map((i) => gold[i]),
    );
    return { m, llm: picks.filter((p) => p.llm).length / picks.length, p50: quantile(picks.map((p) => p.ms), 0.5), p95: quantile(picks.map((p) => p.ms), 0.95) };
  };
  type Res = ReturnType<typeof run>;
  const row = (name: string, r: Res) =>
    `| ${name} | ${pct(r.m.sentenceExact)} | ${pct(r.m.lineExact)} | ${pct(r.m.wrongAcceptRate)} (${r.m.wrongAccepted}/${r.m.accepted}) | ${pct(r.llm)} | ${Math.round(r.p50)} ms | ${Math.round(r.p95)} ms |`;
  const header = '| Cấu hình | Đúng hết (câu) | Đúng theo món | Dòng món sai / dòng món | Gửi LLM | P50 | P95 |\n|---|---|---|---|---|---|---|';
  const ranked = grid
    .map(([name, opts]) => ({ name, opts, r: run(opts, (s) => POOL.has(s)) }))
    .sort((a, b) => b.r.m.sentenceExact - a.r.m.sentenceExact || a.r.m.wrongAcceptRate - b.r.m.wrongAcceptRate || a.r.llm - b.r.llm);
  const defaults = ['gate tự do θ0.9 valid ν0.1', 'gate cũ θ0.9 valid ν0.1'];
  console.log(`# Lưới × LLM (${basename(llmFiles[0])}), ${grid.length} cấu hình, pool ${[...POOL].join(' + ')}\n`);
  console.log(header);
  for (const c of ranked.slice(0, 15)) console.log(row(c.name, c.r));
  console.log('| … | | | | | | |');
  for (const c of ranked.filter((c) => defaults.includes(c.name))) console.log(row(`${c.name} (mặc định, hạng ${ranked.indexOf(c) + 1})`, c.r));
  const oldBest = ranked.find((c) => c.name.startsWith('gate cũ'));
  if (oldBest) console.log(row(`${oldBest.name} (gate cũ tốt nhất, hạng ${ranked.indexOf(oldBest) + 1})`, oldBest.r));
  const last = ranked[ranked.length - 1];
  console.log(row(`${last.name} (cuối, hạng ${ranked.length})`, last.r));
  for (const split of ['test', 'hold3-test']) {
    console.log(`\n## ${split}\n\n${header}`);
    for (const c of [ranked[0], ...ranked.filter((c) => defaults.includes(c.name))])
      console.log(row(c === ranked[0] ? `${c.name} (chọn trên pool)` : c.name, run(c.opts, (s) => s === split)));
  }
  process.exit(0);
}

for (const file of llmFiles) {
  const rows = new Map(readJsonl<LlmRow>(resolve(file)).map((r) => [r.id, r]));
  const any = rows.values().next().value as LlmRow | undefined;
  const missing = gold.filter((g) => !rows.has(g.id)).length;
  console.log(
    `\n# ${basename(file)}: ${any?.model ?? '?'}, effort ${any?.effort ?? '?'} (${rows.size} câu có kết quả LLM, ${missing} câu thiếu)`,
  );
  console.log('Mỗi câu thiếu kết quả LLM hoặc LLM lỗi tính như hỏi lại.');
  const tok = [...rows.values()].flatMap((r) => [r.sale.tokens, r.expense.tokens]).filter((t) => t);
  if (tok.length) {
    const sum = (k: 'input' | 'output') => tok.reduce((a, t) => a + (t?.[k] ?? 0), 0);
    console.log(
      `Token trung bình mỗi câu (SALE + EXPENSE): ${Math.round((2 * sum('input')) / tok.length)} vào, ${Math.round((2 * sum('output')) / tok.length)} ra.`,
    );
  }
  type Pick = (i: number) => { r: ScoredResult; ms: number; llm: boolean };
  const CONFIGS: Array<[string, Pick]> = [
    ['Chỉ trên máy, gate cũ', (i) => ({ r: local[i].old.r, ms: local[i].old.ms, llm: false })],
    ['Chỉ trên máy, gate câu tự do', (i) => ({ r: local[i].neu.r, ms: local[i].neu.ms, llm: false })],
    ['Gate cũ → LLM', (i) => cascade(i, local[i].old)],
    ['Gate câu tự do → LLM', (i) => cascade(i, local[i].neu)],
    [
      'Chỉ LLM',
      (i) => ({ r: llmOrder(rows.get(gold[i].id), catalogs[gold[i].catalog]), ms: llmMs(rows.get(gold[i].id)), llm: true }),
    ],
  ];
  function cascade(i: number, l: { r: DetailedParse; ms: number }) {
    if (!l.r.fallback) return { r: l.r, ms: l.ms, llm: false };
    const row = rows.get(gold[i].id);
    return { r: llmOrder(row, catalogs[gold[i].catalog]), ms: l.ms + llmMs(row), llm: true };
  }
  for (const split of SPLITS) {
    const idx = gold.map((g, i) => (g.split === split ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    console.log(`\n## ${split} (${idx.length} câu)\n`);
    console.log('| Cấu hình | Đúng hết (câu) | Đúng theo món | Dòng món sai / dòng món | Gửi LLM | Độ trễ P50 | P95 |');
    console.log('|---|---|---|---|---|---|---|');
    for (const [name, pick] of CONFIGS) {
      if (name === 'Chỉ LLM' && idx.some((i) => !rows.has(gold[i].id))) continue;
      const picks = idx.map(pick);
      const scores: CaseScore[] = idx.map((i, k) => scoreCase(gold[i], picks[k].r));
      const m = aggregate(
        scores,
        idx.map((i) => gold[i]),
      );
      const ms = picks.map((p) => p.ms);
      const fmtMs = (x: number) => (x >= 100 ? `${Math.round(x)} ms` : `${x.toFixed(1)} ms`);
      console.log(
        `| ${name} | ${pct(m.sentenceExact)} | ${pct(m.lineExact)} | ${pct(m.wrongAcceptRate)} (${m.wrongAccepted}/${m.accepted}) | ${pct(picks.filter((p) => p.llm).length / picks.length)} | ${fmtMs(quantile(ms, 0.5))} | ${fmtMs(quantile(ms, 0.95))} |`,
      );
    }
  }
}
