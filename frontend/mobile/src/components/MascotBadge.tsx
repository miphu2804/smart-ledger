import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

/**
 * Bobi, linh vật của Sổ Nghe Lời: hình dùng cho nút trợ lý nổi và trang giới thiệu Bobi trong hướng dẫn nhanh.
 * Hình Bobi cầm bảng sóng âm trong bong bóng tròn (432 px, nền trong suốt), thay cho logo ghép với cuốn sổ.
 */
export function MascotBadge({ size }: { size: number }) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={require('../../assets/bobi-bubble.png')}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        style={{
          width: size,
          height: size,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});


