import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AddItemSheet } from '../../src/components/AddItemSheet';
import { useToast } from '../../src/components/brand';
import { Badge, Button, Card, Dialog, EmptyState, Field, Header, Row, Screen, Stepper, T } from '../../src/components/ui';
import type { LineItem } from '../../src/data/types';
import { ddmm, hhmm, vnd } from '../../src/lib/format';
import { itemsTotal, methodLabel, sourceLabel } from '../../src/lib/stats';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

/** Tỉ lệ thuế MINH HOẠ — cần cấu hình theo quy định hiện hành cho từng ngành hàng. */
const TAX_RATE = 0.015;

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const app = useApp();
  const toast = useToast();
  const inv = app.invoices.find((i) => i.id === id);
  const [editing, setEditing] = useState(false);
  const [items, setItems] = useState<LineItem[]>(inv?.items ?? []);
  const [customer, setCustomer] = useState(inv?.customer ?? '');
  const [addOpen, setAddOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (!inv) {
    return (
      <Screen>
        <Header title="Hoá đơn" />
        <EmptyState icon="file-text" title="Không tìm thấy hoá đơn" />
      </Screen>
    );
  }

  const shown = editing ? items : inv.items;
  const total = itemsTotal(shown);
  const d = new Date(inv.createdAt);
  const staff = app.staff.find((s) => s.id === inv.staffId);
  const cancelled = inv.status === 'cancelled';

  return (
    <Screen
      footer={
        editing ? (
          <Row>
            <Button
              title="Huỷ sửa"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => {
                setItems(inv.items);
                setCustomer(inv.customer ?? '');
                setEditing(false);
              }}
            />
            <Button
              title="Lưu thay đổi"
              style={{ flex: 1 }}
              disabled={!items.length}
              onPress={() => {
                app.updateInvoice(inv.id, items, customer);
                setEditing(false);
                toast('Đã cập nhật hoá đơn');
              }}
            />
          </Row>
        ) : cancelled ? null : (
          <Row>
            <Button
              title="In"
              icon="printer"
              variant="green"
              style={{ flex: 1 }}
              onPress={() => toast('Đã gửi lệnh in (giả lập)')}
            />
            <Button
              title="Sửa"
              icon="edit-2"
              variant="outline"
              style={{ flex: 1 }}
              onPress={() => {
                setItems(inv.items);
                setEditing(true);
              }}
            />
            <Button title="Huỷ" icon="x-circle" variant="danger" style={{ flex: 1 }} onPress={() => setCancelOpen(true)} />
          </Row>
        )
      }
    >
      <Header title={`Hoá đơn ${inv.code}`} subtitle={`${ddmm(d)}/${d.getFullYear()} · ${hhmm(d)}`} />

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
          {editing ? null : (
            <T w="semibold" size={13}>
              {inv.customer}
            </T>
          )}
        </Row>
        {editing ? <Field value={customer} onChangeText={setCustomer} placeholder="Tên khách" style={{ marginTop: 8 }} /> : null}
        <Row style={{ marginTop: 6 }}>
          <T size={12} color={colors.muted} style={{ flex: 1 }}>
            Nguồn tạo
          </T>
          <Badge text={sourceLabel[inv.source]} icon={inv.source === 'voice' ? 'mic' : undefined} />
        </Row>
        <Row style={{ marginTop: 6 }}>
          <T size={12} color={colors.muted} style={{ flex: 1 }}>
            Thanh toán
          </T>
          <Badge
            text={methodLabel[inv.method]}
            color={inv.method === 'debt' ? colors.gold : colors.green}
            bg={inv.method === 'debt' ? colors.goldSoft : colors.greenSoft}
          />
        </Row>
        <Row style={{ marginTop: 6, marginBottom: 12 }}>
          <T size={12} color={colors.muted} style={{ flex: 1 }}>
            Nhân viên
          </T>
          <T w="semibold" size={13}>
            {staff?.name ?? '—'}
          </T>
        </Row>
        <View style={styles.dash} />

        {shown.map((it, idx) => (
          <Row key={`${it.productId ?? it.name}-${idx}`} style={{ paddingVertical: 10 }}>
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>
                {it.name}
              </T>
              <T size={12} color={colors.faint}>
                {vnd(it.price)} × {it.qty}
              </T>
            </View>
            {editing ? (
              <Stepper
                value={it.qty}
                onChange={(q) =>
                  setItems((cur) =>
                    q <= 0 ? cur.filter((_, i) => i !== idx) : cur.map((x, i) => (i === idx ? { ...x, qty: q } : x)),
                  )
                }
              />
            ) : (
              <T w="bold" size={14}>
                {vnd(it.price * it.qty)}
              </T>
            )}
          </Row>
        ))}
        {editing ? (
          <Button
            title="Thêm món"
            icon="plus"
            variant="soft"
            small
            onPress={() => setAddOpen(true)}
            style={{ marginBottom: 10 }}
          />
        ) : null}
        <View style={styles.dash} />
        <Row style={{ marginTop: 12 }}>
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

      {inv.transcript ? (
        <Card style={{ marginTop: 12 }}>
          <Row gap={6} style={{ marginBottom: 6 }}>
            <Feather name="mic" size={14} color={colors.primary} />
            <T w="bold" size={13} color={colors.primary}>
              Câu nói gốc
            </T>
          </Row>
          <T size={13} color={colors.muted} style={{ fontStyle: 'italic', lineHeight: 19 }}>
            “{inv.transcript}”
          </T>
        </Card>
      ) : null}

      {inv.method === 'debt' && !cancelled ? (
        <Pressable onPress={() => router.push('/debts')} style={styles.debt}>
          <Feather name="book-open" size={15} color={colors.gold} />
          <T w="semibold" size={12.5} color={colors.gold} style={{ flex: 1 }}>
            Đơn này đang được ghi nợ cho {inv.customer}
          </T>
        </Pressable>
      ) : null}

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(li) =>
          setItems((cur) => {
            const ex = cur.find((x) => x.productId === li.productId);
            return ex ? cur.map((x) => (x === ex ? { ...x, qty: x.qty + 1 } : x)) : [...cur, li];
          })
        }
      />
      <Dialog
        visible={cancelOpen}
        danger
        icon="x-circle"
        title="Huỷ hoá đơn này?"
        message="Hoá đơn vẫn được lưu để đối chiếu nhưng không tính vào doanh thu."
        confirm="Huỷ đơn"
        cancel="Giữ lại"
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          app.cancelInvoice(inv.id);
          setCancelOpen(false);
          toast('Đã huỷ hoá đơn');
        }}
      />
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
  debt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.goldSoft,
    borderRadius: 14,
    padding: 12,
  },
});
