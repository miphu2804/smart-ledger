import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Image, ImageSourcePropType, ImageStyle, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReportPeriodTabs, type ReportPeriod } from '../../src/components/ReportPeriodTabs';
import { useGuideTarget } from '../../src/components/GuideTour';
import { QuickNavButton } from '../../src/components/QuickNav';
import { Button, Card, EmptyState, Row, T } from '../../src/components/ui';
import { CountUp, Reveal, Skeleton } from '../../src/components/reveal';
import { vnd } from '../../src/lib/format';
import { formatQuantity, periodRevenue, restockRows, revenueChange as changeVsYesterday, topSellerRows } from '../../src/lib/homeOverview';
import { fromCoreNotification, isNotifUnread, mergeNotifications, notifCategoryMeta, totalUnread } from '../../src/lib/notifications';
import { reportPeriodOf } from '../../src/lib/saleFilter';
import { periodLabel } from '../../src/lib/stats';
import { useCoreNotifications } from '../../src/lib/useCoreNotifications';
import { useHomeOverview } from '../../src/lib/useHomeOverview';
import { useLocalNotifications } from '../../src/lib/useLocalNotifications';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

const weekdayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
// Thanh gọn: dòng tiêu đề và doanh thu (38) + 8 + một hàng nút (34) + khoảng đệm dưới
const HEADER_COLLAPSED = 99;
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
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Trạng thái thu gọn chọn lớp header nhận chạm: lớp đầy đủ chỉ mờ đi chứ vẫn nằm trên, nên khi đã thu gọn mà nó còn nhận chạm
  // thì bấm nút ☰ hay các nút gọn sẽ trúng thẻ "Đọc đơn"… bên dưới. Theo dõi độ cuộn như phần đầu của Bán hàng, chỉ đổi state
  // khi vượt mốc: chốt lúc thả tay sau khi kéo thì cuộn bằng chuột, bàn di hay cuộn tới vị trí khác không bao giờ cập nhật.
  useEffect(() => {
    const threshold = headerScrollDistance * 0.9;
    const id = scrollY.addListener(({ value }) => {
      const next = value >= threshold;
      setIsCollapsed((cur) => (cur === next ? cur : next));
    });
    return () => scrollY.removeListener(id);
  }, [scrollY, headerScrollDistance]);
  const now = new Date();

  // Số liệu lấy từ báo cáo của Core (tính trên toàn tiệm ở Core), không tải toàn bộ đơn, hàng, nợ về máy để cộng.
  // Chỉ lần đầu của mỗi kỳ mới hiện skeleton; quay lại màn hình hay đổi về kỳ đã xem thì giữ số cũ trong lúc làm mới.
  const overview = useHomeOverview(reportPeriodOf(period) ?? 'today');
  const local = useLocalNotifications();
  const { error } = overview;
  const reload = () => {
    void overview.reload();
    void local.reload();
  };
  const ready = !overview.loading && !error;

  // Doanh thu của các đơn bán trong kỳ còn hiệu lực (không âm) và số đơn đó, như màn Đơn hàng; `undefined` khi chưa có số.
  // Đơn bán kỳ trước mà huỷ trong kỳ không trừ vào đây (xem `periodRevenue`).
  const periodTotals = overview.summary && overview.sales ? periodRevenue(overview.summary, overview.sales) : null;
  const totals = periodTotals
    ? {
        count: periodTotals.orderCount,
        revenue: periodTotals.revenueVnd,
        // Kỳ có đơn bán (kể cả đơn sau đó bị huỷ) thì hiện doanh thu, không phải "Chưa có đơn"
        active: periodTotals.hasOrders,
      }
    : undefined;
  const topSellers = topSellerRows(overview.top ?? []);
  const totalDebt = overview.summary?.currentOutstandingDebtVnd ?? 0;
  const openDebtCount = local.openDebtCount;
  // Món cần nhập theo ngưỡng riêng của từng món (Core); chỉ nhắc 2 món, tổng số món ở `restockTotal`
  const restockTotal = overview.restock?.total ?? 0;
  const lowStock = restockRows(overview.restock?.items ?? []);
  // Tắt "Cảnh báo sắp hết hàng" ở Cài đặt thì không nhắc nhập hàng ở đây
  const showRestock = app.settings.stockAlerts && restockTotal > 0;
  const priorityCount = Number(totalDebt > 0) + Number(showRestock);
  const revenueChange =
    period === 'today' && totals ? changeVsYesterday(totals.revenue, local.yesterdayRevenue) : null;
  // Thông báo: kho hàng, đơn bị huỷ và tình trạng tiệm lấy từ inbox Core (chỉ cần trang đầu để xem trước); đơn mới, công nợ, thu chi tính trên máy.
  const coreNotifications = useCoreNotifications(5);
  const coreNotifs = useMemo(() => coreNotifications.items.map(fromCoreNotification), [coreNotifications.items]);
  const localNotifications = local.notifications;
  const notifications = useMemo(
    () => mergeNotifications(localNotifications, coreNotifs, coreNotifications.hasMore),
    [localNotifications, coreNotifs, coreNotifications.hasMore],
  );
  const readNotifications = useMemo(() => new Set(app.readNotifs), [app.readNotifs]);
  // Đếm thông báo trên máy từ danh sách đầy đủ, không phải danh sách đã gộp (đã ẩn bớt khi Core còn trang chưa tải).
  const unreadNotifications = totalUnread(localNotifications, readNotifications, coreNotifications.unreadCount);
  const periodName = periodLabel[period];
  const topSeller = topSellers[0];
  // Quét mã chạy trong màn Bán hàng: ở đó có danh mục, giỏ và kiểm tra tồn. `scan=1` mở thẳng màn quét.
  const openScanner = () => router.push({ pathname: '/pos', params: { scan: '1' } });
  const openAssistant = (path: '/voice' | '/ai') => router.push(path);

  // Hướng dẫn dạng lớp phủ khoanh sáng các nút này (src/components/GuideTour.tsx); khi hướng dẫn mở thì cuộn về đầu để
  // phần đầu đầy đủ (bốn nút lên đơn) hiện ra
  const guide = {
    readOrder: useGuideTarget('readOrder'),
    selectGoods: useGuideTarget('selectGoods'),
    scanCode: useGuideTarget('scanCode'),
    assistant: useGuideTarget('assistant'),
    bell: useGuideTarget('bell'),
    quickNav: useGuideTarget('quickNav'),
  };
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (!app.guideDismissed) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [app.guideDismissed]);

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

  // Chỉ dùng transform và opacity để chạy ở luồng giao diện: khung header cố định chiều cao rồi trượt lên theo độ cuộn;
  // lớp thu gọn bù ngược để đứng yên, lớp mở rộng trượt thêm +25% để tổng cộng vẫn lùi 75% độ cuộn như trước.
  const shellTranslate = scrollY.interpolate({
    inputRange: [0, headerScrollDistance],
    outputRange: [0, -headerScrollDistance],
    extrapolate: 'clamp',
  });
  const counterTranslate = scrollY.interpolate({
    inputRange: [0, headerScrollDistance],
    outputRange: [0, headerScrollDistance],
    extrapolate: 'clamp',
  });
  const expandedOpacity = scrollY.interpolate({
    inputRange: [0, startTransition, endTransition],
    outputRange: [1, 1, 0],
    extrapolate: 'clamp',
  });
  const expandedTranslate = scrollY.interpolate({
    inputRange: [0, headerScrollDistance],
    outputRange: [0, headerScrollDistance * 0.25],
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
          ref={scrollRef}
          style={styles.scroll}
          contentContainerStyle={[styles.scrollContent, { paddingTop: headerExpanded + insets.top }]}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
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
                    subtitle={`${openDebtCount != null ? `${openDebtCount} khoản nợ · ` : ''}${vnd(totalDebt)} chưa thu`}
                    onPress={() => router.push('/debts')}
                    last={!showRestock}
                  />
                ) : null}
                {showRestock ? (
                  <PriorityRow
                    icon="lowStock"
                    tone="danger"
                    title="Kiểm tra hàng sắp hết"
                    subtitle={
                      lowStock.map((product) => `${product.name} còn ${formatQuantity(product.stockQuantity ?? 0)}`).join(' · ') +
                      (restockTotal > lowStock.length ? ` · và ${restockTotal - lowStock.length} món khác` : '')
                    }
                    onPress={() => router.push({ pathname: '/products', params: { tab: 'low' } })}
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
                          ? `${topSeller.productName} bán nhiều nhất trong kỳ, đã bán ${formatQuantity(topSeller.netQuantity)} ${topSeller.unit}. Xem số liệu trước khi chuẩn bị thêm.`
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
                    key={seller.itemKey}
                    style={[styles.sellerRow, index < topSellers.length - 1 && styles.rowBorder]}
                  >
                    {/* Cùng chiều cao dòng: trên Android mỗi độ đậm của font có khoảng đệm khác nhau nên số lượng bị lệch lên */}
                    <T w="bold" size={12} color={colors.muted} style={[styles.sellerText, { width: 22 }]}>
                      {index + 1}
                    </T>
                    <T w="semibold" size={14} style={[styles.sellerText, { flex: 1 }]} numberOfLines={1}>
                      {seller.productName}
                    </T>
                    <T w="bold" size={14} color={colors.primary} style={styles.sellerText}>
                      {formatQuantity(seller.netQuantity)} {seller.unit}
                    </T>
                  </Row>
                ))
              ) : overview.topError ? (
                <T size={13} color={colors.muted} style={{ paddingVertical: 13, textAlign: 'center' }}>
                  Không tải được món bán chạy: {overview.topError}
                </T>
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
                const unread = isNotifUnread(notification, readNotifications);
                return (
                  <Pressable
                    key={notification.id}
                    onPress={() => {
                      if (notification.coreId != null) coreNotifications.markRead([notification.coreId]).catch(() => undefined);
                      else app.markNotifsRead([notification.id]);
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
            { height: headerExpanded + insets.top, transform: [{ translateY: shellTranslate }] },
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
              <View ref={guide.quickNav} collapsable={false}>
                <QuickNavButton tone="dark" />
              </View>
              <Tab1Icon name="logo" size={42} style={styles.logoIcon} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={17} color={colors.white} numberOfLines={1}>{app.store.name}</T>
                <T size={12} color="#B8B5AE">Sổ bán hàng của bạn</T>
              </View>
              <Pressable
                ref={guide.bell}
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
              ) : totals.active ? (
                <CountUp value={totals.revenue} format={vnd} w="extrabold" size={34} numberOfLines={1} adjustsFontSizeToFit style={styles.expandedRevenueValue} />
              ) : (
                <T w="extrabold" size={18} style={{ marginTop: 10 }}>Chưa có đơn trong kỳ</T>
              )}
              {periodTotals && periodTotals.cancelledEarlierVnd > 0 ? (
                // Đơn bán kỳ trước bị huỷ trong kỳ: không trừ vào doanh thu mà tính vào chi, nêu ra để chủ tiệm biết
                <T size={12} color={colors.muted} style={{ marginTop: 4 }}>
                  Huỷ đơn bán kỳ trước {vnd(periodTotals.cancelledEarlierVnd)} · tính vào chi phí
                </T>
              ) : null}
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
                <ActionCard icon="readOrder" title="Đọc đơn" subtitle="Giọng nói" guideRef={guide.readOrder} onPress={() => openAssistant('/voice')} />
                <ActionCard icon="selectGoods" title="Chọn hàng" subtitle="Thủ công" guideRef={guide.selectGoods} onPress={() => router.push('/pos')} />
                <ActionCard icon="scanCode" title="Quét mã" subtitle="Mã vạch / QR" guideRef={guide.scanCode} onPress={openScanner} />
                <ActionCard icon="assistant" title="Trợ lý Bobi" subtitle="Gợi ý bán" guideRef={guide.assistant} onPress={() => openAssistant('/ai')} />
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
                transform: [{ translateY: counterTranslate }, { translateY: compactTranslate }],
              },
            ]}
          >
            {/* Tier 1: Context on left + Prominent Revenue on right */}
            <View style={styles.compactTier1}>
              <QuickNavButton tone="dark" compact style={{ marginRight: 10 }} />
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
                ) : totals.active ? (
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
              <CompactAction icon="readOrder" label="Đọc đơn" onPress={() => openAssistant('/voice')} />
              <CompactAction icon="scanCode" label="Quét mã" onPress={openScanner} />
              <CompactAction icon="selectGoods" label="Chọn hàng" onPress={() => router.push('/pos')} />
              <CompactAction icon="assistant" label="Trợ lý" accessibilityLabel="Trợ lý Bobi" onPress={() => openAssistant('/ai')} />
            </View>
          </Animated.View>
          <Animated.View pointerEvents="none" style={[styles.headerDivider, { opacity: dividerOpacity }]} />
        </Animated.View>
      </View>
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

type QuickAction = 'readOrder' | 'selectGoods' | 'scanCode' | 'assistant';

/**
 * Màu riêng cho bốn nút lên đơn trên nền tím (trước đây cả bốn cùng nền tím trong suốt, khó phân biệt): ô biểu tượng màu pastel
 * đặc để biểu tượng nổi trên nền tím, viền và nền thẻ cùng tông nhưng nhạt để thẻ vẫn hoà vào phần đầu.
 * Vàng: Đọc đơn (giọng nói, chức năng chính) · Xanh dương: Chọn hàng · Xanh lá: Quét mã · Hồng: Trợ lý Bobi.
 */
const ACTION_TONES: Record<QuickAction, { chip: string; border: string; bg: string; bgPressed: string }> = {
  readOrder: { chip: '#FFF1C2', border: 'rgba(255, 214, 102, 0.45)', bg: 'rgba(255, 214, 102, 0.10)', bgPressed: 'rgba(255, 214, 102, 0.2)' },
  selectGoods: { chip: '#DCEBFF', border: 'rgba(122, 176, 255, 0.45)', bg: 'rgba(122, 176, 255, 0.10)', bgPressed: 'rgba(122, 176, 255, 0.2)' },
  scanCode: { chip: '#DDF5D2', border: 'rgba(143, 219, 110, 0.45)', bg: 'rgba(143, 219, 110, 0.10)', bgPressed: 'rgba(143, 219, 110, 0.2)' },
  assistant: { chip: '#FBE0EF', border: 'rgba(255, 150, 200, 0.45)', bg: 'rgba(255, 150, 200, 0.10)', bgPressed: 'rgba(255, 150, 200, 0.2)' },
};

/** Một nút lên đơn ở phần đầu Tổng quan; `guideRef` để phần hướng dẫn khoanh sáng đúng nút này. */
function ActionCard({
  icon,
  title,
  subtitle,
  onPress,
  guideRef,
}: {
  icon: QuickAction;
  title: string;
  subtitle: string;
  onPress: () => void;
  guideRef: (node: View | null) => void;
}) {
  const tone = ACTION_TONES[icon];
  return (
    <Pressable
      ref={guideRef}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        { borderColor: tone.border, backgroundColor: pressed ? tone.bgPressed : tone.bg },
        pressed && styles.actionButtonPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.actionIcon, { backgroundColor: tone.chip }]}>
        <Tab1Icon name={icon} size={24} />
      </View>
      <View style={styles.actionTextCol}>
        <T w="bold" size={14.5} color="#FFFFFF" numberOfLines={1}>
          {title}
        </T>
        <T size={10.5} color="rgba(255, 255, 255, 0.62)" numberOfLines={1} style={{ marginTop: 2 }}>
          {subtitle}
        </T>
      </View>
      <Feather name="chevron-right" size={14} color="rgba(255, 255, 255, 0.4)" />
    </Pressable>
  );
}

/**
 * Nút vào nhanh của thanh gọn (đã cuộn). Biểu tượng nằm trên ô nền sáng: ở cỡ nhỏ, phần tím đậm của biểu tượng chìm vào nền
 * tím của thanh nên trông như bị cắt. Biểu tượng và chữ cùng một dòng để thanh gọn thấp. Nút rộng theo chữ (không chia đều)
 * vì "Chọn hàng" dài hơn "Trợ lý" nhiều, nhờ vậy cả bốn vừa màn 360 px; màn hẹp hơn thì chữ tự thu nhỏ, không xuống dòng.
 */
function CompactAction({
  icon,
  label,
  accessibilityLabel,
  onPress,
}: {
  icon: Tab1IconName;
  label: string;
  accessibilityLabel?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.compactActionBtn, pressed && styles.compactActionBtnPressed]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={[styles.compactActionIcon, { backgroundColor: ACTION_TONES[icon as QuickAction]?.chip ?? 'rgba(255, 255, 255, 0.94)' }]}>
        <Tab1Icon name={icon} size={13} />
      </View>
      <T
        w="semibold"
        size={11}
        color="#FFFFFF"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        maxFontSizeMultiplier={1.1}
        style={styles.compactActionLabel}
      >
        {label}
      </T>
    </Pressable>
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
    // Ô biểu tượng màu chiếm chỗ hơn biểu tượng trần trước đây: đệm và khoảng cách gọn lại để "Chọn hàng", "Trợ lý Bobi"
    // vẫn đủ một dòng ở màn 360–375 px
    paddingLeft: 10,
    paddingRight: 8,
    paddingVertical: 11,
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionButtonPressed: {
    transform: [{ scale: 0.985 }],
  },
  actionIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
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
    gap: 6,
    marginTop: 8,
  },
  compactActionBtn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    backgroundColor: 'transparent',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
  },
  compactActionIcon: {
    width: 18,
    height: 18,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactActionLabel: { flexShrink: 1, minWidth: 0 },
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
  sellerText: { lineHeight: 20, includeFontPadding: false, textAlignVertical: 'center' },
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
