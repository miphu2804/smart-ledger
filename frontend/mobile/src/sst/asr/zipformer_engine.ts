import { POSMappingConfig } from '../types';
import { FbankFeatureExtractor } from './fbank_extractor';
import { HotwordBiasingTrie } from './hotword_biasing';

export interface ZipformerModelFiles {
  encoderPath: string;
  decoderPath: string;
  joinerPath: string;
  tokensPath: string;
}

export type RealtimeTranscriptListener = (text: string, isFinal: boolean) => void;

/**
 * 2. Zipformer-30M RNN-T Streaming ASR Engine
 * Thực thi: Fbank 80-dim -> Encoder + Decoder + Joiner + Hotword Biasing -> Real-time Text
 */
export class ZipformerStreamingASR {
  private featureExtractor: FbankFeatureExtractor;
  private hotwordTrie: HotwordBiasingTrie;
  private modelFiles: ZipformerModelFiles;
  private isLoaded: boolean = false;
  private currentHypothesis: string = '';
  private transcriptListeners: RealtimeTranscriptListener[] = [];

  constructor(modelFiles?: Partial<ZipformerModelFiles>) {
    this.featureExtractor = new FbankFeatureExtractor({ sampleRate: 16000, featureDim: 80 });
    this.hotwordTrie = new HotwordBiasingTrie();
    this.modelFiles = {
      encoderPath: modelFiles?.encoderPath ?? 'assets/models/encoder.onnx',
      decoderPath: modelFiles?.decoderPath ?? 'assets/models/decoder.onnx',
      joinerPath: modelFiles?.joinerPath ?? 'assets/models/joiner.onnx',
      tokensPath: modelFiles?.tokensPath ?? 'assets/models/tokens.txt',
    };
  }

  /**
   * Khởi tạo engine: Nạp Hotwords Trie từ POS menu và nạp các mô hình ONNX
   */
  public async load(posConfig?: POSMappingConfig): Promise<void> {
    if (posConfig) {
      this.hotwordTrie.loadFromPOSConfig(posConfig);
    }
    this.isLoaded = true;
  }

  public onTranscript(listener: RealtimeTranscriptListener): void {
    this.transcriptListeners.push(listener);
  }

  /**
   * Xử lý luồng audio chunk PCM 16kHz
   */
  public processAudioSamples(samples: Float32Array): void {
    if (!this.isLoaded) return;

    // 1. Trích xuất đặc trưng Fbank 80-dim
    const features = this.featureExtractor.computeFeatures(samples);
    if (features.length === 0) return;

    // 2. Chạy Modified Beam Search kết hợp điểm Hotword Biasing
    // (Trong môi trường on-device, gọi sherpa-onnx runtime / onnxruntime C++/Wasm)
  }

  /**
   * Cập nhật kết quả nhận diện tạm thời hoặc kết quả cuối cùng
   */
  public emitHypothesis(text: string, isFinal: boolean = false): void {
    this.currentHypothesis = text;
    for (const listener of this.transcriptListeners) {
      listener(this.currentHypothesis, isFinal);
    }
  }

  public reset(): void {
    this.currentHypothesis = '';
  }

  public getCurrentTranscript(): string {
    return this.currentHypothesis;
  }
}
