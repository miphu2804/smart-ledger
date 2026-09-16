import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Logo, useToast } from '../../src/components/brand';
import { Button, Field, Row, Screen, T } from '../../src/components/ui';
import { useApp } from '../../src/store/AppStore';
import { colors, shadow } from '../../src/theme';

export default function Welcome() {
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const { login } = useApp();
  const toast = useToast();

  const digits = phone.replace(/\D/g, '');
  const valid = /^0?\d{9}$/.test(digits);

  const submit = () => {
    if (!valid) {
      setError('Số điện thoại gồm 10 số, ví dụ 0901 234 567');
      return;
    }
    router.push({ pathname: '/(auth)/otp', params: { phone: digits.startsWith('0') ? digits : `0${digits}` } });
  };

  const social = (name: string) => {
    toast(`Đã đăng nhập bằng ${name} (giả lập)`);
    login('', false);
    router.replace('/(tabs)');
  };

  return (
    <Screen>
      <View style={{ paddingTop: 24 }}>
        <Logo size={38} />
      </View>

      <View style={styles.hero}>
        <View style={styles.bubble}>
          <T size={13} color={colors.primary} w="semibold">
            🎙️ “Bán 2 ly cà phê sữa, 1 ổ bánh mì”
          </T>
        </View>
        <View style={[styles.bubble, styles.bubbleAi]}>
          <T size={12} color={colors.white} w="semibold">
            ✓ Đã ghi 2 món · 65.000đ
          </T>
        </View>
      </View>

      <T w="extrabold" size={30} style={{ marginTop: 8 }}>
        Xin chào!
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 22, lineHeight: 21 }}>
        Nhập số điện thoại để bắt đầu bán hàng cùng Sổ Nghe Lời
      </T>

      <Field
        prefix="+84"
        placeholder="Nhập số điện thoại"
        keyboardType="phone-pad"
        value={phone}
        maxLength={11}
        onChangeText={(t) => {
          setPhone(t);
          setError('');
        }}
        onSubmitEditing={submit}
        error={error}
      />
      <Button title="Tiếp tục" onPress={submit} disabled={!digits.length} />

      <Row style={{ marginVertical: 22 }}>
        <View style={styles.line} />
        <T size={12} color={colors.faint}>
          hoặc đăng nhập với
        </T>
        <View style={styles.line} />
      </Row>

      <Row style={{ justifyContent: 'center', gap: 16 }}>
        <SocialBtn icon="google" color="#EA4335" bg={colors.white} onPress={() => social('Google')} />
        <SocialBtn icon="facebook" color={colors.white} bg="#1877F2" onPress={() => social('Facebook')} />
        <SocialBtn icon="apple" color={colors.white} bg="#111" onPress={() => social('Apple')} />
      </Row>

      <View style={styles.demo}>
        <T w="bold" size={12} color={colors.gold}>
          Chế độ demo
        </T>
        <T size={12} color={colors.muted} style={{ marginTop: 2 }}>
          Nhập số bất kỳ (10 số), mã OTP là 123456. Số bắt đầu bằng 09 → vào thẳng tiệm mẫu; số khác → đi qua bước tạo tiệm.
        </T>
      </View>

      <Row style={{ justifyContent: 'center', marginTop: 20 }} gap={6}>
        <FontAwesome name="lock" size={12} color={colors.faint} />
        <T size={11} color={colors.faint}>
          An toàn & bảo mật
        </T>
      </Row>
    </Screen>
  );
}

function SocialBtn({
  icon,
  color,
  bg,
  onPress,
}: {
  icon: 'google' | 'facebook' | 'apple';
  color: string;
  bg: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Đăng nhập với ${icon}`}
      style={({ pressed }) => [styles.social, { backgroundColor: bg }, shadow(1), pressed && { opacity: 0.8 }]}
    >
      <FontAwesome name={icon} size={20} color={color} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 120, justifyContent: 'center', marginTop: 20 },
  bubble: {
    alignSelf: 'flex-start',
    backgroundColor: colors.white,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...shadow(2),
  },
  bubbleAi: {
    alignSelf: 'flex-end',
    backgroundColor: colors.primary,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 4,
    marginTop: 10,
  },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  social: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  demo: { marginTop: 24, backgroundColor: colors.goldSoft, borderRadius: 14, padding: 12 },
});
