/// <reference types="node" />
/**
 * Nghiên cứu gate tự nhận / escalate cho câu nói tự do: với mỗi câu, lấy đơn hàng ứng viên tốt nhất qua gate cấu trúc
 * (n-best, như `decode: 'valid'`), các tín hiệu "câu lạ" (từ CRF chưa gặp, sửa lời, số lượng có quan hệ, số dòng…) và
 * đơn hàng của model phụ / tagger luật; rồi so các chính sách gate theo độ phủ (tỉ lệ câu tự nhận) và độ chính xác khi
 * tự nhận (câu tự nhận mà đúng hết / câu tự nhận).
 *
 *   npm run voice:gate                                      # bộ câu tự soạn (dev, test, free-dev, free-test), model mặc định
 *   npm run voice:gate -- --set LO-repair=<model.json>=<thư mục synth --famout repair --holdout 1>/famout.jsonl
 *                                                           # thêm tập synthetic: kiểu câu và từ vựng model chưa gặp
 *   npm run voice:gate -- --set …=<model.json>,<model phụ.json>=…   # model phụ cho chính sách "hai model cùng ý"
 *   npm run voice:gate -- --set …=<model.json>=<file.jsonl>=<train.jsonl của model>   # thêm 3-gram khung câu
 *   npm run voice:gate -- --ngrams .data/train.jsonl         # 3-gram khung câu cho bộ câu tự soạn
 *
 * Độ lạ của khung câu (2-gram) lấy từ `shapes` của model; model cũ không có `shapes` thì truyền file train.
 *   npm run voice:gate -- --partner <model phụ.json>         # model phụ cho bộ câu tự soạn
 *   npm run voice:gate -- --dump <out.jsonl>                # ghi tín hiệu từng câu (để học gate bằng Python)
 *
 * Không đọc `eval/holdout.jsonl`: bộ giữ kín chỉ chấm bằng `voice:eval` (số tổng) sau khi đã chốt gate.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParseableProduct, ParsedOrder } from '../../src/lib/parseOrder';
import { type Candidate, CRF_MODEL, crfTagger, parseOrderDetailed, ruleTagger, type Tagger } from '../../src/lib/voiceParse';
import { catalogIndex } from '../../src/lib/voiceParse/catalog';
import { type CrfModel, marginals } from '../../src/lib/voiceParse/crf';
import { crfFeatures, sentenceShape, shapeBigrams } from '../../src/lib/voiceParse/features';
import { analyze, findMarkers, type Label } from '../../src/lib/voiceParse/tagger';
import { TRAIN_CATALOGS } from './lexicon';
import { type GoldCase, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const args = process.argv.slice(2);
const many = (flag: string) => args.flatMap((a, i) => (a === flag && args[i + 1] ? [args[i + 1]] : []));
const one = (flag: string) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined);
const loadModel = (f: string) => JSON.parse(readFileSync(resolve(f), 'utf8')) as CrfModel;
const readJsonl = <T,>(file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);

/** Khoá đơn hàng như độ tin cậy mặc định (`looseNames`): không phân biệt tên món mới / tiêu đề chi. */
const looseKey = (o: ParsedOrder) =>
  JSON.stringify([
    o.items,
    o.unknown.map((u) => [u.price, u.qty]),
    o.missingQuantityItems?.length ?? 0,
    o.disambiguations?.map((d) => [d.qty, d.options.map((x) => x.product_id)]) ?? [],
    o.expenses?.map((e) => e.amount) ?? [],
  ]);
const lineCount = (o: ParsedOrder) =>
  o.items.length + o.unknown.length + (o.missingQuantityItems?.length ?? 0) + (o.disambiguations?.length ?? 0) + (o.expenses?.length ?? 0);

/** Đơn hàng ứng viên tốt nhất qua gate cấu trúc trong n-best và độ tin cậy của nó (như `decode: 'valid'`, ν = 0.1). */
function topOrder(text: string, products: ParseableProduct[], tagger: Tagger) {
  let groups: Candidate[] = [];
  const d = parseOrderDetailed(text, products, { tagger, minConfidence: 1.01, onCandidates: (l) => (groups = l) });
  const valid = groups.filter((g) => !g.reason);
  const seen = groups.reduce((n, g) => n + g.mass, 0);
  const validMass = valid.reduce((n, g) => n + g.mass, 0);
  const top = valid.reduce<Candidate | undefined>((m, g) => (!m || g.mass > m.mass ? g : m), undefined);
  const conf = top && validMass >= 0.1 ? top.mass / (validMass + Math.max(0, 1 - seen)) : 0;
  return { d, top: top?.order, conf, implicit: !!top?.implicit, seen, validMass };
}

interface Row {
  set: string;
  id: string;
  text: string;
  /** Đơn hàng ứng viên (khoá) và đơn hàng vàng, để soát lỗi trên tập synthetic. */
  got?: string;
  want?: string;
  /** Có đơn hàng ứng viên qua gate cấu trúc và có ít nhất một dòng. */
  cand: boolean;
  correct: boolean;
  /** Dòng món tự nhận / dòng tự nhận sai (chỉ bộ câu tự soạn) và dòng vàng / dòng đúng. */
  acc: number;
  wrong: number;
  gold: number;
  right: number;
  f: Record<string, number>;
  tok: string[][];
}

/** n-gram của khung câu (`sentenceShape`), kể cả đầu và cuối câu; n = 2 giống `shapeBigrams` của gate. */
const grams = (sh: string[], n: number) => {
  const p = [...Array(n - 1).fill('^'), ...sh, ...Array(n - 1).fill('$$')];
  return p.slice(0, p.length - n + 1).map((_, i) => p.slice(i, i + n).join(' '));
};
/** Khung câu đã gặp: 2-gram lấy từ `model.shapes`; có file train thì tính lại cả 2-gram và 3-gram từ đó. */
function seenGrams(model: CrfModel, trainFile?: string) {
  const seen = new Set<string>(model.shapes ?? []);
  if (trainFile) {
    for (const r of readJsonl<{ x: string[][] }>(resolve(trainFile))) {
      const sh = sentenceShape(r.x);
      for (const g of [...shapeBigrams(sh), ...grams(sh, 3)]) seen.add(g);
    }
  }
  return seen;
}

function signals(text: string, products: ParseableProduct[], model: CrfModel, partners: Tagger[], seen: Set<string>) {
  const tagger = crfTagger(model, 32);
  const { d, top, conf, implicit, validMass } = topOrder(text, products, tagger);
  const info = analyze(d.tokens, catalogIndex(products));
  const labels: Label[] = d.labels;
  const words = d.tokens.flatMap((t, i) => (t.kind === 'word' ? [{ t, i }] : []));
  const x = crfFeatures(d.tokens, info, model.features);
  const m = marginals(model, x);
  const sh = sentenceShape(x);
  const marg = labels.map((l, i) => m[i][model.labels.indexOf(l)]);
  const empty = !top || lineCount(top) === 0;
  const key = top ? looseKey(top) : '';
  const agree = (t: Tagger) => {
    const o = topOrder(text, products, t).top;
    return o && key && looseKey(o) === key ? 1 : 0;
  };
  const rule = parseOrderDetailed(text, products, { tagger: ruleTagger });
  // Nhiễu nhỏ không đổi nghĩa: bỏ dấu thanh, bỏ dấu câu, bỏ từ lạ. Đơn hàng đổi theo nhiễu là parser chưa vững với câu này.
  const same = (t: string) => {
    if (t === text) return 1;
    const o = topOrder(t, products, tagger).top;
    return o && key && looseKey(o) === key ? 1 : 0;
  };
  const unknown = new Set(words.filter(({ t, i }) => !info[i].inVocab && !info[i].isFiller && !model.state[`w=${t.norm}`]).map(({ i }) => i));
  const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  const f: Record<string, number> = {
    conf,
    validMass,
    implicit: implicit ? 1 : 0,
    // số bị gán O (số bàn, giờ, số đã sửa, số tổng…)
    oNums: d.tokens.filter((_, i) => info[i].isNum && labels[i] === 'O').length,
    // từ CRF chưa gặp khi train, không có trong danh mục và không phải từ đệm
    unk: words.filter(({ t, i }) => !info[i].inVocab && !info[i].isFiller && !model.state[`w=${t.norm}`]).length,
    edit: labels.some((l) => l === 'B-EDIT') ? 1 : 0,
    rel: labels.some((l) => /QTY[PDC]|COPY/.test(l)) ? 1 : 0,
    markers: findMarkers(d.tokens, info).length,
    lines: top ? lineCount(top) : 0,
    items: top?.items.length ?? 0,
    tokens: d.tokens.length,
    nums: info.filter((x) => x.isNum).length,
    minMarg: Math.min(1, ...marg),
    rule: !rule.fallback && key && looseKey(rule) === key ? 1 : 0,
    novel2: new Set(shapeBigrams(sh).filter((g) => !seen.has(g))).size,
    novel3: new Set(grams(sh, 3).filter((g) => !seen.has(g))).size,
    pTone: same(strip(text).normalize('NFC')),
    pSep: same(text.replace(/[,.;:!?]/g, ' ').replace(/\s+/g, ' ').trim()),
    pUnk: unknown.size ? same(d.tokens.filter((_, i) => !unknown.has(i)).map((t) => text.normalize('NFC').slice(t.start, t.end)).join(' ')) : 1,
  };
  partners.forEach((p, k) => (f[`agree${k}`] = agree(p)));
  // token cho nghiên cứu khung câu (Python): đặc trưng CRF rút gọn + nhãn đã chọn
  const tok = x.map((fs, i) => [...['w', 'k', 'num', 'fill', 'unit', 'gz'].map((k) => fs.find((v) => v.startsWith(`${k}=`))?.slice(k.length + 1) ?? ''), labels[i]]);
  return { top: empty ? undefined : top, f, tok };
}

const rows: Row[] = [];

// Bộ câu tự soạn (không gồm bộ giữ kín)
const mainModel = one('--model') ? loadModel(one('--model') as string) : CRF_MODEL;
const humanPartners = many('--partner').map((f) => crfTagger(loadModel(f), 32));
const humanSeen = seenGrams(mainModel, one('--ngrams'));
const human = [
  ...readJsonl<GoldCase>(here('./eval/gold.jsonl').pathname),
  ...readJsonl<GoldCase>(here('./eval/free.jsonl').pathname).map((g) => ({ ...g, split: `free-${g.split}` as GoldCase['split'] })),
];
for (const g of human) {
  const products = catalogs[g.catalog];
  const { top, f, tok } = signals(g.text, products, mainModel, humanPartners, humanSeen);
  const s = top ? scoreCase(g, { ...top, fallback: false }) : undefined;
  // câu không có món nào (nói chuyện, khoản chi rỗng): đúng khi parser không ra dòng nào
  const correct = s ? s.exact : g.lines.length === 0 && g.expenses.length === 0;
  rows.push({
    set: g.split,
    id: g.id,
    text: g.text,
    cand: !!top,
    correct,
    acc: s?.accepted ?? 0,
    wrong: s?.wrongAccepted ?? 0,
    gold: g.lines.length,
    right: s?.correctLines ?? 0,
    f,
    tok,
  });
}

// Tập synthetic: <tên>=<model>[,<model phụ>…]=<file.jsonl>; đơn hàng vàng = ghép slot từ nhãn vàng
const shops = Object.keys(TRAIN_CATALOGS);
for (const spec of many('--set')) {
  const [name, modelList, file, trainFile] = spec.split('=');
  const [main, ...rest] = modelList.split(',').map(loadModel);
  const seen = seenGrams(main, trainFile);
  const partners = rest.map((m) => crfTagger(m, 32));
  readJsonl<{ shop?: string; text: string; y: Label[] }>(resolve(file)).forEach((r, i) => {
    const products = TRAIN_CATALOGS[r.shop ?? shops[i % shops.length]];
    const gold = parseOrderDetailed(r.text, products, { tagger: () => ({ labels: r.y, prob: 1, pOutside: () => 1 }), freeFormGate: false });
    if (gold.fallback && gold.reason !== 'empty') return; // nhãn vàng không ghép được
    const { top, f, tok } = signals(r.text, products, main, partners, seen);
    const correct = top ? looseKey(top) === looseKey(gold) : lineCount(gold) === 0;
    rows.push({ set: name, id: `${name}-${i}`, text: r.text, got: top && looseKey(top), want: looseKey(gold), cand: !!top, correct, acc: 0, wrong: 0, gold: 0, right: 0, f, tok });
  });
}

const dump = one('--dump');
if (dump) writeFileSync(resolve(dump), `${rows.map((r) => JSON.stringify(r)).join('\n')}\n`);

// ─── Chính sách gate ─────────────────────────────────────────────────────────
type Policy = [string, (f: Record<string, number>) => boolean];
const free = (f: Record<string, number>) => f.unk > 0 || f.edit > 0 || f.rel > 0 || f.markers > 0 || f.lines > 3;
/** Câu phức như `isComplex` của gate câu tự do. */
const complex = (f: Record<string, number>) => f.lines >= 2 || f.nums >= 2 || f.rel > 0 || f.edit > 0 || f.markers > 0;
const POLICIES: Policy[] = [
  ['θ0.9 (gate cũ)', (f) => f.conf >= 0.9],
  ['gate câu tự do (mặc định)', (f) => f.conf >= 0.9 && !f.implicit && !(complex(f) && f.novel2 > 0)],
  ['gate câu tự do, 3-gram', (f) => f.conf >= 0.9 && !f.implicit && !(complex(f) && f.novel3 > 0)],
  ['θ0.95', (f) => f.conf >= 0.95],
  ['θ0.98', (f) => f.conf >= 0.98],
  ['θ0.99', (f) => f.conf >= 0.99],
  ['θ0.9, không từ lạ', (f) => f.conf >= 0.9 && f.unk === 0],
  ['θ0.9, không sửa lời', (f) => f.conf >= 0.9 && !f.edit],
  ['θ0.9, không số quan hệ', (f) => f.conf >= 0.9 && !f.rel && !f.markers],
  ['θ0.9, ≤ 3 dòng', (f) => f.conf >= 0.9 && f.lines <= 3],
  ['θ0.9, câu thường (θ0.99 nếu tự do)', (f) => f.conf >= (free(f) ? 0.99 : 0.9)],
  ['θ0.9, câu thường (escalate nếu tự do)', (f) => f.conf >= 0.9 && !free(f)],
  ['θ0.9, tagger luật cùng ý', (f) => f.conf >= 0.9 && f.rule === 1],
  ['θ0.9, vững khi bỏ dấu thanh', (f) => f.conf >= 0.9 && f.pTone === 1],
  ['θ0.9, vững khi bỏ dấu câu', (f) => f.conf >= 0.9 && f.pSep === 1],
  ['θ0.9, vững khi bỏ từ lạ', (f) => f.conf >= 0.9 && f.pUnk === 1],
  ['θ0.9, vững cả ba nhiễu', (f) => f.conf >= 0.9 && f.pTone + f.pSep + f.pUnk === 3],
  ['θ0.9, không ngầm số 1', (f) => f.conf >= 0.9 && !f.implicit],
  ['θ0.9, khung câu quen (2-gram)', (f) => f.conf >= 0.9 && f.novel2 === 0],
  ['θ0.9, khung câu quen (3-gram)', (f) => f.conf >= 0.9 && f.novel3 === 0],
  ['θ0.9, khung quen (3-gram ≤ 1)', (f) => f.conf >= 0.9 && f.novel3 <= 1],
  ['θ0.9, khung quen 3-gram, không ngầm số 1', (f) => f.conf >= 0.9 && f.novel3 === 0 && !f.implicit],
  ['θ0.9, model phụ cùng ý', (f) => f.conf >= 0.9 && f.agree0 === 1],
  ['θ0.9, model phụ + luật cùng ý', (f) => f.conf >= 0.9 && f.agree0 === 1 && f.rule === 1],
  ['θ0.9, tự do thì model phụ cùng ý', (f) => f.conf >= 0.9 && (!free(f) || f.agree0 === 1)],
];

const pct = (x: number) => (Number.isFinite(x) ? (x * 100).toFixed(1) : '—');
const sets = [...new Set(rows.map((r) => r.set))];
console.log('Mỗi ô: tự nhận (% câu) / đúng khi tự nhận (% câu tự nhận); bộ câu tự soạn thêm: dòng tự nhận sai / dòng tự nhận.\n');
console.log(`| Chính sách | ${sets.join(' | ')} |\n|---|${sets.map(() => '---|').join('')}`);
for (const [name, accept] of POLICIES) {
  if (name.includes('model phụ') && !rows.some((r) => 'agree0' in r.f)) continue;
  const cells = sets.map((s) => {
    const list = rows.filter((r) => r.set === s);
    const acc = list.filter((r) => r.cand && accept(r.f));
    const ok = acc.filter((r) => r.correct).length;
    const lines = acc.reduce((n, r) => n + r.acc, 0);
    const wrong = acc.reduce((n, r) => n + r.wrong, 0);
    const human = list.some((r) => r.gold > 0);
    return `${pct(acc.length / list.length)} / ${pct(ok / acc.length)}${human ? ` · ${pct(wrong / lines)}` : ''}`;
  });
  console.log(`| ${name} | ${cells.join(' | ')} |`);
}
