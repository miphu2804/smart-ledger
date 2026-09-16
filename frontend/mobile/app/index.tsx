import { router } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { LogoMark } from '../src/components/brand';
import { T } from '../src/components/ui';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/** Splash — tự chuyển sang đăng nhập (hoặc Trang chủ nếu đã đăng nhập) */
export default function Splash() {
  const { loggedIn } = useApp();
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(fade, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    const t = setTimeout(() => router.replace(loggedIn ? '/(tabs)' : '/(auth)/welcome'), 1400);
    return () => clearTimeout(t);
  }, [fade, loggedIn]);

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={{
          alignItems: 'center',
          opacity: fade,
          transform: [{ scale: fade.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
        }}
      >
        <LogoMark size={112} bg={colors.white} fg={colors.primary} />
        <T w="extrabold" size={34} color={colors.white} style={{ marginTop: 22 }}>
          Sổ Nghe Lời
        </T>
        <T size={14} color="#C9D6F7" style={{ marginTop: 6 }}>
          Sổ bán hàng thông minh — chỉ cần nói
        </T>
      </Animated.View>
      <T size={11} color="#9DB3EE" style={styles.footer}>
        Team HEXA · EXE201
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  footer: { position: 'absolute', bottom: 36 },
});
