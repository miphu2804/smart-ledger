import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import {
  Badge,
  Button,
  Chips,
  Dialog,
  EmptyState,
  Field,
  Header,
  IconBtn,
  LoadingState,
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
import { debtAgeDays, groupDebtsByCustomer, matchesDebtSearch, type DebtGroup } from '../src/lib/debtGroups';
import { errorMessage } from '../src/lib/errors';
import { triggerFeedback } from '../src/lib/feedback';
import { ddmm, hhmm, initials, relDay, vnd } from '../src/lib/format';
import { paymentApi } from '../src/lib/salesApi';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

type F = 'open' | 'done' | 'all';
type Method = 'CASH' | 'TRANSFER';

/** Nợ đã gắn tên/SĐT khách (join client-side — Core không trả kèm tên khách trong `/debts`) */
type DebtCard = DebtView & { name: string; phone: string };

/** Nợ từ chừng này ngày trở lên thì tô đỏ số ngày để chủ tiệm chú ý */
const LONG_DEBT_DAYS = 30;

const METHOD_LABEL: Record<Method, string> = { CASH: 'Tiền mặt', TRANSFER: 'Chuyển khoản' };

/** "nợ 12 ngày" / "nợ từ hôm nay" của khoản nợ đang mở cũ nhất */
function ageText(createdAt: string) {
  const days = debtAgeDays(createdAt);
  return days === 0 ? 'nợ từ hôm nay' : `nợ ${days} ngày`;
}

export default function Debts() {
  const [debts, setDebts] = useState<DebtView[]>([]);
  const [customers, setCustomers] = useState<CustomerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<F>('open');
  const [q, setQ] = useState('');
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
      // Bỏ nợ của đơn đã huỷ (VOIDED): dư nợ 0 nhưng không phải "đã trả", và khách không còn nợ khoản đó.
      debts.filter((d) => d.status !== 'VOIDED').map((d) => {
        const c = customerMap.get(d.customerId);
        return { ...d, name: c?.name ?? 'Khách lẻ', phone: c?.phone ?? '' };
      }),
    [debts, customerMap],
  );

  // Gộp theo khách: mỗi lần ghi nợ Core có thể tạo một khách mới, nên cùng SĐT là một khách (xem `customerKey`)
  const groups = useMemo(() => groupDebtsByCustomer(list), [list]);
  const owing = groups.filter((g) => g.openCount > 0);
  const totalLeft = owing.reduce((a, g) => a + g.outstandingVnd, 0);
  const openDebtCount = owing.reduce((a, g) => a + g.openCount, 0);
  const shown = useMemo<DebtGroup<DebtCard>[]>(
    () =>
      groups
        .filter((g) => matchesDebtSearch(g, q))
        .map((g) => ({
          ...g,
          debts: g.debts.filter((d) => (filter === 'open' ? d.status === 'OPEN' : filter === 'done' ? d.status === 'SETTLED' : true)),
        }))
        .filter((g) => g.debts.length > 0),
    [groups, q, filter],
  );
  const selected = list.find((d) => d.id === openId) ?? null;

  const updateDebt = (updated: DebtView) => setDebts((cur) => cur.map((d) => (d.id === updated.id ? updated : d)));

  return (
    <Screen>
      <Header title="Công nợ" subtitle="Các khoản khách chưa trả" />
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
              Khách đang nợ
            </T>
            <T w="extrabold" size={26}>
              {owing.length}
            </T>
            <T size={11.5} color={colors.faint}>
              {openDebtCount} khoản
            </T>
          </View>
        </Row>
      </View>

      <Field
        placeholder="Tìm tên hoặc SĐT khách"
        value={q}
        onChangeText={setQ}
        autoCorrect={false}
        returnKeyType="search"
        style={{ marginTop: 16, marginBottom: 0 }}
      />

      <Chips<F>
        style={{ marginTop: 10, marginBottom: 12 }}
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'open', label: 'Chưa trả' },
          { key: 'done', label: 'Đã trả xong' },
          { key: 'all', label: 'Tất cả' },
        ]}
      />

      {loading ? (
        <LoadingState label="Đang tải công nợ…" />
      ) : error ? (
        <>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </>
      ) : shown.length ? (
        shown.map((g) => <CustomerCard key={g.key} group={g} onOpen={setOpenId} />)
      ) : q.trim() ? (
        <EmptyState icon="search" title="Không tìm thấy khách" hint="Thử tên khác hoặc vài số cuối SĐT" />
      ) : (
        <EmptyState
          icon={filter === 'open' ? 'check-circle' : 'book-open'}
          tone={filter === 'open' ? 'success' : 'neutral'}
          title={filter === 'open' ? 'Không có công nợ đang mở' : filter === 'done' ? 'Chưa có khoản đã trả' : 'Chưa có công nợ'}
          hint={filter === 'open' ? 'Các khoản chưa trả sẽ hiện ở đây' : undefined}
        />
      )}

      <DebtSheet debt={selected} onClose={() => setOpenId(null)} onRepay={updateDebt} />
    </Screen>
  );
}

/** Một khách: tổng còn nợ, khoản nợ lâu nhất, và từng khoản (theo đơn) để bấm vào thu tiền. */
function CustomerCard({ group, onOpen }: { group: DebtGroup<DebtCard>; onOpen: (id: number) => void }) {
  const owing = group.outstandingVnd > 0;
  const age = group.oldestOpenAt ? debtAgeDays(group.oldestOpenAt) : 0;
  return (
    <View style={styles.card}>
      <Row>
        <Tile
          name={group.name}
          text={initials(group.name)}
          size={42}
          palette={owing ? [colors.redSoft, colors.red] : [colors.greenSoft, colors.green]}
        />
        <View style={{ flex: 1 }}>
          <T w="bold" size={15} numberOfLines={1}>
            {group.name}
          </T>
          <T size={12} color={colors.faint} numberOfLines={1}>
            {group.phone || 'Chưa có SĐT'}
            {group.oldestOpenAt ? (
              <T size={12} w={age >= LONG_DEBT_DAYS ? 'bold' : undefined} color={age >= LONG_DEBT_DAYS ? colors.red : colors.faint}>
                {' · '}
                {ageText(group.oldestOpenAt)}
              </T>
            ) : null}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {owing ? (
            <>
              <T w="extrabold" size={16} color={colors.gold}>
                {vnd(group.outstandingVnd)}
              </T>
              <T size={11.5} color={colors.faint}>
                {group.openCount} khoản chưa trả
              </T>
            </>
          ) : (
            <Badge text="Đã trả xong" color={colors.green} bg={colors.greenSoft} />
          )}
        </View>
      </Row>

      {group.debts.map((d) => {
        const left = d.outstandingVnd;
        const paid = d.originalVnd - left;
        return (
          <Pressable
            key={d.id}
            onPress={() => onOpen(d.id)}
            accessibilityRole="button"
            accessibilityLabel={`Khoản nợ đơn #${d.saleId} của ${group.name}, còn ${vnd(left)}`}
            style={({ pressed }) => [styles.debtRow, pressed && { opacity: 0.7 }]}
          >
            <View style={{ flex: 1 }}>
              <T w="semibold" size={13}>
                Đơn #{d.saleId} · {relDay(new Date(d.createdAt))}
              </T>
              {paid > 0 && left > 0 ? (
                <View style={{ marginTop: 6, marginRight: 12 }}>
                  <Progress value={paid / d.originalVnd} color={colors.green} track={colors.greenSoft} />
                </View>
              ) : (
                <T size={12} color={colors.faint}>
                  Tổng {vnd(d.originalVnd)}
                </T>
              )}
            </View>
            <View style={{ alignItems: 'flex-end', gap: 4 }}>
              <T w="bold" size={14} color={left > 0 ? colors.gold : colors.green}>
                {vnd(Math.max(0, left))}
              </T>
              {d.status === 'SETTLED' ? (
                <Badge text="Đã trả xong" color={colors.green} bg={colors.greenSoft} />
              ) : paid > 0 ? (
                <Badge text="Đã trả một phần" color={colors.gold} bg={colors.goldSoft} />
              ) : (
                <Badge text="Chưa trả" color={colors.red} bg={colors.redSoft} />
              )}
            </View>
            <Feather name="chevron-right" size={16} color={colors.faint} />
          </Pressable>
        );
      })}
    </View>
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
  const app = useApp();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<Method>('CASH');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [payments, setPayments] = useState<PaymentView[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Thu nợ hai bước: chọn "Trả một phần" (hiện ô nhập số tiền) hoặc "Trả đủ" (hỏi xác nhận rồi mới ghi)
  const [step, setStep] = useState<'choose' | 'partial'>('choose');
  const [confirmFull, setConfirmFull] = useState(false);

  useEffect(() => {
    setAmount('');
    setMethod('CASH');
    setReference('');
    setStep('choose');
    setConfirmFull(false);
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
      const ref = reference.trim();
      const res = await debtApi.repay(debt.id, {
        amountVnd: v,
        paymentMethod: method,
        ...(method === 'TRANSFER' && ref ? { transferReference: ref } : {}),
      });
      onRepay(res.debt);
      setPayments((cur) => [...cur, res.payment]);
      setAmount('');
      setReference('');
      setStep('choose');
      if (v >= left) triggerFeedback('success');
      toast(v >= left ? `${debt.name} đã trả hết nợ` : `Đã ghi nhận ${debt.name} trả ${vnd(v)} (${METHOD_LABEL[method].toLowerCase()})`);
    } catch (e) {
      triggerFeedback('error');
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  // Tin nhắc nợ soạn sẵn; iOS nối nội dung bằng "&", Android bằng "?"
  const remind = () => {
    const shop = app.store.name ? `${app.store.name} ` : '';
    const body = `Chào ${debt.name}, ${shop}xin nhắc khoản còn nợ ${vnd(left)} của đơn #${debt.saleId} ngày ${ddmm(new Date(debt.createdAt))}. Cảm ơn bạn!`;
    const sep = Platform.OS === 'ios' ? '&' : '?';
    Linking.openURL(`sms:${debt.phone}${sep}body=${encodeURIComponent(body)}`).catch(() =>
      toast('Không thể mở ứng dụng tin nhắn', 'err'),
    );
  };

  const openSale = () => {
    onClose();
    router.push(`/invoice/${debt.saleId}`);
  };

  // Dòng đầu là khoản nợ gốc (giờ tạo debt); các lần trả nợ thật (DEBT_REPAYMENT) nối sau — mới nhất lên trước
  const history = [
    { at: debt.createdAt, amount: debt.originalVnd, note: 'Ghi nợ ban đầu' },
    ...payments
      .filter((p) => p.type === 'DEBT_REPAYMENT')
      .map((p) => ({ at: p.receivedAt, amount: -p.amountVnd, note: `Khách trả nợ · ${METHOD_LABEL[p.paymentMethod]}` })),
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
            {left > 0 ? <IconBtn name="message-circle" bg={colors.primarySoft} color={colors.primary} onPress={remind} label="Nhắc nợ" /> : null}
          </Row>
        ) : null}
      </Row>

      <Pressable
        onPress={openSale}
        accessibilityRole="button"
        style={({ pressed }) => [styles.saleLink, pressed && { opacity: 0.7 }]}
      >
        <Feather name="file-text" size={15} color={colors.primary} />
        <T w="semibold" size={13} color={colors.primary} style={{ flex: 1 }}>
          Xem đơn #{debt.saleId} · {ddmm(new Date(debt.createdAt))}
        </T>
        <Feather name="chevron-right" size={16} color={colors.primary} />
      </Pressable>

      {left > 0 && step === 'choose' ? (
        <View style={styles.payBox}>
          <T w="semibold" size={13} color={colors.muted} style={{ marginBottom: 8 }}>
            Khách trả nợ
          </T>
          <Row>
            <Button
              title="Trả một phần"
              icon="edit-3"
              variant="outline"
              small
              style={{ flex: 1, height: 44 }}
              disabled={busy}
              onPress={() => setStep('partial')}
            />
            <Button
              title="Trả đủ"
              icon="check"
              small
              style={{ flex: 1, height: 44 }}
              disabled={busy}
              loading={busy}
              onPress={() => setConfirmFull(true)}
            />
          </Row>
        </View>
      ) : left > 0 ? (
        <View style={styles.payBox}>
          <Field
            label="Số tiền khách trả (đ)"
            keyboardType="number-pad"
            placeholder={`Còn nợ ${vnd(left)}`}
            value={amount}
            onChangeText={setAmount}
            autoFocus
            error={num > left ? `Nhiều hơn số còn nợ (${vnd(left)})` : undefined}
            style={{ marginBottom: 8 }}
          />
          <PayMethod method={method} onMethod={setMethod} reference={reference} onReference={setReference} />
          <Row>
            <Button
              title="Quay lại"
              variant="outline"
              small
              style={{ flex: 1, height: 44 }}
              disabled={busy}
              onPress={() => {
                setStep('choose');
                setAmount('');
              }}
            />
            <Button
              title={num && num <= left ? `Ghi nhận ${vnd(num)}` : 'Ghi nhận'}
              small
              style={{ flex: 1, height: 44 }}
              disabled={!num || num > left || busy}
              loading={busy}
              onPress={() => pay(num)}
            />
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
        <LoadingState label="Đang tải lịch sử…" compact />
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

      <Dialog
        visible={confirmFull}
        icon="check-circle"
        title="Khách trả đủ nợ?"
        message={`${debt.name} trả ${vnd(left)} cho đơn #${debt.saleId}. Khoản nợ này sẽ được ghi là đã trả xong.`}
        confirm="Xác nhận đã trả"
        cancel="Huỷ"
        onCancel={() => setConfirmFull(false)}
        onConfirm={() => {
          setConfirmFull(false);
          void pay(left);
        }}
      >
        <View style={{ marginTop: 14 }}>
          <PayMethod method={method} onMethod={setMethod} reference={reference} onReference={setReference} />
        </View>
      </Dialog>
    </Sheet>
  );
}

/** Cách khách trả (tiền mặt / chuyển khoản, kèm mã giao dịch tuỳ chọn), dùng chung cho trả một phần và trả đủ. */
function PayMethod({
  method,
  onMethod,
  reference,
  onReference,
}: {
  method: Method;
  onMethod: (m: Method) => void;
  reference: string;
  onReference: (r: string) => void;
}) {
  return (
    <>
      <Chips<Method>
        scroll={false}
        value={method}
        onChange={onMethod}
        options={[
          { key: 'CASH', label: METHOD_LABEL.CASH },
          { key: 'TRANSFER', label: METHOD_LABEL.TRANSFER },
        ]}
        style={{ marginBottom: 8 }}
      />
      {method === 'TRANSFER' ? (
        <Field
          placeholder="Mã giao dịch (không bắt buộc)"
          value={reference}
          onChangeText={onReference}
          maxLength={255}
          autoCapitalize="characters"
          style={{ marginBottom: 8 }}
        />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  hero: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 18, ...shadow(1) },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: 18, padding: 14, marginBottom: 10, ...shadow(1) },
  debtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 52,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  saleLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 44,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
  },
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
