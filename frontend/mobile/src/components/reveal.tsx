import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleProp, TextProps, TextStyle, ViewStyle } from 'react-native';
import { dur, easeOut, useReducedMotion } from '../motion';
import { T } from './ui';

/** Khối xám nhấp nháy giữ đúng chỗ của số đang tải, tránh nhảy layout khi dữ liệu về. */
export function Skeleton({ width, height, radius = 8, style }: { width: number | `${number}%`; height: number; radius?: number; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.55)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.55, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return <Animated.View style={[{ width, height, borderRadius: radius, backgroundColor: '#ECE9E2', opacity }, style]} />;
}

/** Hiện dần + trượt lên nhẹ khi vừa xuất hiện; `delay` để các số về lần lượt. */
export function Reveal({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const progress = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: reduced ? 120 : dur.base, delay: reduced ? 0 : delay, easing: easeOut, useNativeDriver: true }).start();
  }, [progress, delay, reduced]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: progress, transform: [{ translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 6, 0] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * Số chạy từ giá trị hiện có tới `value`. Lần đầu xuất hiện chạy từ 0; khi `value` đổi thì chạy từ số đang hiển thị.
 * Chữ số cùng bề rộng (tabular-nums) để dòng không rung khi đang đếm.
 */
export function CountUp({ value, format, delay = 0, ...text }: { value: number; format: (n: number) => string; delay?: number } & TextProps & { w?: 'bold' | 'extrabold'; size?: number; color?: string }) {
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(reduced ? value : 0)).current;
  const [shown, setShown] = useState(reduced ? value : 0);
  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setShown(Math.round(v)));
    return () => anim.removeListener(id);
  }, [anim]);
  useEffect(() => {
    if (reduced) {
      anim.setValue(value);
      setShown(value);
      return;
    }
    const run = Animated.timing(anim, { toValue: value, duration: dur.slow + 150, delay, easing: easeOut, useNativeDriver: false });
    run.start();
    return () => run.stop();
  }, [anim, value, delay, reduced]);
  const style: StyleProp<TextStyle> = [{ fontVariant: ['tabular-nums'] }, text.style];
  return (
    <T {...text} style={style} accessibilityLabel={format(value)}>
      {format(shown)}
    </T>
  );
}
