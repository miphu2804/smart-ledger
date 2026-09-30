/**
 * Kiểu lỗi dùng chung cho client gọi Core — tách riêng khỏi `api.ts` để `mockCore.ts` (giả lập khi
 * EXPO_PUBLIC_USE_MOCK=true) có thể ném đúng `ApiError` mà không tạo import vòng với `api.ts`.
 * `api.ts` re-export lại hai định danh này nên mọi chỗ đang `import { ApiError } from './api'` vẫn hoạt động.
 */
export interface ApiErrorDetail {
  field: string;
  issue?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly traceId?: string;
  readonly details: ApiErrorDetail[];
  constructor(status: number, code: string, message: string, traceId?: string, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.traceId = traceId;
    this.details = details;
  }
}
