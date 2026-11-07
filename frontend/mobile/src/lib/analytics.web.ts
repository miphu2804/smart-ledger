import type { AnalyticsEventName, AnalyticsEventParams } from './analyticsEvents';

/** Bản web chỉ dùng để thử app trên trình duyệt, nên không gửi số liệu. Bản Android / iOS: `analytics.ts`. */
export function setAnalyticsConsent(_on: boolean): void {}

export function setAnalyticsUser(_id: string | null): void {}

export function track<N extends AnalyticsEventName>(_name: N, _params: AnalyticsEventParams[N]): void {}

export function trackScreen(_screenName: string): void {}
