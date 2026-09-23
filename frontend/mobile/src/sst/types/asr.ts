export type ASRStatus = 'idle' | 'recording' | 'processing' | 'completed' | 'error';

export interface ASRStreamChunk {
  samples: Float32Array;
  sampleRate: number;
  timestamp: number;
}

export interface ASRRecognitionResult {
  text: string;
  tokens: string[];
  isFinal: boolean;
  confidence?: number;
}

export interface HotwordItem {
  keyword: string;
  boost_score: number;
  aliases?: string[];
}

export interface POSMappingConfig {
  shop_id: string;
  version: string;
  hotwords: HotwordItem[];
  common_units: string[];
  number_words: string[];
}
