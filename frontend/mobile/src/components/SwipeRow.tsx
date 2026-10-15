/** Hàng vuốt trái để lộ một nút thao tác; vuốt hết cỡ là thực hiện luôn. Hàng không bị gỡ, nó bật về chỗ cũ sau khi thực hiện. */
import { Feather } from '@expo/vector-icons';
import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { triggerFeedback } from '../lib/feedback';
import { spring } from '../motion';
import { colors } from '../theme';
import { T } from './ui';

const ACTION_W = 88;
const COMMIT_RATIO = 0.6;
const RESISTANCE = 0.5;
const FLICK_VX = 0.5;

export function SwipeRow({
  actionLabel,
  actionIcon,
  onCommit,
  children,
}: {
  actionLabel: string;
  actionIcon: React.ComponentProps<typeof Feather>['name'];
  onCommit: () => void;
  children: React.ReactNode;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const width = useRef(0);
  const base = useRef(0); // vị trí lúc bắt đầu chạm: 0 (đóng) hoặc -ACTION_W (mở)
  const armed = useRef(false); // đã vượt điểm chốt, báo rung đúng một lần
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const settle = (to: number) => {
    base.current = to;
    Animated.spring(x, { toValue: to, useNativeDriver: false, ...spring.snappy }).start();
  };

  const commit = () => {
    triggerFeedback('success');
    settle(0);
    commitRef.current();
  };

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
        onPanResponderMove: (_, g) => {
          const raw = base.current + g.dx;
          // Quá nút thì chỉ theo một phần ngón tay; không cho kéo sang phải khỏi vị trí đóng.
          const next = raw > 0 ? 0 : raw >= -ACTION_W ? raw : -ACTION_W + (raw + ACTION_W) * RESISTANCE;
          x.setValue(next);
          const past = -next >= width.current * COMMIT_RATIO;
          if (past && !armed.current) triggerFeedback('selection');
          armed.current = past;
        },
        onPanResponderRelease: (_, g) => {
          const at = base.current + g.dx;
          armed.current = false;
          if (-at >= width.current * COMMIT_RATIO) return commit();
          const open = g.vx < -FLICK_VX || (g.vx < FLICK_VX && -at > ACTION_W / 2);
          settle(open ? -ACTION_W : 0);
        },
        onPanResponderTerminate: () => settle(base.current),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <View style={styles.wrap} onLayout={(e) => (width.current = e.nativeEvent.layout.width)}>
      <Pressable
        onPress={commit}
        accessibilityRole="button"
        accessibilityLabel={actionLabel}
        style={styles.action}
      >
        <Feather name={actionIcon} size={18} color={colors.white} />
        <T w="bold" size={12} color={colors.white} style={{ marginTop: 4 }}>
          {actionLabel}
        </T>
      </Pressable>
      <Animated.View
        {...pan.panHandlers}
        accessibilityActions={[{ name: 'activate', label: actionLabel }]}
        onAccessibilityAction={commit}
        style={[styles.surface, { transform: [{ translateX: x }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  action: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    width: ACTION_W,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
  },
  surface: { backgroundColor: colors.card },
});
