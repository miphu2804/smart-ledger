import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from 'react-native';
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
import type { CustomerView, DebtView, PaymentView } from '../src/data/types';
import { customerApi } from '../src/lib/customerApi';
import { debtApi } from '../src/lib/debtApi';
import { errorMessage } from '../src/lib/errors';
import { ddmm, hhmm, initials, relDay, vnd } from '../src/lib/format';
import { paymentApi } from '../src/lib/salesApi';
import { colors, shadow } from '../src/theme';

type F = 'open' | 'done' | 'all';

/** Nợ đã gắn tên/SĐT khách (join client-side — Core không trả kèm tên khách trong `/debts`) */
type DebtCard = DebtView & { name: string; phone: string };

export default function Debts() {
  const [debts, setDebts] = useState<DebtView[]>([]);
  const [customers, setCustomers] = useState<CustomerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<F>('open');
  const [openId, setOpenId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ds, cs] = await Promise.all([debtApi.list(), customerApi.list()]);
      setDebts(ds);
      setCustomers(cs);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const customerMap = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const list = useMemo<DebtCard[]>(
    () =>
      debts.map((d) => {
        const c = customerMap.get(d.customerId);
        return { ...d, name: c?.name ?? 'Khách lẻ', phone: c?.phone ?? '' };
      }),
    [debts, customerMap],
  );

  const owing = list.filter((d) => d.status === 'OPEN');
  const totalLeft = owing.reduce((a, d) => a + d.outstandingVnd, 0);
  const filtered = list.filter((d) =>
    filter === 'open' ? d.status === 'OPEN' : filter === 'done' ? d.status === 'SETTLED' : true,
  );
  const selected = list.find((d) => d.id === openId) ?? null;

  const updateDebt = (updated: DebtView) => setDebts((cur) => cur.map((d) => (d.id === updated.id ? updated : d)));

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

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </>
      ) : filtered.length ? (
        filtered.map((d) => {
          const l = d.outstandingVnd;
          const paid = d.originalVnd - d.outstandingVnd;
          const status = d.status === 'SETTLED' ? 'done' : paid > 0 ? 'partial' : 'unpaid';
          return (
            <Pressable
              key={d.id}
              onPress={() => setOpenId(d.id)}
              style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
            >
              <Row>
                <Tile
                  name={d.name}
                  text={initials(d.name)}
                  size={42}
                  palette={l > 0 ? [colors.redSoft, colors.red] : [colors.greenSoft, colors.green]}
                />
                <View style={{ flex: 1 }}>
                  <T w="bold" size={15}>
                    {d.name}
                  </T>
                  <T size={12} color={colors.faint}>
                    {d.phone || 'Chưa có SĐT'} · {relDay(new Date(d.createdAt))}
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
              {paid > 0 && l > 0 ? (
                <View style={{ marginTop: 10 }}>
                  <Progress value={paid / d.originalVnd} color={colors.green} track={colors.greenSoft} />
                </View>
              ) : null}
            </Pressable>
          );
        })
      ) : (
        <EmptyState icon="smile" title="Không có khoản nợ nào" hint="Khi thanh toán chọn “Ghi nợ”, khách sẽ hiện ở đây" />
      )}

      <DebtSheet debt={selected} onClose={() => setOpenId(null)} onRepay={updateDebt} />
    </Screen>
  );
}

function DebtSheet({
  debt,
  onClose,
  onRepay,
}: {
  debt: DebtCard | null;
  onClose: () => void;
  onRepay: (debt: DebtView) => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  useEffect(() => {
    setAmount('');
    if (!debt) {
      setPayments([]);
      return;
    }
    let cancelled = false;
    setHistoryLoading(true);
    paymentApi
      .listForSale(debt.saleId)
      .then((ps) => {
        if (!cancelled) setPayments(ps);
      })
      .catch(() => {
        if (!cancelled) setPayments([]);
      })
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debt?.id, debt?.saleId]);

  if (!debt)
    return (
      <Sheet visible={false} onClose={onClose}>
        {null}
      </Sheet>
    );

  const left = debt.outstandingVnd;
  const paidTotal = debt.originalVnd - debt.outstandingVnd;
  const num = parseInt(amount.replace(/\D/g, ''), 10) || 0;

  const pay = async (v: number) => {
    if (!v || v > left || busy) return;
    setBusy(true);
    try {
      const res = await debtApi.repay(debt.id, { amountVnd: v, paymentMethod: 'CASH' });
      onRepay(res.debt);
      setPayments((cur) => [...cur, res.payment]);
      setAmount('');
      toast(v >= left ? `${debt.name} đã trả hết nợ` : `Đã ghi nhận ${debt.name} trả ${vnd(v)}`);
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  // Dòng đầu là khoản nợ gốc (giờ tạo debt); các lần trả nợ thật (DEBT_REPAYMENT) nối sau — mới nhất lên trước
  const history = [
    { at: debt.createdAt, amount: debt.originalVnd, note: 'Ghi nợ ban đầu' },
    ...payments
      .filter((p) => p.type === 'DEBT_REPAYMENT')
      .map((p) => ({ at: p.receivedAt, amount: -p.amountVnd, note: 'Khách trả nợ' })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

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
            Tổng {vnd(debt.originalVnd)} · đã trả {vnd(paidTotal)}
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
              onPress={() => Linking.openURL(`sms:${debt.phone}`).catch(() => toast('Không thể mở ứng dụng tin nhắn', 'err'))}
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
              disabled={!num || num >= left || busy}
              loading={busy}
              onPress={() => pay(num)}
            />
            <Button title="Trả hết" small style={{ flex: 1, height: 44 }} disabled={busy} loading={busy} onPress={() => pay(left)} />
          </Row>
        </View>
      ) : (
        <View style={[styles.payBox, { backgroundColor: colors.greenSoft, alignItems: 'center' }]}>
          <Feather name="check-circle" size={26} color={colors.green} />
          <T w="bold" size={14} color={colors.green} style={{ marginTop: 6 }}>
            Khách đã trả đủ
          </T>
        </View>
      )}

      <T w="bold" size={14} style={{ marginTop: 18, marginBottom: 6 }}>
        Lịch sử
      </T>
      {historyLoading ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        history.map((h, i) => {
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
        })
      )}
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
