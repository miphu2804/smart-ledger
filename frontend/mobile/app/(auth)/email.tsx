import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { Button, Chips, Field, Header, Screen, T } from '../../src/components/ui';
import { AuthError, authClient } from '../../src/lib/auth';
import { debugLog } from '../../src/lib/debug';
import { describeError, errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import { useCooldown } from '../../src/lib/useCooldown';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

type Mode = 'login' | 'register' | 'reset';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Đăng nhập / tự đăng ký bằng email + mật khẩu (Firebase Email/Password), kèm "Quên mật khẩu".
 * Đăng ký xong phải xác minh email (màn verify-email) rồi mới gửi Firebase ID token xuống Core (POST /auth/session).
 */
export default function EmailAuth() {
  const { signIn } = useApp();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === 'register' ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  /** Đăng nhập không khớp (sai mật khẩu hoặc chưa có tài khoản): gợi ý hướng đi thay vì báo lỗi */
  const [hint, setHint] = useState(false);
  const [sentTo, setSentTo] = useState('');
  const cooldown = useCooldown(30);

  const emailOk = EMAIL_RE.test(email.trim());
  const valid = mode === 'reset' ? emailOk : emailOk && password.length >= 6;

  const switchMode = (m: Mode) => {
    setMode(m);
    setErr('');
    setHint(false);
    setSentTo('');
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setErr('');
    setHint(false);
    try {
      if (mode === 'login') await authClient.signInWithEmail(email, password);
      else await authClient.signUpWithEmail(email, password);
      if (authClient.needsEmailVerification()) {
        // Tài khoản mới nhận thư xác minh ngay; tài khoản cũ chưa xác minh tự bấm "Gửi lại" ở màn sau để khỏi gửi thừa.
        if (mode === 'register') await authClient.sendEmailVerification().catch((e) => debugLog('auth', 'gửi thư xác minh ✗', describeError(e)));
        router.replace('/(auth)/verify-email');
        return;
      }
      const session = await signIn(); // gửi Firebase ID token xuống Core (POST /auth/session)
      router.replace(session.needsOnboarding ? '/(auth)/setup' : '/(tabs)');
    } catch (e) {
      debugLog('auth', 'email flow ✗', describeError(e));
      if (isDisplayNameRequired(e)) {
        // Firebase đã xác thực nhưng Core chưa có tài khoản → hỏi tên rồi mở phiên
        router.replace('/(auth)/profile');
        return;
      }
      if (mode === 'login' && e instanceof AuthError && e.code === 'invalid-credentials') {
        setHint(true);
        return;
      }
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (!valid || busy || cooldown.left > 0) return;
    setBusy(true);
    setErr('');
    try {
      await authClient.sendPasswordReset(email);
      setSentTo(email.trim());
      cooldown.start();
    } catch (e) {
      debugLog('auth', 'quên mật khẩu ✗', describeError(e));
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const titles: Record<Mode, { title: string; sub: string }> = {
    login: { title: 'Đăng nhập', sub: 'Nhập email và mật khẩu.' },
    register: { title: 'Tạo tài khoản', sub: 'Nhập email và tạo mật khẩu từ 6 ký tự. Chúng tôi sẽ gửi thư xác minh tới email này.' },
    reset: { title: 'Quên mật khẩu', sub: 'Nhập email đã đăng ký, chúng tôi sẽ gửi liên kết để đặt mật khẩu mới.' },
  };

  return (
    <Screen>
      <Header title="" />
      <T w="extrabold" size={26} style={{ marginTop: 4 }}>
        {titles[mode].title}
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 18, lineHeight: 21 }}>
        {titles[mode].sub}
      </T>

      {mode !== 'reset' ? (
        <Chips<'login' | 'register'>
          scroll={false}
          value={mode}
          onChange={switchMode}
          options={[
            { key: 'login', label: 'Đăng nhập' },
            { key: 'register', label: 'Tạo tài khoản' },
          ]}
          style={{ marginBottom: 18 }}
        />
      ) : null}

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
          setHint(false);
        }}
        onSubmitEditing={mode === 'reset' ? sendReset : undefined}
        error={mode === 'reset' ? err || undefined : undefined}
      />

      {mode !== 'reset' ? (
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
            setHint(false);
          }}
          onSubmitEditing={submit}
          error={err || undefined}
        />
      ) : null}

      {mode === 'login' && hint ? (
        <T size={13} color={colors.muted} style={{ marginBottom: 12, lineHeight: 20 }}>
          Email hoặc mật khẩu chưa đúng. Nếu chưa có tài khoản, hãy{' '}
          <T w="bold" size={13} color={colors.brand} onPress={() => switchMode('register')}>
            tạo tài khoản
          </T>
          ; nếu quên mật khẩu, hãy{' '}
          <T w="bold" size={13} color={colors.brand} onPress={() => switchMode('reset')}>
            đặt lại mật khẩu
          </T>
          .
        </T>
      ) : null}

      {mode === 'reset' && sentTo ? (
        <T size={13} color={colors.green} style={{ marginBottom: 12, lineHeight: 20 }}>
          Nếu {sentTo} đã đăng ký, chúng tôi vừa gửi liên kết đặt lại mật khẩu. Hãy mở email (kiểm tra cả thư rác) rồi quay lại đăng nhập.
        </T>
      ) : null}

      {mode === 'reset' ? (
        <Button
          title={cooldown.left > 0 ? `Gửi lại sau ${cooldown.left}s` : sentTo ? 'Gửi lại liên kết' : 'Gửi liên kết đặt lại'}
          onPress={sendReset}
          disabled={!valid || cooldown.left > 0}
          loading={busy}
          style={{ marginTop: 6 }}
        />
      ) : (
        <>
          <Button
            title={mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}
            onPress={submit}
            disabled={!valid}
            loading={busy}
            style={{ marginTop: 6 }}
          />
          {mode === 'login' ? (
            <Pressable
              onPress={() => switchMode('reset')}
              accessibilityRole="button"
              style={{ alignSelf: 'center', marginTop: 8, minHeight: 44, justifyContent: 'center' }}
              hitSlop={8}
            >
              <T w="semibold" size={13} color={colors.brand}>
                Quên mật khẩu?
              </T>
            </Pressable>
          ) : null}
        </>
      )}

      <Pressable
        onPress={() => (mode === 'reset' ? switchMode('login') : router.canGoBack() ? router.back() : router.replace('/(auth)/welcome'))}
        style={{ alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' }}
        hitSlop={8}
      >
        <T size={13} color={colors.faint}>
          {mode === 'reset' ? 'Quay lại đăng nhập' : 'Chọn cách đăng nhập khác'}
        </T>
      </Pressable>
    </Screen>
  );
}
