import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

export const COMPOSER_ACTION_SIZE = 40;

const MAX_PULL = 90;
const ARM_AT = 26;
const TAP_SLOP = 6;
const BURST = 7;

/** Kéo nút ra sau như ná cao su rồi thả để bắn tin (React Bits "Sling Button"); chạm một cái vẫn gửi. */
export function SlingSendButton({ disabled, onSend }: { disabled: boolean; onSend: () => void }) {
  const pos = useRef(new Animated.ValueXY()).current;
  const tilt = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const aim = useRef({ ux: 0, uy: -1 });
  const armed = useRef(false);
  const live = useRef({ disabled, onSend });
  live.current = { disabled, onSend };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !live.current.disabled,
        onPanResponderMove: (_, g) => {
          const raw = Math.hypot(g.dx, g.dy);
          if (raw < 0.01) return;
          const d = (MAX_PULL * raw) / (MAX_PULL + raw); // rubber band
          const ux = g.dx / raw;
          const uy = g.dy / raw;
          aim.current = { ux, uy };
          pos.setValue({ x: d * ux, y: d * uy });
          // Mũi tên xoay về hướng sẽ bắn (ngược chiều kéo).
          tilt.setValue(((Math.atan2(-uy, -ux) * 180) / Math.PI + 90) * Math.min(d / 12, 1));
          armed.current = d >= ARM_AT;
        },
        onPanResponderRelease: (_, g) => {
          const moved = Math.hypot(g.dx, g.dy) > TAP_SLOP;
          const fire = !moved || armed.current;
          armed.current = false;
          Animated.spring(pos, { toValue: { x: 0, y: 0 }, velocity: { x: -g.vx, y: -g.vy }, friction: 5, tension: 180, useNativeDriver: false }).start();
          Animated.spring(tilt, { toValue: 0, friction: 6, useNativeDriver: false }).start();
          if (!fire) return;
          live.current.onSend();
          if (moved) {
            burst.setValue(0);
            Animated.timing(burst, { toValue: 1, duration: 320, useNativeDriver: false }).start();
          }
        },
        onPanResponderTerminate: () => {
          armed.current = false;
          Animated.spring(pos, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start();
          Animated.spring(tilt, { toValue: 0, useNativeDriver: false }).start();
        },
      }),
    [pos, tilt, burst],
  );

  useEffect(() => () => { pos.stopAnimation(); tilt.stopAnimation(); burst.stopAnimation(); }, [pos, tilt, burst]);

  const rotate = tilt.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'] });
  const launch = aim.current;

  return (
    <View style={styles.slot} accessibilityRole="button" accessibilityLabel="Gửi tin nhắn" accessibilityState={{ disabled }}>
      {Array.from({ length: BURST }, (_, i) => {
        const spread = ((i / (BURST - 1)) - 0.5) * 1.1;
        const base = Math.atan2(-launch.uy, -launch.ux) + spread;
        const reach = 34 + (i % 3) * 12;
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={[
              styles.dot,
              {
                opacity: burst.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
                transform: [
                  { translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(base) * reach] }) },
                  { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(base) * reach] }) },
                  { scale: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0.3] }) },
                ],
              },
            ]}
          />
        );
      })}
      <Animated.View
        {...responder.panHandlers}
        style={[styles.pad, disabled && styles.padDisabled, { transform: [{ translateX: pos.x }, { translateY: pos.y }] }]}
      >
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Feather name="arrow-up" size={19} color={disabled ? colors.muted : colors.white} />
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { width: COMPOSER_ACTION_SIZE, height: COMPOSER_ACTION_SIZE, alignItems: 'center', justifyContent: 'center' },
  pad: {
    width: COMPOSER_ACTION_SIZE,
    height: COMPOSER_ACTION_SIZE,
    borderRadius: COMPOSER_ACTION_SIZE / 2,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  padDisabled: { backgroundColor: colors.brandSoft, opacity: 0.7 },
  dot: { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
});
