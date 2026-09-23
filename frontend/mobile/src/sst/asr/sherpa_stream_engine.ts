import { ASRRecognitionResult, ASRStreamChunk, POSMappingConfig } from '../types/asr';
import { FbankFeatureExtractor } from './fbank_extractor';
import { HotwordBiasingTrie } from './hotword_biasing';

export interface SherpaModelPaths {
  encoderPath: string;
  decoderPath: string;
  joinerPath: string;
  tokensPath: string;
}

export type TranscriptCallback = (result: ASRRecognitionResult) => void;

/**
 * Sherpa-ONNX Zipformer-30M RNN-T Streaming Engine Wrapper
 * Điều phối Fbank 80-dim -> Encoder -> Decoder -> Joiner + Hotword Biasing Trie -> Text Real-time
 */
export class SherpaStreamingEngine {
  private featureExtractor: FbankFeatureExtractor;
  private hotwordTrie: HotwordBiasingTrie;
  private modelPaths: SherpaModelPaths;
  private isInitialized: boolean = false;
  private currentTranscript: string = '';
  private onTranscriptCallback: TranscriptCallback | null = null;

  constructor(modelPaths?: Partial<SherpaModelPaths>) {
    this.featureExtractor = new FbankFeatureExtractor();
    this.hotwordTrie = new HotwordBiasingTrie();
    this.modelPaths = {
      encoderPath: modelPaths?.encoderPath ?? 'assets/models/encoder.onnx',
      decoderPath: modelPaths?.decoderPath ?? 'assets/models/decoder.onnx',
      joinerPath: modelPaths?.joinerPath ?? 'assets/models/joiner.onnx',
      tokensPath: modelPaths?.tokensPath ?? 'assets/models/tokens.txt',
    };
  }

  public async initialize(posConfig?: POSMappingConfig): Promise<void> {
    if (posConfig) {
      this.hotwordTrie.loadFromPOSConfig(posConfig);
      console.log(`[SherpaEngine] Đã nạp ${posConfig.hotwords.length} hotwords từ pos_mapping.json vào Trie.`);
    }

    // Khởi tạo runtime (sherpa-onnx / onnxruntime)
    console.log('[SherpaEngine] Khởi tạo Zipformer-30M Streaming Engine với các model:', this.modelPaths);
    this.isInitialized = true;
  }

  public setOnTranscript(callback: TranscriptCallback): void {
    this.onTranscriptCallback = callback;
  }

  /**
   * Nhận audio chunk PCM 16kHz từ AudioRecorder và thực thi decode
   */
  public async processChunk(chunk: ASRStreamChunk): Promise<void> {
    if (!this.isInitialized) return;

    // 1. Trích xuất đặc trưng Fbank 80-dim
    const features = this.featureExtractor.computeFeatures(chunk.samples);
    if (features.length === 0) return;

    // 2. Chạy Modified Beam Search kết hợp Hotword Biasing
    // (Trong môi trường thật, hàm này gọi sherpa-onnx C++/Wasm wrapper)
  }

  /**
   * Giả lập / nhận diện chuỗi văn bản hoàn chỉnh khi người dùng dứt câu
   */
  public pushTextHypothesis(text: string, isFinal: boolean = false): void {
    this.currentTranscript = text;
    if (this.onTranscriptCallback) {
      this.onTranscriptCallback({
        text: this.currentTranscript,
        tokens: this.currentTranscript.split(/\s+/),
        isFinal,
        confidence: 0.95,
      });
    }
  }

  public reset(): void {
    this.currentTranscript = '';
  }

  public getCurrentTranscript(): string {
    return this.currentTranscript;
  }
}
