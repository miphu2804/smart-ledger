import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Badge, Button, Chips, Field, Header, Row, Screen, Sheet, T, Tile, Toggle } from '../src/components/ui';
import { compact } from '../src/lib/format';
import { activeInvoices, invoiceTotal } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

const ROLES = ['Bán hàng', 'Thu ngân', 'Quản lý kho'];

export default function Staff() {
  const app = useApp();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState(ROLES[0]);

  const sales = useMemo(() => {
    const map: Record<string, { rev: number; count: number }> = {};
    activeInvoices(app.invoices, 'month').forEach((i) => {
      map[i.staffId] = map[i.staffId] ?? { rev: 0, count: 0 };
      map[i.staffId].rev += invoiceTotal(i);
      map[i.staffId].count++;
    });
    return map;
  }, [app.invoices]);

  return (
    <Screen>
      <Header title="Nhân viên" subtitle={`${app.staff.filter((s) => s.active).length} nhân viên hoạt động`} />
      {app.staff.map((s) => (
        <View key={s.id} style={[styles.card, !s.active && { opacity: 0.55 }]}>
          <Tile name={s.name} text={s.name.split(' ').slice(-1)[0][0]} size={42} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={14}>
              {s.name}
            </T>
            <Row gap={6} style={{ marginTop: 2 }}>
              <Badge
                text={s.role}
                color={s.role === 'Chủ tiệm' ? colors.gold : colors.primary}
                bg={s.role === 'Chủ tiệm' ? colors.goldSoft : colors.primarySoft}
              />
              <T size={12} color={colors.faint}>
                {sales[s.id]?.count ?? 0} đơn tháng này
              </T>
            </Row>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 6 }}>
            <T size={12} color={colors.faint}>
              Doanh thu
            </T>
            <T w="extrabold" size={14} color={colors.primary}>
              {compact(sales[s.id]?.rev ?? 0)} đ
            </T>
            {s.role !== 'Chủ tiệm' ? <Toggle value={s.active} onChange={() => app.toggleStaff(s.id)} /> : null}
          </View>
        </View>
      ))}
      <Pressable onPress={() => setOpen(true)} style={styles.add}>
        <Row gap={6}>
          <Feather name="plus" size={16} color={colors.primary} />
          <T w="bold" size={14} color={colors.primary}>
            Thêm nhân viên mới
          </T>
        </Row>
        <T size={12} color={colors.faint} style={{ marginTop: 3 }}>
          Giao ca, phân quyền, theo dõi doanh thu
        </T>
      </Pressable>

      <Sheet visible={open} onClose={() => setOpen(false)} title="Thêm nhân viên">
        <Field label="Họ tên" placeholder="VD: Phạm Minh Tú" value={name} onChangeText={setName} />
        <Field label="Số điện thoại" placeholder="09xx xxx xxx" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          Vai trò
        </T>
        <Chips scroll={false} value={role} onChange={setRole} options={ROLES.map((r) => ({ key: r, label: r }))} />
        <Button
          title="Thêm & gửi lời mời"
          style={{ marginTop: 16 }}
          disabled={!name.trim() || phone.replace(/\D/g, '').length < 9}
          onPress={() => {
            app.addStaff(name.trim(), role, phone);
            toast(`Đã gửi lời mời tới ${phone} (giả lập)`);
            setName('');
            setPhone('');
            setOpen(false);
          }}
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    marginBottom: 10,
    ...shadow(1),
  },
  add: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    marginTop: 4,
  },
});
