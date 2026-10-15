import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { COMPOSER_ACTION_SIZE } from './SlingSendButton';

const OPEN_WIDTH = 92;
const BARS = [0.5, 0.9, 0.65, 1, 0.55];
const HANDOFF_MS = 360;

/** Nút mic phình thành viên thuốc có thanh equalizer khi bấm (React Bits "Voice Pill"), rồi mở màn giọng nói. */
export function VoicePillButton({ onOpen }: { onOpen: () => void }) {
  const open = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(Animated.timing(wave, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: false }));
    wave.setValue(0);
    loop.start();
    return () => loop.stop();
  }, [active, wave]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const swell = (to: 0 | 1) =>
    Animated.spring(open, { toValue: to, friction: 7, tension: 120, useNativeDriver: false }).start();

  const press = () => {
    setActive(true);
    swell(1);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      onOpen();
      // Thu pill lại sau khi màn giọng nói đã phủ lên.
      timer.current = setTimeout(() => {
        swell(0);
        setActive(false);
      }, 500);
    }, HANDOFF_MS);
  };

  const width = open.interpolate({ inputRange: [0, 1], outputRange: [COMPOSER_ACTION_SIZE, OPEN_WIDTH] });
  const barsOpacity = open.interpolate({ inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const micShift = open.interpolate({ inputRange: [0, 1], outputRange: [0, -(OPEN_WIDTH - COMPOSER_ACTION_SIZE) / 2 + 2] });

  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Mở nhập bằng giọng nói" hitSlop={4} onPress={press}>
      <Animated.View style={[styles.pill, { width }]}>
        <Animated.View style={{ transform: [{ translateX: micShift }] }}>
          <Feather name="mic" size={19} color={colors.brand} />
        </Animated.View>
        <Animated.View style={[styles.bars, { opacity: barsOpacity }]}>
          {BARS.map((peak, i) => {
            const phase = i / BARS.length;
            const scaleY = wave.interpolate({
              inputRange: [0, phase || 0.001, phase + 0.5 > 1 ? 1 : phase + 0.5, 1],
              outputRange: [0.35, peak, 0.35, 0.35],
              extrapolate: 'clamp',
            });
            return <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY }] }]} />;
          })}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: COMPOSER_ACTION_SIZE,
    borderRadius: COMPOSER_ACTION_SIZE / 2,
    backgroundColor: colors.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bars: { position: 'absolute', right: 14, flexDirection: 'row', alignItems: 'center', gap: 3, height: 18 },
  bar: { width: 3, height: 18, borderRadius: 2, backgroundColor: colors.brand },
});
