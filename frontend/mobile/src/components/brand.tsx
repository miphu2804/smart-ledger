import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { easeOut, spring, useReducedMotion } from '../motion';
import { colors, shadow } from '../theme';
import { T } from './ui';

/** Logo icon thương hiệu Sổ Nghe Lời */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <Image
      source={require('../../assets/brand-logo.png')}
      resizeMode="contain"
      style={{ width: size, height: size }}
    />
  );
}

/** Chữ thương hiệu "Sổ Nghe Lời" với dấu chấm vàng trên chữ 'i' và phụ đề "AI VOICE POS" */
export function BrandWordmark({
  size = 32,
  align = 'center',
  showSub = true,
}: {
  size?: number;
  align?: 'left' | 'center' | 'right';
  showSub?: boolean;
}) {
  const dotSize = Math.max(Math.round(size * 0.16), 4);
  const dotTop = Math.round(size * 0.12);
  const dotRight = Math.round(size * 0.04);
  const subSize = Math.max(Math.round(size * 0.3), 10);
  const subSpacing = Math.max(Math.round(size * 0.16), 3);

  return (
    <View style={{ alignItems: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start' }}>
      {/* Hàng chữ chính: Sổ Nghe Lờ + ı với dấu chấm vàng */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <T w="extrabold" size={size} color="#111827" style={{ letterSpacing: -size * 0.02 }}>
          Sổ Nghe Lờ
        </T>
        <View style={{ position: 'relative', alignItems: 'center' }}>
          <View
            style={{
              position: 'absolute',
              top: dotTop,
              right: dotRight,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: '#F5BE18',
            }}
          />
          <T w="extrabold" size={size} color="#111827" style={{ letterSpacing: -size * 0.02 }}>
            {'\u0131'}
          </T>
        </View>
      </View>

      {/* Dòng phụ: AI VOICE POS */}
      {showSub ? (
        <T
          w="semibold"
          size={subSize}
          color="#6B7280"
          style={{
            letterSpacing: subSpacing,
            marginTop: Math.max(Math.round(size * 0.1), 3),
            textTransform: 'uppercase',
          }}
        >
          AI VOICE POS
        </T>
      ) : null}
    </View>
  );
}

export function Logo({
  size = 40,
  showSub = true,
  subtitle,
}: {
  size?: number;
  showSub?: boolean;
  subtitle?: boolean;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <LogoMark size={size} />
      <BrandWordmark size={size * 0.62} align="left" showSub={showSub && subtitle !== false} />
    </View>
  );
}

/** Nút nổi mở trợ lý. */
export function AIFab({ bottom = 96 }: { bottom?: number }) {
  const path = usePathname();
  if (path.startsWith('/ai')) return null;
  return (
    <Pressable
      onPress={() => router.push('/ai')}
      accessibilityLabel="Mở trợ lý"
      style={({ pressed }) => [styles.fab, { bottom }, shadow(2), pressed && { opacity: 0.85 }]}
    >
      <View style={styles.fabIcon}>
        <Feather name="message-circle" size={16} color={colors.white} />
      </View>
      <T w="bold" size={13} color={colors.orange} style={{ marginRight: 4 }}>
        Trợ lý
      </T>
    </Pressable>
  );
}

// ---------------------------------------------------------------- Toast
type ToastKind = 'ok' | 'err';
/** `actionLabel` + `onAction` hiện nút hành động (vd. "Hoàn tác"); toast có nút thì ở lại lâu hơn để kịp bấm. */
type ToastOptions = { actionLabel?: string; onAction?: () => void };
type ToastState = { text: string; kind: ToastKind } & ToastOptions;

const ToastCtx = createContext<(msg: string, kind?: ToastKind, options?: ToastOptions) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

const TOAST_MS = 2200;
const TOAST_ACTION_MS = 4500;
const SWIPE_DISMISS_PX = 28;
const SWIPE_FLICK_VY = 0.5;

/** Toast trượt xuống từ đỉnh màn hình, vuốt lên để tắt, thanh "ngòi" ở đáy cháy dần theo thời gian hiển thị. */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<ToastState | null>(null);
  const enter = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const fuse = useRef(new Animated.Value(1)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const duration = useRef(TOAST_MS);
  const reducedMotion = useReducedMotion();
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;

  const stopTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    fuse.stopAnimation();
  }, [fuse]);

  const dismiss = useCallback(
    (swipedTo = 0) => {
      stopTimer();
      if (reduced.current) {
        enter.setValue(0);
        setMsg(null);
        return;
      }
      Animated.parallel([
        Animated.timing(enter, { toValue: 0, duration: 200, useNativeDriver: false }),
        Animated.timing(dragY, { toValue: swipedTo, duration: 200, useNativeDriver: false }),
      ]).start(({ finished }) => finished && setMsg(null));
    },
    [dragY, enter, stopTimer],
  );

  const burn = useCallback(() => {
    stopTimer();
    fuse.setValue(1);
    if (!reduced.current) Animated.timing(fuse, { toValue: 0, duration: duration.current, easing: Easing.linear, useNativeDriver: false }).start();
    timer.current = setTimeout(() => dismiss(), duration.current);
  }, [dismiss, fuse, stopTimer]);

  const show = useCallback(
    (text: string, kind: ToastKind = 'ok', options?: ToastOptions) => {
      duration.current = options?.onAction ? TOAST_ACTION_MS : TOAST_MS;
      enter.stopAnimation();
      dragY.stopAnimation();
      dragY.setValue(0);
      setMsg({ text, kind, ...options });
      if (reduced.current) enter.setValue(1);
      else Animated.timing(enter, { toValue: 1, duration: 220, easing: easeOut, useNativeDriver: false }).start();
      burn();
    },
    [burn, dragY, enter],
  );

  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderGrant: stopTimer,
        // Kéo xuống bị cản (rubber band) để toast không rời khỏi đỉnh màn hình.
        onPanResponderMove: (_, g) => dragY.setValue(g.dy < 0 ? g.dy : g.dy * 0.15),
        onPanResponderRelease: (_, g) => {
          if (g.dy < -SWIPE_DISMISS_PX || g.vy < -SWIPE_FLICK_VY) dismiss(-120);
          else {
            Animated.spring(dragY, { toValue: 0, ...spring.snappy, useNativeDriver: false }).start();
            burn();
          }
        },
        onPanResponderTerminate: () => {
          Animated.spring(dragY, { toValue: 0, ...spring.snappy, useNativeDriver: false }).start();
          burn();
        },
      }),
    [burn, dismiss, dragY, stopTimer],
  );

  const runAction = () => {
    msg?.onAction?.();
    dismiss();
  };

  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View
          {...pan.panHandlers}
          accessibilityRole="alert"
          style={[
            styles.toast,
            {
              opacity: enter,
              transform: [
                { translateY: Animated.add(dragY, enter.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] })) },
              ],
            },
          ]}
        >
          <View style={styles.toastIcon}>
            <Feather
              name={msg.kind === 'ok' ? 'check-circle' : 'alert-circle'}
              size={20}
              color={msg.kind === 'ok' ? '#7EE2A0' : '#FF9C9B'}
            />
          </View>
          <T w="semibold" size={13.5} color={colors.white} style={{ flex: 1 }}>
            {msg.text}
          </T>
          {msg.actionLabel && msg.onAction ? (
            <Pressable
              onPress={runAction}
              style={({ pressed }) => [styles.toastAction, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
            >
              <T w="bold" size={13.5} color="#1E1B4B">
                {msg.actionLabel}
              </T>
            </Pressable>
          ) : null}
          {/* Lớp cắt riêng để ngòi bo theo góc pill mà không làm mất bóng đổ của toast */}
          <View pointerEvents="none" style={styles.toastFuseClip}>
            <Animated.View style={[styles.toastFuse, { width: fuse.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }]} />
          </View>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1E4',
    borderRadius: 26,
    padding: 5,
    paddingRight: 12,
  },
  fabIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toast: {
    position: 'absolute',
    top: 54,
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    ...shadow(3),
    zIndex: 1000,
  },
  toastIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastAction: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.goldBright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastFuseClip: {
    ...StyleSheet.absoluteFill,
    borderRadius: 26,
    overflow: 'hidden',
  },
  toastFuse: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    backgroundColor: '#F5A524',
  },
});
