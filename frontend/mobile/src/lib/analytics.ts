import type { AnalyticsEventName, AnalyticsEventParams } from './analyticsEvents';
import { debugLog } from './debug';

/**
 * Google Analytics 4 qua Firebase Analytics trên Android / iOS. Bản web là `analytics.web.ts` và không gửi gì.
 *
 * Chỉ gửi khi người dùng đã đồng ý ở hộp thoại hỏi một lần hoặc ở Cài đặt (`settings.analytics`). `firebase.json` tắt thu thập
 * từ lúc mở app, tắt ID quảng cáo và tự ghi màn, nên trước khi `setAnalyticsConsent(true)` chạy thì SDK không gửi gì.
 * Gói được nạp lười trong try/catch như `auth/firebase.ts`: bản Expo Go hay bản build cũ chưa có mô-đun native vẫn chạy, chỉ
 * không gửi số liệu.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loaded = { m: any; analytics: any } | null;

let loaded: Loaded | undefined;
let enabled = false;
let userId: string | null = null;

function load(): Loaded {
  if (loaded !== undefined) return loaded;
  try {
    const m = require('@react-native-firebase/analytics');
    loaded = { m, analytics: m.getAnalytics() };
  } catch (e) {
    debugLog('analytics', 'không nạp được Firebase Analytics', String(e));
    loaded = null;
  }
  return loaded;
}

/**
 * Gọi SDK không chặn luồng chính; lỗi chỉ ghi log vì mất một sự kiện không được làm hỏng thao tác của người dùng.
 * `logEvent` bản modular không trả Promise và SDK kiểm tra tham số bằng cách ném lỗi ngay, nên phải bắt cả hai kiểu.
 */
function call(label: string, run: (m: any, analytics: any) => unknown): void {
  const sdk = load();
  if (!sdk) return;
  const fail = (e: unknown) => debugLog('analytics', `${label} ✗`, String(e));
  try {
    Promise.resolve(run(sdk.m, sdk.analytics)).catch(fail);
  } catch (e) {
    fail(e);
  }
}

/** Bật hoặc tắt thu thập theo lựa chọn của người dùng. Rút lại đồng ý thì xoá dữ liệu GA4 còn trên máy và ID cài đặt app. */
export function setAnalyticsConsent(on: boolean): void {
  const wasEnabled = enabled;
  enabled = on;
  call('đặt đồng ý', (m, a) => m.setAnalyticsCollectionEnabled(a, on));
  if (on) call('gắn người dùng', (m, a) => m.setUserId(a, userId));
  else if (wasEnabled) call('xoá dữ liệu trên máy', (m, a) => m.resetAnalyticsData(a));
}

/** ID tài khoản Core (số nội bộ, không phải số điện thoại hay email) để GA4 đếm người dùng trên nhiều máy; null khi đăng xuất. */
export function setAnalyticsUser(id: string | null): void {
  userId = id;
  if (enabled) call('gắn người dùng', (m, a) => m.setUserId(a, id));
}

export function track<N extends AnalyticsEventName>(name: N, params: AnalyticsEventParams[N]): void {
  if (enabled) call(name, (m, a) => m.logEvent(a, name, params));
}

export function trackScreen(screenName: string): void {
  if (enabled) call('screen_view', (m, a) => m.logScreenView(a, { screen_name: screenName, screen_class: screenName }));
}
