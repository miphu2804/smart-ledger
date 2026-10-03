import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LogoMark } from '../src/components/brand';
import { T } from '../src/components/ui';
import { useReducedMotion } from '../src/motion';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/** Splash — chờ Firebase khôi phục phiên đã lưu, rồi chuyển sang đăng nhập (hoặc Trang chủ nếu còn đăng nhập) */
export default function Splash() {
  const { loggedIn, authReady, needsProfile, onboarded } = useApp();
  const reducedMotion = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) fade.setValue(1);
    else Animated.spring(fade, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  }, [fade, reducedMotion]);

  useEffect(() => {
    if (!authReady) return;
    const target = loggedIn
      ? onboarded
        ? '/(tabs)'
        : '/(auth)/setup' // đã có tài khoản nhưng chưa tạo tiệm
      : needsProfile
        ? '/(auth)/profile' // Firebase còn đăng nhập, Core chưa có tài khoản
        : '/(auth)/welcome';
    const t = setTimeout(() => router.replace(target), 1400);
    return () => clearTimeout(t);
  }, [authReady, loggedIn, needsProfile, onboarded]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: fade,
          transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }}
      >
        <LogoMark size={112} />
        <T w="extrabold" size={34} color={colors.ink} style={{ marginTop: 22 }}>
          Sổ Nghe Lời
        </T>
        <T size={14} color={colors.muted} style={{ marginTop: 6 }}>
          Bán hàng gọn hơn mỗi ngày
        </T>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#FFFCF8', alignItems: 'center', justifyContent: 'center' },
});
