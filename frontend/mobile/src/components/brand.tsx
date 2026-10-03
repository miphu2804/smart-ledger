import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { useReducedMotion } from '../motion';
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
const ToastCtx = createContext<(msg: string, kind?: 'ok' | 'err') => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [msg, setMsg] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useReducedMotion();
  const show = useCallback(
    (text: string, kind: 'ok' | 'err' = 'ok') => {
      setMsg({ text, kind });
      if (timer.current) clearTimeout(timer.current);
      if (reducedMotion) {
        anim.setValue(1);
      } else {
        Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      }
      timer.current = setTimeout(() => {
        if (reducedMotion) {
          anim.setValue(0);
          setMsg(null);
        } else {
          Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
        }
      }, 2200);
    },
    [anim, reducedMotion],
  );
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toast,
            { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }] },
          ]}
        >
          <Feather
            name={msg.kind === 'ok' ? 'check-circle' : 'alert-circle'}
            size={18}
            color={msg.kind === 'ok' ? '#7EE2A0' : '#FF9C9B'}
          />
          <T w="semibold" size={13} color={colors.white} style={{ flex: 1 }}>
            {msg.text}
          </T>
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
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.ink,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    zIndex: 1000,
  },
});
