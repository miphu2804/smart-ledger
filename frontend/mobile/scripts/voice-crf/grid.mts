/// <reference types="node" />
/**
 * Dò lưới cấu hình của bộ parse giọng nói (nghiên cứu): mỗi cấu hình (model CRF × cách giải mã × ngưỡng × tagger dự phòng)
 * chạy trên mọi tập, in một dòng chỉ số. Chọn cấu hình trên "pool" (dev chính + free-dev + free-test, đều đã soát lỗi);
 * tập test chính chỉ dùng làm chốt chặn (không soát lỗi, chỉ xem số tổng).
 *
 *   npm run voice:grid                                   # lưới giải mã (θ × ν × dự phòng × tên) trên model mặc định
 *   npm run voice:grid -- --model a.json --compact       # thêm model (train.py --model a.json), vài cấu hình chính
 *   npm run voice:grid -- --ablate                       # tắt gate dấu hiệu / luật số tham chiếu viết tay
 *   npm run voice:grid -- --lexout <thư mục synth --holdout 1> --model <model train trên thư mục đó>
 *                                                        # câu synthetic dùng từ vựng chưa gặp: đúng / tự nhận sai / hỏi lại
 *   npm run voice:grid -- --oracle                       # câu hỏi lại trong pool: đơn hàng đúng có trong n-best không
 *   npm run voice:grid -- --latency                      # thêm P95 trên danh mục 1.000 món
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import type { ParseableProduct, ParsedOrder } from '../../src/lib/parseOrder';
import { type Candidate, CRF_MODEL, crfTagger, type ParseOptions, parseOrderDetailed, ruleTagger } from '../../src/lib/voiceParse';
import type { CrfModel } from '../../src/lib/voiceParse/crf';
import type { Label } from '../../src/lib/voiceParse/tagger';
import { bigCatalog, TRAIN_CATALOGS } from './lexicon';
import { aggregate, type GoldCase, type Metrics, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const readSet = (file: string, prefix = '') =>
  readFileSync(here(file), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as GoldCase)
    .map((g) => ({ ...g, split: `${prefix}${g.split}` as GoldCase['split'] }));
const gold = [...readSet('./eval/gold.jsonl'), ...readSet('./eval/free.jsonl', 'free-')];
const POOL = new Set(['dev', 'free-dev', 'free-test']);

const args = process.argv.slice(2);
const many = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const one = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const models: Array<[string, CrfModel]> = [
  ['default', CRF_MODEL],
  ...many('--model').map((f) => [basename(f).replace(/\.json$/, ''), JSON.parse(readFileSync(resolve(f), 'utf8')) as CrfModel] as [string, CrfModel]),
];
const only = one('--only');
const out = one('--out');

interface Config {
  name: string;
  opts: ParseOptions;
}

function configs(model: string, m: CrfModel): Config[] {
  const tagger = crfTagger(m, 32);
  const list: Config[] = [];
  if (args.includes('--ablate')) {
    // Có phụ thuộc phần viết tay không: cấu hình mặc định, tắt lần lượt gate dấu hiệu / luật số tham chiếu
    for (const theta of [0.8, 0.9]) {
      const base: ParseOptions = { tagger, minConfidence: theta };
      list.push({ name: `${model} θ${theta} đủ`, opts: base });
      list.push({ name: `${model} θ${theta} -markers`, opts: { ...base, ablate: ['markers'] } });
      list.push({ name: `${model} θ${theta} -refs`, opts: { ...base, ablate: ['refs'] } });
      list.push({ name: `${model} θ${theta} -markers -refs`, opts: { ...base, ablate: ['markers', 'refs'] } });
    }
    return list;
  }
  if (args.includes('--compact')) {
    // so sánh model: mặc định, mặc định + tagger luật dự phòng, cách của giai đoạn 3 (Viterbi, luật dự phòng)
    list.push({ name: `${model} mặc định (valid θ0.9 ν0.1)`, opts: { tagger } });
    list.push({ name: `${model} valid θ0.9 ν0.1 +luật`, opts: { tagger, fallbackTagger: ruleTagger } });
    list.push({ name: `${model} viterbi θ0.9`, opts: { tagger, decode: 'viterbi' } });
    list.push({ name: `${model} viterbi θ0.9 +luật, tên chặt (gđ 3)`, opts: { tagger, decode: 'viterbi', fallbackTagger: ruleTagger, looseNames: false } });
    return list;
  }
  for (const fb of ['none', 'rule'] as const) {
    const fallbackTagger = fb === 'rule' ? ruleTagger : undefined;
    for (const looseNames of [true, false]) {
      const tail = `${fb === 'rule' ? ' +luật' : ''}${looseNames ? '' : ' tên chặt'}`;
      for (const theta of [0.7, 0.8, 0.85, 0.9, 0.95]) {
        const base: ParseOptions = { tagger, fallbackTagger, looseNames, minConfidence: theta };
        list.push({ name: `${model} viterbi θ${theta}${tail}`, opts: { ...base, decode: 'viterbi' } });
        for (const nu of [0.1, 0.3, 0.5]) list.push({ name: `${model} valid θ${theta} ν${nu}${tail}`, opts: { ...base, minValidMass: nu } });
      }
    }
  }
  return list;
}

const pct = (x: number) => (x * 100).toFixed(1);
const fmt = (m: Metrics) => `${pct(m.lineExact)}/${pct(m.wrongAcceptRate)}/${pct(m.askRate)}`;

function evaluate(opts: ParseOptions) {
  const scores = gold.map((g) => scoreCase(g, parseOrderDetailed(g.text, catalogs[g.catalog], opts)));
  const of = (pred: (g: GoldCase) => boolean) => {
    const idx = gold.map((g, i) => (pred(g) ? i : -1)).filter((i) => i >= 0);
    return aggregate(
      idx.map((i) => scores[i]),
      idx.map((i) => gold[i]),
    );
  };
  return {
    pool: of((g) => POOL.has(g.split)),
    dev: of((g) => g.split === 'dev'),
    freeDev: of((g) => g.split === 'free-dev'),
    freeTest: of((g) => g.split === 'free-test'),
    test: of((g) => g.split === 'test'),
  };
}

function latencyP95(opts: ParseOptions) {
  const products = bigCatalog(catalogs.tap_hoa, 1000);
  const texts = gold.filter((g) => g.split === 'test' || g.split === 'free-test').map((g) => g.text);
  parseOrderDetailed(texts[0], products, opts);
  const times = texts.map((t) => {
    const s = performance.now();
    parseOrderDetailed(t, products, opts);
    return performance.now() - s;
  });
  times.sort((a, b) => a - b);
  return times[Math.floor(0.95 * times.length)];
}

const lexoutDir = one('--lexout');
if (lexoutDir) {
  // Câu synthetic dùng từ vựng giữ lại (voice:synth --holdout 1): đơn hàng vàng = ghép slot từ nhãn vàng; so với parser
  const rows = readFileSync(resolve(lexoutDir, 'lexout.jsonl'), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as { shop: string; text: string; y: Label[] });
  const key = (o: ParsedOrder) => JSON.stringify([o.items, o.unknown, o.missingQuantityItems, o.disambiguations, o.expenses]);
  const golds = rows.map((r) => {
    const g = parseOrderDetailed(r.text, TRAIN_CATALOGS[r.shop], { tagger: () => ({ labels: r.y, prob: 1, pOutside: () => 1 }), fallbackTagger: undefined });
    return g.fallback && g.reason !== 'empty' ? null : key(g);
  });
  console.log(`lexout ${rows.length} câu, ${golds.filter((g) => g === null).length} câu nhãn vàng không ghép được (bỏ qua)`);
  console.log('| Cấu hình | đúng | tự nhận sai | hỏi lại |\n|---|---|---|---|');
  for (const [name, m] of models) {
    for (const c of configs(name, m)) {
      if (only && !c.name.includes(only)) continue;
      let ok = 0;
      let wrong = 0;
      let ask = 0;
      let n = 0;
      rows.forEach((r, i) => {
        if (golds[i] === null) return;
        n++;
        const p = parseOrderDetailed(r.text, TRAIN_CATALOGS[r.shop], c.opts);
        if (p.fallback && p.reason !== 'empty') ask++;
        else if (key(p) === golds[i]) ok++;
        else wrong++;
      });
      console.log(`| ${c.name} | ${pct(ok / n)} | ${pct(wrong / n)} | ${pct(ask / n)} |`);
    }
  }
} else if (args.includes('--oracle')) {
  // Câu trong pool mà cấu hình mặc định hỏi lại: đơn hàng đúng nằm ở hạng mấy trong các đơn hàng ứng viên của CRF (k = 256)?
  const tagger = crfTagger(CRF_MODEL, 256);
  const ranks: Record<string, number> = {};
  for (const g of gold.filter((x) => POOL.has(x.split))) {
    const products = catalogs[g.catalog];
    const def = parseOrderDetailed(g.text, products);
    if (!def.fallback || def.reason === 'empty') continue;
    let list: Candidate[] = [];
    parseOrderDetailed(g.text, products, { tagger, minConfidence: 1.01, onCandidates: (l) => (list = l) });
    list.sort((a, b) => b.mass - a.mass);
    const rank = list.findIndex((c) => scoreCase(g, c.order).exact);
    const key = rank < 0 ? 'không có' : rank === 0 ? 'hạng 1' : rank < 3 ? 'hạng 2–3' : 'hạng 4+';
    ranks[key] = (ranks[key] ?? 0) + 1;
    const top = list.slice(0, 3).map((c) => `${c.mass.toFixed(3)}${c.reason ? `(${c.reason})` : ''}${scoreCase(g, c.order).exact ? '✓' : ''}`);
    console.log(`${g.id} ${def.reason} đúng ở ${rank < 0 ? '—' : rank + 1}/${list.length}: ${top.join(' ')}`);
  }
  console.log(ranks);
} else {
  const rows: string[] = ['config\tpool\tdev\tfree-dev\tfree-test\ttest\tp95'];
  console.log('| Cấu hình | pool | dev | free-dev | free-test | test | P95 |\n|---|---|---|---|---|---|---|');
  console.log('(mỗi ô: exact theo món / tự nhận sai / hỏi lại, %)');
  for (const [name, m] of models) {
    for (const c of configs(name, m)) {
      if (only && !c.name.includes(only)) continue;
      const r = evaluate(c.opts);
      const p95 = args.includes('--latency') ? `${latencyP95(c.opts).toFixed(2)} ms` : '';
      console.log(`| ${c.name} | ${fmt(r.pool)} | ${fmt(r.dev)} | ${fmt(r.freeDev)} | ${fmt(r.freeTest)} | ${fmt(r.test)} | ${p95} |`);
      rows.push([c.name, fmt(r.pool), fmt(r.dev), fmt(r.freeDev), fmt(r.freeTest), fmt(r.test), p95].join('\t'));
    }
  }
  if (out) writeFileSync(resolve(out), `${rows.join('\n')}\n`);
}
