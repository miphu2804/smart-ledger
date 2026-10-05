import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '../../src/components/brand';
import {
  Badge,
  Button,
  Card,
  Chips,
  EmptyState,
  Field,
  Header,
  LoadingState,
  Row,
  Screen,
  Sheet,
  T,
  Toggle,
} from '../../src/components/ui';
import type { SaleRefundView, SaleView } from '../../src/data/types';
import { ApiError } from '../../src/lib/api';
import { errorMessage } from '../../src/lib/errors';
import { triggerFeedback } from '../../src/lib/feedback';
import { ddmm, hhmm, vnd } from '../../src/lib/format';
import { buildVoidRequest, refundMethodLabel, type RefundMethod, voidSummary } from '../../src/lib/saleVoid';
import { saleApi } from '../../src/lib/salesApi';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

type RefundChoice = RefundMethod | 'NONE';

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const toast = useToast();
  const [sale, setSale] = useState<SaleView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refund, setRefund] = useState<SaleRefundView | null>(null);
  // Biểu mẫu huỷ đơn
  const [voidOpen, setVoidOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [method, setMethod] = useState<RefundChoice>('NONE');
  const [reference, setReference] = useState('');
  const [voidErr, setVoidErr] = useState('');
  const [voiding, setVoiding] = useState(false);

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

  // Đơn đã huỷ và đã thu tiền thì có khoản hoàn để hiển thị; lỗi ở đây không ảnh hưởng việc xem đơn.
  const voided = sale?.saleStatus === 'VOIDED';
  const voidedPaid = (sale?.paidVnd ?? 0) > 0;
  useEffect(() => {
    let alive = true;
    if (voided && voidedPaid && Number.isFinite(saleId)) {
      saleApi
        .getRefund(saleId)
        .then((r) => alive && setRefund(r))
        .catch(() => alive && setRefund(null));
    } else {
      setRefund(null);
    }
    return () => {
      alive = false;
    };
  }, [voided, voidedPaid, saleId]);

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
  const needsRefundMethod = sale.paidVnd > 0;
  // Màn hình có thể được dùng lại cho đơn khác: không bao giờ hiện khoản hoàn của đơn khác.
  const shownRefund = refund && refund.saleId === sale.id ? refund : null;

  const openVoid = () => {
    setReason('');
    setRestock(true);
    setMethod('NONE');
    setReference('');
    setVoidErr('');
    setVoidOpen(true);
  };

  const submitVoid = async () => {
    if (voiding) return;
    const built = buildVoidRequest(sale, {
      reason,
      restockItems: restock,
      refundMethod: method === 'NONE' ? null : method,
      transferReference: reference,
    });
    if ('error' in built) {
      setVoidErr(built.error);
      return;
    }
    setVoiding(true);
    setVoidErr('');
    try {
      // Gửi kèm Idempotency-Key: mất mạng rồi bấm lại cùng nội dung thì Core không huỷ và hoàn tiền hai lần.
      const result = await saleApi.void(sale.id, built.body);
      setSale(result.sale);
      setRefund(result.refund);
      setVoidOpen(false);
      triggerFeedback('success');
      toast(voidSummary(result));
    } catch (e) {
      triggerFeedback('error');
      if (e instanceof ApiError && e.code === 'sale_already_voided') {
        // Đã huỷ ở lần gửi trước (hoặc ở máy khác): tải lại để thấy đúng trạng thái thay vì để người dùng thử lại.
        setVoidOpen(false);
        toast('Đơn này đã được huỷ trước đó');
        load();
      } else {
        setVoidErr(errorMessage(e));
      }
    } finally {
      setVoiding(false);
    }
  };

  return (
    <Screen footer={!cancelled ? <Button title="Huỷ đơn" icon="x-circle" variant="outline" onPress={openVoid} /> : undefined}>
      <Header title={`Đơn #${sale.id}`} subtitle={`${ddmm(d)}/${d.getFullYear()} · ${hhmm(d)}`} />

      {cancelled ? (
        <View style={styles.cancelled}>
          <Feather name="slash" size={15} color={colors.red} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={13} color={colors.red}>
              Đơn đã huỷ — không tính vào doanh thu
            </T>
            {shownRefund ? (
              <T size={12} color={colors.red} style={{ marginTop: 3 }}>
                Đã hoàn {vnd(shownRefund.amountVnd)} · {refundMethodLabel[shownRefund.refundMethod]}
                {shownRefund.transferReference ? ` · Mã GD ${shownRefund.transferReference}` : ''}
              </T>
            ) : null}
          </View>
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

      <Sheet visible={voidOpen} onClose={() => !voiding && setVoidOpen(false)} title={`Huỷ đơn #${sale.id}`}>
        <View style={styles.warn}>
          <T w="semibold" size={13}>
            Việc huỷ đơn không thể hoàn tác
          </T>
          <T size={12.5} color={colors.muted} style={{ marginTop: 4, lineHeight: 18 }}>
            {needsRefundMethod
              ? `Đơn đã thu ${vnd(sale.paidVnd)}: toàn bộ số này được ghi nhận hoàn lại cho khách. `
              : 'Đơn chưa thu đồng nào nên không có khoản hoàn. '}
            {sale.outstandingVnd > 0 ? `Phần còn nợ ${vnd(sale.outstandingVnd)} sẽ bị huỷ. ` : ''}
            Ứng dụng chỉ ghi nhận, không tự chuyển tiền cho khách.
          </T>
        </View>
        <Field
          label="Lý do huỷ đơn"
          placeholder="VD: Khách đổi ý"
          value={reason}
          onChangeText={(v) => {
            setReason(v);
            setVoidErr('');
          }}
          maxLength={500}
        />
        <Row style={{ marginBottom: 14 }}>
          <View style={{ flex: 1 }}>
            <T w="semibold" size={14}>
              Hoàn hàng về kho
            </T>
            <T size={12} color={colors.faint}>
              Cộng lại số lượng đã bán vào kho
            </T>
          </View>
          <Toggle value={restock} onChange={setRestock} />
        </Row>
        {needsRefundMethod ? (
          <>
            <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
              Hoàn tiền bằng
            </T>
            <Chips<RefundChoice>
              value={method}
              onChange={(m) => {
                setMethod(m);
                setVoidErr('');
              }}
              options={[
                { key: 'CASH', label: refundMethodLabel.CASH },
                { key: 'TRANSFER', label: refundMethodLabel.TRANSFER },
              ]}
              style={{ marginBottom: 12 }}
            />
            {method === 'TRANSFER' ? (
              <Field
                label="Mã giao dịch (không bắt buộc)"
                value={reference}
                onChangeText={setReference}
                maxLength={255}
                autoCapitalize="none"
              />
            ) : null}
          </>
        ) : null}
        {voidErr ? (
          <T size={13} color={colors.red} style={{ marginBottom: 10 }}>
            {voidErr}
          </T>
        ) : null}
        <Button title="Xác nhận huỷ đơn" variant="danger" loading={voiding} disabled={voiding} onPress={submitVoid} />
        <Button title="Không huỷ" variant="ghost" disabled={voiding} onPress={() => setVoidOpen(false)} style={{ marginTop: 8 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  receipt: { paddingTop: 18 },
  dash: { borderBottomWidth: 1.5, borderColor: colors.border, borderStyle: 'dashed' },
  warn: { backgroundColor: colors.goldSoft, borderRadius: 12, padding: 12, marginBottom: 14 },
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
