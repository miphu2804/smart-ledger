/**
 * Giải mã Viterbi cho CRF chuỗi tuyến tính đã train bằng CRFsuite (`scripts/voice-crf/train.py` xuất ra JSON).
 * Cộng điểm và phá hoà đúng như `crf1dc_viterbi` của CRFsuite: điểm trạng thái cộng theo thứ tự đặc trưng của token,
 * so sánh `<` nghiêm ngặt nên nhãn có chỉ số nhỏ hơn thắng khi bằng điểm. Nhờ vậy kết quả trùng khớp với Python.
 */
export interface CrfModel {
  /** Nhãn theo thứ tự chỉ số của CRFsuite. */
  labels: string[];
  /** transitions[i][j]: điểm chuyển từ nhãn i sang nhãn j. */
  transitions: number[][];
  /** Đặc trưng → các cặp [chỉ số nhãn, trọng số]. */
  state: Record<string, Array<[number, number]>>;
}

/** Điểm trạng thái từng token: cộng trọng số theo thứ tự đặc trưng như CRFsuite. */
function stateScores(model: CrfModel, features: string[][]): Float64Array[] {
  const L = model.labels.length;
  return features.map((fs) => {
    const s = new Float64Array(L);
    for (const f of fs) {
      const refs = model.state[f];
      if (refs) for (const [y, w] of refs) s[y] += w;
    }
    return s;
  });
}

export function viterbi(model: CrfModel, features: string[][]): string[] {
  const T = features.length;
  const L = model.labels.length;
  if (!T) return [];
  const score = stateScores(model, features);
  const back: Int32Array[] = [new Int32Array(L)];
  let prev = score[0];
  for (let t = 1; t < T; t++) {
    const cur = new Float64Array(L);
    const bt = new Int32Array(L);
    for (let j = 0; j < L; j++) {
      let best = -Infinity;
      for (let i = 0; i < L; i++) {
        const v = prev[i] + model.transitions[i][j];
        if (best < v) {
          best = v;
          bt[j] = i;
        }
      }
      cur[j] = best + score[t][j];
    }
    back.push(bt);
    prev = cur;
  }
  let last = 0;
  let best = -Infinity;
  for (let i = 0; i < L; i++) {
    if (best < prev[i]) {
      best = prev[i];
      last = i;
    }
  }
  const out = new Array<string>(T);
  for (let t = T - 1; t >= 0; t--) {
    out[t] = model.labels[last];
    last = back[t][last];
  }
  return out;
}

const logSumExp = (xs: Float64Array | number[]) => {
  let m = -Infinity;
  for (const x of xs) if (x > m) m = x;
  if (m === -Infinity) return m;
  let sum = 0;
  for (const x of xs) sum += Math.exp(x - m);
  return m + Math.log(sum);
};

/** Xác suất biên P(nhãn y ở token t | câu) bằng forward-backward; marginals[t][y], cùng thứ tự nhãn với `model.labels`. */
export function marginals(model: CrfModel, features: string[][]): Float64Array[] {
  const T = features.length;
  const L = model.labels.length;
  if (!T) return [];
  const score = stateScores(model, features);
  const tr = model.transitions;
  const alpha: Float64Array[] = [Float64Array.from(score[0])];
  const tmp = new Float64Array(L);
  for (let t = 1; t < T; t++) {
    const a = new Float64Array(L);
    for (let j = 0; j < L; j++) {
      for (let i = 0; i < L; i++) tmp[i] = alpha[t - 1][i] + tr[i][j];
      a[j] = logSumExp(tmp) + score[t][j];
    }
    alpha.push(a);
  }
  const beta: Float64Array[] = new Array(T);
  beta[T - 1] = new Float64Array(L);
  for (let t = T - 2; t >= 0; t--) {
    const b = new Float64Array(L);
    for (let i = 0; i < L; i++) {
      for (let j = 0; j < L; j++) tmp[j] = tr[i][j] + score[t + 1][j] + beta[t + 1][j];
      b[i] = logSumExp(tmp);
    }
    beta[t] = b;
  }
  const logZ = logSumExp(alpha[T - 1]);
  return alpha.map((a, t) => a.map((v, y) => Math.exp(v + beta[t][y] - logZ)));
}
