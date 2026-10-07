/**
 * Phần thuần của nhận dạng giọng nói trên máy: danh sách file model, đo mức mic, ghép câu. Không phụ thuộc React Native
 * nên chạy được trong script kiểm thử.
 */

export const STT_SAMPLE_RATE = 16000;

/** Đổi khi thay model để app tải lại (tên thư mục lưu trên máy). */
export const STT_MODEL_VERSION = 'v1';

export interface SttModelFile {
  name: string;
  bytes: number;
}

/**
 * Các file bắt buộc của model (tên và kích thước theo `assets/models`). Phía native tìm theo tiền tố `encoder`,
 * `decoder`, `joiner` (đuôi `.onnx`) và tên `tokens.txt`, nên phải giữ nguyên tên. `bpe.model`/`bpe.vocab` chỉ cần
 * cho hotword, app chưa dùng nên không tải.
 */
export const STT_MODEL_FILES: readonly SttModelFile[] = [
  { name: 'encoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx', bytes: 46172538 },
  { name: 'decoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx', bytes: 2584449 },
  { name: 'joiner-epoch-31-avg-11-chunk-32-left-128.fp16.onnx', bytes: 2052891 },
  { name: 'tokens.txt', bytes: 25238 },
];

export const STT_MODEL_TOTAL_BYTES = STT_MODEL_FILES.reduce((sum, f) => sum + f.bytes, 0);

/** File còn thiếu hoặc sai kích thước, theo kích thước hiện có trên máy (null/undefined = chưa có). */
export function missingModelFiles(sizes: Record<string, number | null | undefined>): SttModelFile[] {
  return STT_MODEL_FILES.filter((f) => sizes[f.name] !== f.bytes);
}

/** Địa chỉ tải một file từ địa chỉ gốc (tự thêm `/` nếu thiếu); tên file được mã hoá. */
export function modelFileUrl(base: string, name: string): string {
  return `${base.replace(/\/+$/, '')}/${encodeURIComponent(name)}`;
}

/** Phần trăm đã tải (0..100) từ số byte của các file đã xong và của file đang tải. */
export function downloadPercent(doneBytes: number, currentBytes: number): number {
  return Math.max(0, Math.min(100, Math.round(((doneBytes + currentBytes) / STT_MODEL_TOTAL_BYTES) * 100)));
}

/**
 * Mức âm 0..1 từ các mẫu PCM float trong [-1, 1]: lấy RMS đổi sang dB, -60 dB trở xuống là 0 và 0 dB là 1.
 * Dùng để hiện cho người dùng biết mic có đang nhận tiếng hay không.
 */
export function micLevel(samples: ArrayLike<number>): number {
  const n = samples.length;
  if (!n) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / n);
  if (!(rms > 0)) return 0;
  return Math.max(0, Math.min(1, (20 * Math.log10(rms) + 60) / 60));
}

/** Model xuất chữ HOA ("HAI CÀ PHÊ"): đưa về chữ thường và gọn khoảng trắng. */
export function cleanTranscript(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Ghép các câu đã chốt (đến điểm ngắt) với câu đang nói dở. */
export function joinTranscript(finals: readonly string[], partial: string): string {
  return [...finals, partial]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(' ');
}

/** Nối nhiều đoạn mẫu thành một mảng liên tục (dùng khi bộ nhận dạng xử lý chậm hơn tốc độ thu). */
export function concatSamples(chunks: readonly Float32Array[]): Float32Array {
  if (chunks.length === 1) return chunks[0];
  const out = new Float32Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
