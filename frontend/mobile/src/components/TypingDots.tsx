import React, { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

// Ba chấm lần lượt sáng lên và nhô lên như ô chat thường; mỗi chấm một nhịp PULSE_MS, chấm sau trễ STAGGER_MS.
const DOT = 7;
const PULSE_MS = 900;
const STAGGER_MS = 160;
const LIFT_PX = 3;
const USE_NATIVE = Platform.OS !== 'web';

/** Dấu chờ của trợ lý cho tới khi chữ đầu tiên của câu trả lời tới. */
export function TypingDots({ color = colors.brand }: { color?: string }) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const dots = useMemo(
    () =>
      values.map((v) => ({
        opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1] }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -LIFT_PX] }) }],
      })),
    [values],
  );

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // Người bật giảm chuyển động thấy ba chấm đứng yên.
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      const pulse = (v: Animated.Value) =>
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE }),
          Animated.timing(v, { toValue: 0, duration: PULSE_MS / 2, easing: Easing.inOut(Easing.quad), useNativeDriver: USE_NATIVE }),
        ]);
      loop = Animated.loop(Animated.stagger(STAGGER_MS, values.map(pulse)));
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [values]);

  return (
    <View style={styles.row} accessibilityRole="progressbar" accessibilityLabel="Trợ lý đang trả lời">
      {dots.map((style, i) => (
        <Animated.View key={i} style={[styles.dot, { backgroundColor: color }, style]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 20 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
});
