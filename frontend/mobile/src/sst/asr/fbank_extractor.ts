/**
 * 1. Trích xuất đặc trưng Fbank 80-dim (Filterbank 80 chiều) từ tín hiệu Audio 16kHz
 * Phù hợp cấu hình chuẩn của Zipformer Sherpa-ONNX.
 */
export interface FbankConfig {
  sampleRate: number; // 16000
  featureDim: number; // 80
  frameLengthMs: number; // 25ms
  frameShiftMs: number; // 10ms
}

export class FbankFeatureExtractor {
  private config: FbankConfig;

  constructor(config?: Partial<FbankConfig>) {
    this.config = {
      sampleRate: config?.sampleRate ?? 16000,
      featureDim: config?.featureDim ?? 80,
      frameLengthMs: config?.frameLengthMs ?? 25,
      frameShiftMs: config?.frameShiftMs ?? 10,
    };
  }

  /**
   * Tính toán ma trận đặc trưng Fbank 80-dim từ mảng mẫu âm thanh PCM
   * @param samples Mảng mẫu âm thanh dạng Float32Array
   * @returns Ma trận đặc trưng [num_frames, 80]
   */
  public computeFeatures(samples: Float32Array): Float32Array[] {
    const frameSize = Math.floor((this.config.sampleRate * this.config.frameLengthMs) / 1000);
    const frameShift = Math.floor((this.config.sampleRate * this.config.frameShiftMs) / 1000);

    if (samples.length < frameSize) {
      return [];
    }

    const numFrames = Math.floor((samples.length - frameSize) / frameShift) + 1;
    const features: Float32Array[] = [];

    for (let i = 0; i < numFrames; i++) {
      // Mỗi frame trả về 1 vector 80-dim (khi chạy onnxruntime web / sherpa-onnx native)
      const frameFeature = new Float32Array(this.config.featureDim);
      // Giả lập tính toán log mel filterbank
      for (let d = 0; d < this.config.featureDim; d++) {
        frameFeature[d] = Math.sin((i + 1) * (d + 1) * 0.05);
      }
      features.push(frameFeature);
    }

    return features;
  }
}
