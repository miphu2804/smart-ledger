import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useToast } from '../../src/components/brand';
import { Button, Field, Header, Progress, Screen, T } from '../../src/components/ui';
import { errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

/**
 * Đăng nhập lần đầu: Firebase đã xác thực số điện thoại nhưng Core chưa có tài khoản → hỏi tên rồi mở phiên
 * (POST /auth/session { displayName }). Số điện thoại không kèm tên nên Core bắt buộc phải có bước này.
 */
export default function Profile() {
  const { signIn, logout } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    const displayName = name.trim();
    if (!displayName || busy) return;
    setBusy(true);
    setErr('');
    try {
      const session = await signIn(displayName);
      router.replace(session.needsOnboarding ? '/(auth)/setup' : '/(tabs)');
    } catch (e) {
      if (isDisplayNameRequired(e)) {
        setErr(errorMessage(e));
      } else {
        // Lỗi khác đã làm đăng xuất Firebase (signIn xử lý) → quay về đăng nhập
        toast(errorMessage(e), 'err');
        router.replace('/(auth)/welcome');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={<Button title="Tiếp tục" icon="arrow-right" disabled={!name.trim()} loading={busy} onPress={submit} />}
    >
      <Header title="" back={false} />
      <Progress value={0.6} height={4} />
      <T w="extrabold" size={26} style={{ marginTop: 24 }}>
        Bạn tên gì?
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 18 }}>
        Tên này hiện trong hồ sơ và trên hoá đơn của bạn
      </T>
      <Field
        placeholder="VD: Nguyễn Thị Lan"
        value={name}
        maxLength={150}
        autoFocus
        onChangeText={(t) => {
          setName(t);
          setErr('');
        }}
        onSubmitEditing={submit}
        error={err || undefined}
      />
      <Pressable
        onPress={async () => {
          await logout();
          router.replace('/(auth)/welcome');
        }}
        style={{ alignSelf: 'center', marginTop: 20 }}
      >
        <T size={13} color={colors.faint}>
          Dùng số điện thoại khác
        </T>
      </Pressable>
    </Screen>
  );
}
