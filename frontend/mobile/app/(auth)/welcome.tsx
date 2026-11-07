import { FontAwesome } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LogoMark, useToast } from '../../src/components/brand';
import { Button, Field, Row, Screen, T } from '../../src/components/ui';
import { WEBSITE_URL } from '../../src/config';
import { AuthError, authClient } from '../../src/lib/auth';
import { track } from '../../src/lib/analytics';
import { debugLog } from '../../src/lib/debug';
import { setEmailDraft } from '../../src/lib/emailDraft';
import { describeError, errorMessage, isDisplayNameRequired } from '../../src/lib/errors';
import type { SignInMethod } from '../../src/lib/lastSignIn';
import { loadLastSignIn, saveLastSignIn } from '../../src/lib/lastSignInStorage';
import { signInWithZalo, ZALO_LOGIN_AVAILABLE } from '../../src/lib/zaloLogin';
import { useApp } from '../../src/store/AppStore';
import { colors, shadow } from '../../src/theme';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

/**
 * Màn đăng nhập theo bố cục Runpod: một thẻ giữa màn với Google và Zalo, ô email và nút "Tiếp tục" (sang màn nhập mật
 * khẩu, email điền sẵn), "Quên mật khẩu?", và chân thẻ "Chưa có tài khoản? Tạo tài khoản". Cách đăng nhập thành công gần
 * nhất trên máy được gắn nhãn "Lần trước dùng". Không còn nút Facebook (mã `signInWithFacebook` và SDK vẫn giữ); Zalo dùng
 * được khi build có cấu hình Zalo (Android: EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID, web: EXPO_PUBLIC_ZALO_LOGIN), còn lại ghi
 * "Sắp có". Không đăng nhập bằng số điện thoại.
 */
export default function Welcome() {
  const toast = useToast();
  const app = useApp();
  const [busy, setBusy] = useState<SocialProvider | null>(null);
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [last, setLast] = useState<SignInMethod | null>(null);

  useEffect(() => {
    void loadLastSignIn().then(setLast);
  }, []);

  // Google/Zalo → Firebase → phiên Core, cùng luồng với email: tài khoản mới (Core đòi tên) đi tiếp qua màn đăng ký.
  const signInWith = async (provider: SocialProvider) => {
    if (busy) return;
    setBusy(provider);
    try {
      // Zalo mở cửa sổ ngay trong lượt bấm (trước mọi await) để trình duyệt không chặn; tên Zalo dùng khi tạo tài khoản mới
      let displayName: string | undefined;
      if (provider === 'zalo') {
        // Tên Zalo chỉ là gợi ý cho tài khoản mới: Zalo cho tới 255 ký tự, `/auth/session` nhận tối đa 150. Tên rỗng hay quá dài
        // thì không gửi: tài khoản mới khi đó bị Core hỏi tên và đi qua màn "Bạn tên gì?", tài khoản cũ vào thẳng như thường.
        const name = (await signInWithZalo()).displayName?.trim();
        displayName = name && name.length <= MAX_DISPLAY_NAME ? name : undefined;
      } else await authClient.signInWithGoogle();
      const session = await app.signIn(displayName); // gửi Firebase ID token xuống Core (POST /auth/session)
      void saveLastSignIn(provider);
      track('login', { method: provider });
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

  // Bước 1 của đăng nhập bằng email: kiểm tra định dạng rồi sang màn mật khẩu với email điền sẵn
  const continueWithEmail = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailErr('Email chưa đúng, VD: ten@example.com');
      return;
    }
    setEmailDraft(email.trim());
    router.push({ pathname: '/(auth)/email', params: { mode: 'login' } });
  };

  return (
    <Screen bg={colors.surfaceMuted}>
      <View style={styles.card}>
        <View style={styles.body}>
          <View style={styles.logo}>
            <LogoMark size={56} />
          </View>
          <T w="extrabold" size={22} style={styles.center}>
            Đăng nhập Sổ Nghe Lời
          </T>
          <T size={14} color={colors.muted} style={[styles.center, { marginTop: 6, marginBottom: 24, lineHeight: 21 }]}>
            Chào mừng trở lại! Đăng nhập để tiếp tục.
          </T>

          <SocialBtn name="Google" icon="google" last={last === 'google'} busy={busy === 'google'} disabled={!!busy && busy !== 'google'} onPress={() => signInWith('google')} />
          {/* Zalo: build thiếu cấu hình (hay iOS, Core chưa có luồng) thì nút mờ, ghi "Sắp có" */}
          <SocialBtn
            name="Zalo"
            icon="zalo"
            soon={!ZALO_LOGIN_AVAILABLE}
            last={last === 'zalo'}
            busy={busy === 'zalo'}
            disabled={!!busy && busy !== 'zalo'}
            onPress={() => signInWith('zalo')}
          />

          <Row style={styles.divider} gap={12}>
            <View style={styles.line} />
            <T size={13} color={colors.faint}>hoặc</T>
            <View style={styles.line} />
          </Row>

          <View>
            {last === 'email' ? <LastUsedBadge style={styles.emailBadge} /> : null}
            <Field
              label="Địa chỉ email"
              placeholder="Nhập địa chỉ email của bạn"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setEmailErr('');
              }}
              onSubmitEditing={continueWithEmail}
              returnKeyType="next"
              error={emailErr || undefined}
            />
          </View>
          <Button title="Tiếp tục" icon="arrow-right" onPress={continueWithEmail} style={{ marginTop: 4 }} />

          <Pressable
            onPress={() => {
              setEmailDraft(email.trim());
              router.push({ pathname: '/(auth)/email', params: { mode: 'reset' } });
            }}
            accessibilityRole="button"
            style={styles.link}
            hitSlop={8}
          >
            <T w="semibold" size={14} color={colors.brand}>
              Quên mật khẩu?
            </T>
          </Pressable>
        </View>

        {/* Chân thẻ như "Don't have an account? Sign up" */}
        <Pressable
          onPress={() => router.push({ pathname: '/(auth)/email', params: { mode: 'register' } })}
          accessibilityRole="button"
          style={({ pressed }) => [styles.footer, pressed && { opacity: 0.75 }]}
        >
          <T size={14} color={colors.muted}>
            Chưa có tài khoản?{' '}
            <T w="bold" size={14} color={colors.brand}>
              Tạo tài khoản
            </T>
          </T>
        </Pressable>
      </View>

      {__DEV__ ? (
        <Button
          title="Vào app"
          icon="arrow-right"
          variant="soft"
          onPress={() => {
            app.enterDevApp();
            router.replace('/(tabs)');
          }}
          style={styles.devBtn}
        />
      ) : null}

      <Row style={{ justifyContent: 'center', marginTop: 20 }} gap={6}>
        <FontAwesome name="lock" size={12} color={colors.faint} />
        <T size={12} color={colors.faint}>
          An toàn & bảo mật
        </T>
      </Row>
      <Pressable
        onPress={() => void Linking.openURL(`${WEBSITE_URL}/chinh-sach`)}
        accessibilityRole="link"
        hitSlop={10}
        style={{ alignSelf: 'center', marginTop: 10, marginBottom: 12 }}
      >
        <T size={12} color={colors.muted} style={{ textDecorationLine: 'underline' }}>
          Chính sách và điều khoản
        </T>
      </Pressable>
    </Screen>
  );
}

type SocialProvider = 'google' | 'zalo';
/** Giới hạn `displayName` của `POST /auth/session` (cùng `maxLength` ở màn "Bạn tên gì?"). */
const MAX_DISPLAY_NAME = 150;
const SOCIAL_COLOR: Record<SocialProvider, string> = { google: '#EA4335', zalo: '#0068FF' };

/** Nhãn nhỏ "Lần trước dùng" vắt trên góc phải nút, như "Last used" của Runpod */
function LastUsedBadge({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.badge, style]} pointerEvents="none">
      <T w="semibold" size={11} color={colors.inkSecondary}>
        Lần trước dùng
      </T>
    </View>
  );
}

function SocialBtn({ name, icon, onPress, soon = false, last = false, busy = false, disabled = false }: {
  name: string;
  icon: SocialProvider;
  onPress?: () => void;
  /** true = chưa dùng được: nút mờ, ghi "Sắp có" và không bấm được */
  soon?: boolean;
  /** cách đăng nhập thành công gần nhất trên máy này */
  last?: boolean;
  busy?: boolean;
  /** true khi đang chờ cách đăng nhập khác: không bấm được nhưng không mờ như "Sắp có" */
  disabled?: boolean;
}) {
  const color = SOCIAL_COLOR[icon];
  return (
    <View style={styles.socialWrap}>
      <Pressable
        onPress={onPress}
        disabled={soon || busy || disabled}
        accessibilityRole="button"
        accessibilityLabel={soon ? `${name}, sắp có` : `Đăng nhập bằng ${name}`}
        accessibilityState={{ busy, disabled: soon || disabled }}
        style={({ pressed }) => [styles.social, soon && styles.socialSoon, (pressed || busy) && { opacity: 0.75 }]}
      >
        <Row gap={10}>
          {busy ? (
            <ActivityIndicator size="small" color={color} />
          ) : icon === 'zalo' ? (
            <View style={[styles.zaloMark, { backgroundColor: color }]}>
              <T w="extrabold" size={11} color={colors.white}>Z</T>
            </View>
          ) : (
            <FontAwesome name={icon} size={18} color={color} />
          )}
          <T w="semibold" size={15} color={colors.inkSecondary}>
            Tiếp tục với {name}
          </T>
          {soon ? (
            <T size={11} color={colors.faint}>
              (Sắp có)
            </T>
          ) : null}
        </Row>
      </Pressable>
      {last && !soon ? <LastUsedBadge style={styles.socialBadge} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    marginTop: 28,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: 'hidden',
    ...shadow(1),
  },
  body: { paddingHorizontal: 22, paddingTop: 30, paddingBottom: 12 },
  logo: { alignItems: 'center', marginBottom: 18 },
  center: { textAlign: 'center' },
  socialWrap: { marginBottom: 12 },
  social: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  socialSoon: { opacity: 0.6, backgroundColor: colors.bg },
  socialBadge: { position: 'absolute', top: -10, right: 12 },
  emailBadge: { position: 'absolute', top: -2, right: 0, zIndex: 1 },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  zaloMark: { width: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  divider: { marginTop: 8, marginBottom: 18, alignItems: 'center' },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  link: { alignSelf: 'center', marginTop: 10, minHeight: 44, justifyContent: 'center' },
  footer: {
    paddingVertical: 18,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  devBtn: { marginTop: 14, width: '100%', maxWidth: 440, alignSelf: 'center' },
});
