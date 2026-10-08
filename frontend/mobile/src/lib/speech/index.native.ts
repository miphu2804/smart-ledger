import { sherpaEngine } from './sherpaEngine';

export * from './core';
export type { PrepareProgress, SpeechCallbacks, SpeechEngine, SpeechSession } from './types';

/** Android/iOS: nhận dạng giọng nói tiếng Việt chạy ngay trên máy bằng sherpa-onnx (xem `sherpaEngine.ts`). */
export const speechEngine = sherpaEngine;
