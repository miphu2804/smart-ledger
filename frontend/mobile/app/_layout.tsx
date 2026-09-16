import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ToastProvider } from '../src/components/brand';
import { AppStoreProvider } from '../src/store/AppStore';
import { colors } from '../src/theme';

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
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary }}>
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
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: colors.bg },
                  animation: 'slide_from_right',
                }}
              >
                <Stack.Screen name="index" options={{ animation: 'fade' }} />
                <Stack.Screen name="(auth)" options={{ animation: 'fade' }} />
                <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
                <Stack.Screen name="voice" options={{ animation: 'slide_from_bottom' }} />
                <Stack.Screen name="ai" options={{ animation: 'slide_from_bottom' }} />
              </Stack>
            </ToastProvider>
          </AppStoreProvider>
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const webFrame = {
  outer: { flex: 1, backgroundColor: '#DCE4F5', alignItems: 'center' as const },
  inner: { flex: 1, width: '100%' as const, maxWidth: 440, backgroundColor: colors.bg, overflow: 'hidden' as const },
};
