export type AudioChunkListener = (samples: Float32Array) => void;

/**
 * Quản lý đệm mẫu âm thanh PCM 16kHz từ Audio Device / Web Audio / Native Micro
 * và phát ra các chunk phù hợp cho Zipformer inference.
 */
export class AudioStreamBuffer {
  private sampleRate: number;
  private isStreaming: boolean = false;
  private listeners: AudioChunkListener[] = [];

  constructor(sampleRate: number = 16000) {
    this.sampleRate = sampleRate;
  }

  public onChunk(listener: AudioChunkListener): void {
    this.listeners.push(listener);
  }

  public start(): void {
    this.isStreaming = true;
  }

  /**
   * Frontend đẩy mảng Float32Array PCM 16kHz vào engine
   */
  public pushSamples(pcm16kSamples: Float32Array): void {
    if (!this.isStreaming) return;
    for (const listener of this.listeners) {
      listener(pcm16kSamples);
    }
  }

  public stop(): void {
    this.isStreaming = false;
  }

  public getSampleRate(): number {
    return this.sampleRate;
  }
}
