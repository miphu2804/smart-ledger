import { ApiError, type ApiErrorDetail } from './apiError.ts';
import { ddmm, hhmm, WEEKDAYS } from './format.ts';

/**
 * Lượt hỏi Bobi do Core tính (`GET /agent/quota`, contract §10). File này chỉ có logic thuần để test bằng `node --test`;
 * gọi API và giữ Idempotency-Key ở `agentApi.ts`.
 */
export interface AiQuota {
  effectiveTier: 'FREE' | 'FULL';
  limit: number;
  committed: number;
  reserved: number;
  /** Đã trừ cả câu đã trả lời và câu đang xử lý */
  remaining: number;
  windowStart: string;
  windowEnd: string;
  /** null ở tuần cuối của gói trả phí: hết gói thì về Miễn phí, xem `accessExpiresAt` */
  nextResetAt: string | null;
  accessExpiresAt: string | null;
  /** Core có bật trừ lượt không (`AI_QUOTA_ENABLED`). Tắt thì chat không gửi key và không hiện số lượt. */
  enforcementEnabled: boolean;
}

/** Core trả `Retry-After: 2` cho 202; chờ tổng cộng tối đa bằng thời gian chờ một câu trả lời. */
export const PENDING_RETRY_MS = 2000;
export const PENDING_MAX_MS = 45000;

/**
 * Core trả 202 khi cùng lượt hỏi (cùng key) còn đang chạy: hỏi lại đúng lượt đó sau `PENDING_RETRY_MS`, không tạo lượt mới.
 * Quá `PENDING_MAX_MS` thì ném lỗi 202 để màn hình báo "đang xử lý"; bộ gửi giữ key nên lần gửi lại vẫn là lượt cũ.
 */
export async function untilSettled<T>(
  request: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now: () => number = Date.now,
): Promise<T> {
  const deadline = now() + PENDING_MAX_MS;
  for (;;) {
    try {
      return await request();
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 202) || now() + PENDING_RETRY_MS > deadline) throw err;
      await sleep(PENDING_RETRY_MS);
    }
  }
}

/** "00:00 T2 01/12" theo giờ máy; mốc của Core đã kèm múi giờ nên không cộng thêm. */
export function quotaMoment(iso: string): string {
  const d = new Date(iso);
  return `${hhmm(d)} ${WEEKDAYS[d.getDay()]} ${ddmm(d)}`;
}

/** Dòng số lượt dưới khung chat; null khi Core chưa bật trừ lượt (không quảng cáo hạn mức chưa áp dụng). */
export function quotaLine(q: AiQuota | null): string | null {
  if (!q?.enforcementEnabled) return null;
  const parts = [`Còn ${q.remaining}/${q.limit} lượt hỏi Bobi`];
  if (q.reserved > 0) parts.push(`${q.reserved} câu đang xử lý`);
  if (q.nextResetAt) parts.push(`lượt mới từ ${quotaMoment(q.nextResetAt)}`);
  else if (q.accessExpiresAt) parts.push(`gói dùng đến ${quotaMoment(q.accessExpiresAt)}`);
  return parts.join(' · ');
}

/** Câu báo cho `429 ai_quota_exhausted`, kèm mốc `nextAvailableAt` trong `details` nếu Core gửi. */
export function exhaustedMessage(details: ApiErrorDetail[]): string {
  const at = details.find((d) => d.field === 'nextAvailableAt')?.issue;
  const when = at && Number.isFinite(Date.parse(at)) ? ` Lượt mới có từ ${quotaMoment(at)}.` : '';
  return `Bạn đã dùng hết lượt hỏi Bobi.${when} Câu hỏi vẫn được giữ để gửi lại khi có lượt mới.`;
}
