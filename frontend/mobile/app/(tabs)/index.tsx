import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, ImageSourcePropType, ImageStyle, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReportPeriodTabs, type ReportPeriod } from '../../src/components/ReportPeriodTabs';
import { AssistantIntroModal } from '../../src/components/AssistantIntroModal';
import { Button, Card, EmptyState, Row, T } from '../../src/components/ui';
import { BarcodeScannerModal } from '../../src/components/BarcodeScannerModal';
import { CountUp, Reveal, Skeleton } from '../../src/components/reveal';
import { vnd } from '../../src/lib/format';
import { buildNotifications, notifCategoryMeta } from '../../src/lib/notifications';
import { bestSellers, periodLabel, summary } from '../../src/lib/stats';
import { useCoreData } from '../../src/lib/useCoreData';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

const weekdayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const HEADER_COLLAPSED = 115;
const overviewHeaderPurple = '#482AAC';
type Tab1IconName =
  | 'logo'
  | 'revenue'
  | 'closedOrders'
  | 'shopDebt'
  | 'readOrder'
  | 'selectGoods'
  | 'scanCode'
  | 'assistant'
  | 'dataSuggestion'
  | 'lowStock'
  | 'collectDebt';

const tab1Icons: Record<Tab1IconName, ImageSourcePropType> = {
  logo: require('../../assets/tab1-overview/logo.png'),
  revenue: require('../../assets/tab1-overview/doanh-thu.png'),
  closedOrders: require('../../assets/tab1-overview/da-chot-trong-ky.png'),
  shopDebt: require('../../assets/tab1-overview/con-no-toan-tiem.png'),
  readOrder: require('../../assets/tab1-overview/doc-don.png'),
  selectGoods: require('../../assets/tab1-overview/chon-hang.png'),
  scanCode: require('../../assets/tab1-overview/quet-ma.png'),
  assistant: require('../../assets/tab1-overview/tro-li-ai.png'),
  dataSuggestion: require('../../assets/tab1-overview/goi-y-tu-du-lieu.png'),
  lowStock: require('../../assets/tab1-overview/kiem-tra-hang-sap-het.png'),
  collectDebt: require('../../assets/tab1-overview/thu-khoan-con-no.png'),
};

export default function Home() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const { height: viewportHeight } = useWindowDimensions();
  const headerExpanded = Math.min(500, Math.max(500, viewportHeight * 0.62));
  const headerScrollDistance = headerExpanded - HEADER_COLLAPSED;
  const scrollY = useRef(new Animated.Value(0)).current;
  const bellShake = useRef(new Animated.Value(0)).current;
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      const threshold = headerScrollDistance * 0.90;
      if (value >= threshold && !isCollapsed) {
        setIsCollapsed(true);
      } else if (value < threshold && isCollapsed) {
        setIsCollapsed(false);
      }
    });
    return () => scrollY.removeListener(id);
  }, [headerScrollDistance, isCollapsed, scrollY]);
  const now = new Date();

  const { invoices, products, debts, expenses, loading, error, reload } = useCoreData({
    invoices: true,
    products: true,
    debts: true,
    expenses: true,
  });

  // `loading` chỉ true ở lần tải đầu (xem useCoreData) nên các lần tải lại khi focus giữ số cũ, không nháy.
  const ready = !loading && !error;

  // Báo cáo của kỳ đang chọn, tính từ dữ liệu Core; `undefined` khi chưa tải xong (hiện skeleton, không hiện số 0 giả).
  const totals = useMemo(() => (ready ? summary(invoices, products, period) : undefined), [ready, invoices, products, period]);
  const previousDay = useMemo(
    () => (ready && period === 'today' ? summary(invoices, products, 'yesterday') : null),
    [ready, invoices, products, period],
  );
  const topSellers = useMemo(() => (ready ? bestSellers(invoices, period).slice(0, 4) : []), [ready, invoices, period]);
  const totalDebt = debts.reduce((total, debt) => total + Math.max(0, debt.total - debt.paid), 0);
  const debtorCount = debts.filter((debt) => debt.total > debt.paid).length;
  const lowStock = products.filter((product) => product.tracked && product.stock <= 6).sort((a, b) => a.stock - b.stock);
  const priorityCount = Number(totalDebt > 0) + Number(lowStock.length > 0);
  const revenueChange = totals && previousDay?.revenue ? (totals.revenue - previousDay.revenue) / previousDay.revenue : null;
  const notifications = useMemo(
    () => (ready ? buildNotifications({ invoices, products, expenses, debts }) : []),
    [ready, invoices, products, expenses, debts],
  );
  const readNotifications = useMemo(() => new Set(app.readNotifs), [app.readNotifs]);
  const unreadNotifications = notifications.filter((notification) => !readNotifications.has(notification.id)).length;
  const periodName = periodLabel[period];
  const topSeller = topSellers[0];
  const openAssistant = (path: '/voice' | '/ai') => {
    app.dismissGuide();
    router.push(path);
  };

  const playBellShake = useCallback(() => {
    if (!unreadNotifications) return;
    bellShake.setValue(0);
    Animated.sequence([
      Animated.timing(bellShake, { toValue: 1, duration: 90, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: -1, duration: 90, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: 0.85, duration: 80, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: -0.65, duration: 80, useNativeDriver: true }),
      Animated.timing(bellShake, { toValue: 0, duration: 110, useNativeDriver: true }),
    ]).start();
  }, [bellShake, unreadNotifications]);

  useEffect(() => {
    playBellShake();
  }, [playBellShake]);

  useFocusEffect(
    useCallback(() => {
      playBellShake();
    }, [playBellShake]),
  );

  const startTransition = headerScrollDistance * 0.80;
  const endTransition = headerScrollDistance * 1.02;

  const headerHeight = scrollY.interpolate({
    inputRange: [0, headerScrollDistance],
    outputRange: [headerExpanded, HEADER_COLLAPSED],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, startTransition, endTransition],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const expandedTranslate = scrollY.interpolate({
    inputRange: [0, headerScrollDistance],
    outputRange: [0, -headerScrollDistance * 0.75],
    extrapolate: 'clamp',
  });
  const compactOpacity = scrollY.interpolate({
    inputRange: [0, startTransition, endTransition],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const compactTranslate = scrollY.interpolate({
    inputRange: [0, startTransition, endTransition],
    outputRange: [8, 8, 0],
    extrapolate: 'clamp',
  });
  const dividerOpacity = scrollY.interpolate({
    inputRange: [0, startTransition, endTransition],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });
  const bellRotate = bellShake.interpolate({
    inputRange: [-1, 0, 1],
    outputRange: ['-14deg', '0deg', '14deg'],
  });

  return (
    <>
      <View style={styles.screen}>
        <View
          pointerEvents="none"
          style={[styles.topBlackUnderlay, { height: 800 + insets.top + 24 }]}
        />
        <Animated.ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerExpanded + insets.top }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
        >
          <View style={styles.contentSheet}>
            <View style={styles.periodTabs}>
              <ReportPeriodTabs value={period} onChange={setPeriod} />
            </View>
            {error ? (
              <View style={{ marginTop: 14, marginBottom: 88 }}>
                <EmptyState icon="alert-triangle" title="Không tải được số liệu tổng quan" hint={error} />
                <Button title="Thử lại" variant="outline" onPress={reload} />
              </View>
            ) : (
            <>
            <HomeSectionHeading
              title="Ưu tiên hôm nay"
              side={!ready ? undefined : priorityCount ? `${priorityCount} việc cần xem` : 'Đã xong'}
            />
            {!ready ? (
              <Card style={{ paddingVertical: 15, gap: 8 }}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="80%" height={12} />
              </Card>
            ) : priorityCount ? (
              <Card style={{ paddingVertical: 4 }}>
                {totalDebt > 0 ? (
                  <PriorityRow
                    icon="collectDebt"
                    tone="warning"
                    title="Thu khoản còn nợ"
                    subtitle={`${debtorCount} khách · ${vnd(totalDebt)} chưa thu`}
                    onPress={() => router.push('/debts')}
                    last={lowStock.length === 0}
                  />
                ) : null}
                {lowStock.length > 0 ? (
                  <PriorityRow
                    icon="lowStock"
                    tone="danger"
                    title="Kiểm tra hàng sắp hết"
                    subtitle={lowStock.slice(0, 2).map((product) => `${product.name} còn ${product.stock}`).join(' · ')}
                    onPress={() => router.push('/products')}
                    last
                  />
                ) : null}
              </Card>
            ) : (
              <Card style={{ paddingVertical: 15 }}>
                <T size={14} color={colors.muted}>
                  Chưa có việc cần xử lý ngay
                </T>
              </Card>
            )}

            <View style={styles.suggestion}>
              <Row style={{ alignItems: 'flex-start' }} gap={10}>
                <View style={styles.suggestionIcon}>
                  <Tab1Icon name="dataSuggestion" size={24} />
                </View>
                <View style={{ flex: 1 }}>
                  <T w="bold" size={14} style={{ marginBottom: 4 }}>Gợi ý từ dữ liệu đã chốt</T>
                  {totals ? (
                    <Reveal>
                      <T size={13} color={colors.muted} style={{ lineHeight: 20 }}>
                        {topSeller
                          ? `${topSeller.name} bán nhiều nhất trong kỳ, đã bán ${topSeller.qty}. Xem số liệu trước khi chuẩn bị thêm.`
                          : 'Chưa đủ dữ liệu đơn đã chốt trong kỳ để đưa ra gợi ý.'}
                      </T>
                      <T size={12} color={colors.faint} style={{ marginTop: 5 }}>
                        Nguồn: {totals.count} đơn đã chốt · {periodName}
                      </T>
                    </Reveal>
                  ) : (
                    <View style={{ gap: 8, paddingTop: 4 }}>
                      <Skeleton width="100%" height={12} />
                      <Skeleton width="72%" height={12} />
                      <Skeleton width="45%" height={10} style={{ marginTop: 3 }} />
                    </View>
                  )}
                </View>
              </Row>
            </View>

            <HomeSectionHeading
              title={`Bán chạy ${periodName.toLowerCase()}`}
              side="Xem tất cả ›"
              onPress={() => router.push({ pathname: '/bestsellers', params: { period } })}
            />
            <Card style={{ paddingVertical: 4 }}>
              {!ready ? (
                [0, 1, 2].map((row) => (
                  <Row key={row} style={[styles.sellerRow, row < 2 && styles.rowBorder]}>
                    <Skeleton width="60%" height={14} />
                  </Row>
                ))
              ) : topSellers.length ? (
                topSellers.map((seller, index) => (
                  <Row
                    key={seller.productId ?? seller.name}
                    style={[styles.sellerRow, index < topSellers.length - 1 && styles.rowBorder]}
                  >
                    <T w="bold" size={12} color={colors.muted} style={{ width: 22 }}>
                      {index + 1}
                    </T>
                    <T w="semibold" size={14} style={{ flex: 1 }} numberOfLines={1}>
                      {seller.name}
                    </T>
                    <T w="bold" size={14} color={colors.primary}>
                      {seller.qty} phần
                    </T>
                  </Row>
                ))
              ) : (
                <T size={13} color={colors.muted} style={{ paddingVertical: 13, textAlign: 'center' }}>
                  Chưa có đơn trong kỳ
                </T>
              )}
            </Card>

            <HomeSectionHeading title="Thông báo" side="Xem tất cả ›" onPress={() => router.push('/notifications')} />
            <Card style={{ paddingVertical: 4, marginBottom: 88 }}>
              {notifications.slice(0, 3).map((notification, index) => {
                const meta = notifCategoryMeta[notification.category];
                const unread = !readNotifications.has(notification.id);
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => {
                      app.markNotifsRead([notification.id]);
                      if (notification.href) router.push(notification.href);
                    }}
                    style={({ pressed }) => [styles.notificationRow, index < Math.min(3, notifications.length) - 1 && styles.rowBorder, pressed && styles.pressed]}
                  >
                    <View style={[styles.notificationIcon, { backgroundColor: notification.urgent ? colors.redSoft : meta.bg }]}>
                      <Feather name={notification.icon ?? meta.icon} size={17} color={notification.urgent ? colors.red : meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w={unread ? 'bold' : 'semibold'} size={13.5} numberOfLines={1}>{notification.title}</T>
                      <T size={12} color={colors.muted} numberOfLines={1} style={{ marginTop: 2 }}>{notification.body}</T>
                    </View>
                    {unread ? <View style={styles.notificationDot} /> : null}
                  </Pressable>
                );
              })}
            </Card>
            </>
            )}
          </View>
        </Animated.ScrollView>

        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.collapsingHeader,
            { height: Animated.add(headerHeight, insets.top) },
          ]}
        >
          <Animated.View
            pointerEvents={isCollapsed ? 'none' : 'auto'}
            style={[
              styles.expandedHeader,
              {
                top: insets.top + 10,
                opacity: expandedOpacity,
                transform: [{ translateY: expandedTranslate }],
              },
            ]}
          >
            <Row style={styles.brandRow}>
              <Tab1Icon name="logo" size={42} style={styles.logoIcon} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={17} color={colors.white} numberOfLines={1}>{app.store.name}</T>
                <T size={12} color="#B8B5AE">Sổ bán hàng của bạn</T>
              </View>
              <Pressable
                onPress={() => router.push('/notifications')}
                accessibilityRole="button"
                accessibilityLabel="Thông báo"
                style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
              >
                <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
                  <Feather name="bell" size={24} color={colors.white} />
                </Animated.View>
                {unreadNotifications > 0 ? <View style={styles.headerIconDot} /> : null}
              </Pressable>
            </Row>
            <Row style={styles.overviewMeta}>
              <T w="extrabold" size={21} color={colors.white}>Tổng quan</T>
              <T w="bold" size={10.5} color="#B8B5AE">
                {`${weekdayNames[now.getDay()]}, ${now.getDate()} tháng ${now.getMonth() + 1}`.toLocaleUpperCase('vi-VN')}
              </T>
            </Row>
            <Card
              style={styles.expandedRevenueCard}
              onPress={() => router.push({ pathname: '/analytics', params: { period } })}
              accessibilityLabel={`Xem phân tích doanh thu ${periodName}`}
            >
              <Row style={styles.revenueHeader} gap={8}>
                <Row gap={7} style={{ flex: 1 }}>
                  <Tab1Icon name="revenue" size={24} />
                  <T w="bold" size={12} color={colors.muted} numberOfLines={1}>DOANH THU {periodName.toUpperCase()}</T>
                </Row>
                {revenueChange !== null ? (
                  <T w="bold" size={11.5} color={revenueChange >= 0 ? colors.green : colors.red}>
                    {revenueChange >= 0 ? '+' : ''}{Math.round(revenueChange * 100)}% so với hôm qua
                  </T>
                ) : null}
              </Row>
              {!totals ? (
                <Skeleton width={190} height={34} radius={10} style={{ marginTop: 8 }} />
              ) : totals.count ? (
                <CountUp value={totals.revenue} format={vnd} w="extrabold" size={34} numberOfLines={1} adjustsFontSizeToFit style={styles.expandedRevenueValue} />
              ) : (
                <T w="extrabold" size={18} style={{ marginTop: 10 }}>Chưa có đơn trong kỳ</T>
              )}
              <Row style={styles.financeRow} gap={14}>
                <View style={styles.financeItem}>
                  <Tab1Icon name="closedOrders" size={25} style={styles.financeIcon} />
                  <T w="bold" size={16}>{totals ? `${totals.count} đơn` : '—'}</T>
                  <T size={11.5} color={colors.muted}>Đã chốt trong kỳ</T>
                </View>
                <View style={styles.financeDivider} />
                <View style={styles.financeItem}>
                  <Tab1Icon name="shopDebt" size={25} style={styles.financeIcon} />
                  <T w="bold" size={16}>{ready ? vnd(totalDebt) : '—'}</T>
                  <T size={11.5} color={colors.muted}>Còn nợ toàn tiệm</T>
                </View>
              </Row>
            </Card>
            <View style={styles.expandedSalesSection}>
              <Row style={styles.expandedSalesHeading}>
                <T w="bold" size={15.5} color={colors.white}>
                  Đơn hàng mới
                </T>
              </Row>
              <View style={styles.expandedActionGrid}>
                <Pressable
                  onPress={() => openAssistant('/voice')}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Đọc đơn"
                >
                  <Tab1Icon name="readOrder" size={30} />
                  <View style={styles.actionTextCol}>
                    <T w="bold" size={14.5} color="#FFFFFF" numberOfLines={1}>
                      Đọc đơn
                    </T>
                    <T size={10.5} color="rgba(255, 255, 255, 0.58)" numberOfLines={1} style={{ marginTop: 2 }}>
                      Giọng nói
                    </T>
                  </View>
                  <Feather name="chevron-right" size={14} color="rgba(255, 255, 255, 0.35)" />
                </Pressable>

                <Pressable
                  onPress={() => router.push('/pos')}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Chọn hàng"
                >
                  <Tab1Icon name="selectGoods" size={30} />
                  <View style={styles.actionTextCol}>
                    <T w="bold" size={14.5} color="#FFFFFF" numberOfLines={1}>
                      Chọn hàng
                    </T>
                    <T size={10.5} color="rgba(255, 255, 255, 0.58)" numberOfLines={1} style={{ marginTop: 2 }}>
                      Thủ công
                    </T>
                  </View>
                  <Feather name="chevron-right" size={14} color="rgba(255, 255, 255, 0.35)" />
                </Pressable>

                <Pressable
                  onPress={() => setScannerOpen(true)}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Quét mã"
                >
                  <Tab1Icon name="scanCode" size={30} />
                  <View style={styles.actionTextCol}>
                    <T w="bold" size={14.5} color="#FFFFFF" numberOfLines={1}>
                      Quét mã
                    </T>
                    <T size={10.5} color="rgba(255, 255, 255, 0.58)" numberOfLines={1} style={{ marginTop: 2 }}>
                      Mã vạch / QR
                    </T>
                  </View>
                  <Feather name="chevron-right" size={14} color="rgba(255, 255, 255, 0.35)" />
                </Pressable>

                <Pressable
                  onPress={() => openAssistant('/ai')}
                  style={({ pressed }) => [styles.actionButton, pressed && styles.actionButtonPressed]}
                  accessibilityRole="button"
                  accessibilityLabel="Trợ lý AI"
                >
                  <Tab1Icon name="assistant" size={30} />
                  <View style={styles.actionTextCol}>
                    <T w="bold" size={14.5} color="#FFFFFF" numberOfLines={1}>
                      Trợ lý AI
                    </T>
                    <T size={10.5} color="rgba(255, 255, 255, 0.58)" numberOfLines={1} style={{ marginTop: 2 }}>
                      Gợi ý bán
                    </T>
                  </View>
                  <Feather name="chevron-right" size={14} color="rgba(255, 255, 255, 0.35)" />
                </Pressable>
              </View>
            </View>
          </Animated.View>

          <Animated.View
            pointerEvents={isCollapsed ? 'auto' : 'none'}
            style={[
              styles.compactHeader,
              {
                top: insets.top + 6,
                opacity: compactOpacity,
                transform: [{ translateY: compactTranslate }],
              },
            ]}
          >
            {/* Tier 1: Context on left + Prominent Revenue on right */}
            <View style={styles.compactTier1}>
              <View style={styles.compactContext}>
                <T w="bold" size={16} color={colors.white} numberOfLines={1}>
                  Tổng quan
                </T>
                <T size={11} color="#A8A59E" numberOfLines={1} style={{ marginTop: 2 }}>
                  {periodName} · {totals ? `${totals.count} đơn` : 'Đang tải'}
                </T>
              </View>

              <Pressable
                onPress={() => router.push({ pathname: '/analytics', params: { period } })}
                accessibilityRole="button"
                accessibilityLabel={`Xem phân tích doanh thu ${periodName}`}
                style={({ pressed }) => [styles.compactRevenueBox, pressed && styles.pressed]}
              >
                <View style={styles.compactRevenueMeta}>
                  <T w="bold" size={10} color="#A8A59E">
                    DOANH THU
                  </T>
                  {revenueChange !== null ? (
                    <T w="bold" size={10} color={revenueChange >= 0 ? colors.accent : '#F2A39A'}>
                      {revenueChange >= 0 ? '+' : ''}{Math.round(revenueChange * 100)}%
                    </T>
                  ) : null}
                </View>
                {!totals ? (
                  <Skeleton width={110} height={20} radius={6} style={{ marginTop: 2 }} />
                ) : totals.count ? (
                  <CountUp
                    value={totals.revenue}
                    format={vnd}
                    w="extrabold"
                    size={20}
                    color={colors.white}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.compactRevenueValue}
                  />
                ) : (
                  <T w="bold" size={15} color={colors.white} numberOfLines={1} style={{ marginTop: 2 }}>
                    0 đ
                  </T>
                )}
              </Pressable>
            </View>

            {/* Tier 2: 4 quick actions */}
            <View style={styles.compactTier2}>
              <Pressable
                onPress={() => openAssistant('/voice')}
                style={({ pressed }) => [styles.compactActionBtn, pressed && styles.compactActionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Đọc đơn"
              >
                <Tab1Icon name="readOrder" size={20} />
                <T w="semibold" size={11} color="#FFFFFF" numberOfLines={1}>
                  Đọc đơn
                </T>
              </Pressable>

              <Pressable
                onPress={() => setScannerOpen(true)}
                style={({ pressed }) => [styles.compactActionBtn, pressed && styles.compactActionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Quét mã"
              >
                <Tab1Icon name="scanCode" size={20} />
                <T w="semibold" size={11} color="#FFFFFF" numberOfLines={1}>
                  Quét mã
                </T>
              </Pressable>

              <Pressable
                onPress={() => router.push('/pos')}
                style={({ pressed }) => [styles.compactActionBtn, pressed && styles.compactActionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Chọn hàng"
              >
                <Tab1Icon name="selectGoods" size={20} />
                <T w="semibold" size={11} color="#FFFFFF" numberOfLines={1}>
                  Chọn hàng
                </T>
              </Pressable>

              <Pressable
                onPress={() => openAssistant('/ai')}
                style={({ pressed }) => [styles.compactActionBtn, pressed && styles.compactActionBtnPressed]}
                accessibilityRole="button"
                accessibilityLabel="Trợ lý"
              >
                <Tab1Icon name="assistant" size={20} />
                <T w="semibold" size={11} color="#FFFFFF" numberOfLines={1}>
                  Trợ lý
                </T>
              </Pressable>
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.headerDivider, { opacity: dividerOpacity }]} />
        </Animated.View>
      </View>
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onProductScanned={(product) => {
          setScannerOpen(false);
          router.push({ pathname: '/pos', params: { autoAdd: product.id } });
        }}
        onCheckout={() => {
          setScannerOpen(false);
          router.push('/checkout');
        }}
      />
      <AssistantIntroModal
        visible={!app.guideDismissed}
        onDismiss={app.dismissGuide}
        onVoice={() => openAssistant('/voice')}
        onChat={() => openAssistant('/ai')}
      />
    </>
  );
}

function HomeSectionHeading({ title, side, onPress }: { title: string; side?: string; onPress?: () => void }) {
  return (
    <Row style={styles.sectionHeading} gap={8}>
      <T w="bold" size={19} style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </T>
      {side && onPress ? (
        <Pressable onPress={onPress} accessibilityRole="button" style={styles.sectionAction}>
          <T w="semibold" size={12} color={colors.primary}>{side}</T>
        </Pressable>
      ) : side ? (
        <T w="semibold" size={12} color={colors.muted}>{side}</T>
      ) : null}
    </Row>
  );
}

function Tab1Icon({
  name,
  size,
  style,
}: {
  name: Tab1IconName;
  size: number;
  style?: ImageStyle;
}) {
  return (
    <Image
      source={tab1Icons[name]}
      resizeMode="contain"
      style={[{ width: size, height: size }, style]}
      accessibilityIgnoresInvertColors
    />
  );
}

const priorityTone = {
  danger: { bg: colors.redSoft, fg: colors.red },
  warning: { bg: colors.goldSoft, fg: colors.gold },
};

function PriorityRow({
  icon,
  tone,
  title,
  subtitle,
  onPress,
  last,
}: {
  icon: Extract<Tab1IconName, 'collectDebt' | 'lowStock'>;
  tone: keyof typeof priorityTone;
  title: string;
  subtitle: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.priorityRow, !last && styles.rowBorder]}
    >
      <View style={[styles.priorityIcon, { backgroundColor: priorityTone[tone].bg }]}>
        <Tab1Icon name={icon} size={29} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={14}>
          {title}
        </T>
        <T size={12} color={colors.muted} numberOfLines={1} style={{ marginTop: 2 }}>
          {subtitle}
        </T>
      </View>
      <Feather name="chevron-right" size={17} color={colors.disabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  topBlackUnderlay: {
    position: 'absolute',
    top: -800,
    left: 0,
    right: 0,
    backgroundColor: overviewHeaderPurple,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 28 },
  contentSheet: {
    minHeight: 650,
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 110,
  },
  periodTabs: { marginTop: 16 },
  collapsingHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    backgroundColor: overviewHeaderPurple,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
  },
  expandedHeader: { position: 'absolute', left: 16, right: 16 },
  brandRow: { minHeight: 46, gap: 10 },
  logoIcon: { borderRadius: 13 },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(31, 18, 80, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIconDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: colors.red,
  },
  overviewMeta: { minHeight: 30, justifyContent: 'space-between', alignItems: 'center' },
  headerDivider: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  expandedRevenueCard: { marginTop: 12, paddingVertical: 14 },
  revenueHeader: { minHeight: 22, justifyContent: 'space-between' },
  expandedRevenueValue: { marginTop: 4, lineHeight: 42 },
  financeRow: { marginTop: 10, paddingTop: 9, borderTopWidth: 1, borderTopColor: colors.border, alignItems: 'stretch' },
  financeItem: { flex: 1, minHeight: 42, justifyContent: 'center' },
  financeIcon: { marginBottom: 3 },
  financeDivider: { width: 1, backgroundColor: colors.border },
  expandedSalesSection: { marginTop: 14 },
  expandedSalesHeading: { marginBottom: 10, alignItems: 'center' },
  expandedActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  actionButton: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 140,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderColor: 'rgba(255, 255, 255, 0.22)',
    transform: [{ scale: 0.985 }],
  },
  actionTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  compactHeader: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  compactTier1: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 38,
    paddingHorizontal: 2,
  },
  compactContext: {
    flex: 1,
    minWidth: 0,
    paddingRight: 10,
    justifyContent: 'center',
  },
  compactRevenueBox: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    maxWidth: '55%',
  },
  compactRevenueMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  compactRevenueValue: {
    marginTop: 1,
    lineHeight: 22,
    textAlign: 'right',
  },
  compactTier2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  compactActionBtn: {
    flex: 1,
    height: 42,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 4,
  },
  compactActionBtnPressed: {
    opacity: 0.72,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  sectionHeading: { marginTop: 24, marginBottom: 10, minHeight: 40, alignItems: 'center' },
  sectionAction: { minHeight: 44, justifyContent: 'center' },
  priorityRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  priorityIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  suggestionIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sellerRow: { minHeight: 52, paddingVertical: 8 },
  notificationRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 9 },
  notificationIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  notificationDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
  pressed: { opacity: 0.78 },
  suggestion: {
    marginTop: 22,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
});
