import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import {
  Badge,
  Button,
  Chips,
  EmptyState,
  Field,
  Header,
  IconBtn,
  Progress,
  Row,
  Screen,
  Sheet,
  T,
  Tile,
} from '../src/components/ui';
import type { Debt } from '../src/data/types';
import { ddmm, hhmm, relDay, vnd } from '../src/lib/format';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

type F = 'open' | 'done' | 'all';

export default function Debts() {
  const app = useApp();
  const [filter, setFilter] = useState<F>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const left = (d: Debt) => d.total - d.paid;
  const owing = app.debts.filter((d) => left(d) > 0);
  const totalLeft = owing.reduce((a, d) => a + left(d), 0);
  const list = app.debts.filter((d) => (filter === 'open' ? left(d) > 0 : filter === 'done' ? left(d) <= 0 : true));
  const selected = app.debts.find((d) => d.id === openId) ?? null;

  return (
    <Screen>
      <Header title="Quản lý nợ" subtitle="Theo dõi khách chưa thanh toán" />
      <View style={styles.hero}>
        <Row>
          <View style={{ flex: 1 }}>
            <T size={12} color={colors.muted}>
              Tổng còn nợ
            </T>
            <T w="extrabold" size={30} color={colors.gold}>
              {vnd(totalLeft)}
            </T>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <T size={12} color={colors.muted}>
              Số khách nợ
            </T>
            <T w="extrabold" size={26}>
              {owing.length}
            </T>
          </View>
        </Row>
      </View>

      <Chips<F>
        style={{ marginTop: 16, marginBottom: 12 }}
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'open', label: 'Chưa trả' },
          { key: 'done', label: 'Đã trả xong' },
          { key: 'all', label: 'Tất cả' },
        ]}
      />

      {list.length ? (
        list.map((d) => {
          const l = left(d);
          const status = l <= 0 ? 'done' : d.paid > 0 ? 'partial' : 'unpaid';
          return (
            <Pressable
              key={d.id}
              onPress={() => setOpenId(d.id)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <Row>
                <Tile
                  name={d.name}
                  text={d.name.split(' ').slice(-1)[0][0]}
                  size={42}
                  palette={l > 0 ? [colors.redSoft, colors.red] : [colors.greenSoft, colors.green]}
                />
                <View style={{ flex: 1 }}>
                  <T w="bold" size={15}>
                    {d.name}
                  </T>
                  <T size={12} color={colors.faint}>
                    {d.phone || 'Chưa có SĐT'} · {relDay(new Date(d.lastDate))}
                  </T>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <T w="extrabold" size={16} color={l > 0 ? colors.gold : colors.green}>
                    {vnd(Math.max(0, l))}
                  </T>
                  {status === 'unpaid' ? (
                    <Badge text="Chưa trả" color={colors.red} bg={colors.redSoft} />
                  ) : status === 'partial' ? (
                    <Badge text="Đã trả một phần" color={colors.gold} bg={colors.goldSoft} />
                  ) : (
                    <Badge text="Đã trả xong" color={colors.green} bg={colors.greenSoft} />
                  )}
                </View>
              </Row>
              {d.paid > 0 && l > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Progress value={d.paid / d.total} color={colors.green} track={colors.greenSoft} />
                </View>
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <EmptyState icon="smile" title="Không có khoản nợ nào" hint="Khi thanh toán chọn “Ghi nợ”, khách sẽ hiện ở đây" />
      )}

      <DebtSheet debt={selected} onClose={() => setOpenId(null)} />
    </Screen>
  );
}

function DebtSheet({ debt, onClose }: { debt: Debt | null; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const [amount, setAmount] = useState('');
  if (!debt)
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );
  const left = Math.max(0, debt.total - debt.paid);
  const num = parseInt(amount.replace(/\D/g, ''), 10) || 0;

  const pay = (v: number) => {
    app.payDebt(debt.id, v);
    setAmount('');
    toast(v >= left ? `${debt.name} đã trả hết nợ` : `Đã ghi nhận ${debt.name} trả ${vnd(v)}`);
  };

  return (
    <Sheet visible onClose={onClose} title={debt.name}>
      <Row>
        <View style={{ flex: 1 }}>
          <T size={12} color={colors.faint}>
            Còn nợ
          </T>
          <T w="extrabold" size={28} color={left ? colors.gold : colors.green}>
            {vnd(left)}
          </T>
          <T size={12} color={colors.faint}>
            Tổng {vnd(debt.total)} · đã trả {vnd(debt.paid)}
          </T>
        </View>
        {debt.phone ? (
          <Row gap={8}>
            <IconBtn
              name="phone"
              bg={colors.greenSoft}
              color={colors.green}
              onPress={() => Linking.openURL(`tel:${debt.phone}`).catch(() => {})}
              label="Gọi"
            />
            <IconBtn
              name="message-circle"
              bg={colors.primarySoft}
              color={colors.primary}
              onPress={() => toast(`Đã gửi tin nhắc nợ tới ${debt.phone} (giả lập)`)}
              label="Nhắc nợ"
            />
          </Row>
        ) : null}
      </Row>

      {left > 0 ? (
        <View style={styles.payBox}>
          <Field
            label="Khách trả (đ)"
            keyboardType="number-pad"
            placeholder={`Tối đa ${vnd(left)}`}
            value={amount}
            onChangeText={setAmount}
            style={{ marginBottom: 8 }}
          />
          <Row>
            <Button
              title="Trả một phần"
              variant="outline"
              small
              style={{ flex: 1, height: 44 }}
              disabled={!num || num >= left}
              onPress={() => pay(num)}
            />
            <Button title="Trả hết" small style={{ flex: 1, height: 44 }} onPress={() => pay(left)} />
          </Row>
        </View>
      ) : (
        <View style={[styles.payBox, { backgroundColor: colors.greenSoft, alignItems: 'center' }]}>
          <Feather name="check-circle" size={26} color={colors.green} />
          <T w="bold" size={14} color={colors.green} style={{ marginTop: 6 }}>
            Khách đã trả đủ
          </T>
          <Button
            title="Xoá khỏi sổ nợ"
            variant="ghost"
            small
            onPress={() => {
              app.removeDebt(debt.id);
              onClose();
            }}
          />
        </View>
      )}

      <T w="bold" size={14} style={{ marginTop: 18, marginBottom: 6 }}>
        Lịch sử
      </T>
      {debt.history.map((h, i) => {
        const d = new Date(h.at);
        const payment = h.amount < 0;
        return (
          <Row key={i} style={styles.hist}>
            <View style={[styles.histIcon, payment && { backgroundColor: colors.greenSoft }]}>
              <Feather
                name={payment ? 'arrow-down-left' : 'shopping-bag'}
                size={14}
                color={payment ? colors.green : colors.gold}
              />
            </View>
            <View style={{ flex: 1 }}>
              <T w="semibold" size={13}>
                {h.note}
              </T>
              <T size={12} color={colors.faint}>
                {ddmm(d)} · {hhmm(d)}
              </T>
            </View>
            <T w="bold" size={13} color={payment ? colors.green : colors.gold}>
              {payment ? '−' : '+'}
              {vnd(Math.abs(h.amount))}
            </T>
          </Row>
        );
      })}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 18, ...shadow(1) },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10, ...shadow(1) },
  payBox: { marginTop: 16, backgroundColor: colors.bg, borderRadius: 16, padding: 12 },
  hist: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  histIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: colors.goldSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
