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
  /** Bộ đặc trưng model được train (`features.ts`); không có là `v1`. */
  features?: 'v1' | 'v2' | 'nolex';
  /** Cặp lớp liền nhau của khung câu (`shapeBigrams`) có trong câu train, để gate đo câu mới lạ đến đâu. */
  shapes?: string[];
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

/** Forward (log): alpha[t][y] = log tổng điểm các chuỗi nhãn của token 0..t kết thúc bằng y. */
function forward(model: CrfModel, score: Float64Array[]): Float64Array[] {
  const L = model.labels.length;
  const tr = model.transitions;
  const alpha: Float64Array[] = [Float64Array.from(score[0])];
  const tmp = new Float64Array(L);
  for (let t = 1; t < score.length; t++) {
    const a = new Float64Array(L);
    for (let j = 0; j < L; j++) {
      for (let i = 0; i < L; i++) tmp[i] = alpha[t - 1][i] + tr[i][j];
      a[j] = logSumExp(tmp) + score[t][j];
    }
    alpha.push(a);
  }
  return alpha;
}

/** Xác suất biên P(nhãn y ở token t | câu) bằng forward-backward; marginals[t][y], cùng thứ tự nhãn với `model.labels`. */
export function marginals(model: CrfModel, features: string[][]): Float64Array[] {
  const T = features.length;
  const L = model.labels.length;
  if (!T) return [];
  const score = stateScores(model, features);
  const tr = model.transitions;
  const alpha = forward(model, score);
  const tmp = new Float64Array(L);
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

/** P(chuỗi nhãn | câu) = exp(điểm của chuỗi − log Z). */
export function sequenceProb(model: CrfModel, features: string[][], labels: readonly string[]): number {
  const T = features.length;
  if (!T) return 1;
  const score = stateScores(model, features);
  const ys = labels.map((l) => model.labels.indexOf(l));
  let s = score[0][ys[0]];
  for (let t = 1; t < T; t++) s += model.transitions[ys[t - 1]][ys[t]] + score[t][ys[t]];
  return Math.exp(s - logSumExp(forward(model, score)[T - 1]));
}

/**
 * k chuỗi nhãn có điểm cao nhất (list Viterbi), giảm dần, kèm xác suất P(chuỗi | câu). Dùng để tính độ tin cậy theo kết
 * quả: cộng xác suất các chuỗi cho ra cùng đơn hàng, vì nhiều chuỗi nhãn khác nhau (ví dụ "vỉ" là UNIT hay O) vẫn cho
 * cùng một kết quả. Mỗi ô (t, nhãn) giữ k đường tốt nhất; ghép k đường từ L ô trước bằng trộn L danh sách đã sắp xếp.
 */
export function nBest(model: CrfModel, features: string[][], k: number): Array<{ labels: string[]; prob: number }> {
  const T = features.length;
  const L = model.labels.length;
  if (!T || k < 1) return [];
  const score = stateScores(model, features);
  const tr = model.transitions;
  // Ô (t, y) có cnt[t][y] đường; đường thứ r: điểm s[t][y*k+r], nhãn trước bi[..], hạng của đường trước br[..]
  const s: Float64Array[] = [];
  const bi: Int32Array[] = [];
  const br: Int32Array[] = [];
  const cnt: Int32Array[] = [];
  s.push(new Float64Array(L * k));
  bi.push(new Int32Array(L * k).fill(-1));
  br.push(new Int32Array(L * k).fill(-1));
  cnt.push(new Int32Array(L).fill(1));
  for (let y = 0; y < L; y++) s[0][y * k] = score[0][y];
  const head = new Int32Array(L);
  for (let t = 1; t < T; t++) {
    const ps = s[t - 1];
    const pc = cnt[t - 1];
    const cs = new Float64Array(L * k);
    const ci = new Int32Array(L * k);
    const cr = new Int32Array(L * k);
    const cc = new Int32Array(L);
    for (let j = 0; j < L; j++) {
      head.fill(0);
      let n = 0;
      while (n < k) {
        let bestI = -1;
        let best = -Infinity;
        for (let i = 0; i < L; i++) {
          if (head[i] >= pc[i]) continue;
          const v = ps[i * k + head[i]] + tr[i][j];
          if (best < v) {
            best = v;
            bestI = i;
          }
        }
        if (bestI < 0) break;
        cs[j * k + n] = best + score[t][j];
        ci[j * k + n] = bestI;
        cr[j * k + n] = head[bestI]++;
        n++;
      }
      cc[j] = n;
    }
    s.push(cs);
    bi.push(ci);
    br.push(cr);
    cnt.push(cc);
  }
  const logZ = logSumExp(forward(model, score)[T - 1]);
  const out: Array<{ labels: string[]; prob: number }> = [];
  head.fill(0);
  const last = s[T - 1];
  while (out.length < k) {
    let bestY = -1;
    let best = -Infinity;
    for (let y = 0; y < L; y++) {
      if (head[y] < cnt[T - 1][y] && best < last[y * k + head[y]]) {
        best = last[y * k + head[y]];
        bestY = y;
      }
    }
    if (bestY < 0) break;
    const labels = new Array<string>(T);
    let y = bestY;
    let r = head[bestY]++;
    for (let t = T - 1; t >= 0; t--) {
      labels[t] = model.labels[y];
      const at = y * k + r;
      y = bi[t][at];
      r = br[t][at];
    }
    out.push({ labels, prob: Math.exp(best - logZ) });
  }
  return out;
}
