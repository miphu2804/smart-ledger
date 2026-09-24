import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors, shadow } from '../theme';
import { T } from './ui';

/** Logo: micro trong khung bo tròn + chấm vàng “đang nghe” */
export function LogoMark({
  size = 36,
  bg = colors.primary,
  fg = colors.white,
  accent = colors.goldBright,
}: {
  size?: number;
  bg?: string;
  fg?: string;
  accent?: string;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 260 260">
      <Rect width={260} height={260} rx={66} fill={bg} />
      <Rect x={98} y={44} width={64} height={112} rx={32} fill={fg} />
      <Path d="M66 118 a64 64 0 0 0 128 0" fill="none" stroke={fg} strokeWidth={18} strokeLinecap="round" />
      <Rect x={121} y={180} width={18} height={30} fill={fg} />
      <Rect x={88} y={202} width={84} height={18} rx={9} fill={fg} />
      <Circle cx={196} cy={60} r={14} fill={accent} />
    </Svg>
  );
}

export function Logo({ size = 34, subtitle = true }: { size?: number; subtitle?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
      <LogoMark size={size} />
      <View>
        <T w="extrabold" size={size * 0.55}>
          Sổ Nghe{' '}
          <T w="extrabold" size={size * 0.55} color={colors.primary}>
            Lời
          </T>
        </T>
        {subtitle ? (
          <T size={12} color={colors.faint}>
            Bán hàng chỉ cần nói
          </T>
        ) : null}
      </View>
    </View>
  );
}

/** Nút nổi "Trợ lý AI" */
export function AIFab({ bottom = 96 }: { bottom?: number }) {
  const path = usePathname();
  if (path.startsWith('/ai')) return null;
  return (
    <Pressable
      onPress={() => router.push('/ai')}
      accessibilityLabel="Mở trợ lý AI"
      style={({ pressed }) => [styles.fab, { bottom }, shadow(2), pressed && { opacity: 0.85 }]}
    >
      <View style={styles.fabIcon}>
        <Feather name="star" size={16} color={colors.white} />
      </View>
      <T w="bold" size={13} color={colors.orange} style={{ marginRight: 4 }}>
        Trợ lý AI
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
  const show = useCallback(
    (text: string, kind: 'ok' | 'err' = 'ok') => {
      setMsg({ text, kind });
      if (timer.current) clearTimeout(timer.current);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setMsg(null));
      }, 2200);
    },
    [anim],
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
