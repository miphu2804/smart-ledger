import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart } from '../src/components/charts';
import { Card, Chips, EmptyState, Header, Progress, Row, Screen, SectionTitle, T, Tile } from '../src/components/ui';
import { vnd } from '../src/lib/format';
import { bestSellers, daily, Period } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

type Sort = 'qty' | 'revenue';
const RANK = [
  [colors.goldSoft, colors.gold],
  ['#EEF1F5', colors.muted],
  ['#FBEBDD', '#B26A2E'],
] as const;

export default function BestSellers() {
  const { invoices, products } = useApp();
  const { period: requestedPeriod } = useLocalSearchParams<{ period?: string }>();
  const [period, setPeriod] = useState<Period>(
    requestedPeriod === 'today' || requestedPeriod === 'yesterday' || requestedPeriod === 'week' ? requestedPeriod : 'month',
  );
  const [sort, setSort] = useState<Sort>('qty');
  const list = useMemo(() => {
    const l = bestSellers(invoices, period);
    return sort === 'qty' ? l : [...l].sort((a, b) => b.revenue - a.revenue);
  }, [invoices, period, sort]);
  const max = Math.max(1, ...list.map((l) => (sort === 'qty' ? l.qty : l.revenue)));
  const week = useMemo(() => daily(invoices, 7), [invoices]);
  const sold = new Set(list.map((l) => l.productId));
  const slow = products.filter((p) => !sold.has(p.id));

  return (
    <Screen>
      <Header title="Hàng bán chạy" subtitle="Biết món nào nên nhập thêm" />
      <Chips<Period>
        value={period}
        onChange={setPeriod}
        options={[
          { key: 'today', label: 'Hôm nay' },
          { key: 'yesterday', label: 'Hôm qua' },
          { key: 'week', label: '7 ngày' },
          { key: 'month', label: 'Tháng này' },
          { key: 'all', label: 'Tất cả' },
        ]}
      />
      <Chips<Sort>
        style={{ marginTop: 8 }}
        value={sort}
        onChange={setSort}
        options={[
          { key: 'qty', label: 'Theo số lượng' },
          { key: 'revenue', label: 'Theo doanh thu' },
        ]}
      />

      <Card style={{ marginTop: 14 }}>
        <T w="bold" size={14} style={{ marginBottom: 10 }}>
          Doanh thu 7 ngày
        </T>
        <BarChart data={week} height={110} />
      </Card>

      <SectionTitle title={`Xếp hạng (${list.length} món)`} />
      {list.length ? (
        list.map((l, i) => {
          const v = sort === 'qty' ? l.qty : l.revenue;
          const rank = RANK[i];
          return (
            <View key={l.name} style={styles.row}>
              <View style={[styles.rank, { backgroundColor: rank?.[0] ?? colors.bg }]}>
                <T w="extrabold" size={12} color={rank?.[1] ?? colors.faint}>
                  {i + 1}
                </T>
              </View>
              <Tile name={l.name} size={34} />
              <View style={{ flex: 1 }}>
                <Row>
                  <T w="semibold" size={14} style={{ flex: 1 }} numberOfLines={1}>
                    {l.name}
                  </T>
                  <T w="extrabold" size={14} color={colors.primary}>
                    {sort === 'qty' ? `x${l.qty}` : vnd(l.revenue)}
                  </T>
                </Row>
                <View style={{ marginTop: 6 }}>
                  <Progress value={v / max} color={i < 3 ? colors.primary : colors.primaryLight} />
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <EmptyState icon="bar-chart-2" title="Chưa có dữ liệu" />
      )}

      {slow.length ? (
        <Card style={{ marginTop: 16, backgroundColor: colors.purpleSoft }}>
          <Row gap={8}>
            <Feather name="star" size={14} color={colors.purple} />
            <T w="bold" size={13} color={colors.purple}>
              AI gợi ý · hàng bán chậm
            </T>
          </Row>
          <T size={12.5} color={colors.muted} style={{ marginTop: 6, lineHeight: 18 }}>
            {slow.map((s) => s.name).join(', ')} chưa bán được trong khoảng này. Cân nhắc giảm lượng nhập hoặc bày ở vị trí dễ
            thấy hơn.
          </T>
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
  },
  rank: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
});
