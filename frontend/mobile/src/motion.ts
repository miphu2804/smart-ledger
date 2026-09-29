import { useEffect, useState } from 'react';
import { AccessibilityInfo, Easing } from 'react-native';

/** Giá trị chuyển động dùng chung; chỉnh trên máy thật rồi giữ ở một chỗ. */
export const spring = {
  snappy: { stiffness: 320, damping: 26, mass: 1 },
  soft: { stiffness: 180, damping: 14, mass: 1 },
};

export const dur = { fast: 150, base: 250, slow: 450 };
export const easeOut = Easing.out(Easing.cubic);

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
