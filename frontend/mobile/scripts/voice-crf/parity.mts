/// <reference types="node" />
/**
 * So nhãn của decoder Viterbi TS (`src/lib/voiceParse/crf.ts`) với nhãn CRFsuite (Python) trên cùng đặc trưng:
 * bộ eval và câu synthetic dev. Thoát mã 1 nếu lệch dù một token.
 *
 *   npm run voice:parity
 */
import { readFileSync } from 'node:fs';
import { type CrfModel, viterbi } from '../../src/lib/voiceParse/crf';

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
  const ys = rows(`${set}.pred.jsonl`) as Array<{ id: string | number; y: string[] }>;
  let sentences = 0;
  let tokens = 0;
  let total = 0;
  const t0 = performance.now();
  xs.forEach((row, i) => {
    const ts = viterbi(model, row.x);
    const py = ys[i].y;
    const same = ts.filter((l, k) => l === py[k]).length;
    tokens += same;
    total += py.length;
    if (same === py.length && ts.length === py.length) sentences++;
    else if (!failed || sentences < 5) console.log(`lệch ${ys[i].id}: TS ${ts.join(' ')} | Python ${py.join(' ')}`);
  });
  const ms = (performance.now() - t0) / xs.length;
  console.log(`${set}: ${sentences}/${xs.length} câu, ${tokens}/${total} token trùng khớp (${((tokens / total) * 100).toFixed(2)}%), Viterbi TS ${ms.toFixed(3)} ms/câu`);
  if (sentences !== xs.length) failed = true;
}
process.exitCode = failed ? 1 : 0;
