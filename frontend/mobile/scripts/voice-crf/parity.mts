/// <reference types="node" />
/**
 * So decoder TS (`src/lib/voiceParse/crf.ts`) với CRFsuite (Python) trên cùng đặc trưng, ở bộ eval (chính + tự do) và
 * câu synthetic dev: nhãn Viterbi phải trùng từng token, xác suất biên của nhãn đó lệch không quá 1e-5. Viterbi không
 * dùng hàm mũ nên trùng tuyệt đối; forward-backward thì có, và CRFsuite (bản build SSE) tính exp xấp xỉ nên lệch cỡ 1e-6.
 * Thoát mã 1 nếu không đạt.
 *
 *   npm run voice:parity
 */
import { readFileSync } from 'node:fs';
import { type CrfModel, marginals, viterbi } from '../../src/lib/voiceParse/crf';

const data = new URL('./.data/', import.meta.url);
const model = JSON.parse(readFileSync(new URL('../../src/lib/voiceParse/crf-model.json', import.meta.url), 'utf8')) as CrfModel;
const rows = (name: string) =>
  readFileSync(new URL(name, data), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

let failed = false;
for (const set of ['eval', 'dev']) {
  const xs = rows(`${set}.jsonl`) as Array<{ x: string[][] }>;
  const ys = rows(`${set}.pred.jsonl`) as Array<{ id: string | number; y: string[]; m: number[] }>;
  let maxDiff = 0;
  let sentences = 0;
  let tokens = 0;
  let total = 0;
  const t0 = performance.now();
  xs.forEach((row, i) => {
    const ts = viterbi(model, row.x);
    const py = ys[i].y;
    const marg = marginals(model, row.x);
    py.forEach((l, t) => {
      maxDiff = Math.max(maxDiff, Math.abs(marg[t][model.labels.indexOf(l)] - ys[i].m[t]));
    });
    const same = ts.filter((l, k) => l === py[k]).length;
    tokens += same;
    total += py.length;
    if (same === py.length && ts.length === py.length) sentences++;
    else if (!failed || sentences < 5) console.log(`lệch ${ys[i].id}: TS ${ts.join(' ')} | Python ${py.join(' ')}`);
  });
  const ms = (performance.now() - t0) / xs.length;
  console.log(
    `${set}: ${sentences}/${xs.length} câu, ${tokens}/${total} token trùng khớp (${((tokens / total) * 100).toFixed(2)}%), xác suất biên lệch tối đa ${maxDiff.toExponential(2)}, Viterbi + biên TS ${ms.toFixed(3)} ms/câu`,
  );
  if (sentences !== xs.length || maxDiff > 1e-5) failed = true;
}
process.exitCode = failed ? 1 : 0;
