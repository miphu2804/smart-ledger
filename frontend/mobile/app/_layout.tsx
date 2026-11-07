import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AnalyticsConsentPrompt } from '../src/components/AnalyticsConsentPrompt';
import { ToastProvider } from '../src/components/brand';
import { UpdatePrompt } from '../src/components/UpdatePrompt';
import { trackScreen } from '../src/lib/analytics';
import { screenNameFromSegments } from '../src/lib/analyticsEvents';
import { canOpenProtectedScreens, PROTECTED_SCREENS } from '../src/lib/authGate';
import { AppStoreProvider, useApp } from '../src/store/AppStore';
import { colors, WEB_FRAME_MAX_WIDTH } from '../src/theme';
import { SCREEN_ANIMATION } from '../src/motion';

function AppStack() {
  const app = useApp();
  // Ghi màn đang mở cho Google Analytics; SDK không tự ghi (`firebase.json`) vì nó chỉ thấy một Activity của React Native.
  // Ghi lại cả khi vừa bật đồng ý, để màn đang đứng không bị thiếu.
  const screen = screenNameFromSegments(useSegments());
  const analyticsOn = app.settings.analytics;
  useEffect(() => {
    if (analyticsOn) trackScreen(screen);
  }, [screen, analyticsOn]);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: SCREEN_ANIMATION,
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      {/* Chưa đăng nhập thì mở thẳng đường dẫn (vd /ai) hay hết phiên khi đang ở màn này đều về splash, rồi tới màn đăng nhập */}
      <Stack.Protected guard={canOpenProtectedScreens(app)}>
        {PROTECTED_SCREENS.map((name) => (
          <Stack.Screen key={name} name={name} />
        ))}
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const [loaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  if (!loaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand }}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      {/* Trên web: giới hạn khung như điện thoại để dễ test bằng trình duyệt */}
      <View style={Platform.OS === 'web' ? webFrame.outer : { flex: 1 }}>
        <View style={Platform.OS === 'web' ? webFrame.inner : { flex: 1 }}>
          <AppStoreProvider>
            <ToastProvider>
              <StatusBar style="dark" />
              <AppStack />
              <UpdatePrompt />
              <AnalyticsConsentPrompt />
            </ToastProvider>
          </AppStoreProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const webFrame = {
  outer: { flex: 1, backgroundColor: '#E8E4DC', alignItems: 'center' as const },
  inner: { flex: 1, width: '100%' as const, maxWidth: WEB_FRAME_MAX_WIDTH, backgroundColor: colors.bg, overflow: 'hidden' as const },
};
