import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View } from 'react-native';
import { nextThinkingPhrase } from '../lib/thinkingPhrases';
import { colors } from '../theme';
import { T } from './ui';

// Mẫu "orbit" 3×3 của LatticeLoader (React Bits): độ trễ của mỗi chấm theo bước, đi vòng quanh ô
// giữa bỏ trống. Một vòng = 8 bước × 108ms.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4];
const CYCLE_STEPS = 8;
const CYCLE_MS = 864;
const IDLE = 0.15;
const DOT = 6;
const PHRASE_MS = 3500;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

/** Chấm lưới nhấp nháy, câu chờ đổi mỗi vài giây và đồng hồ đếm, trong lúc chờ chữ đầu tiên. */
export function ThinkingStatus({ color = colors.brand }: { color?: string }) {
  const [phrase, setPhrase] = useState(() => nextThinkingPhrase());
  const [tenths, setTenths] = useState(0);
  const clock = useRef(new Animated.Value(0)).current;
  // Đồng hồ render lại 10 lần/giây: dựng node animation một lần thay vì mỗi lần render.
  const opacities = useMemo(() => ORBIT.map((delay) => (delay == null ? IDLE * 0.47 : dotOpacity(clock, delay))), [clock]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // Người bật giảm chuyển động chỉ thấy lưới đứng yên; chữ và đồng hồ vẫn chạy.
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.timing(clock, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }),
      );
      loop.start();
    });
    const startedAt = Date.now();
    const timer = setInterval(() => setTenths(Math.floor((Date.now() - startedAt) / 100)), 100);
    const rotate = setInterval(() => setPhrase((current) => nextThinkingPhrase(current)), PHRASE_MS);
    return () => {
      cancelled = true;
      loop?.stop();
      clearInterval(timer);
      clearInterval(rotate);
    };
  }, [clock]);

  return (
    <View style={styles.row} accessible accessibilityRole="progressbar" accessibilityLabel="Trợ lý đang suy nghĩ">
      <View style={styles.grid}>
        {opacities.map((opacity, i) => (
          <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity }]} />
        ))}
      </View>
      <T w="medium" size={12.5} color={colors.muted} style={styles.phrase} numberOfLines={1}>
        {phrase}
      </T>
      <T size={11.5} color={colors.faint} style={{ fontFamily: MONO }}>
        {elapsed(tenths)}
      </T>
    </View>
  );
}

/** Mỗi chấm sáng ở 18–42% vòng của riêng nó, lệch pha theo độ trễ, giống keyframe `lattice-on`. */
function dotOpacity(clock: Animated.Value, delay: number) {
  const phase = Animated.modulo(Animated.add(clock, 1 - delay / CYCLE_STEPS), 1);
  return phase.interpolate({
    inputRange: [0, 0.18, 0.42, 0.62, 1],
    outputRange: [IDLE, 1, 1, IDLE, IDLE],
    easing: Easing.bezier(0.77, 0, 0.175, 1),
  });
}

function elapsed(tenths: number) {
  return tenths < 600 ? `${(tenths / 10).toFixed(1)}s` : `${Math.floor(tenths / 600)}m ${Math.floor((tenths % 600) / 10)}s`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  grid: { width: DOT * 3 + 2 * 2, flexDirection: 'row', flexWrap: 'wrap', gap: 2 },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  phrase: { flexShrink: 1 },
});
