/**
 * Nút hai nhịp: bấm lần đầu chưa làm gì mà chuyển sang "Hoàn tác" trong lúc viền nút cháy dần (như ngòi nổ); cháy hết thì
 * `onCommit` mới chạy, bấm "Hoàn tác" thì huỷ. Nhờ vậy thao tác hàng loạt như "đọc hết" không cần hộp xác nhận và không phải
 * có API khôi phục.
 */
import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { triggerFeedback } from '../lib/feedback';
import { colors } from '../theme';
import { T } from './ui';
import { useReducedMotion } from '../motion';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

const HEIGHT = 32;
const STROKE = 2;
const FUSE_COLOR = '#F5A524';

export function FuseButton({
  label,
  undoLabel = 'Hoàn tác',
  icon,
  windowMs = 4000,
  onCommit,
}: {
  label: string;
  undoLabel?: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  windowMs?: number;
  /** chạy khi ngòi cháy hết mà không bị hoàn tác */
  onCommit: () => void;
}) {
  const reduced = useReducedMotion();
  const [armed, setArmed] = useState(false);
  const [width, setWidth] = useState(0);
  const burn = useRef(new Animated.Value(0)).current; // 0 = còn nguyên viền, 1 = cháy hết
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    burn.stopAnimation();
  };
  useEffect(() => stop, []); // eslint-disable-line react-hooks/exhaustive-deps

  const arm = () => {
    triggerFeedback('selection');
    burn.setValue(0);
    setArmed(true);
    if (!reduced) Animated.timing(burn, { toValue: 1, duration: windowMs, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => {
      timer.current = null;
      setArmed(false);
      commitRef.current();
    }, windowMs);
  };

  const undo = () => {
    triggerFeedback('selection');
    stop();
    setArmed(false);
  };

  // Chu vi của hình viên thuốc (bo tròn hoàn toàn) vẽ ở nửa nét trong: đường nét đứt dài đúng một vòng.
  const w = width - STROKE;
  const h = HEIGHT - STROKE;
  const perimeter = 2 * (w - h) + Math.PI * h;
  const dashOffset = burn.interpolate({ inputRange: [0, 1], outputRange: [0, -perimeter] });

  return (
    <Pressable
      onPress={armed ? undo : arm}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessibilityRole="button"
      accessibilityLabel={armed ? undoLabel : label}
      hitSlop={6}
      style={({ pressed }) => [styles.pill, armed && styles.pillArmed, pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] }]}
    >
      <Feather name={armed ? 'rotate-ccw' : icon} size={14} color={armed ? colors.white : colors.inkSecondary} />
      <T w="bold" size={13} color={armed ? colors.white : colors.inkSecondary} numberOfLines={1}>
        {armed ? undoLabel : label}
      </T>
      {armed && width > 0 ? (
        <Svg width={width} height={HEIGHT} style={StyleSheet.absoluteFill} pointerEvents="none">
          <AnimatedRect
            x={STROKE / 2}
            y={STROKE / 2}
            width={w}
            height={h}
            rx={h / 2}
            fill="none"
            stroke={FUSE_COLOR}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${perimeter} ${perimeter}`}
            strokeDashoffset={dashOffset}
          />
        </Svg>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Cùng khuôn với pill bộ lọc ở màn Đơn hàng: cao 32, bo tròn hoàn toàn.
  pill: {
    height: HEIGHT,
    minWidth: 64,
    borderRadius: HEIGHT / 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
  },
  // Bỏ viền khi cháy: Svg phủ vùng trong viền, còn viền 1px sẽ lệch khỏi nét cam và hiện thành vòng đôi.
  pillArmed: { backgroundColor: colors.brand, borderWidth: 0 },
});
