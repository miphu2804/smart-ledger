import type { SpeechEngine } from './types';

export * from './core';
export type { PrepareProgress, SpeechCallbacks, SpeechEngine, SpeechSession } from './types';

/**
 * Bản dùng cho web và nền tảng chưa hỗ trợ. Web nhận giọng bằng Web Speech API ngay trong `app/voice.tsx`; Android dùng
 * `index.native.ts` (sherpa-onnx), file này chỉ để các nơi khác biên dịch và báo "chưa hỗ trợ".
 */
export const speechEngine: SpeechEngine = {
  supported: false,
  isReady: () => false,
  requestPermission: async () => false,
  prepare: async () => {
    throw new Error('Nền tảng này chưa hỗ trợ nhận dạng giọng nói trên máy.');
  },
  start: async () => {
    throw new Error('Nền tảng này chưa hỗ trợ nhận dạng giọng nói trên máy.');
  },
};
