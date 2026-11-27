import { apiRequest } from './api';
import { withFreeQuota, type BillingPlan, type PaymentRequest, type Subscription } from './billing';
import { createIdempotentSender } from './idempotency';

/**
 * Billing của Core (contract §9–§10). Chỉ OWNER đang hoạt động gọi được; không gửi `X-Shop-Id` vì gói tính theo tài khoản,
 * dùng chung mọi tiệm. Core trả `Cache-Control: no-store` nên mỗi lần gọi là dữ liệu mới.
 */

export function getPlans(): Promise<BillingPlan[]> {
  return apiRequest<BillingPlan[]>('/billing/plans').then(withFreeQuota);
}

export function getSubscription(): Promise<Subscription> {
  return apiRequest<Subscription>('/billing/subscription');
}

export function getPaymentRequest(id: number): Promise<PaymentRequest> {
  return apiRequest<PaymentRequest>(`/billing/payment-requests/${id}`);
}

// Một key cho một lần mua: bấm hai lần chỉ tạo một yêu cầu; lỗi mạng/5xx thì gửi lại đúng key cũ để không tạo yêu cầu
// thứ hai. Thành công hoặc 4xx thì lần mua sau dùng key mới (xem idempotency.ts).
const createSender = createIdempotentSender();

export function createPaymentRequest(plan: { planCode: string; planVersion: number }): Promise<PaymentRequest> {
  const body = { planCode: plan.planCode, planVersion: plan.planVersion };
  return createSender.send(body, (key) =>
    apiRequest<PaymentRequest>('/billing/payment-requests', { method: 'POST', body, idempotencyKey: key }),
  );
}
