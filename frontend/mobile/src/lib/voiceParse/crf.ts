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

export function viterbi(model: CrfModel, features: string[][]): string[] {
  const T = features.length;
  const L = model.labels.length;
  if (!T) return [];
  const score: Float64Array[] = [];
  for (let t = 0; t < T; t++) {
    const s = new Float64Array(L);
    for (const f of features[t]) {
      const refs = model.state[f];
      if (refs) for (const [y, w] of refs) s[y] += w;
    }
    score.push(s);
  }
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
