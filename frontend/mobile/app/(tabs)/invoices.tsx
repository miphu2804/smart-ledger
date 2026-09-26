import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Badge, Button, Chips, EmptyState, Field, IconBtn, Row, T } from '../../src/components/ui';
import type { SaleView } from '../../src/data/types';
import { errorMessage } from '../../src/lib/errors';
import { hhmm, normalizeText, relDay, vnd } from '../../src/lib/format';
import { saleApi } from '../../src/lib/salesApi';
import { inPeriod, Period } from '../../src/lib/stats';
import { colors, shadow } from '../../src/theme';

export default function Invoices() {
  const insets = useSafeAreaInsets();
  const { period: queryPeriod } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: Period = queryPeriod === 'yesterday' || queryPeriod === 'month' ? queryPeriod : 'today';
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);

  const [sales, setSales] = useState<SaleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSales(await saleApi.list());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      if (queryPeriod === 'today' || queryPeriod === 'yesterday' || queryPeriod === 'month') {
        setPeriod(queryPeriod);
      }
    }, [queryPeriod]),
  );

  const list = useMemo(() => {
    const nq = normalizeText(q);
    return sales.filter((s) => {
      if (!inPeriod(s.soldAt, period)) return false;
      if (nq) {
        const hay = normalizeText(`${s.id} ${s.customerName ?? ''} ${s.items.map((x) => x.productName).join(' ')}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [sales, period, q]);

  const total = list.filter((s) => s.saleStatus !== 'VOIDED').reduce((a, s) => a + s.totalVnd, 0);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Row style={{ paddingTop: 10, paddingBottom: 12 }}>
          <T w="extrabold" size={26} style={{ flex: 1 }}>
            Hoá đơn
          </T>
          <IconBtn
            name={searching ? 'x' : 'search'}
            onPress={() => {
              setSearching((s) => !s);
              setQ('');
            }}
            label="Tìm hoá đơn"
          />
        </Row>
        {searching ? <Field autoFocus placeholder="Tìm theo khách, tên món…" value={q} onChangeText={setQ} /> : null}
        <Chips<Period>
          value={period}
          onChange={setPeriod}
          options={[
            { key: 'all', label: 'Tất cả' },
            { key: 'today', label: 'Hôm nay' },
            { key: 'yesterday', label: 'Hôm qua' },
            { key: 'week', label: '7 ngày' },
            { key: 'month', label: 'Tháng này' },
          ]}
        />
        <Row style={styles.summary}>
          <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
            {list.length} hoá đơn
          </T>
          <T w="extrabold" size={15} color={colors.primary}>
            {vnd(total)}
          </T>
        </Row>
      </View>
      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <EmptyState icon="alert-triangle" title="Không tải được hoá đơn" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(s) => String(s.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}
          initialNumToRender={12}
          renderItem={({ item, index }) => {
            const showDay = index === 0 || relDay(new Date(list[index - 1].soldAt)) !== relDay(new Date(item.soldAt));
            return (
              <>
                {showDay && period !== 'today' && period !== 'yesterday' ? (
                  <T w="bold" size={12} color={colors.faint} style={{ marginTop: 10, marginBottom: 6 }}>
                    {relDay(new Date(item.soldAt)).toUpperCase()}
                  </T>
                ) : null}
                <SaleCard sale={item} />
              </>
            );
          }}
          ListEmptyComponent={
            <EmptyState icon="file-text" title="Chưa có hoá đơn" hint="Chọn Bán hàng để tạo đơn đầu tiên" />
          }
        />
      )}
    </View>
  );
}

function SaleCard({ sale }: { sale: SaleView }) {
  const voided = sale.saleStatus === 'VOIDED';
  return (
    <Pressable
      onPress={() => router.push(`/invoice/${sale.id}`)}
      style={({ pressed }) => [cardStyles.card, pressed && { opacity: 0.85 }, voided && { opacity: 0.55 }]}
    >
      <Row>
        <View style={cardStyles.icon}>
          <Feather name="shopping-bag" size={17} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <T w="bold" size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
              {sale.customerName || 'Khách lẻ'}
            </T>
            {voided ? <Badge text="Đã huỷ" color={colors.muted} bg={colors.border} /> : null}
          </Row>
          <T size={12} color={colors.faint} numberOfLines={1} style={{ marginTop: 2 }}>
            {sale.items.map((i) => `${i.productName} x${i.quantity}`).join(', ')}
          </T>
        </View>
        <Feather name="chevron-right" size={18} color={colors.disabled} />
      </Row>
      <View style={cardStyles.sep} />
      <Row>
        <T size={12} color={colors.faint} style={{ flex: 1 }}>
          #{sale.id} · {relDay(new Date(sale.soldAt))} · {hhmm(new Date(sale.soldAt))}
        </T>
        <T
          w="extrabold"
          size={16}
          color={voided ? colors.faint : colors.primary}
          style={voided ? { textDecorationLine: 'line-through' } : undefined}
        >
          {vnd(sale.totalVnd)}
        </T>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 12, marginBottom: 6 },
});

const cardStyles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10, ...shadow(1) },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 10, borderStyle: 'dashed' },
});
