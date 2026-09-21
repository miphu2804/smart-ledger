import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AIFab } from '../../src/components/brand';
import { IconName, T } from '../../src/components/ui';
import { colors, shadow } from '../../src/theme';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Trang chủ', icon: 'home' },
  invoices: { label: 'Hoá đơn', icon: 'file-text' },
  expenses: { label: 'Chi phí', icon: 'credit-card' },
  more: { label: 'Khác', icon: 'grid' },
};

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const routes = state.routes;
  const renderTab = (i: number) => {
    const route = routes[i];
    const meta = TABS[route.name];
    if (!meta) return null;
    const focused = state.index === i;
    return (
      <Pressable
        key={route.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        onPress={() => {
          const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
        }}
        style={styles.tab}
      >
        <Feather name={meta.icon} size={21} color={focused ? colors.primary : colors.faint} />
        <T w={focused ? 'bold' : 'medium'} size={10.5} color={focused ? colors.primary : colors.faint} style={{ marginTop: 3 }}>
          {meta.label}
        </T>
      </Pressable>
    );
  };
  return (
    <View>
      <AIFab bottom={insets.bottom + 84} />
      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        {renderTab(0)}
        {renderTab(1)}
        <View style={styles.tab}>
          <Pressable
            onPress={() => router.push('/voice')}
            accessibilityRole="button"
            accessibilityLabel="Bán hàng"
            style={({ pressed }) => [styles.center, shadow(3), pressed && { transform: [{ scale: 0.95 }] }]}
          >
            <Feather name="edit-3" size={22} color={colors.white} />
            <T w="bold" size={9} color={colors.white} style={{ marginTop: 1 }}>
              Bán hàng
            </T>
          </Pressable>
        </View>
        {renderTab(2)}
        {renderTab(3)}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="expenses" />
      <Tabs.Screen name="more" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center: {
    width: 62,
    height: 62,
    borderRadius: 31,
    marginTop: -30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: colors.white,
  },
});
