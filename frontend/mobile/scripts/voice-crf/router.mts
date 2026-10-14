/// <reference types="node" />
/**
 * Nghiên cứu "System 1" router: đặc trưng của một lượt parse (độ tin cậy, khối lượng chuỗi qua gate, entropy n-best, biên
 * token thấp nhất, từ lạ với CRF, điểm khớp danh mục…) và nhãn "đơn hàng ứng viên có đúng không", để `router.py` học
 * khi nào tự nhận và khi nào escalate sang LLM.
 *
 *   npm run voice:router -- <model.json> <out.jsonl> synth-dev:<dev.jsonl> synth-lexout:<lexout.jsonl> human
 *
 * `synth-*`: câu của `voice:synth` (đơn hàng vàng = ghép slot từ nhãn vàng); `human`: bộ câu tự soạn trong `eval/`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ParseableProduct, ParsedOrder } from '../../src/lib/parseOrder';
import { type Candidate, crfTagger, parseOrderDetailed } from '../../src/lib/voiceParse';
import { catalogIndex, linkSpan } from '../../src/lib/voiceParse/catalog';
import { type CrfModel, marginals } from '../../src/lib/voiceParse/crf';
import { crfFeatures } from '../../src/lib/voiceParse/features';
import { analyze, type Label } from '../../src/lib/voiceParse/tagger';
import { TRAIN_CATALOGS } from './lexicon';
import { type GoldCase, scoreCase } from './eval/score';

const here = (p: string) => new URL(p, import.meta.url);
const catalogs = JSON.parse(readFileSync(here('./eval/catalogs.json'), 'utf8')) as Record<string, ParseableProduct[]>;
const [modelPath, outPath, ...sets] = process.argv.slice(2);
const model = JSON.parse(readFileSync(resolve(modelPath), 'utf8')) as CrfModel;
const tagger = crfTagger(model, 32);
const shops = Object.keys(TRAIN_CATALOGS);

/** Khoá đơn hàng như độ tin cậy mặc định: không phân biệt tên món mới / tiêu đề chi. */
const looseKey = (o: ParsedOrder) =>
  JSON.stringify([
    o.items,
    o.unknown.map((u) => [u.price, u.qty]),
    o.missingQuantityItems?.length,
    o.disambiguations?.map((d) => [d.qty, d.options.map((x) => x.product_id)]),
    o.expenses?.map((e) => e.amount),
  ]);
const lineCount = (o: ParsedOrder) =>
  o.items.length + o.unknown.length + (o.missingQuantityItems?.length ?? 0) + (o.disambiguations?.length ?? 0) + (o.expenses?.length ?? 0);

function features(text: string, products: ParseableProduct[]) {
  let groups: Candidate[] = [];
  // θ > 1 để luôn tính n-best; quyết định tự nhận do router / ngưỡng ở router.py
  const d = parseOrderDetailed(text, products, { tagger, minConfidence: 1.01, onCandidates: (l) => (groups = l) });
  const index = catalogIndex(products);
  const info = analyze(d.tokens, index);
  const valid = groups.filter((g) => !g.reason);
  const seen = groups.reduce((n, g) => n + g.mass, 0);
  const validMass = valid.reduce((n, g) => n + g.mass, 0);
  const top = valid.reduce<Candidate | undefined>((m, g) => (!m || g.mass > m.mass ? g : m), undefined);
  const conf = top ? top.mass / (validMass + Math.max(0, 1 - seen)) : 0;
  const ps = valid.map((g) => g.mass / (validMass || 1));
  const entropy = -ps.reduce((n, p) => n + (p > 0 ? p * Math.log(p) : 0), 0);
  const second = valid.map((g) => g.mass).sort((a, b) => b - a)[1] ?? 0;
  const labels: Label[] = d.labels;
  const m = marginals(model, crfFeatures(d.tokens, info, model.features));
  const marg = labels.map((l, i) => m[i][model.labels.indexOf(l)]);
  const nonO = marg.filter((_, i) => labels[i] !== 'O');
  const words = d.tokens.flatMap((t, i) => (t.kind === 'word' ? [{ t, i }] : []));
  // từ CRF chưa gặp khi train và không có trong danh mục (từ lạ thật, không phải tên món mới của cửa hàng)
  const unknownToModel = words.filter(({ t, i }) => !info[i].inVocab && !model.state[`w=${t.norm}`]).length;
  const offCatalog = words.filter(({ i }) => !info[i].inVocab && !info[i].isFiller).length;
  const noTone = words.filter(({ t }) => t.raw === t.norm && /[aeiouy]/.test(t.norm)).length;
  // điểm khớp danh mục của các cụm ITEM đã chọn: thấp nhất, và khoảng cách ứng viên 1–2 nhỏ nhất
  let minLink = 1;
  let minGap = 1;
  let start = -1;
  labels.forEach((l, i) => {
    if (l === 'B-ITEM' || (l === 'I-ITEM' && start < 0)) start = i;
    if (start >= 0 && labels[i + 1] !== 'I-ITEM') {
      const c = linkSpan(index, d.tokens.slice(start, i + 1));
      minLink = Math.min(minLink, c[0]?.score ?? 0);
      minGap = Math.min(minGap, (c[0]?.score ?? 0) - (c[1]?.score ?? 0));
      start = -1;
    }
  });
  const order = top?.order;
  const empty = !!order && lineCount(order) === 0 && (labels.some((l) => l !== 'O') || info.some((x) => x.isNum));
  const n = Math.max(1, words.length);
  return {
    order: order && !empty ? order : null,
    f: {
      conf,
      validMass,
      topMass: top?.mass ?? 0,
      margin: (top?.mass ?? 0) - second,
      seen,
      nGroups: groups.length,
      nValid: valid.length,
      entropy,
      minMarg: Math.min(1, ...marg),
      meanMarg: marg.reduce((a, b) => a + b, 0) / Math.max(1, marg.length),
      minMargNonO: Math.min(1, ...nonO),
      nTokens: d.tokens.length,
      unknownToModel: unknownToModel / n,
      unknownToModelAny: unknownToModel > 0 ? 1 : 0,
      offCatalog: offCatalog / n,
      noTone: noTone / n,
      nNum: info.filter((x) => x.isNum).length,
      nItems: order?.items.length ?? 0,
      nUnknown: order?.unknown.length ?? 0,
      nMissing: order?.missingQuantityItems?.length ?? 0,
      nDisamb: order?.disambiguations?.length ?? 0,
      nExp: order?.expenses?.length ?? 0,
      nEdit: labels.filter((l) => l === 'B-EDIT').length,
      minLink,
      minGap,
    },
  };
}

const readJsonl = <T,>(file: string) =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as T);

const out: string[] = [];
for (const spec of sets) {
  const [kind, path] = spec.split(':');
  if (kind === 'human') {
    const rows = [
      ...readJsonl<GoldCase>(here('./eval/gold.jsonl').pathname),
      ...readJsonl<GoldCase>(here('./eval/free.jsonl').pathname).map((g) => ({ ...g, split: `free-${g.split}` as GoldCase['split'] })),
    ];
    for (const g of rows) {
      const { order, f } = features(g.text, catalogs[g.catalog]);
      const correct = order ? scoreCase(g, { ...order, fallback: false }).exact : false;
      out.push(JSON.stringify({ set: g.split, id: g.id, hasCand: !!order, correct, f }));
    }
    continue;
  }
  readJsonl<{ shop?: string; text: string; y: Label[] }>(resolve(path)).forEach((r, i) => {
    // dev.jsonl không ghi cửa hàng: synth xoay vòng danh mục theo chỉ số câu
    const products = TRAIN_CATALOGS[r.shop ?? shops[i % shops.length]];
    const gold = parseOrderDetailed(r.text, products, { tagger: () => ({ labels: r.y, prob: 1, pOutside: () => 1 }) });
    if (gold.fallback && gold.reason !== 'empty') return; // nhãn vàng không ghép được
    const { order, f } = features(r.text, products);
    out.push(JSON.stringify({ set: kind, id: `${kind}-${i}`, hasCand: !!order, correct: !!order && looseKey(order) === looseKey(gold), f }));
  });
}
writeFileSync(resolve(outPath), `${out.join('\n')}\n`);
console.log(`${out.length} dòng → ${outPath}`);
