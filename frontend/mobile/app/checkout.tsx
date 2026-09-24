import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { AddItemSheet } from '../src/components/AddItemSheet';
import { useToast } from '../src/components/brand';
import { FakeQR } from '../src/components/FakeQR';
import { Button, Card, Chips, EmptyState, Field, Header, IconName, Row, Screen, Stepper, T } from '../src/components/ui';
import type { LineItem, PayMethod } from '../src/data/types';
import { vnd } from '../src/lib/format';
import { itemsTotal, methodLabel } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, font } from '../src/theme';

const METHODS: { key: PayMethod; icon: IconName }[] = [
  { key: 'cash', icon: 'dollar-sign' },
  { key: 'transfer', icon: 'smartphone' },
  { key: 'debt', icon: 'book-open' },
];

export default function Checkout() {
  const app = useApp();
  const toast = useToast();
  const [items, setItems] = useState<LineItem[]>(app.draft?.items ?? []);
  const [method, setMethod] = useState<PayMethod>('cash');
  const [customer, setCustomer] = useState('');
  const [phone, setPhone] = useState('');
  const [given, setGiven] = useState<number | null>(null);
  const [edit, setEdit] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [doneId, setDoneId] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const total = itemsTotal(items);
  const change = given !== null ? given - total : 0;
  const quick = Array.from(new Set([total, Math.ceil(total / 50000) * 50000, Math.ceil(total / 100000) * 100000, 200000, 500000]))
    .filter((v) => v >= total)
    .slice(0, 4);

  if (doneId) return <Success id={doneId} total={total} method={method} change={method === 'cash' && given ? change : 0} />;

  if (!app.draft && !items.length) {
    return (
      <Screen>
        <Header title="Thanh toán" />
        <EmptyState icon="shopping-bag" title="Chưa có đơn để thanh toán" hint="Hãy nói hoặc chọn hàng trước" />
        <Button title="Bán hàng" icon="mic" variant="gold" onPress={() => router.replace('/voice')} />
      </Screen>
    );
  }

  const complete = () => {
    if (!items.length) return;
    if (method === 'debt' && !customer.trim()) {
      setErr('Nhập tên khách để ghi nợ');
      return;
    }
    if (method === 'cash' && given !== null && given < total) {
      setErr('Tiền khách đưa chưa đủ');
      return;
    }
    const id = app.createInvoice({
      items,
      customer,
      phone,
      method,
      source: app.draft?.source ?? 'manual',
      transcript: app.draft?.transcript,
    });
    setDoneId(id);
  };

  return (
    <Screen
      footer={
        <Row>
          <View style={{ flex: 1 }}>
            <T size={12} color={colors.faint}>
              Khách cần trả
            </T>
            <T w="extrabold" size={22} color={colors.primary}>
              {vnd(total)}
            </T>
          </View>
          <Button
            title={method === 'debt' ? 'Ghi nợ' : 'Hoàn tất'}
            icon="check"
            onPress={complete}
            disabled={!items.length}
            style={{ paddingHorizontal: 26 }}
          />
        </Row>
      }
    >
      <Header
        title="Thanh toán"
        subtitle={
          app.draft?.source === 'voice'
            ? 'Đơn tạo bằng giọng nói'
            : app.draft?.source === 'pos'
              ? 'Đơn chọn từ POS'
              : 'Đơn nhập tay'
        }
      />

      <Card>
        <Row style={{ marginBottom: 4 }}>
          <T w="bold" size={15} style={{ flex: 1 }}>
            Món trong đơn
          </T>
          <Pressable onPress={() => setEdit((e) => !e)} hitSlop={8}>
            <T w="bold" size={13} color={colors.primary}>
              {edit ? 'Xong' : 'Sửa'}
            </T>
          </Pressable>
        </Row>
        {items.map((it, idx) => (
          <Row key={`${it.productId ?? it.name}-${idx}`} style={styles.line}>
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>
                {it.name}
              </T>
              <T size={12} color={colors.faint}>
                {vnd(it.price)} × {it.qty}
              </T>
            </View>
            {edit ? (
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
        {edit ? (
          <Button title="Thêm món" icon="plus" variant="soft" small onPress={() => setAddOpen(true)} style={{ marginTop: 10 }} />
        ) : null}
        {app.draft?.transcript ? (
          <View style={styles.transcript}>
            <Feather name="mic" size={12} color={colors.primary} />
            <T size={12} color={colors.muted} style={{ flex: 1, fontStyle: 'italic' }}>
              “{app.draft.transcript}”
            </T>
          </View>
        ) : null}
      </Card>

      <T w="bold" size={15} style={{ marginTop: 20, marginBottom: 10 }}>
        Hình thức thanh toán
      </T>
      <Row>
        {METHODS.map((m) => {
          const on = m.key === method;
          return (
            <Pressable
              key={m.key}
              onPress={() => {
                setMethod(m.key);
                setErr('');
              }}
              style={[
                styles.method,
                on && styles.methodOn,
                on && m.key === 'debt' && { borderColor: colors.gold, backgroundColor: colors.goldSoft },
              ]}
            >
              <Feather name={m.icon} size={20} color={on ? (m.key === 'debt' ? colors.gold : colors.accentInk) : colors.faint} />
              <T w={on ? 'bold' : 'semibold'} size={12} color={on ? colors.ink : colors.muted} style={{ marginTop: 6 }}>
                {methodLabel[m.key]}
              </T>
            </Pressable>
          );
        })}
      </Row>

      <Card style={{ marginTop: 12 }}>
        {method === 'cash' ? (
          <>
            <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 8 }}>
              Khách đưa
            </T>
            <Chips
              scroll={false}
              value={given === null ? '' : String(given)}
              onChange={(k) => setGiven(Number(k))}
              options={quick.map((v) => ({ key: String(v), label: v === total ? 'Đủ tiền' : vnd(v) }))}
            />
            <Field
              label="Hoặc nhập số tiền khách đưa"
              placeholder="VD: 150.000"
              keyboardType="number-pad"
              maxLength={13}
              value={given === null ? '' : vnd(given, false)}
              onChangeText={(t) => {
                const digits = t.replace(/\D/g, '');
                setGiven(digits ? Number(digits) : null);
                setErr('');
              }}
              error={given !== null && change < 0 ? `Còn thiếu ${vnd(-change)}` : undefined}
              inputStyle={{ fontFamily: font.bold }}
              style={{ marginTop: 14, marginBottom: 0 }}
            />
            {given !== null ? (
              <Row style={{ marginTop: 14 }}>
                <T size={13} color={colors.muted} style={{ flex: 1 }}>
                  Tiền thối lại
                </T>
                <T w="extrabold" size={18} color={change >= 0 ? colors.green : colors.red}>
                  {vnd(Math.max(0, change))}
                </T>
              </Row>
            ) : (
              <T size={12} color={colors.faint} style={{ marginTop: 10 }}>
                Có thể bỏ qua nếu khách đưa đủ tiền
              </T>
            )}
          </>
        ) : null}
        {method === 'transfer' ? (
          <View style={{ alignItems: 'center' }}>
            <View style={styles.qr}>
              <FakeQR seed={`${total}-${items.length}`} size={170} />
            </View>
            <T w="bold" size={14} style={{ marginTop: 10 }}>
              {app.user.name.toUpperCase()}
            </T>
            <T size={12} color={colors.faint}>
              Vietcombank · 0123 456 789 (tài khoản mẫu)
            </T>
            <T w="extrabold" size={20} color={colors.primary} style={{ marginTop: 6 }}>
              {vnd(total)}
            </T>
            <T size={12} color={colors.faint} style={{ marginTop: 4, textAlign: 'center' }}>
              Mã QR minh hoạ — bản chính thức sẽ tạo VietQR thật
            </T>
          </View>
        ) : null}
        {method === 'debt' ? (
          <View>
            <T size={12} color={colors.gold} style={{ marginBottom: 10 }}>
              Đơn sẽ được ghi vào Sổ nợ của khách
            </T>
          </View>
        ) : null}
        <Field
          label={method === 'debt' ? 'Tên khách (bắt buộc)' : 'Tên khách (không bắt buộc)'}
          placeholder="VD: Chị Ba"
          value={customer}
          onChangeText={(t) => {
            setCustomer(t);
            setErr('');
          }}
          style={{ marginTop: method === 'cash' ? 16 : 12 }}
        />
        {method === 'debt' ? (
          <Field
            label="Số điện thoại"
            placeholder="09xx xxx xxx"
            keyboardType="phone-pad"
            value={phone}
            onChangeText={setPhone}
          />
        ) : null}
        {err ? (
          <T size={12} color={colors.red}>
            {err}
          </T>
        ) : null}
      </Card>

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(li) => {
          setItems((cur) => {
            const ex = cur.find((x) => x.productId === li.productId);
            return ex ? cur.map((x) => (x === ex ? { ...x, qty: x.qty + 1 } : x)) : [...cur, li];
          });
          toast(`Đã thêm ${li.name}`);
        }}
      />
    </Screen>
  );
}

function Success({ id, total, method, change }: { id: string; total: number; method: PayMethod; change: number }) {
  const toast = useToast();
  const scale = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 4, useNativeDriver: true }).start();
  }, [scale]);
  return (
    <Screen
      footer={
        <>
          <Button title="Tạo đơn mới" icon="mic" variant="gold" onPress={() => router.replace('/voice')} />
          <Row style={{ marginTop: 8 }}>
            <Button
              title="Xem hoá đơn"
              variant="outline"
              small
              style={{ flex: 1, height: 44 }}
              onPress={() => {
                // Bỏ các màn bán hàng (giọng nói / POS / thanh toán) khỏi stack để "quay lại" từ hoá đơn về trang chủ
                router.dismissTo('/(tabs)');
                router.push(`/invoice/${id}`);
              }}
            />
            <Button
              title="Về trang chủ"
              variant="outline"
              small
              style={{ flex: 1, height: 44 }}
              onPress={() => router.dismissTo('/(tabs)')}
            />
          </Row>
        </>
      }
    >
      <View style={{ alignItems: 'center', paddingTop: 70 }}>
        <Animated.View style={[styles.check, { transform: [{ scale }] }]}>
          <Feather name="check" size={46} color={colors.white} />
        </Animated.View>
        <T w="extrabold" size={24} style={{ marginTop: 22 }}>
          {method === 'debt' ? 'Đã ghi nợ!' : 'Đã lưu đơn!'}
        </T>
        <T w="extrabold" size={36} color={colors.primary} style={{ marginTop: 6 }}>
          {vnd(total)}
        </T>
        <T size={13} color={colors.muted} style={{ marginTop: 4 }}>
          {methodLabel[method]}
          {change > 0 ? ` · Thối lại ${vnd(change)}` : ''}
        </T>
        <Pressable onPress={() => toast('Chưa kết nối máy in. Vui lòng thử lại sau.', 'err')} style={styles.print}>
          <Feather name="printer" size={16} color={colors.green} />
          <T w="bold" size={13} color={colors.green}>
            In hoá đơn
          </T>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  transcript: { flexDirection: 'row', gap: 6, marginTop: 12, backgroundColor: colors.primaryTint, borderRadius: 10, padding: 10 },
  method: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  methodOn: { borderColor: colors.accent, backgroundColor: colors.primaryTint },
  qr: { padding: 12, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  check: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  print: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 24,
    backgroundColor: colors.greenSoft,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
});
