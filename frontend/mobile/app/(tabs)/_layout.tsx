import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon, type TabIconName } from '../../src/components/icons';
import { T } from '../../src/components/ui';
import { ZenRing } from '../../src/components/ZenRing';
import { triggerFeedback } from '../../src/lib/feedback';
import { useReducedMotion } from '../../src/motion';
import { colors } from '../../src/theme';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: TabIconName }> = {
  index: { label: 'Tổng quan', icon: 'home' },
  invoices: { label: 'Đơn hàng', icon: 'receipt' },
  sales: { label: 'Bán hàng', icon: 'box' },
  more: { label: 'Quản lý', icon: 'grid' },
};

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const selectedTab = state.routes[state.index]?.name;
  const [barWidth, setBarWidth] = useState(0);
  const indicatorX = useRef(new Animated.Value(0)).current;
  const bubbleScaleX = useRef(new Animated.Value(1)).current;
  const bubbleScaleY = useRef(new Animated.Value(1)).current;
  const tabNames = Object.keys(TABS);
  const selectedIndex = Math.max(0, tabNames.indexOf(selectedTab));
  const prevIndexRef = useRef(selectedIndex);
  const tabWidth = barWidth > 8 ? (barWidth - 8) / tabNames.length : 0;

  const iconScales = useRef(tabNames.map(() => new Animated.Value(1))).current;

  const triggerIconBounce = (index: number) => {
    if (reducedMotion) return;
    const s = iconScales[index];
    if (!s) return;
    s.setValue(1);
    Animated.sequence([
      Animated.timing(s, {
        toValue: 1.09,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.spring(s, {
        toValue: 1,
        stiffness: 420,
        damping: 19,
        mass: 0.65,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePressIn = () => {
    if (reducedMotion) return;
    Animated.parallel([
      Animated.spring(bubbleScaleX, { toValue: 1.05, stiffness: 450, damping: 20, useNativeDriver: true }),
      Animated.spring(bubbleScaleY, { toValue: 0.95, stiffness: 450, damping: 20, useNativeDriver: true }),
    ]).start();
  };

  const handlePressOut = () => {
    if (reducedMotion) return;
    Animated.parallel([
      Animated.spring(bubbleScaleX, { toValue: 1, stiffness: 450, damping: 18, useNativeDriver: true }),
      Animated.spring(bubbleScaleY, { toValue: 1, stiffness: 450, damping: 18, useNativeDriver: true }),
    ]).start();
  };

  useEffect(() => {
    if (!tabWidth) return;
    const isChangingTab = prevIndexRef.current !== selectedIndex;
    prevIndexRef.current = selectedIndex;

    const targetX = selectedIndex * tabWidth;

    if (reducedMotion) {
      indicatorX.setValue(targetX);
      bubbleScaleX.setValue(1);
      bubbleScaleY.setValue(1);
      return;
    }

    Animated.spring(indicatorX, {
      toValue: targetX,
      stiffness: 340,
      damping: 28,
      mass: 0.75,
      useNativeDriver: true,
    }).start();

    if (isChangingTab) {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(bubbleScaleX, {
            toValue: 1.10,
            duration: 80,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(bubbleScaleX, {
            toValue: 1,
            stiffness: 440,
            damping: 18,
            mass: 0.6,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(bubbleScaleY, {
            toValue: 0.94,
            duration: 80,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.spring(bubbleScaleY, {
            toValue: 1,
            stiffness: 440,
            damping: 18,
            mass: 0.6,
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }

    triggerIconBounce(selectedIndex);
  }, [indicatorX, bubbleScaleX, bubbleScaleY, reducedMotion, selectedIndex, tabWidth]);

  return (
    <View
      pointerEvents="box-none"
      style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 10) }]}
    >
      <View onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)} style={styles.bar}>
        {tabWidth ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.indicator,
              {
                width: tabWidth,
                transform: [
                  { translateX: indicatorX },
                  { scaleX: bubbleScaleX },
                  { scaleY: bubbleScaleY },
                ],
              },
            ]}
          />
        ) : null}
        {Object.entries(TABS).map(([name, meta], idx) => {
          const route = state.routes.find((item) => item.name === name);
          if (!route) return null;
          const focused = selectedTab === name;
          const routeFocused = state.routes[state.index]?.key === route.key;
          const iconScale = iconScales[idx];

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              onPress={() => {
                triggerFeedback('selection');
                triggerIconBounce(idx);
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!routeFocused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tab}
            >
              <Animated.View style={{ transform: [{ scale: iconScale }] }}>
                <TabIcon
                  name={meta.icon}
                  variant={focused ? 'filled' : 'outline'}
                  size={23}
                  color={focused ? colors.brandInk : colors.muted}
                />
              </Animated.View>
              <T
                w={focused ? 'bold' : 'medium'}
                size={11.5}
                color={focused ? colors.brandInk : colors.muted}
                style={{ marginTop: 2.5 }}
              >
                {meta.label}
              </T>
            </Pressable>
          );
        })}
      </View>
      <StatusBar key={`sb-${selectedTab}`} style={selectedTab === 'index' ? 'light' : 'dark'} />
    </View>
  );
}

export default function TabsLayout() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Tabs screenOptions={{ headerShown: false, animation: 'fade' }} tabBar={(p) => <TabBar {...p} />}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="invoices" />
        <Tabs.Screen name="sales" />
        <Tabs.Screen name="more" />
      </Tabs>
      <ZenRing />
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    zIndex: 40,
  },
  bar: {
    height: 64,
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 32,
    paddingHorizontal: 4,
    position: 'relative',
    ...(Platform.select({
      web: {
        boxShadow: '0 8px 24px rgba(26, 25, 22, 0.08), 0 2px 6px rgba(26, 25, 22, 0.03)',
      } as ViewStyle,
      default: {
        shadowColor: '#1A1916',
        shadowOpacity: 0.08,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      },
    })),
  },
  indicator: {
    position: 'absolute',
    left: 4,
    top: 5,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  tab: { flex: 1, minHeight: 62, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
});
