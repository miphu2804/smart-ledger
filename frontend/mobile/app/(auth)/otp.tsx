import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useToast } from '../../src/components/brand';
import { Button, Header, Progress, Screen, T } from '../../src/components/ui';
import { USE_MOCK } from '../../src/config';
import { MOCK_OTP } from '../../src/data/mock';
import { confirmPhoneLogin, startPhoneLogin } from '../../src/lib/auth';
import { errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import { useApp } from '../../src/store/AppStore';
import { colors, font } from '../../src/theme';

export default function Otp() {
  const { phone = '' } = useLocalSearchParams<{ phone: string }>();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [left, setLeft] = useState(30);
  const input = useRef<TextInput>(null);
  const { signIn } = useApp();
  const toast = useToast();

  useEffect(() => {
    const t = setInterval(() => setLeft((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async (c = code) => {
    if (c.length < 6 || loading) return;
    setLoading(true);
    setError('');
    try {
      await confirmPhoneLogin(c); // Firebase xác thực mã OTP
      const session = await signIn(); // đổi ID token lấy phiên ở Core (POST /auth/session)
      router.replace(session.needsOnboarding ? '/(auth)/setup' : '/(tabs)');
    } catch (e) {
      if (isDisplayNameRequired(e)) {
        // Firebase đã xác thực nhưng Core chưa có tài khoản → hỏi tên rồi mở phiên
        router.replace('/(auth)/profile');
        return;
      }
      setCode('');
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await startPhoneLogin(phone);
      setLeft(30);
      setError('');
      toast(USE_MOCK ? `Đã gửi lại mã OTP (mã demo: ${MOCK_OTP})` : 'Đã gửi lại mã OTP');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const pretty = phone.replace(/^0/, '').replace(/(\d{2,3})(\d{3})(\d{3,4})/, '$1 $2 $3');

  return (
    <Screen>
      <Header title="" />
      <Progress value={0.33} height={4} />
      <T w="extrabold" size={26} style={{ marginTop: 24 }}>
        Xác nhận số điện thoại
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6 }}>
        Nhập mã OTP đã gửi đến{'\n'}
        <T w="bold">+84 {pretty}</T>
      </T>

      <Pressable onPress={() => input.current?.focus()} style={{ marginTop: 28 }}>
        <View style={styles.boxes}>
          {Array.from({ length: 6 }).map((_, i) => {
            const ch = code[i];
            const focused = i === code.length;
            return (
              <View
                key={i}
                style={[styles.box, focused && { borderColor: colors.primary }, error ? { borderColor: colors.red } : null]}
              >
                <T w="bold" size={22}>
                  {ch ?? ''}
                </T>
              </View>
            );
          })}
        </View>
        <TextInput
          ref={input}
          value={code}
          autoFocus
          onChangeText={(t) => {
            const c = t.replace(/\D/g, '').slice(0, 6);
            setCode(c);
            setError('');
            if (c.length === 6) verify(c);
          }}
          keyboardType="number-pad"
          maxLength={6}
          style={styles.hidden}
          accessibilityLabel="Mã OTP"
        />
      </Pressable>
      {error ? (
        <T size={12} color={colors.red} style={{ marginTop: 10 }}>
          {error}
        </T>
      ) : null}

      <Button title="Xác nhận" onPress={() => verify()} disabled={code.length < 6} loading={loading} style={{ marginTop: 24 }} />

      <View style={{ alignItems: 'center', marginTop: 18 }}>
        {left > 0 ? (
          <T size={13} color={colors.faint}>
            Gửi lại mã sau {left}s
          </T>
        ) : (
          <T size={13} color={colors.faint}>
            Chưa nhận được mã?{' '}
            <T
              w="bold"
              size={13}
              color={colors.primary}
              onPress={resend}
            >
              Gửi lại
            </T>
          </T>
        )}
      </View>

      {USE_MOCK ? (
        <Pressable
          onPress={() => {
            setCode(MOCK_OTP);
            verify(MOCK_OTP);
          }}
          style={styles.fill}
        >
          <T w="semibold" size={12} color={colors.gold}>
            Điền nhanh mã demo {MOCK_OTP}
          </T>
        </Pressable>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  box: {
    flex: 1,
    height: 58,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hidden: { position: 'absolute', opacity: 0, width: '100%', height: '100%', fontFamily: font.medium },
  fill: {
    alignSelf: 'center',
    marginTop: 28,
    backgroundColor: colors.goldSoft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
});
