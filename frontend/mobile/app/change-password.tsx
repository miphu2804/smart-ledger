import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useToast } from '../src/components/brand';
import { Button, Card, Field, Header, Screen, T } from '../src/components/ui';
import { authClient, AuthError } from '../src/lib/auth';
import { errorMessage } from '../src/lib/errors';
import { triggerFeedback } from '../src/lib/feedback';
import { colors } from '../src/theme';

/** Đổi mật khẩu ngay trong app (tài khoản đăng ký bằng email): không phải đăng xuất rồi đi đường "Quên mật khẩu". */
export default function ChangePassword() {
  const toast = useToast();
  const email = authClient.currentEmail() ?? '';
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [currentErr, setCurrentErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);

  const nextErr = next && next.length < 6 ? 'Mật khẩu mới cần ít nhất 6 ký tự' : next && next === current ? 'Mật khẩu mới phải khác mật khẩu hiện tại' : '';
  const againErr = again && again !== next ? 'Hai lần nhập mật khẩu mới chưa giống nhau' : '';
  const valid = !!current && next.length >= 6 && next !== current && again === next;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    setCurrentErr('');
    try {
      await authClient.changePassword(current, next);
      triggerFeedback('success');
      toast('Đã đổi mật khẩu');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/more');
    } catch (e) {
      triggerFeedback('error');
      if (e instanceof AuthError && e.code === 'invalid-credentials') setCurrentErr('Mật khẩu hiện tại chưa đúng');
      else toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  // Quên luôn mật khẩu hiện tại thì gửi thư đặt lại về email đang đăng nhập, vẫn không phải đăng xuất
  const sendReset = async () => {
    if (!email || resetBusy) return;
    setResetBusy(true);
    try {
      await authClient.sendPasswordReset(email);
      toast(`Đã gửi thư đặt lại mật khẩu tới ${email}`);
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <Screen footer={<Button title="Đổi mật khẩu" loading={busy} disabled={!valid || busy} onPress={submit} />}>
      <Header title="Đổi mật khẩu" subtitle={email || undefined} />
      <Card>
        <Field
          label="Mật khẩu hiện tại"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={current}
          onChangeText={(t) => {
            setCurrent(t);
            setCurrentErr('');
          }}
          error={currentErr || undefined}
        />
        <Field
          label="Mật khẩu mới"
          placeholder="Ít nhất 6 ký tự"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={next}
          onChangeText={setNext}
          error={nextErr || undefined}
        />
        <Field
          label="Nhập lại mật khẩu mới"
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          value={again}
          onChangeText={setAgain}
          onSubmitEditing={submit}
          error={againErr || undefined}
        />
        <T size={12} color={colors.faint}>
          Đổi xong bạn vẫn ở trong app. Lần đăng nhập sau trên máy khác hãy dùng mật khẩu mới.
        </T>
      </Card>
      {email ? (
        <Pressable
          onPress={sendReset}
          disabled={resetBusy}
          accessibilityRole="button"
          style={{ alignSelf: 'center', marginTop: 16, minHeight: 44, justifyContent: 'center' }}
        >
          <T w="semibold" size={13} color={colors.brand}>
            {resetBusy ? 'Đang gửi…' : 'Quên mật khẩu hiện tại? Gửi thư đặt lại'}
          </T>
        </Pressable>
      ) : null}
    </Screen>
  );
}
