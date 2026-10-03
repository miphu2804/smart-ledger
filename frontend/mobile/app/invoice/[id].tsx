import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Button, Card, EmptyState, Header, LoadingState, Row, Screen, T } from '../../src/components/ui';
import type { SaleView } from '../../src/data/types';
import { errorMessage } from '../../src/lib/errors';
import { ddmm, hhmm, vnd } from '../../src/lib/format';
import { saleApi } from '../../src/lib/salesApi';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const [sale, setSale] = useState<SaleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const saleId = Number(id);

  const load = useCallback(async () => {
    if (!Number.isFinite(saleId)) {
      setError('Mã đơn không hợp lệ');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      setSale(await saleApi.getById(saleId));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [saleId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <Screen>
        <Header title="Đơn hàng" />
        <LoadingState label="Đang tải đơn…" />
      </Screen>
    );
  }

  if (error || !sale) {
    return (
      <Screen>
        <Header title="Đơn hàng" />
        <EmptyState icon="file-text" title="Không tìm thấy đơn" hint={error || undefined} />
        {error ? <Button title="Thử lại" variant="outline" onPress={load} /> : null}
      </Screen>
    );
  }

  const total = sale.totalVnd;
  const d = new Date(sale.soldAt);
  const cancelled = sale.saleStatus === 'VOIDED';

  return (
    <Screen>
      <Header title={`Đơn #${sale.id}`} subtitle={`${ddmm(d)}/${d.getFullYear()} · ${hhmm(d)}`} />

      {cancelled ? (
        <View style={styles.cancelled}>
          <Feather name="slash" size={15} color={colors.red} />
          <T w="bold" size={13} color={colors.red}>
            Đơn đã huỷ — không tính vào doanh thu
          </T>
        </View>
      ) : null}

      <Card style={styles.receipt}>
        <View style={{ alignItems: 'center', paddingBottom: 14 }}>
          <T w="extrabold" size={16}>
            {app.store.name}
          </T>
          <T size={12} color={colors.faint}>
            {app.store.address}
          </T>
        </View>
        <View style={styles.dash} />
        <Row style={{ marginTop: 12 }}>
          <T size={12} color={colors.muted} style={{ flex: 1 }}>
            Khách hàng
          </T>
          <T w="semibold" size={13}>
            {sale.customerName || 'Khách lẻ'}
          </T>
        </Row>
        {sale.customerPhone ? (
          <Row style={{ marginTop: 6 }}>
            <T size={12} color={colors.muted} style={{ flex: 1 }}>
              Số điện thoại
            </T>
            <T w="semibold" size={13}>
              {sale.customerPhone}
            </T>
          </Row>
        ) : null}
        <Row style={{ marginTop: 6, marginBottom: 12 }}>
          <T size={12} color={colors.muted} style={{ flex: 1 }}>
            Thanh toán
          </T>
          <Badge
            text={sale.paidVnd >= sale.totalVnd ? 'Đã thu đủ' : 'Chưa thu đủ'}
            color={sale.paidVnd >= sale.totalVnd ? colors.green : sale.paidVnd > 0 ? colors.gold : colors.red}
            bg={sale.paidVnd >= sale.totalVnd ? colors.greenSoft : sale.paidVnd > 0 ? colors.goldSoft : colors.redSoft}
          />
        </Row>
        <View style={styles.dash} />

        {sale.items.map((it) => (
          <Row key={it.id} style={{ paddingVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>
                {it.productName}
              </T>
              <T size={12} color={colors.faint}>
                {vnd(it.unitPriceVnd)} × {it.quantity}
              </T>
            </View>
            <T w="bold" size={14}>
              {vnd(it.lineTotalVnd)}
            </T>
          </Row>
        ))}
        <View style={styles.dash} />
        {sale.discountVnd > 0 ? (
          <Row style={{ marginTop: 12 }}>
            <T size={12} color={colors.muted} style={{ flex: 1 }}>
              Giảm giá
            </T>
            <T size={12} color={colors.muted}>
              -{vnd(sale.discountVnd)}
            </T>
          </Row>
        ) : null}
        <Row style={{ marginTop: 8 }}>
          <T w="bold" size={15} style={{ flex: 1 }}>
            Tổng cộng
          </T>
          <T w="extrabold" size={24} color={cancelled ? colors.faint : colors.primary}>
            {vnd(total)}
          </T>
        </Row>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  receipt: { paddingTop: 18 },
  dash: { borderBottomWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  cancelled: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.redSoft,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
});
