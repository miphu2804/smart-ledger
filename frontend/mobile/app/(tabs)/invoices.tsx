import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { InvoiceCard } from '../../src/components/InvoiceCard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Chips, EmptyState, Field, IconBtn, Row, T } from '../../src/components/ui';
import { normalizeText, relDay, vnd } from '../../src/lib/format';
import { inPeriod, invoiceTotal, Period } from '../../src/lib/stats';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

type Src = 'all' | 'voice' | 'pos' | 'manual' | 'debt' | 'cancelled';

export default function Invoices() {
  const { invoices } = useApp();
  const insets = useSafeAreaInsets();
  const { period: queryPeriod } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: Period = queryPeriod === 'yesterday' || queryPeriod === 'month' ? queryPeriod : 'today';
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [src, setSrc] = useState<Src>('all');
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (queryPeriod === 'today' || queryPeriod === 'yesterday' || queryPeriod === 'month') {
        setPeriod(queryPeriod);
      }
    }, [queryPeriod]),
  );

  const list = useMemo(() => {
    const nq = normalizeText(q);
    return invoices.filter((i) => {
      if (!inPeriod(i.createdAt, period)) return false;
      if (src === 'debt' && i.status !== 'debt') return false;
      if (src === 'cancelled' && i.status !== 'cancelled') return false;
      if (['voice', 'pos', 'manual'].includes(src) && i.source !== src) return false;
      if (nq) {
        const hay = normalizeText(`${i.code} ${i.customer} ${i.items.map((x) => x.name).join(' ')}`);
        if (!hay.includes(nq)) return false;
      }
      return true;
    });
  }, [invoices, period, src, q]);

  const total = list.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + invoiceTotal(i), 0);

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
        {searching ? <Field autoFocus placeholder="Tìm theo mã, khách, tên món…" value={q} onChangeText={setQ} /> : null}
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
        <Chips<Src>
          style={{ marginTop: 8 }}
          value={src}
          onChange={setSrc}
          options={[
            { key: 'all', label: 'Mọi loại' },
            { key: 'voice', label: '🎙 Đọc đơn AI' },
            { key: 'pos', label: 'POS' },
            { key: 'manual', label: 'Nhập tay' },
            { key: 'debt', label: 'Ghi nợ' },
            { key: 'cancelled', label: 'Đã huỷ' },
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
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 90 }}
        initialNumToRender={12}
        renderItem={({ item, index }) => {
          const showDay = index === 0 || relDay(new Date(list[index - 1].createdAt)) !== relDay(new Date(item.createdAt));
          return (
            <>
              {showDay && period !== 'today' && period !== 'yesterday' ? (
                <T w="bold" size={12} color={colors.faint} style={{ marginTop: 10, marginBottom: 6 }}>
                  {relDay(new Date(item.createdAt)).toUpperCase()}
                </T>
              ) : null}
              <InvoiceCard inv={item} />
            </>
          );
        }}
        ListEmptyComponent={
          <EmptyState icon="file-text" title="Chưa có hoá đơn" hint="Chọn Bán hàng để tạo đơn đầu tiên" />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summary: { marginTop: 12, marginBottom: 6 },
});
