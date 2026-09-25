import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { ReportPeriodTabs, type ReportPeriod } from '../../src/components/ReportPeriodTabs';
import { AssistantIntroModal } from '../../src/components/AssistantIntroModal';
import { LogoMark } from '../../src/components/brand';
import { Card, IconBtn, IconName, Row, Screen, T } from '../../src/components/ui';
import { vnd } from '../../src/lib/format';
import { buildNotifications } from '../../src/lib/notifications';
import { bestSellers, periodLabel, summary } from '../../src/lib/stats';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

const weekdayNames = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

export default function Home() {
  const app = useApp();
  const { width } = useWindowDimensions();
  const compactRevenueHeader = width < 390;
  const [period, setPeriod] = useState<ReportPeriod>('today');
  const now = new Date();

  const totals = useMemo(() => summary(app.invoices, app.products, period), [app.invoices, app.products, period]);
  const previousDay = useMemo(
    () => (period === 'today' ? summary(app.invoices, app.products, 'yesterday') : null),
    [app.invoices, app.products, period],
  );
  const topSellers = useMemo(() => bestSellers(app.invoices, period).slice(0, 4), [app.invoices, period]);
  const totalDebt = app.debts.reduce((total, debt) => total + Math.max(0, debt.total - debt.paid), 0);
  const debtorCount = app.debts.filter((debt) => debt.total > debt.paid).length;
  const lowStock = app.products.filter((product) => product.tracked && product.stock <= 6).sort((a, b) => a.stock - b.stock);
  const priorityCount = Number(totalDebt > 0) + Number(lowStock.length > 0);
  const revenueChange = previousDay?.revenue ? (totals.revenue - previousDay.revenue) / previousDay.revenue : null;
  const unreadNotifications = useMemo(() => {
    const read = new Set(app.readNotifs);
    return buildNotifications(app).filter((notification) => !read.has(notification.id)).length;
  }, [app.invoices, app.products, app.expenses, app.debts, app.readNotifs]);
  const periodName = periodLabel[period];
  const topSeller = topSellers[0];
  const openAssistant = (path: '/voice' | '/ai') => {
    app.dismissGuide();
    router.push(path);
  };

  return (
    <>
    <Screen bg={colors.white}>
      <Row style={styles.topBar}>
        <LogoMark size={42} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={17} numberOfLines={1}>
            {app.store.name}
          </T>
          <T size={12} color={colors.muted}>
            Sổ bán hàng của bạn
          </T>
        </View>
        <IconBtn
          name="bell"
          dot={unreadNotifications > 0}
          onPress={() => router.push('/notifications')}
          label="Thông báo"
        />
      </Row>

      <T w="bold" size={12} color={colors.muted} style={styles.date}>
        {`${weekdayNames[now.getDay()]}, ${now.getDate()} tháng ${now.getMonth() + 1}`.toLocaleUpperCase('vi-VN')}
      </T>
      <T w="extrabold" size={32} style={{ marginTop: 3, lineHeight: 42 }}>
        Tổng quan
      </T>

      <Card
        style={{ marginTop: 18 }}
        onPress={() => router.push({ pathname: '/analytics', params: { period } })}
        accessibilityLabel={`Xem phân tích doanh thu ${periodName}`}
      >
        <Row style={[styles.revenueHeader, compactRevenueHeader && styles.revenueHeaderCompact]} gap={compactRevenueHeader ? 0 : 8}>
          <T w="bold" size={12} color={colors.muted} numberOfLines={1} style={styles.revenueLabel}>
            DOANH THU {periodName.toUpperCase()}
          </T>
          <View style={compactRevenueHeader ? styles.compactComparisonSlot : undefined}>
            {revenueChange !== null ? (
              <Row gap={4} style={[styles.changeBadge, { backgroundColor: revenueChange >= 0 ? colors.greenSoft : colors.redSoft }]}>
                <Feather
                  name={revenueChange >= 0 ? 'trending-up' : 'trending-down'}
                  size={14}
                  color={revenueChange >= 0 ? colors.green : colors.red}
                />
                <T w="semibold" size={12} color={revenueChange >= 0 ? colors.green : colors.red} numberOfLines={1} adjustsFontSizeToFit>
                  {revenueChange >= 0 ? '+' : ''}
                  {Math.round(revenueChange * 100)}% so với hôm qua
                </T>
              </Row>
            ) : null}
          </View>
        </Row>
        <Row style={{ marginTop: 8 }} gap={8}>
          <T
            w="extrabold"
            size={totals.count ? 34 : 18}
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{ flex: 1, lineHeight: totals.count ? 44 : 28 }}
          >
            {totals.count ? vnd(totals.revenue) : 'Chưa có đơn trong kỳ'}
          </T>
          <Feather name="arrow-up-right" size={18} color={colors.faint} />
        </Row>
        <Row style={styles.financeRow} gap={14}>
          <View style={styles.financeItem}>
            <T w="bold" size={17} numberOfLines={1} adjustsFontSizeToFit>
              {totals.count} đơn
            </T>
            <T size={12} color={colors.muted}>
              Đã chốt trong kỳ
            </T>
          </View>
          <View style={styles.financeDivider} />
          <View style={styles.financeItem}>
            <T w="bold" size={17} numberOfLines={1} adjustsFontSizeToFit>
              {vnd(totalDebt)}
            </T>
            <T size={12} color={colors.muted}>
              Còn nợ toàn tiệm
            </T>
          </View>
        </Row>
      </Card>

      <View style={{ marginTop: 14 }}>
        <ReportPeriodTabs value={period} onChange={setPeriod} />
      </View>

      <HomeSectionHeading title="Ưu tiên hôm nay" side={priorityCount ? `${priorityCount} việc cần xem` : 'Đã xong'} />
      {priorityCount ? (
        <Card style={{ paddingVertical: 4 }}>
          {totalDebt > 0 ? (
            <PriorityRow
              icon="book-open"
              title="Thu khoản còn nợ"
              subtitle={`${debtorCount} khách · ${vnd(totalDebt)} chưa thu`}
              onPress={() => router.push('/debts')}
              last={lowStock.length === 0}
            />
          ) : null}
          {lowStock.length > 0 ? (
            <PriorityRow
              icon="alert-triangle"
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

      <Card style={{ backgroundColor: colors.primaryTint, marginTop: 22 }}>
        <Row style={{ alignItems: 'flex-start' }} gap={10}>
          <View style={styles.suggestionIcon}>
            <Feather name="star" size={17} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={14} style={{ marginBottom: 4 }}>Gợi ý từ dữ liệu đã chốt</T>
            <T size={13} color={colors.muted} style={{ lineHeight: 20 }}>
              {topSeller
                ? `${topSeller.name} bán nhiều nhất trong kỳ (${topSeller.qty} sản phẩm). Xem số liệu trước khi chuẩn bị thêm.`
                : 'Chưa đủ dữ liệu đơn đã chốt trong kỳ để đưa ra gợi ý.'}
            </T>
            <T size={12} color={colors.faint} style={{ marginTop: 5 }}>
              Nguồn: {totals.count} đơn đã chốt · {periodName}
            </T>
          </View>
        </Row>
      </Card>

      <HomeSectionHeading
        title={`Bán chạy ${periodName.toLowerCase()}`}
        side="Xem tất cả ›"
        onPress={() => router.push({ pathname: '/bestsellers', params: { period } })}
      />
      <Card style={{ paddingVertical: 4, marginBottom: 88 }}>
        {topSellers.length ? (
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
                {seller.qty} sp
              </T>
            </Row>
          ))
        ) : (
          <T size={13} color={colors.muted} style={{ paddingVertical: 13, textAlign: 'center' }}>
            Chưa có đơn trong kỳ
          </T>
        )}
      </Card>
    </Screen>
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

function PriorityRow({
  icon,
  title,
  subtitle,
  onPress,
  last,
}: {
  icon: IconName;
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
      <View style={styles.priorityIcon}>
        <Feather name={icon} size={19} color={colors.white} />
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
  topBar: { paddingTop: 6, paddingBottom: 2, gap: 10 },
  date: { marginTop: 22, letterSpacing: 0.6 },
  revenueHeader: { minHeight: 30, justifyContent: 'space-between' },
  revenueHeaderCompact: { minHeight: 54, alignItems: 'stretch', flexDirection: 'column' },
  revenueLabel: { letterSpacing: 0.5, lineHeight: 18, flexShrink: 1 },
  compactComparisonSlot: { minHeight: 30, alignItems: 'flex-end', justifyContent: 'center' },
  changeBadge: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 5, flexShrink: 1 },
  financeRow: {
    alignItems: 'stretch',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  financeItem: { flex: 1, justifyContent: 'center', minHeight: 44 },
  financeDivider: { width: 1, backgroundColor: colors.border },
  sectionHeading: { marginTop: 24, marginBottom: 10, minHeight: 40, alignItems: 'center' },
  sectionAction: { minHeight: 44, justifyContent: 'center' },
  priorityRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  priorityIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
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
});
