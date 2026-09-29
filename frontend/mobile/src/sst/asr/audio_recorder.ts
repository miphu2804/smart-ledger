import { ASRStreamChunk } from '../types/asr';

export type AudioChunkCallback = (chunk: ASRStreamChunk) => void;

/**
 * Quản lý ghi âm từ Microphone và stream các chunk âm thanh PCM 16kHz
 */
export class AudioRecorderStreamer {
  private isRecording: boolean = false;
  private sampleRate: number = 16000;
  private chunkIntervalMs: number = 100; // Gửi chunk mỗi 100ms
  private onChunkCallback: AudioChunkCallback | null = null;
  private timer: any = null;

  constructor(sampleRate: number = 16000, chunkIntervalMs: number = 100) {
    this.sampleRate = sampleRate;
    this.chunkIntervalMs = chunkIntervalMs;
  }

  public setOnChunk(callback: AudioChunkCallback): void {
    this.onChunkCallback = callback;
  }

  public async start(): Promise<void> {
    if (this.isRecording) return;
    this.isRecording = true;

    // Trong môi trường Web Audio / React Native Audio:
    // Sẽ kết nối AudioContext ScriptProcessor / AudioWorkletNode
    // Tại đây định nghĩa interface chuẩn để stream float32 PCM samples (16kHz)
    console.log(`[AudioRecorder] Bắt đầu stream Audio 16kHz (Chunk Interval: ${this.chunkIntervalMs}ms)...`);
  }

  public feedRawSamples(samples: Float32Array): void {
    if (!this.isRecording || !this.onChunkCallback) return;
    const chunk: ASRStreamChunk = {
      samples,
      sampleRate: this.sampleRate,
      timestamp: Date.now(),
    };
    this.onChunkCallback(chunk);
  }

  public async stop(): Promise<void> {
    this.isRecording = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    console.log('[AudioRecorder] Đã dừng stream Audio.');
  }

  public getStatus(): boolean {
    return this.isRecording;
  }
}
