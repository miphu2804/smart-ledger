/** Giao diện chung của bộ nhận dạng giọng nói trên máy (Android dùng sherpa-onnx; nơi khác chưa hỗ trợ). */

export interface PrepareProgress {
  /** `download`: đang tải model về máy; `load`: đang nạp model vào bộ nhớ. */
  stage: 'download' | 'load';
  /** 0..100 (chỉ có ý nghĩa ở bước `download`). */
  percent: number;
}

export interface SpeechCallbacks {
  /** Chữ đang nhận được (gồm cả các câu đã chốt trước đó), gọi nhiều lần khi đang nói. */
  onPartial: (text: string) => void;
  /** Mức âm đo từ mic, 0..1: cho người dùng biết mic có nhận tiếng không. */
  onLevel: (level: number) => void;
  /** Lỗi trong lúc đang ghi (mic dừng, bộ nhận dạng lỗi...). */
  onError: (message: string) => void;
}

export interface SpeechSession {
  /** Dừng ghi, xử lý nốt phần còn lại và trả toàn bộ chữ nhận được. */
  stop: () => Promise<string>;
}

export interface SpeechEngine {
  /** Thiết bị và bản app này có mô-đun nhận dạng giọng nói không (bản dev client cũ thì không). */
  readonly supported: boolean;
  /** Model đã tải và nạp xong, sẵn sàng `start`. */
  isReady: () => boolean;
  /** Xin quyền micro (hiện hộp thoại của hệ thống nếu chưa cấp). Trả true nếu được dùng mic. */
  requestPermission: () => Promise<boolean>;
  /** Tải model (lần đầu) và nạp vào bộ nhớ. Gọi lại khi đang chạy thì dùng chung một lần. */
  prepare: (onProgress?: (p: PrepareProgress) => void) => Promise<void>;
  /** Bắt đầu thu mic và nhận dạng. Cần `prepare` xong và có quyền micro. */
  start: (callbacks: SpeechCallbacks) => Promise<SpeechSession>;
}
