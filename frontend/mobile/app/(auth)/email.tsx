import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Button, Chips, Field, Header, Screen, T } from '../../src/components/ui';
import { authClient } from '../../src/lib/auth';
import { debugLog } from '../../src/lib/debug';
import { describeError, errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

type Mode = 'login' | 'register';

/**
 * Đăng nhập / tự đăng ký bằng email + mật khẩu (Firebase Email/Password). Sau khi Firebase xác thực, đi cùng luồng với
 * số điện thoại: gửi Firebase ID token xuống Core (POST /auth/session). Tiện để thử API khi không có SMS/điện thoại,
 * và không cần ai thêm user trong Firebase Console — chọn “Tạo tài khoản”.
 */
export default function EmailAuth() {
  const { signIn } = useApp();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const valid = /^\S+@\S+\.\S+$/.test(email.trim()) && password.length >= 6;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr('');
    try {
      if (mode === 'login') await authClient.signInWithEmail(email, password);
      else await authClient.signUpWithEmail(email, password);
      const session = await signIn(); // gửi Firebase ID token xuống Core (POST /auth/session)
      router.replace(session.needsOnboarding ? '/(auth)/setup' : '/(tabs)');
    } catch (e) {
      debugLog('auth', 'email flow ✗', describeError(e));
      if (isDisplayNameRequired(e)) {
        // Firebase đã xác thực nhưng Core chưa có tài khoản → hỏi tên rồi mở phiên
        router.replace('/(auth)/profile');
        return;
      }
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Header title="" />
      <T w="extrabold" size={26} style={{ marginTop: 4 }}>
        {mode === 'login' ? 'Đăng nhập bằng email' : 'Tạo tài khoản'}
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 18, lineHeight: 21 }}>
        {mode === 'login'
          ? 'Dùng email và mật khẩu đã đăng ký'
          : 'Chưa có tài khoản? Nhập email và đặt mật khẩu (từ 6 ký tự) để tạo mới'}
      </T>

      <Chips<Mode>
        scroll={false}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setErr('');
        }}
        options={[
          { key: 'login', label: 'Đăng nhập' },
          { key: 'register', label: 'Tạo tài khoản' },
        ]}
        style={{ marginBottom: 18 }}
      />

      <Field
        label="Email"
        placeholder="ten@example.com"
        keyboardType="email-address"
        autoCapitalize="none"
        autoCorrect={false}
        value={email}
        onChangeText={(t) => {
          setEmail(t);
          setErr('');
        }}
      />
      <Field
        label="Mật khẩu"
        placeholder="Ít nhất 6 ký tự"
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
        value={password}
        onChangeText={(t) => {
          setPassword(t);
          setErr('');
        }}
        onSubmitEditing={submit}
        error={err || undefined}
      />

      <Button
        title={mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
        onPress={submit}
        disabled={!valid}
        loading={busy}
        style={{ marginTop: 6 }}
      />

      <Pressable onPress={() => router.back()} style={{ alignSelf: 'center', marginTop: 20 }} hitSlop={8}>
        <T size={13} color={colors.faint}>
          Dùng số điện thoại
        </T>
      </Pressable>
    </Screen>
  );
}
