import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LogoMark } from '../../src/components/brand';
import { Button, Card, IconBtn, IconName, Row, Screen, SectionTitle, T } from '../../src/components/ui';
import { ddmm, vnd } from '../../src/lib/format';
import { buildNotifications } from '../../src/lib/notifications';
import { bestSellers, periodLabel, summary, type Period } from '../../src/lib/stats';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

type HomePeriod = Extract<Period, 'today' | 'yesterday' | 'month'>;

const weekdayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

export default function Home() {
  const app = useApp();
  const [period, setPeriod] = useState<HomePeriod>('today');
  const now = new Date();

  const totals = useMemo(() => summary(app.invoices, app.products, period), [app.invoices, app.products, period]);
  const previousDay = useMemo(
    () => (period === 'today' ? summary(app.invoices, app.products, 'yesterday') : null),
    [app.invoices, app.products, period],
  );
  const topSellers = useMemo(() => bestSellers(app.invoices, period).slice(0, 4), [app.invoices, period]);
  const totalDebt = app.debts.reduce((total, debt) => total + Math.max(0, debt.total - debt.paid), 0);
  const lowStock = app.products.filter((product) => product.tracked && product.stock <= 6).sort((a, b) => a.stock - b.stock);
  const revenueChange = previousDay?.revenue ? (totals.revenue - previousDay.revenue) / previousDay.revenue : null;
  const unreadNotifications = useMemo(() => {
    const read = new Set(app.readNotifs);
    return buildNotifications(app).filter((notification) => !read.has(notification.id)).length;
  }, [app.invoices, app.products, app.expenses, app.debts, app.readNotifs]);
  const periodName = periodLabel[period];
  const topSeller = topSellers[0];

  return (
    <Screen>
      <Row style={styles.topBar}>
        <LogoMark size={42} bg={colors.ink} fg={colors.white} accent={colors.accent} />
        <View style={{ flex: 1 }}>
          <T w="bold" size={17} numberOfLines={1}>
            {app.store.name}
          </T>
          <T size={12} color={colors.muted}>
            Bản demo · dữ liệu giả lập
          </T>
        </View>
        <IconBtn
          name="bell"
          dot={unreadNotifications > 0}
          onPress={() => router.push('/notifications')}
          label="Thông báo"
        />
      </Row>

      <T size={12} color={colors.muted} style={{ marginTop: 14 }}>
        {weekdayNames[now.getDay()]}, {ddmm(now)}
      </T>
      <T w="extrabold" size={30} style={{ marginTop: 2, lineHeight: 38 }}>
        Tổng quan
      </T>

      <Card
        style={{ marginTop: 14 }}
        onPress={() => router.push({ pathname: '/(tabs)/invoices', params: { period } })}
      >
        <Row style={{ justifyContent: 'space-between' }}>
          <T w="bold" size={13} color={colors.primary}>
            Doanh thu · {periodName}
          </T>
          {revenueChange !== null ? (
            <Row gap={4}>
              <Feather
                name={revenueChange >= 0 ? 'trending-up' : 'trending-down'}
                size={14}
                color={revenueChange >= 0 ? colors.green : colors.red}
              />
              <T w="semibold" size={12} color={revenueChange >= 0 ? colors.green : colors.red}>
                {revenueChange >= 0 ? '+' : ''}
                {Math.round(revenueChange * 100)}% so với hôm qua
              </T>
            </Row>
          ) : null}
        </Row>
        <T
          w="extrabold"
          size={totals.count ? 32 : 18}
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{ marginTop: 3, lineHeight: totals.count ? 40 : 28 }}
        >
          {totals.count ? vnd(totals.revenue) : 'Chưa có đơn trong kỳ'}
        </T>
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

      <View style={styles.periodSelector}>
        {(['today', 'yesterday', 'month'] as const).map((option) => {
          const active = period === option;
          return (
            <Pressable
              key={option}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setPeriod(option)}
              style={[styles.periodOption, active && styles.periodOptionActive]}
            >
              <T w={active ? 'bold' : 'semibold'} size={14} color={active ? colors.ink : colors.muted}>
                {periodLabel[option]}
              </T>
            </Pressable>
          );
        })}
      </View>

      <SectionTitle title="Cần xử lý" />
      {totalDebt > 0 || lowStock.length > 0 ? (
        <Card style={{ paddingVertical: 4 }}>
          {totalDebt > 0 ? (
            <PriorityRow
              icon="book-open"
              title="Còn nợ toàn tiệm"
              subtitle="Tổng số dư còn lại của khách"
              amount={vnd(totalDebt)}
              onPress={() => router.push('/debts')}
              last={lowStock.length === 0}
            />
          ) : null}
          {lowStock.length > 0 ? (
            <PriorityRow
              icon="alert-triangle"
              title={`${lowStock.length} mặt hàng sắp hết`}
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

      <SectionTitle title="Bán hàng" />
      <Button
        title="Nói để lên đơn"
        icon="mic"
        onPress={() => router.push('/voice')}
        style={{ marginBottom: 8 }}
      />
      <Button title="Chọn hàng trên POS" icon="grid" variant="outline" onPress={() => router.push('/pos')} />

      <SectionTitle title="Gợi ý từ dữ liệu" />
      <Card style={{ backgroundColor: colors.primaryTint }}>
        <Row style={{ alignItems: 'flex-start' }} gap={10}>
          <View style={styles.suggestionIcon}>
            <Feather name="trending-up" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14} style={{ lineHeight: 21 }}>
              {topSeller
                ? `${topSeller.name} bán nhiều nhất trong kỳ này (${topSeller.qty} sản phẩm).`
                : 'Chưa đủ dữ liệu đơn đã chốt trong kỳ để đưa ra gợi ý.'}
            </T>
            <T size={12} color={colors.muted} style={{ marginTop: 5 }}>
              Nguồn: {totals.count} đơn đã chốt · {periodName}
            </T>
          </View>
        </Row>
      </Card>

      <SectionTitle title="Bán chạy" action="Xem tất cả" onAction={() => router.push('/bestsellers')} />
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
  );
}

function PriorityRow({
  icon,
  title,
  subtitle,
  amount,
  onPress,
  last,
}: {
  icon: IconName;
  title: string;
  subtitle: string;
  amount?: string;
  onPress: () => void;
  last?: boolean;
}) {
  const isDebt = icon === 'book-open';
  const tone = isDebt ? colors.gold : colors.red;
  const toneBg = isDebt ? colors.goldSoft : colors.redSoft;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={[styles.priorityRow, !last && styles.rowBorder]}
    >
      <View style={[styles.priorityIcon, { backgroundColor: toneBg }]}>
        <Feather name={icon} size={17} color={tone} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14}>
          {title}
        </T>
        <T size={12} color={colors.muted} numberOfLines={1}>
          {subtitle}
        </T>
      </View>
      {amount ? (
        <T w="bold" size={13} color={tone} style={{ marginRight: 3 }}>
          {amount}
        </T>
      ) : null}
      <Feather name="chevron-right" size={17} color={colors.disabled} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { paddingTop: 6, paddingBottom: 2, gap: 10 },
  periodSelector: {
    flexDirection: 'row',
    backgroundColor: '#F1F0ED',
    borderRadius: 14,
    padding: 4,
    marginTop: 10,
  },
  periodOption: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  periodOptionActive: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  financeRow: {
    alignItems: 'stretch',
    marginTop: 11,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  financeItem: { flex: 1, justifyContent: 'center', minHeight: 44 },
  financeDivider: { width: 1, backgroundColor: colors.border },
  priorityRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  priorityIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
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
