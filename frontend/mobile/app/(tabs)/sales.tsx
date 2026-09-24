import { router } from 'expo-router';
import React from 'react';
import { Feather } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';
import { Card, Screen, T } from '../../src/components/ui';
import { colors } from '../../src/theme';

export default function Sales() {
  return (
    <Screen>
      <T w="extrabold" size={26} style={{ paddingTop: 10, paddingBottom: 6 }}>
        Bán hàng
      </T>
      <T size={14} color={colors.muted} style={{ marginBottom: 18 }}>
        Chọn cách tạo đơn
      </T>

      <Pressable onPress={() => router.push('/pos')} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.8 }}>
        <Card style={styles.option}>
          <View style={styles.icon}>
            <Feather name="shopping-cart" size={21} color={colors.accentInk} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={16}>Chọn hàng</T>
            <T size={13} color={colors.muted} style={{ marginTop: 3 }}>Mở danh mục sản phẩm và giỏ hàng</T>
          </View>
          <Feather name="chevron-right" size={20} color={colors.faint} />
        </Card>
      </Pressable>

      <Pressable onPress={() => router.push('/voice')} accessibilityRole="button" style={({ pressed }) => [styles.voiceWrap, pressed && { opacity: 0.8 }]}>
        <Card style={styles.option}>
          <View style={[styles.icon, styles.voiceIcon]}>
            <Feather name="mic" size={21} color={colors.ink} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={16}>Nói để lên đơn</T>
            <T size={13} color={colors.muted} style={{ marginTop: 3 }}>Thử câu nói mẫu trong bản demo</T>
          </View>
          <Feather name="chevron-right" size={20} color={colors.faint} />
        </Card>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  icon: { width: 44, height: 44, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  voiceWrap: { marginTop: 12 },
  voiceIcon: { backgroundColor: colors.border },
});
