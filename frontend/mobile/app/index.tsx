import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { BrandWordmark, LogoMark } from '../src/components/brand';
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
        <View style={{ marginTop: 22 }}>
          <BrandWordmark size={36} align="center" showSub={true} />
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
});
