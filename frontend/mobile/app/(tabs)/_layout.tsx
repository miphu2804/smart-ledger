import { Feather } from '@expo/vector-icons';
import { Tabs } from 'expo-router/js-tabs';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconName, T } from '../../src/components/ui';
import { colors } from '../../src/theme';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName }> = {
  index: { label: 'Tổng quan', icon: 'home' },
  invoices: { label: 'Đơn hàng', icon: 'file-text' },
  sales: { label: 'Bán hàng', icon: 'shopping-cart' },
  more: { label: 'Khác', icon: 'grid' },
};

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const selectedName = state.routes[state.index]?.name;
  const selectedTab = selectedName === 'expenses' ? 'more' : selectedName;

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {Object.entries(TABS).map(([name, meta]) => {
        const route = state.routes.find((item) => item.name === name);
        if (!route) return null;
        const focused = selectedTab === name;
        const routeFocused = state.routes[state.index]?.key === route.key;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            onPress={() => {
              const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
              if (!routeFocused && !e.defaultPrevented) navigation.navigate(route.name);
            }}
            style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
          >
            <Feather name={meta.icon} size={20} color={focused ? colors.accentInk : colors.muted} />
            <T w={focused ? 'bold' : 'medium'} size={12} color={focused ? colors.accentInk : colors.muted} style={{ marginTop: 3 }}>
              {meta.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(p) => <TabBar {...p} />}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="invoices" />
      <Tabs.Screen name="sales" />
      <Tabs.Screen name="more" />
      <Tabs.Screen name="expenses" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 6,
  },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
});
