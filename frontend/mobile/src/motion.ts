import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

/** Giá trị chuyển động dùng chung; chỉnh trên máy thật rồi giữ ở một chỗ. */
export const spring = {
  snappy: { stiffness: 320, damping: 26, mass: 1 },
  soft: { stiffness: 180, damping: 14, mass: 1 },
};

export const dur = { fast: 150, base: 250, slow: 450 };
/** Duration for functional menus/panels opened by a button. */
export const ACTION_MENU_DURATION = 350;
export const easeOut = Easing.out(Easing.cubic);

/** Route/tab transitions stay immediate so web and native do not choose different platform defaults. */
export const SCREEN_ANIMATION = 'none' as const;

/** Shared screen entry contract. Keep this platform-neutral; only the driver may differ. */
export const SCREEN_ENTER = {
  duration: 220,
  distance: 36,
  easing: easeOut,
} as const;

/** Người dùng bật "Giảm chuyển động" thì bỏ spring/count-up, chỉ giữ đổi trạng thái tức thì. */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((value) => alive && setReduced(value));
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
