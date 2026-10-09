import { router } from 'expo-router';
import React, { useState } from 'react';
import { Linking, Pressable } from 'react-native';
import { useToast } from '../../src/components/brand';
import { Button, Header, Screen, T } from '../../src/components/ui';
import { SUPPORT_EMAIL } from '../../src/config';
import { authClient } from '../../src/lib/auth';
import { debugLog } from '../../src/lib/debug';
import { describeError, errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import { useCooldown } from '../../src/lib/useCooldown';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

/**
 * Bước xác minh email sau khi đăng ký (hoặc đăng nhập bằng email chưa xác minh): người dùng mở thư, bấm liên kết rồi quay lại
 * bấm "Tôi đã xác minh". Chỉ khi Firebase báo đã xác minh mới lấy phiên ở Core (POST /auth/session).
 * Đây là chặn ở phía app; Core chưa kiểm tra email_verified.
 */
export default function VerifyEmail() {
  const { signIn, logout } = useApp();
  const toast = useToast();
  const email = authClient.currentEmail() ?? '';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cooldown = useCooldown(60);

  const check = async () => {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      const verified = await authClient.refreshEmailVerified();
      if (!verified) {
        setErr('Email chưa được xác minh. Hãy bấm liên kết trong thư (kiểm tra cả thư rác) rồi thử lại.');
        return;
      }
      const session = await signIn(); // gửi Firebase ID token xuống Core (POST /auth/session)
      router.replace(session.needsOnboarding ? '/(auth)/setup' : '/(tabs)');
    } catch (e) {
      debugLog('auth', 'xác minh email ✗', describeError(e));
      if (isDisplayNameRequired(e)) {
        router.replace('/(auth)/profile');
        return;
      }
      // signIn() đăng xuất Firebase khi Core lỗi: ở lại màn này thì nút "Tôi đã xác minh" báo sai là chưa xác minh.
      if (!authClient.currentEmail()) {
        toast(errorMessage(e), 'err');
        router.replace('/(auth)/welcome');
        return;
      }
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (busy || cooldown.left > 0) return;
    setBusy(true);
    setErr('');
    try {
      await authClient.sendEmailVerification();
      cooldown.start();
      toast('Đã gửi lại thư xác minh');
    } catch (e) {
      debugLog('auth', 'gửi lại thư xác minh ✗', describeError(e));
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const useAnotherEmail = async () => {
    await logout();
    router.replace('/(auth)/welcome');
  };

  return (
    <Screen>
      <Header title="" back={false} />
      <T w="extrabold" size={26} style={{ marginTop: 4 }}>
        Xác minh email
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 18, lineHeight: 21 }}>
        {email ? `Chúng tôi đã gửi thư xác minh tới ${email}. ` : 'Chúng tôi đã gửi thư xác minh tới email của bạn. '}
        Mở thư, bấm liên kết trong đó rồi quay lại đây. Không thấy thư thì kiểm tra cả thư rác.
      </T>

      {err ? (
        <T size={13} color={colors.red} style={{ marginBottom: 12, lineHeight: 20 }}>
          {err}
        </T>
      ) : null}

      <Button title="Tôi đã xác minh" onPress={check} loading={busy} />
      <Button
        title={cooldown.left > 0 ? `Gửi lại thư sau ${cooldown.left}s` : 'Gửi lại thư xác minh'}
        variant="soft"
        onPress={resend}
        disabled={cooldown.left > 0}
        style={{ marginTop: 10 }}
      />

      <Pressable onPress={useAnotherEmail} accessibilityRole="button" style={{ alignSelf: 'center', marginTop: 14, minHeight: 44, justifyContent: 'center' }} hitSlop={8}>
        <T size={13} color={colors.faint}>
          Dùng email khác
        </T>
      </Pressable>

      {SUPPORT_EMAIL ? (
        <Pressable
          onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
          accessibilityRole="link"
          style={{ alignSelf: 'center', marginTop: 4, minHeight: 44, justifyContent: 'center' }}
          hitSlop={8}
        >
          <T size={12} color={colors.faint}>
            Cần hỗ trợ? {SUPPORT_EMAIL}
          </T>
        </Pressable>
      ) : null}
    </Screen>
  );
}
