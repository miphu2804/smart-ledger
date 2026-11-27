/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  aiPromoAllowed,
  EMPTY_PROMO_STATE,
  freeWeeklyLimit,
  LAUNCH_GAP_MS,
  launchPromoAllowed,
  markPromoShown,
  parsePromoState,
  PROMO_GAP_MS,
  quotaPromoAllowed,
  recordAiAnswer,
  snoozeToday,
  startSession,
  type PromoContext,
  type PromoState,
} from '../src/lib/promo.ts';

const NOW = Date.parse('2026-11-23T09:00:00+07:00');
const TODAY = '2026-11-23';
/** 23/11/2026 là thứ Hai */
const WEEK = '2026-11-23';
const ctx = (over: Partial<PromoContext> = {}): PromoContext => ({ now: NOW, today: TODAY, week: WEEK, free: true, pendingPayment: false, ...over });
/** Đã mở app vài lần trước đó, đây là lần thứ ba */
const returning: PromoState = { ...EMPTY_PROMO_STATE, sessions: 3 };

describe('quảng cáo lúc mở app', () => {
  it('không hiện ở lần mở app đầu tiên trên máy', () => {
    assert.equal(launchPromoAllowed(startSession(EMPTY_PROMO_STATE), ctx()), false);
    assert.equal(launchPromoAllowed(startSession(startSession(EMPTY_PROMO_STATE)), ctx()), true);
  });

  it('chỉ hiện cho gói Miễn phí và khi không chờ thanh toán', () => {
    assert.equal(launchPromoAllowed(returning, ctx()), true);
    assert.equal(launchPromoAllowed(returning, ctx({ free: false })), false);
    assert.equal(launchPromoAllowed(returning, ctx({ pendingPayment: true })), false);
  });

  it('cách lần trước ít nhất 6 tiếng', () => {
    const shown = markPromoShown(returning, 'launch', NOW, TODAY);
    assert.equal(launchPromoAllowed(shown, ctx({ now: NOW + LAUNCH_GAP_MS - 1 })), false);
    assert.equal(launchPromoAllowed(shown, ctx({ now: NOW + LAUNCH_GAP_MS })), true);
  });

  it('tick "Không hiện lại hôm nay" thì nghỉ tới hết ngày', () => {
    const snoozed = snoozeToday(returning, TODAY);
    assert.equal(launchPromoAllowed(snoozed, ctx()), false);
    assert.equal(launchPromoAllowed(snoozed, ctx({ today: '2026-11-24', now: NOW + 24 * 3600 * 1000 })), true);
  });
});

describe('quảng cáo khi dùng Bobi', () => {
  it('hiện khi số câu trong tuần chạm lượt Miễn phí, tối đa một lần mỗi ngày', () => {
    let s = recordAiAnswer(returning, WEEK);
    assert.equal(aiPromoAllowed(s, ctx(), 2), false);
    s = recordAiAnswer(s, WEEK);
    assert.equal(aiPromoAllowed(s, ctx(), 2), true);
    s = markPromoShown(s, 'ai', NOW, TODAY);
    s = recordAiAnswer(s, WEEK);
    assert.equal(aiPromoAllowed(s, ctx({ now: NOW + 2 * PROMO_GAP_MS }), 2), false);
    const tomorrow = NOW + 24 * 3600 * 1000;
    assert.equal(aiPromoAllowed(s, ctx({ now: tomorrow, today: '2026-11-24' }), 2), true);
  });

  it('sang tuần mới thì đếm lại', () => {
    const s = recordAiAnswer({ ...returning, aiWeek: '2026-11-16', aiAnswers: 5 }, WEEK);
    assert.equal(s.aiAnswers, 1);
  });

  it('cách quảng cáo trước ít nhất 1 tiếng và nghỉ khi đã tick', () => {
    const s = recordAiAnswer(recordAiAnswer(returning, WEEK), WEEK);
    const afterLaunch = markPromoShown(s, 'launch', NOW - PROMO_GAP_MS + 1, TODAY);
    assert.equal(aiPromoAllowed(afterLaunch, ctx(), 2), false);
    assert.equal(aiPromoAllowed(snoozeToday(s, TODAY), ctx(), 2), false);
  });
});

describe('hết lượt hỏi Bobi', () => {
  it('giải thích một lần mỗi ngày, kể cả khi đã tick hoặc lần đầu mở app', () => {
    const s = snoozeToday({ ...EMPTY_PROMO_STATE, sessions: 1 }, TODAY);
    assert.equal(quotaPromoAllowed(s, ctx()), true);
    assert.equal(quotaPromoAllowed(markPromoShown(s, 'quota', NOW, TODAY), ctx()), false);
    assert.equal(quotaPromoAllowed(s, ctx({ free: false })), false);
  });
});

describe('đọc trạng thái đã lưu', () => {
  it('giá trị hỏng thì dùng mặc định', () => {
    assert.deepEqual(parsePromoState(null), EMPTY_PROMO_STATE);
    assert.deepEqual(parsePromoState({ sessions: 'x', snoozedDay: 3 }), EMPTY_PROMO_STATE);
    assert.equal(parsePromoState({ sessions: 4, snoozedDay: TODAY }).snoozedDay, TODAY);
  });
});

describe('lượt Miễn phí theo catalog', () => {
  it('lấy lượt theo tuần của gói Miễn phí, thiếu thì dùng 100', () => {
    const free = { planCode: 'FREE', version: 1, amountVnd: 0, currency: 'VND', durationMonths: null, featureScope: 'EXISTING_FEATURES', aiQuota: { limit: 80, period: 'WEEK', scope: 'OWNER' } };
    assert.equal(freeWeeklyLimit([free]), 80);
    assert.equal(freeWeeklyLimit([{ ...free, aiQuota: { ...free.aiQuota, period: 'DAY' } }]), 100);
    assert.equal(freeWeeklyLimit(null), 100);
  });
});
