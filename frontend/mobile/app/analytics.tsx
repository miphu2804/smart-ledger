import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ReportPeriodTabs, type ReportPeriod } from '../src/components/ReportPeriodTabs';
import { BarChart } from '../src/components/charts';
import { Button, Card, Header, Row, Screen, SectionTitle, T } from '../src/components/ui';
import type { Invoice } from '../src/data/types';
import { vnd } from '../src/lib/format';
import { bestSellers, hourly, inPeriod, invoiceTotal, periodLabel, summary } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

function monthWeeks(invoices: Invoice[], now = new Date()) {
  const weeks = Array.from({ length: Math.ceil(now.getDate() / 7) }, (_, index) => {
    const first = index * 7 + 1;
    return { label: `${first}–${Math.min(first + 6, now.getDate())}`, value: 0 };
  });
  invoices.forEach((invoice) => {
    if (invoice.status === 'cancelled' || !inPeriod(invoice.createdAt, 'month', now)) return;
    const day = new Date(invoice.createdAt).getDate();
    if (day <= now.getDate()) weeks[Math.floor((day - 1) / 7)].value += invoiceTotal(invoice);
  });
  return weeks;
}

const weekdayShort = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const weekdayLong = ['Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy', 'Chủ nhật'];

/** Doanh thu từng ngày trong tuần lịch hiện tại (T2 → CN); ngày chưa tới có giá trị 0. */
function weekDays(invoices: Invoice[], now = new Date()) {
  const days = weekdayShort.map((label) => ({ label, value: 0 }));
  invoices.forEach((invoice) => {
    if (invoice.status === 'cancelled' || !inPeriod(invoice.createdAt, 'thisWeek', now)) return;
    days[(new Date(invoice.createdAt).getDay() + 6) % 7].value += invoiceTotal(invoice);
  });
  return days;
}

export default function Analytics() {
  const app = useApp();
  const { period: requestedPeriod } = useLocalSearchParams<{ period?: string }>();
  const [period, setPeriod] = useState<ReportPeriod>(
    requestedPeriod === 'thisWeek' || requestedPeriod === 'month' ? requestedPeriod : 'today',
  );
  const [selectedBar, setSelectedBar] = useState<number | null>(null);

  const totals = summary(app.invoices, app.products, period);
  const expenses = app.expenses.filter((expense) => inPeriod(expense.createdAt, period));
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const estimatedCost = totals.revenue - totals.profit;
  const debtLeft = app.debts.reduce((sum, debt) => sum + Math.max(0, debt.total - debt.paid), 0);
  const leaders = bestSellers(app.invoices, period).slice(0, 3);
  const trend = period === 'month' ? monthWeeks(app.invoices) : period === 'thisWeek' ? weekDays(app.invoices) : hourly(app.invoices, period);
  const defaultBar = trend.reduce((best, item, index) => (item.value > trend[best].value ? index : best), 0);
  const activeBar = selectedBar !== null && selectedBar < trend.length ? selectedBar : defaultBar;
  const periodName = periodLabel[period];

  return (
    <Screen contentStyle={{ paddingBottom: 48 }}>
      <Header title="Phân tích bán hàng" subtitle={app.store.name} />
      <ReportPeriodTabs
        value={period}
        onChange={(next) => {
          setPeriod(next);
          setSelectedBar(null);
        }}
      />

      <Card style={{ marginTop: 12 }}>
        <T w="bold" size={12} color={colors.muted} style={styles.eyebrow}>
          DOANH THU {periodName.toUpperCase()}
        </T>
        <T w="extrabold" size={32} numberOfLines={1} adjustsFontSizeToFit style={styles.revenue}>
          {vnd(totals.revenue)}
        </T>
        <T size={12} color={colors.muted}>
          Từ đơn đã chốt trong kỳ
        </T>
        <Row style={styles.heroMetrics} gap={14}>
          <View style={{ flex: 1 }}>
            <T w="bold" size={17}>{totals.count} đơn</T>
            <T size={12} color={colors.muted}>Đã chốt</T>
          </View>
          <View style={styles.divider} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={17} numberOfLines={1} adjustsFontSizeToFit>
              {vnd(totals.count ? totals.revenue / totals.count : 0)}
            </T>
            <T size={12} color={colors.muted}>Trung bình / đơn</T>
          </View>
        </Row>
      </Card>

      <SectionTitle title="Diễn biến doanh thu" />
      <Card>
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <T size={12} color={colors.muted}>
            {period === 'month' ? 'Theo tuần trong tháng' : period === 'thisWeek' ? 'Theo ngày trong tuần' : 'Theo giờ trong ngày'}
          </T>
          <Feather name="bar-chart-2" size={15} color={colors.primary} />
        </Row>
        {totals.count ? (
          <>
            <BarChart data={trend} height={126} selected={activeBar} onSelect={setSelectedBar} highlightLast={false} />
            <T size={12} color={colors.muted} style={{ marginTop: 12 }}>
              {period === 'month' ? `Ngày ${trend[activeBar].label}` : period === 'thisWeek' ? weekdayLong[activeBar] : `Khung ${trend[activeBar].label}`} · {vnd(trend[activeBar].value)}
            </T>
          </>
        ) : (
          <T size={14} color={colors.muted} style={styles.empty}>
            Chưa có đơn đã chốt trong kỳ này
          </T>
        )}
      </Card>

      <SectionTitle title="Thu chi trong kỳ" />
      <Card style={{ paddingVertical: 6 }}>
        <MetricRow label="Doanh thu" value={vnd(totals.revenue)} />
        <MetricRow label="Giá vốn ước tính" value={vnd(estimatedCost)} />
        <MetricRow label="Chi phí đã ghi" value={vnd(expenseTotal)} />
        <View style={styles.metricDivider} />
        <MetricRow
          label="Lãi gộp ước tính"
          value={vnd(totals.profit)}
          color={totals.profit >= 0 ? colors.primary : colors.red}
          strong
        />
        <T size={12} color={colors.faint} style={styles.note}>
          Lãi gộp = doanh thu − giá vốn ước tính, chưa trừ chi phí đã ghi. Món chưa có giá vốn dùng mức ước tính.
        </T>
      </Card>

      <SectionTitle title="Bán chạy trong kỳ" action="Xem tất cả" onAction={() => router.push({ pathname: '/bestsellers', params: { period } })} />
      <Card style={{ paddingVertical: 4 }}>
        {leaders.length ? leaders.map((item, index) => (
          <Row key={item.productId ?? item.name} style={[styles.sellerRow, index < leaders.length - 1 && styles.rowBorder]} gap={10}>
            <T w="bold" size={12} color={colors.faint} style={{ width: 22 }}>{index + 1}</T>
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14} numberOfLines={1}>{item.name}</T>
              <T size={12} color={colors.muted}>{item.qty} sản phẩm</T>
            </View>
            <T w="bold" size={13} color={colors.primary}>{vnd(item.revenue)}</T>
          </Row>
        )) : (
          <T size={14} color={colors.muted} style={styles.empty}>Chưa có mặt hàng bán trong kỳ</T>
        )}
      </Card>

      <SectionTitle title="Công nợ" />
      <Card onPress={() => router.push('/debts')}>
        <Row gap={10}>
          <View style={styles.debtIcon}><Feather name="book-open" size={17} color={colors.gold} /></View>
          <View style={{ flex: 1 }}>
            <T size={12} color={colors.muted}>Còn nợ toàn tiệm</T>
            <T w="bold" size={18}>{vnd(debtLeft)}</T>
          </View>
          <Feather name="chevron-right" size={18} color={colors.faint} />
        </Row>
      </Card>

      <Button
        title="Xem đơn trong kỳ"
        icon="file-text"
        variant="outline"
        style={{ marginTop: 16 }}
        onPress={() => router.push({ pathname: '/(tabs)/invoices', params: { period } })}
      />
    </Screen>
  );
}

function MetricRow({ label, value, color = colors.ink, strong = false }: { label: string; value: string; color?: string; strong?: boolean }) {
  return (
    <Row style={styles.metricRow} gap={8}>
      <T w={strong ? 'bold' : 'medium'} size={strong ? 14 : 13} color={strong ? colors.ink : colors.muted} style={{ flex: 1 }}>
        {label}
      </T>
      <T w="bold" size={strong ? 16 : 14} color={color} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </T>
    </Row>
  );
}

const styles = StyleSheet.create({
  eyebrow: { letterSpacing: 0.5 },
  revenue: { marginTop: 6, lineHeight: 42 },
  heroMetrics: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: 15, paddingTop: 13 },
  divider: { width: 1, backgroundColor: colors.border },
  empty: { paddingVertical: 30, textAlign: 'center' },
  metricRow: { minHeight: 42, justifyContent: 'space-between' },
  metricDivider: { height: 1, backgroundColor: colors.border, marginVertical: 3 },
  note: { lineHeight: 18, marginTop: 7, marginBottom: 8 },
  sellerRow: { minHeight: 56, paddingVertical: 8 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  debtIcon: { width: 38, height: 38, borderRadius: 11, backgroundColor: colors.goldSoft, alignItems: 'center', justifyContent: 'center' },
});
