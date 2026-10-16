import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Logo, useToast } from '../../src/components/brand';
import { Button, Row, Screen, T } from '../../src/components/ui';
import { AuthError, authClient } from '../../src/lib/auth';
import { debugLog } from '../../src/lib/debug';
import { describeError, errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import { signInWithZalo, ZALO_LOGIN_AVAILABLE } from '../../src/lib/zaloLogin';
import { useApp } from '../../src/store/AppStore';
import { colors, shadow } from '../../src/theme';

/**
 * Cách đăng nhập: email + mật khẩu, Facebook và Google dùng được; Zalo dùng được trên bản web khi bật EXPO_PUBLIC_ZALO_LOGIN,
 * còn lại ghi "Sắp có". Không còn đăng nhập bằng số điện thoại.
 */
export default function Welcome() {
  const toast = useToast();
  const app = useApp();
  const [busy, setBusy] = useState<SocialProvider | null>(null);

  // Facebook/Google/Zalo → Firebase → phiên Core, cùng luồng với email: tài khoản mới (Core đòi tên) đi tiếp qua màn đăng ký.
  const signInWith = async (provider: SocialProvider) => {
    if (busy) return;
    setBusy(provider);
    try {
      // Zalo mở cửa sổ ngay trong lượt bấm (trước mọi await) để trình duyệt không chặn; tên Zalo dùng khi tạo tài khoản mới
      let displayName: string | undefined;
      if (provider === 'zalo') displayName = (await signInWithZalo()).displayName;
      else await (provider === 'google' ? authClient.signInWithGoogle() : authClient.signInWithFacebook());
      const session = await app.signIn(displayName); // gửi Firebase ID token xuống Core (POST /auth/session)
      router.replace(session.needsOnboarding ? '/(auth)/setup' : '/(tabs)');
    } catch (e) {
      if (e instanceof AuthError && e.code === 'cancelled') return; // người dùng tự đóng, không phải lỗi
      debugLog('auth', `${provider} flow ✗`, describeError(e));
      if (isDisplayNameRequired(e)) {
        router.replace('/(auth)/profile');
        return;
      }
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen>
      <View style={{ paddingTop: 24 }}>
        <Logo size={54} />
      </View>

      <T w="extrabold" size={30} style={{ marginTop: 48 }}>
        Đăng nhập
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 22, lineHeight: 21 }}>
        Chọn cách vào sổ bán hàng của bạn.
      </T>

      <Button title="Đăng nhập bằng email" icon="mail" onPress={() => router.push({ pathname: '/(auth)/email', params: { mode: 'login' } })} />

      <Pressable
        onPress={() => router.push({ pathname: '/(auth)/email', params: { mode: 'register' } })}
        accessibilityRole="button"
        style={{ alignSelf: 'center', marginTop: 10, minHeight: 44, justifyContent: 'center' }}
        hitSlop={8}
      >
        <T w="semibold" size={13} color={colors.brand}>
          Chưa có tài khoản? Tạo tài khoản
        </T>
      </Pressable>

      {__DEV__ ? (
        <Button
          title="Vào app"
          icon="arrow-right"
          variant="soft"
          onPress={() => {
            app.enterDevApp();
            router.replace('/(tabs)');
          }}
          style={{ marginTop: 6 }}
        />
      ) : null}

      <Row style={styles.divider} gap={10}>
        <View style={styles.line} />
        <T size={12} color={colors.faint}>Hoặc tiếp tục với</T>
        <View style={styles.line} />
      </Row>
      <Row gap={8} style={{ alignItems: 'stretch' }}>
        <SocialBtn name="Facebook" icon="facebook" busy={busy === 'facebook'} disabled={!!busy && busy !== 'facebook'} onPress={() => signInWith('facebook')} />
        <SocialBtn name="Google" icon="google" busy={busy === 'google'} disabled={!!busy && busy !== 'google'} onPress={() => signInWith('google')} />
        <SocialBtn
          name="Zalo"
          icon="zalo"
          soon={!ZALO_LOGIN_AVAILABLE}
          busy={busy === 'zalo'}
          disabled={!!busy && busy !== 'zalo'}
          onPress={() => signInWith('zalo')}
        />
      </Row>

      <Row style={{ justifyContent: 'center', marginTop: 24 }} gap={6}>
        <FontAwesome name="lock" size={12} color={colors.faint} />
        <T size={12} color={colors.faint}>
          An toàn & bảo mật
        </T>
      </Row>
    </Screen>
  );
}

type SocialProvider = 'facebook' | 'google' | 'zalo';
type SocialIcon = SocialProvider;
const SOCIAL_COLOR: Record<SocialIcon, string> = { google: '#EA4335', facebook: '#1877F2', zalo: '#0068FF' };

function SocialBtn({ name, icon, onPress, soon = false, busy = false, disabled = false }: {
  name: string;
  icon: SocialIcon;
  onPress?: () => void;
  /** true = chưa có: nút mờ, có nhãn "Sắp có" và không bấm được */
  soon?: boolean;
  busy?: boolean;
  /** true khi đang chờ cách đăng nhập khác: không bấm được nhưng không mờ như "Sắp có" */
  disabled?: boolean;
}) {
  const color = SOCIAL_COLOR[icon];
  return (
    <Pressable
      onPress={onPress}
      disabled={soon || busy || disabled}
      accessibilityRole="button"
      accessibilityLabel={soon ? `${name}, sắp có` : `Đăng nhập bằng ${name}`}
      accessibilityState={{ busy, disabled: soon || disabled }}
      style={({ pressed }) => [styles.social, soon && styles.socialSoon, (pressed || busy) && { opacity: 0.75 }]}
    >
      <Row gap={6}>
        {busy ? (
          <ActivityIndicator size="small" color={color} />
        ) : icon === 'zalo' ? (
          <View style={[styles.zaloMark, { backgroundColor: color }]}>
            <T w="extrabold" size={11} color={colors.white}>Z</T>
          </View>
        ) : (
          <FontAwesome name={icon} size={18} color={color} />
        )}
        <T w="bold" size={12}>{name}</T>
      </Row>
      {soon ? (
        <T size={10} color={colors.faint} style={{ marginTop: 2 }}>
          Sắp có
        </T>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  divider: { marginTop: 12, marginBottom: 12 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  social: {
    flex: 1, minHeight: 56, alignItems: 'center', justifyContent: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
    ...shadow(0),
  },
  socialSoon: { opacity: 0.6, backgroundColor: colors.bg },
  zaloMark: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
