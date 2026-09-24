import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Logo, useToast } from '../../src/components/brand';
import { Button, Field, Row, Screen, T } from '../../src/components/ui';
import { startPhoneLogin } from '../../src/lib/auth';
import { errorMessage } from '../../src/lib/errors';
import { colors, shadow } from '../../src/theme';

export default function Welcome() {
  const toast = useToast();
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const digits = phone.replace(/\D/g, '');
  const valid = /^0?\d{9}$/.test(digits);

  const submit = async () => {
    if (!valid) {
      setError('Số điện thoại gồm 10 số, ví dụ 0901 234 567');
      return;
    }
    if (loading) return;
    const local = digits.startsWith('0') ? digits : `0${digits}`;
    setLoading(true);
    try {
      await startPhoneLogin(local); // gửi SMS OTP (Firebase; bản mock thì không gửi gì)
      router.push({ pathname: '/(auth)/otp', params: { phone: local } });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: 24 }}>
        <Logo size={54} />
      </View>

      <T w="extrabold" size={30} style={{ marginTop: 48 }}>
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
      <Button title="Tiếp tục" onPress={submit} disabled={!digits.length} loading={loading} />

      <Pressable onPress={() => router.push('/(auth)/email')} style={{ alignSelf: 'center', marginTop: 14, minHeight: 44, justifyContent: 'center' }} hitSlop={8}>
        <T w="semibold" size={13} color={colors.primary}>
          Đăng nhập bằng email và mật khẩu
        </T>
      </Pressable>

      <Row style={styles.divider} gap={10}>
        <View style={styles.line} />
        <T size={12} color={colors.faint}>Cách đăng nhập khác</T>
        <View style={styles.line} />
      </Row>
      <Row gap={8}>
        <SocialBtn name="Google" icon="google" color="#EA4335" onPress={() => toast('Google chưa được kết nối. Hãy dùng số điện thoại hoặc email.', 'err')} />
        <SocialBtn name="Facebook" icon="facebook" color="#1877F2" onPress={() => toast('Facebook chưa được kết nối. Hãy dùng số điện thoại hoặc email.', 'err')} />
        <SocialBtn name="Apple" icon="apple" color={colors.ink} onPress={() => toast('Apple chưa được kết nối. Hãy dùng số điện thoại hoặc email.', 'err')} />
      </Row>
      <T size={11} color={colors.faint} style={styles.socialNote}>
        Các phương thức này chưa được kết nối.
      </T>

      <Row style={{ justifyContent: 'center', marginTop: 20 }} gap={6}>
        <FontAwesome name="lock" size={12} color={colors.faint} />
          <T size={12} color={colors.faint}>
          An toàn & bảo mật
        </T>
      </Row>
    </Screen>
  );
}

function SocialBtn({ name, icon, color, onPress }: {
  name: string;
  icon: 'google' | 'facebook' | 'apple';
  color: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name} chưa được kết nối`}
      style={({ pressed }) => [styles.social, pressed && { opacity: 0.75 }]}
    >
      <FontAwesome name={icon} size={18} color={color} />
      <T w="bold" size={12}>{name}</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  divider: { marginTop: 12, marginBottom: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  social: {
    flex: 1, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    ...shadow(0),
  },
  socialNote: { textAlign: 'center', marginTop: 9 },
});
