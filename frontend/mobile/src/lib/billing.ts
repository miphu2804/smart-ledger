/**
 * Gói dịch vụ và thanh toán phí qua SePay (contract §9–§10, docs/contracts/billing-ai-client-handoff.md).
 * File này chỉ có logic thuần để test được bằng `node --test`; gọi API ở `billingApi.ts`, màn hình ở `app/plans.tsx` và
 * `app/plan-payment.tsx`.
 *
 * - Giá, thời hạn và lượt hỏi Bobi luôn lấy từ catalog của Core (`GET /billing/plans`), không ghi cứng trong app.
 * - Mọi gói có đủ chức năng hiện có; chỉ khác số lượt hỏi Bobi. Không quảng cáo "không giới hạn".
 * - Gói không tự gia hạn (renewalMode MANUAL). Hết hạn thì về Miễn phí, dữ liệu giữ nguyên.
 * - Đã quét QR, đếm ngược hết hay bấm "đã chuyển" đều không chứng minh đã trả: chỉ trạng thái Core mới quyết định.
 */

export interface AiQuotaPolicy {
  limit: number;
  /** Core trả DAY (Miễn phí) hoặc WEEK (gói trả phí, 7 ngày từ lúc kích hoạt); app hiện Miễn phí theo `FREE_AI_QUOTA` */
  period: string;
  scope: string;
}

export interface BillingPlan {
  planCode: string;
  version: number;
  amountVnd: number;
  currency: string;
  /** null với gói Miễn phí */
  durationMonths: number | null;
  featureScope: string;
  aiQuota: AiQuotaPolicy;
}

export type PaymentStatus = 'PENDING' | 'EXPIRED' | 'PAID';
export type FulfillmentStatus = 'NOT_STARTED' | 'PENDING' | 'APPLIED';

export interface PaymentRequest {
  id: number;
  planCode: string;
  planVersion: number;
  amountVnd: number;
  currency: string;
  durationMonths: number | null;
  quotaPolicyVersion: number;
  /** Nội dung chuyển khoản, dạng SLP + 12 ký tự */
  paymentCode: string;
  status: PaymentStatus;
  reviewRequired: boolean;
  fulfillmentStatus: FulfillmentStatus;
  createdAt: string;
  expiresAt: string;
  paidAt: string | null;
  recipient: { bankCode: string; accountNumber: string; accountName: string };
  /** Chỉ có khi yêu cầu còn PENDING và chưa hết hạn */
  qrUrl: string | null;
}

export interface Subscription {
  effectiveTier: 'FREE' | 'FULL';
  lastPurchasedPlanCode: string | null;
  scope: string;
  status: 'FREE' | 'ACTIVE';
  activatedAt: string | null;
  expiresAt: string | null;
  weeklyAnchorAt: string | null;
  renewalMode: string;
}

/** Gói được chọn sẵn và gắn nhãn "Phổ biến nhất". */
export const POPULAR_PLAN_CODE = 'FULL_MONTHLY';

export function isPaidPlan(plan: Pick<BillingPlan, 'amountVnd' | 'durationMonths'>): boolean {
  return plan.amountVnd > 0 && plan.durationMonths !== null;
}

export function planName(plan: Pick<BillingPlan, 'planCode' | 'durationMonths'>): string {
  if (plan.planCode === 'FREE' || plan.durationMonths === null) return 'Miễn phí';
  return `${plan.durationMonths} tháng`;
}

/**
 * Lượt hỏi Bobi của gói Miễn phí mà app hiện: 100 lượt mỗi tuần, tuần bắt đầu 00:00 thứ Hai (quyết định ngày 2026-11-27).
 * ponytail: chỉ đổi phần hiển thị; catalog và hạn mức của Core vẫn là 2 lượt/ngày. Bỏ ghi đè khi Core đổi catalog.
 */
export const FREE_AI_QUOTA: AiQuotaPolicy = { limit: 100, period: 'WEEK', scope: 'OWNER' };

/** Catalog của Core với lượt Miễn phí thay bằng `FREE_AI_QUOTA`. */
export function withFreeQuota(plans: BillingPlan[]): BillingPlan[] {
  return plans.map((p) => (isPaidPlan(p) ? p : { ...p, aiQuota: FREE_AI_QUOTA }));
}

/** "100 lượt/tuần", "300 lượt/tuần" */
export function quotaText(quota: AiQuotaPolicy): string {
  const per = quota.period === 'DAY' ? '/ngày' : quota.period === 'WEEK' ? '/tuần' : '';
  return `${quota.limit} lượt${per}`;
}

/** Giá chia theo tháng, làm tròn đồng; null với gói Miễn phí. */
export function monthlyPrice(plan: Pick<BillingPlan, 'amountVnd' | 'durationMonths'>): number | null {
  if (!plan.durationMonths) return null;
  return Math.round(plan.amountVnd / plan.durationMonths);
}

/** Miễn phí trước, rồi gói trả phí từ ngắn tới dài. */
export function sortPlans(plans: BillingPlan[]): BillingPlan[] {
  return [...plans].sort((a, b) => (a.durationMonths ?? 0) - (b.durationMonths ?? 0) || a.amountVnd - b.amountVnd);
}

/** Gói chọn sẵn: gói phổ biến nếu có, không thì gói trả phí đầu tiên. */
export function defaultPlanCode(plans: BillingPlan[]): string | null {
  const paid = sortPlans(plans).filter(isPaidPlan);
  return (paid.find((p) => p.planCode === POPULAR_PLAN_CODE) ?? paid[0])?.planCode ?? null;
}

export type PaymentStage = 'awaiting' | 'expired' | 'activating' | 'active';

export interface PaymentView {
  stage: PaymentStage;
  title: string;
  message: string;
  /** Hiện QR khi còn chờ thanh toán và Core còn trả qrUrl */
  showQr: boolean;
  /** Số giây còn lại tới hạn chuyển khoản, 0 khi đã qua hạn */
  secondsLeft: number;
  /** Có khoản chuyển cần đối soát; giữ nguyên trạng thái thanh toán/kích hoạt bên dưới */
  review: boolean;
}

/** Trạng thái hiển thị theo bảng gợi ý của FE handoff. Hạn chuyển khoản tính theo `expiresAt` của Core. */
export function paymentView(req: PaymentRequest, nowMs: number): PaymentView {
  const expiresMs = Date.parse(req.expiresAt);
  const secondsLeft = Number.isFinite(expiresMs) ? Math.max(0, Math.ceil((expiresMs - nowMs) / 1000)) : 0;
  const review = req.reviewRequired;
  if (req.status === 'PAID') {
    if (req.fulfillmentStatus === 'APPLIED') {
      return { stage: 'active', title: 'Gói đã được kích hoạt', message: 'Cảm ơn bạn! Gói mới đã có hiệu lực.', showQr: false, secondsLeft, review };
    }
    return {
      stage: 'activating',
      title: 'Đã nhận thanh toán — đang kích hoạt gói',
      message: 'Bạn không cần chuyển thêm. Gói sẽ có hiệu lực trong ít phút.',
      showQr: false,
      secondsLeft,
      review,
    };
  }
  if (req.status === 'EXPIRED' || secondsLeft === 0) {
    return {
      stage: 'expired',
      title: 'Yêu cầu thanh toán đã hết hạn',
      message: 'Nếu bạn đã chuyển khoản, khoản tiền sẽ được đối soát. Muốn mua gói thì tạo yêu cầu mới.',
      showQr: false,
      secondsLeft: 0,
      review,
    };
  }
  return {
    stage: 'awaiting',
    title: 'Chờ thanh toán',
    message: 'Quét mã bằng app ngân hàng. Giữ nguyên số tiền và nội dung chuyển khoản.',
    showQr: req.qrUrl !== null,
    secondsLeft,
    review,
  };
}

/** Sau hạn vẫn hỏi thêm một lúc: tiền chuyển trước hạn có thể tới Core trễ vài giây. */
export const EXPIRED_GRACE_MS = 2 * 60 * 1000;

export function shouldPoll(req: PaymentRequest, nowMs: number): boolean {
  if (req.status === 'PAID') return req.fulfillmentStatus !== 'APPLIED';
  return nowMs < Date.parse(req.expiresAt) + EXPIRED_GRACE_MS;
}

/** 125 → "02:05" */
export function countdown(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export interface SubscriptionSummary {
  paid: boolean;
  title: string;
  /** Ngày hết hạn gói trả phí, null với Miễn phí */
  expiresAt: Date | null;
}

/** Hết hạn đúng lúc `expiresAt` là về Miễn phí, kể cả khi lần đọc trước còn ACTIVE. */
export function subscriptionSummary(sub: Subscription, nowMs: number): SubscriptionSummary {
  const expires = sub.expiresAt ? new Date(sub.expiresAt) : null;
  const paid = sub.effectiveTier === 'FULL' && expires !== null && expires.getTime() > nowMs;
  return paid ? { paid, title: 'Gói trả phí', expiresAt: expires } : { paid: false, title: 'Gói Miễn phí', expiresAt: null };
}

/** Lời báo cho các lỗi billing của Core (contract §9); lỗi khác dùng câu của Core. */
export function billingErrorMessage(err: { status?: number; code?: string; message?: string }): string {
  switch (err.code) {
    case 'billing_unavailable':
      return 'Chưa mở bán gói trả phí. Bạn thử lại sau nhé.';
    case 'billing_offer_unavailable':
      return 'Giá gói vừa thay đổi. Hãy tải lại danh sách gói rồi chọn lại.';
    case 'billing_request_not_found':
      return 'Không tìm thấy yêu cầu thanh toán này.';
    case 'billing_idempotency_conflict':
      return 'Yêu cầu trước chưa xong. Hãy mở lại màn mua gói rồi thử lại.';
  }
  if (err.status === 403) return 'Chỉ chủ tiệm đang hoạt động mới mua được gói.';
  return err.message || 'Không tải được thông tin gói. Bạn thử lại sau nhé.';
}

/** Yêu cầu thanh toán đang theo dõi, lưu trên máy theo tài khoản để mở lại không tạo yêu cầu thứ hai. */
export interface StoredPayment {
  id: number;
  planCode: string;
  expiresAt: string;
}

/** Bỏ yêu cầu đã lưu khi gói đã kích hoạt hoặc đã quá hạn hẳn mà chưa nhận tiền. */
export function keepStoredPayment(req: PaymentRequest, nowMs: number): boolean {
  return shouldPoll(req, nowMs);
}
