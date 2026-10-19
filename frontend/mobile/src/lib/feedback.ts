import { Platform, Vibration } from 'react-native';

export type FeedbackLevel = 'selection' | 'success' | 'warning' | 'error';

const durations: Record<FeedbackLevel, number | number[]> = {
  selection: 12,
  success: Platform.OS === 'android' ? [0, 28, 45, 40] : 40,
  warning: 55,
  error: Platform.OS === 'android' ? [0, 45, 55, 70] : 70,
};

let enabled = true;

/** Tuỳ chọn "Rung phản hồi" ở Cài đặt; AppStore đặt lại sau khi đọc tuỳ chọn đã lưu và mỗi khi người dùng đổi. */
export function setFeedbackEnabled(value: boolean) {
  enabled = value;
}

export function triggerFeedback(level: FeedbackLevel) {
  if (!enabled) return;
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(durations[level]);
    return;
  }

  if (level === 'selection' && Platform.OS === 'ios') return;
  Vibration.vibrate(durations[level]);
}
