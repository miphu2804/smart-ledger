/**
 * Khi nào hiện quảng cáo mua gói (`src/components/PlanPromo.tsx`). Logic thuần để test bằng `node --test`; trạng thái lưu
 * trên máy theo tài khoản ở `promoStorage.ts`. Mục tiêu: người dùng gói Miễn phí biết có gói trả phí, nhưng không bị làm phiền.
 *
 * - Không hiện ở lần mở app đầu tiên trên máy, khi còn hướng dẫn, khi đang chờ thanh toán, khi đã có gói trả phí hoặc
 *   khi chưa đọc được gói đang dùng.
 * - Mở app: tối đa một lần mỗi lần mở, cách lần trước ít nhất 6 tiếng. Tick "Không hiện lại hôm nay" thì nghỉ tới hết ngày.
 * - Dùng Bobi: một lần mỗi ngày, khi số câu đã hỏi trong ngày chạm lượt của gói Miễn phí; cũng nghỉ khi đã tick.
 * - Hai quảng cáo cách nhau ít nhất 1 tiếng.
 * - Hết lượt hỏi Bobi (Core trả 429 `ai_quota_exhausted`) là lời giải thích, không phải quảng cáo: hiện một lần mỗi ngày,
 *   bỏ qua các luật trên trừ gói đang dùng.
 */

import type { BillingPlan } from './billing';

export type PromoKind = 'launch' | 'ai' | 'quota';

export interface PromoState {
  /** Số lần mở app (mỗi lần JS khởi động) đã ghi trên máy */
  sessions: number;
  /** Lần hiện quảng cáo gần nhất (ms), mọi loại trừ 'quota' */
  lastShownAt: number | null;
  /** Lần hiện quảng cáo lúc mở app gần nhất (ms) */
  launchShownAt: number | null;
  /** Ngày (yyyy-mm-dd) người dùng tick "Không hiện lại hôm nay" */
  snoozedDay: string | null;
  /** Ngày đang đếm câu hỏi Bobi và số câu đã có trả lời trong ngày đó */
  aiDay: string | null;
  aiAnswers: number;
  aiShownDay: string | null;
  quotaShownDay: string | null;
}

export const EMPTY_PROMO_STATE: PromoState = {
  sessions: 0,
  lastShownAt: null,
  launchShownAt: null,
  snoozedDay: null,
  aiDay: null,
  aiAnswers: 0,
  aiShownDay: null,
  quotaShownDay: null,
};

export const LAUNCH_GAP_MS = 6 * 60 * 60 * 1000;
export const PROMO_GAP_MS = 60 * 60 * 1000;
/** Lượt Miễn phí mặc định khi chưa đọc được catalog (BR-029: 2 lượt/ngày) */
export const DEFAULT_FREE_DAILY_LIMIT = 2;

/** Đọc lại trạng thái đã lưu; giá trị hỏng thì dùng mặc định thay vì lỗi. */
export function parsePromoState(raw: unknown): PromoState {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_PROMO_STATE };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' ? v : null);
  return {
    sessions: num(r.sessions) ?? 0,
    lastShownAt: num(r.lastShownAt),
    launchShownAt: num(r.launchShownAt),
    snoozedDay: str(r.snoozedDay),
    aiDay: str(r.aiDay),
    aiAnswers: num(r.aiAnswers) ?? 0,
    aiShownDay: str(r.aiShownDay),
    quotaShownDay: str(r.quotaShownDay),
  };
}

export function startSession(state: PromoState): PromoState {
  return { ...state, sessions: state.sessions + 1 };
}

export interface PromoContext {
  now: number;
  /** Ngày theo giờ máy, yyyy-mm-dd */
  today: string;
  /** true chỉ khi đọc được gói đang dùng và đó là Miễn phí */
  free: boolean;
  pendingPayment: boolean;
}

function quietPromo(state: PromoState, ctx: PromoContext): boolean {
  if (!ctx.free || ctx.pendingPayment) return true;
  // Lần mở app đầu tiên trên máy (sessions đã gồm lần này) không quảng cáo
  if (state.sessions <= 1) return true;
  if (state.snoozedDay === ctx.today) return true;
  return state.lastShownAt !== null && ctx.now - state.lastShownAt < PROMO_GAP_MS;
}

export function launchPromoAllowed(state: PromoState, ctx: PromoContext): boolean {
  if (quietPromo(state, ctx)) return false;
  return state.launchShownAt === null || ctx.now - state.launchShownAt >= LAUNCH_GAP_MS;
}

/** Ghi một câu hỏi Bobi đã có trả lời; sang ngày mới thì đếm lại. */
export function recordAiAnswer(state: PromoState, today: string): PromoState {
  return state.aiDay === today ? { ...state, aiAnswers: state.aiAnswers + 1 } : { ...state, aiDay: today, aiAnswers: 1 };
}

export function aiPromoAllowed(state: PromoState, ctx: PromoContext, freeDailyLimit: number): boolean {
  if (quietPromo(state, ctx) || state.aiShownDay === ctx.today) return false;
  return state.aiDay === ctx.today && state.aiAnswers >= freeDailyLimit;
}

export function quotaPromoAllowed(state: PromoState, ctx: Pick<PromoContext, 'today' | 'free'>): boolean {
  return ctx.free && state.quotaShownDay !== ctx.today;
}

export function markPromoShown(state: PromoState, kind: PromoKind, now: number, today: string): PromoState {
  if (kind === 'quota') return { ...state, quotaShownDay: today };
  const next = { ...state, lastShownAt: now };
  return kind === 'launch' ? { ...next, launchShownAt: now } : { ...next, aiShownDay: today };
}

export function snoozeToday(state: PromoState, today: string): PromoState {
  return { ...state, snoozedDay: today };
}

/** Lượt hỏi Bobi mỗi ngày của gói Miễn phí theo catalog Core; catalog không nói theo ngày thì dùng mặc định. */
export function freeDailyLimit(plans: BillingPlan[] | null): number {
  const free = plans?.find((p) => p.planCode === 'FREE' || p.durationMonths === null);
  return free && free.aiQuota.period === 'DAY' && free.aiQuota.limit > 0 ? free.aiQuota.limit : DEFAULT_FREE_DAILY_LIMIT;
}
