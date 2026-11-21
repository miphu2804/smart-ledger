/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  billingErrorMessage,
  countdown,
  defaultPlanCode,
  keepStoredPayment,
  monthlyPrice,
  paymentView,
  planName,
  quotaText,
  shouldPoll,
  sortPlans,
  subscriptionSummary,
  type BillingPlan,
  type PaymentRequest,
  type Subscription,
} from '../src/lib/billing.ts';

const plans: BillingPlan[] = [
  { planCode: 'FULL_QUARTERLY', version: 1, amountVnd: 297000, currency: 'VND', durationMonths: 3, featureScope: 'EXISTING_FEATURES', aiQuota: { limit: 300, period: 'WEEK', scope: 'OWNER' } },
  { planCode: 'FREE', version: 1, amountVnd: 0, currency: 'VND', durationMonths: null, featureScope: 'EXISTING_FEATURES', aiQuota: { limit: 2, period: 'DAY', scope: 'OWNER' } },
  { planCode: 'FULL_MONTHLY', version: 1, amountVnd: 99000, currency: 'VND', durationMonths: 1, featureScope: 'EXISTING_FEATURES', aiQuota: { limit: 300, period: 'WEEK', scope: 'OWNER' } },
];

const NOW = Date.parse('2026-11-21T10:00:00+07:00');

function request(over: Partial<PaymentRequest> = {}): PaymentRequest {
  return {
    id: 7,
    planCode: 'FULL_MONTHLY',
    planVersion: 1,
    amountVnd: 99000,
    currency: 'VND',
    durationMonths: 1,
    quotaPolicyVersion: 1,
    paymentCode: 'SLPABCDEF123456',
    status: 'PENDING',
    reviewRequired: false,
    fulfillmentStatus: 'NOT_STARTED',
    createdAt: '2026-11-21T09:50:00+07:00',
    expiresAt: '2026-11-21T10:20:00+07:00',
    paidAt: null,
    recipient: { bankCode: 'MB', accountNumber: '0123', accountName: 'SO NGHE LOI' },
    qrUrl: 'https://qr.example/img',
    ...over,
  };
}

describe('catalog gói', () => {
  it('xếp Miễn phí trước rồi gói ngắn tới dài', () => {
    assert.deepEqual(sortPlans(plans).map((p) => p.planCode), ['FREE', 'FULL_MONTHLY', 'FULL_QUARTERLY']);
  });

  it('chọn sẵn gói 1 tháng, không có thì gói trả phí đầu tiên', () => {
    assert.equal(defaultPlanCode(plans), 'FULL_MONTHLY');
    assert.equal(defaultPlanCode(plans.filter((p) => p.planCode !== 'FULL_MONTHLY')), 'FULL_QUARTERLY');
    assert.equal(defaultPlanCode(plans.filter((p) => p.planCode === 'FREE')), null);
  });

  it('đặt tên, lượt hỏi và giá mỗi tháng theo dữ liệu của Core', () => {
    assert.deepEqual(sortPlans(plans).map(planName), ['Miễn phí', '1 tháng', '3 tháng']);
    assert.equal(quotaText(plans[1].aiQuota), '2 lượt/ngày');
    assert.equal(quotaText(plans[0].aiQuota), '300 lượt/tuần');
    assert.equal(monthlyPrice(plans[0]), 99000);
    assert.equal(monthlyPrice(plans[1]), null);
  });
});

describe('trạng thái thanh toán', () => {
  it('còn hạn thì chờ thanh toán và hiện QR', () => {
    const v = paymentView(request(), NOW);
    assert.equal(v.stage, 'awaiting');
    assert.equal(v.showQr, true);
    assert.equal(v.secondsLeft, 20 * 60);
  });

  it('qua expiresAt thì hết hạn dù Core chưa đổi trạng thái', () => {
    const v = paymentView(request(), Date.parse('2026-11-21T10:20:00+07:00'));
    assert.equal(v.stage, 'expired');
    assert.equal(v.showQr, false);
  });

  it('đã nhận tiền nhưng chưa kích hoạt thì không bảo chuyển lại', () => {
    const v = paymentView(request({ status: 'PAID', fulfillmentStatus: 'PENDING', qrUrl: null }), NOW);
    assert.equal(v.stage, 'activating');
    assert.match(v.message, /không cần chuyển thêm/);
  });

  it('đã kích hoạt và có khoản cần đối soát thì giữ cả hai', () => {
    const v = paymentView(request({ status: 'PAID', fulfillmentStatus: 'APPLIED', reviewRequired: true }), NOW);
    assert.equal(v.stage, 'active');
    assert.equal(v.review, true);
  });

  it('ngừng hỏi Core khi đã kích hoạt hoặc quá hạn hai phút', () => {
    assert.equal(shouldPoll(request(), NOW), true);
    assert.equal(shouldPoll(request({ status: 'PAID', fulfillmentStatus: 'PENDING' }), NOW), true);
    assert.equal(shouldPoll(request({ status: 'PAID', fulfillmentStatus: 'APPLIED' }), NOW), false);
    assert.equal(shouldPoll(request({ status: 'EXPIRED' }), Date.parse('2026-11-21T10:21:00+07:00')), true);
    assert.equal(shouldPoll(request({ status: 'EXPIRED' }), Date.parse('2026-11-21T10:23:00+07:00')), false);
    assert.equal(keepStoredPayment(request({ status: 'PAID', fulfillmentStatus: 'APPLIED' }), NOW), false);
  });

  it('đếm ngược dạng phút:giây', () => {
    assert.equal(countdown(125), '02:05');
    assert.equal(countdown(-3), '00:00');
  });
});

describe('gói hiện tại', () => {
  const sub = (over: Partial<Subscription>): Subscription => ({
    effectiveTier: 'FREE',
    lastPurchasedPlanCode: null,
    scope: 'OWNER',
    status: 'FREE',
    activatedAt: null,
    expiresAt: null,
    weeklyAnchorAt: null,
    renewalMode: 'MANUAL',
    ...over,
  });

  it('Miễn phí không có ngày hết hạn', () => {
    assert.deepEqual(subscriptionSummary(sub({}), NOW), { paid: false, title: 'Gói Miễn phí', expiresAt: null });
  });

  it('gói trả phí còn hạn hiện ngày hết hạn, quá hạn thì về Miễn phí', () => {
    const active = sub({ effectiveTier: 'FULL', status: 'ACTIVE', expiresAt: '2026-12-21T10:00:00+07:00' });
    assert.equal(subscriptionSummary(active, NOW).paid, true);
    assert.equal(subscriptionSummary(active, Date.parse('2026-12-21T10:00:00+07:00')).paid, false);
  });
});

describe('lời báo lỗi', () => {
  it('đổi mã lỗi billing của Core thành câu dễ hiểu', () => {
    assert.match(billingErrorMessage({ status: 503, code: 'billing_unavailable' }), /Chưa mở bán/);
    assert.match(billingErrorMessage({ status: 403, code: 'forbidden' }), /chủ tiệm/);
    assert.equal(billingErrorMessage({ status: 500, code: 'x', message: 'Lỗi máy chủ' }), 'Lỗi máy chủ');
  });
});
