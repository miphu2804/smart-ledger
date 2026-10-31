import { Redirect, usePathname, useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { Image, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { GuideTourProvider, useGuideTarget } from '../../src/components/GuideTour';
import { TabIcon, type TabIconName } from '../../src/components/icons';
import { QuickNavProvider } from '../../src/components/QuickNav';
import { T } from '../../src/components/ui';
import { triggerFeedback } from '../../src/lib/feedback';
import { useApp } from '../../src/store/AppStore';
import { colors, shadow } from '../../src/theme';
import { SCREEN_ANIMATION } from '../../src/motion';

type TabBarProps = Parameters<NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>>[0];

/**
 * Chuyển tab không có hiệu ứng, trên mọi nền tảng. Hiệu ứng mờ dần từng làm Safari iPhone đứng hình (#224) và trên Android đôi khi
 * kẹt ở độ đậm 0: bấm sang tab khác chỉ thấy màn trắng với Bobi và thanh tab. Phần dữ liệu đang tải hiện skeleton của từng màn;
 * nền của vùng màn hình cùng màu nền app để nếu có chớp cũng không trắng tinh.
 */
const TAB_ANIMATION = SCREEN_ANIMATION;
const BAR_HEIGHT = 100;
const SHAPE_OFFSET = 28;
const CURVE_HEIGHT = 28;
const CURVE_PEAK = 14;
const SHAPE_HEIGHT = BAR_HEIGHT + SHAPE_OFFSET;

const TABS = [
  { name: 'index', label: 'Tổng quan', icon: 'home' as TabIconName },
  { name: 'invoices', label: 'Đơn hàng', icon: 'receipt' as TabIconName },
  { name: 'sales', label: 'Tạo đơn', icon: 'plus' as TabIconName },
  { name: 'expenses', label: 'Trợ lý Bobi', icon: 'chat' as TabIconName },
  { name: 'more', label: 'Quản lý', icon: 'grid' as TabIconName },
];

function TabBar({ state, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const selectedTab = state.routes[state.index]?.name;
  const pathname = usePathname();
  const router = useRouter();
  const [barWidth, setBarWidth] = useState(0);
  const tabWidth = barWidth / TABS.length;
  // Hướng dẫn khoanh sáng tab Đơn hàng và Quản lý
  const invoicesGuideRef = useGuideTarget('tabInvoices');
  const moreGuideRef = useGuideTarget('tabMore');
  const salesGuideRef = useGuideTarget('tabSales');
  const bobiGuideRef = useGuideTarget('tabBobi');

  return (
    <View
      pointerEvents="box-none"
      style={[styles.shell, { bottom: -insets.bottom, height: BAR_HEIGHT + insets.bottom }]}
    >
      <View pointerEvents="none" style={styles.safeAreaFill} />
      <View
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={styles.bar}
      >
        {barWidth > 0 ? (
          <Svg
            pointerEvents="none"
            style={styles.barShape}
            width={barWidth}
            height={SHAPE_HEIGHT}
            viewBox={`0 0 ${barWidth} ${SHAPE_HEIGHT}`}
          >
            <Path
              d={[
                `M 0 ${CURVE_HEIGHT}`,
                `L ${barWidth / 2 - 64} ${CURVE_HEIGHT}`,
                `C ${barWidth / 2 - 42} ${CURVE_HEIGHT} ${barWidth / 2 - 30} ${CURVE_PEAK} ${barWidth / 2} ${CURVE_PEAK}`,
                `C ${barWidth / 2 + 30} ${CURVE_PEAK} ${barWidth / 2 + 42} ${CURVE_HEIGHT} ${barWidth / 2 + 64} ${CURVE_HEIGHT}`,
                `L ${barWidth} ${CURVE_HEIGHT}`,
                `L ${barWidth} ${SHAPE_HEIGHT} L 0 ${SHAPE_HEIGHT} Z`,
              ].join(' ')}
              fill={colors.card}
              stroke="none"
            />
          </Svg>
        ) : null}
        {TABS.map((meta, index) => {
          const { name } = meta;
          const route = state.routes.find((item) => item.name === name);
          const focused = selectedTab === name || (name === 'expenses' && pathname.startsWith('/ai'));
          const routeFocused = route && state.routes[state.index]?.key === route.key;

          return (
            <Pressable
              key={route?.key ?? name}
              ref={name === 'invoices' ? invoicesGuideRef : name === 'more' ? moreGuideRef : name === 'sales' ? salesGuideRef : name === 'expenses' ? bobiGuideRef : undefined}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              onPress={() => {
                triggerFeedback('selection');
                if (!route) {
                  router.replace('/ai');
                  return;
                }
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!routeFocused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={[
                styles.tab,
                name === 'sales' ? styles.centerTab : styles.regularTab,
                { left: index * tabWidth, width: tabWidth },
              ]}
            >
              {focused && name !== 'sales' && name !== 'expenses' ? (
                <View pointerEvents="none" style={styles.selectedSurface} />
              ) : null}
              {name === 'sales' ? (
                <View style={styles.fabStack}>
                  <View style={styles.fab}>
                    <Image
                      source={require('../../assets/create-order-tab-v2.png')}
                      resizeMode="contain"
                      accessibilityIgnoresInvertColors
                      style={styles.createOrderLogo}
                    />
                  </View>
                </View>
              ) : name === 'expenses' ? (
                <View style={styles.iconSlot}><Image source={require('../../assets/bobi-tab-v2.png')} resizeMode="contain" style={{ width: 40, height: 34 }} /></View>
              ) : (
                <View style={styles.iconSlot}>
                <TabIcon
                  name={meta.icon}
                  variant={focused ? 'filled' : 'outline'}
                  size={24}
                  color={focused ? colors.brand : colors.faint}
                />
                </View>
              )}
              <T
                w={focused ? 'bold' : 'medium'}
                size={10.5}
                color={focused ? colors.brand : colors.muted}
                style={{ marginTop: 6 }}
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
  const { authReady, loggedIn, onboarded, guideDismissed, dismissGuide, user, shopId } = useApp();
  const pathname = usePathname();
  // Các tab chỉ mở khi đã có tài khoản và tiệm. Trước khi có phiên, state còn là tiệm mẫu ("Tiệm tạp hoá cô Thỏ"): bấm back ở
  // bước tạo tiệm hay đăng xuất từ một màn mở chồng lên tab từng để lộ tiệm mẫu này như một tài khoản thật.
  if (!authReady) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  if (!loggedIn) return <Redirect href="/(auth)/welcome" />;
  if (!onboarded) return <Redirect href="/(auth)/setup" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Hướng dẫn dạng lớp phủ chạy trên Tổng quan, phủ lên cả menu chuyển nhanh, thanh tab và mascot */}
      <GuideTourProvider active={!guideDismissed && pathname === '/'} onFinish={dismissGuide} userName={user.name}>
      {/* Menu chuyển nhanh bên trái phủ lên cả thanh tab và mascot */}
      <QuickNavProvider>
        {/* Đổi tiệm thì dựng lại các tab: không còn số liệu, giỏ hay ô tìm kiếm của tiệm cũ */}
        <Tabs
          key={shopId ?? 'no-shop'}
          screenOptions={{ headerShown: false, animation: TAB_ANIMATION, sceneStyle: { backgroundColor: colors.bg } }}
          tabBar={(p) => <TabBar {...p} />}
        >
          <Tabs.Screen name="index" />
          <Tabs.Screen name="invoices" />
          <Tabs.Screen name="sales" />
          <Tabs.Screen name="more" />
        </Tabs>
      </QuickNavProvider>
      </GuideTourProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 40,
  },
  safeAreaFill: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: BAR_HEIGHT,
    backgroundColor: colors.card,
  },
  bar: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    paddingHorizontal: 0,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'visible',
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
  barShape: { position: 'absolute', top: -SHAPE_OFFSET, left: 0, zIndex: 0 },
  tab: { minHeight: BAR_HEIGHT, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  regularTab: { position: 'absolute' },
  centerTab: { position: 'absolute', overflow: 'visible' },
  iconSlot: { height: 34, justifyContent: 'center', alignItems: 'center' },
  selectedSurface: {
    position: 'absolute',
    left: 5,
    right: 5,
    height: 68,
    borderRadius: 23,
    backgroundColor: colors.brandTint,
  },
  fabStack: {
    width: 68,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -12,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    ...shadow(3),
  },
  createOrderLogo: {
    width: 40,
    height: 40,
    borderRadius: 10,
  },
});
