import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useToast } from '../../src/components/brand';
import { Badge, Button, Card, EmptyState, Header, Row, Screen, T } from '../../src/components/ui';
import type { SaleView } from '../../src/data/types';
import { errorMessage } from '../../src/lib/errors';
import { ddmm, hhmm, vnd } from '../../src/lib/format';
import { saleApi } from '../../src/lib/salesApi';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

/** Tỉ lệ thuế MINH HOẠ — cần cấu hình theo quy định hiện hành cho từng ngành hàng. */
const TAX_RATE = 0.015;

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const toast = useToast();
  const [sale, setSale] = useState<SaleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const saleId = Number(id);

  const load = useCallback(async () => {
    if (!Number.isFinite(saleId)) {
      setError('Mã hoá đơn không hợp lệ');
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
        <Header title="Hoá đơn" />
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (error || !sale) {
    return (
      <Screen>
        <Header title="Hoá đơn" />
        <EmptyState icon="file-text" title="Không tìm thấy hoá đơn" hint={error || undefined} />
        {error ? <Button title="Thử lại" variant="outline" onPress={load} /> : null}
      </Screen>
    );
  }

  const total = sale.totalVnd;
  const d = new Date(sale.soldAt);
  const cancelled = sale.saleStatus === 'VOIDED';
  const notSupported = () => toast('Chưa hỗ trợ — hoá đơn đã xác nhận không thể sửa/huỷ ở bản này', 'err');

  return (
    <Screen
      footer={
        cancelled ? null : (
          <>
            <Row>
              <Button
                title="In"
                icon="printer"
                variant="green"
                style={{ flex: 1 }}
                onPress={() => toast('Chưa kết nối máy in. Vui lòng thử lại sau.', 'err')}
              />
              <Button title="Sửa" icon="edit-2" variant="outline" style={{ flex: 1 }} disabled onPress={notSupported} />
              <Button title="Huỷ" icon="x-circle" variant="danger" style={{ flex: 1 }} disabled onPress={notSupported} />
            </Row>
            <T size={11} color={colors.faint} style={{ textAlign: 'center', marginTop: 8 }}>
              Chưa hỗ trợ sửa/huỷ hoá đơn đã xác nhận
            </T>
          </>
        )
      }
    >
      <Header title={`Hoá đơn #${sale.id}`} subtitle={`${ddmm(d)}/${d.getFullYear()} · ${hhmm(d)}`} />

      {cancelled ? (
        <View style={styles.cancelled}>
          <Feather name="slash" size={15} color={colors.red} />
          <T w="bold" size={13} color={colors.red}>
            Hoá đơn đã huỷ — không tính vào doanh thu
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
          <Badge text={sale.paidVnd >= sale.totalVnd ? 'Đã thanh toán đủ' : 'Chưa thanh toán đủ'} color={colors.green} bg={colors.greenSoft} />
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
          <T size={12} color={colors.muted} style={{ flex: 1 }}>
            Thuế ước tính 1,5% (tham khảo)
          </T>
          <T size={12} color={colors.muted}>
            {vnd(Math.round(total * TAX_RATE))}
          </T>
        </Row>
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
