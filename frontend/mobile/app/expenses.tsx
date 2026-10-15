import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import {
  Button,
  Card,
  Chips,
  Dialog,
  EmptyState,
  Field,
  Header,
  LoadingState,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  T,
  Tile,
} from '../src/components/ui';
import { expenseCategoryMeta } from '../src/data/mock';
import type { Expense, ExpenseCategory, ExpenseView, SaleView } from '../src/data/types';
import { errorMessage } from '../src/lib/errors';
import { triggerFeedback } from '../src/lib/feedback';
import { compact, ddmm, hhmm, vnd } from '../src/lib/format';
import { expenseApi } from '../src/lib/expenseApi';
import { parseExpenseVoice } from '../src/lib/expenseVoiceParser';
import { useVoiceRecorder } from '../src/lib/speech/useVoiceRecorder';
import { saleApi } from '../src/lib/salesApi';
import { monthExpenses } from '../src/lib/stats';
import { colors } from '../src/theme';

/** Loại chi của dòng "Huỷ đơn": đơn bán tháng trước bị huỷ trong tháng, app tự thêm từ danh sách đơn (không có trong sổ chi) */
const CANCELLED_ORDER = 'huy_don';
const CANCELLED_ORDER_PREFIX = 'void-';

/** Thông tin hiển thị (nhãn/màu) của một loại chi — dùng cho cả key hợp lệ và chuỗi lạ (fallback) */
function catMeta(key: string) {
  if (key === CANCELLED_ORDER) return { label: 'Huỷ đơn', color: colors.red, bg: colors.redSoft };
  return expenseCategoryMeta[key] ?? { label: key, color: colors.muted, bg: colors.border };
}

/** Hai thời điểm có cùng tháng (giờ máy) không */
function sameMonth(a: Date, b: Date) {
  return a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

/** Đơn `soldAt` có rơi vào tháng cách hiện tại `offset` tháng không — dùng để lọc doanh thu theo tháng như `monthExpenses`. */
function inMonthOffset(iso: string, offset: number, now: Date) {
  const m = new Date(now.getFullYear(), now.getMonth() - offset, 1);
  const d = new Date(iso);
  return d.getMonth() === m.getMonth() && d.getFullYear() === m.getFullYear();
}

export default function Expenses() {
  const toast = useToast();
  const [month, setMonth] = useState(0);
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState<number | null>(null);
  const now = new Date();

  const [expenses, setExpenses] = useState<ExpenseView[]>([]);
  const [sales, setSales] = useState<SaleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [es, ss] = await Promise.all([expenseApi.list(), saleApi.list()]);
      setExpenses(es);
      setSales(ss);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // `monthExpenses`/`stats.ts` vẫn đọc dữ liệu mẫu (Expense) — đổ mảng thật vào cùng hình dạng đó.
  // `category` giữ nguyên chuỗi thô của Core (ép kiểu để khớp Expense.category, không đổi giá trị runtime)
  // nên chuỗi lạ vẫn hiện đúng qua `catMeta` phía dưới; Core chưa có trường `source` nên mặc định 'manual'.
  // Đơn bán tháng trước mà bị huỷ trong tháng này không trừ vào doanh thu tháng này (doanh thu chỉ tính đơn còn hiệu lực bán
  // trong tháng) mà hiện thành khoản chi "Huỷ đơn" của tháng huỷ, để chủ tiệm biết. Đơn bán và huỷ cùng tháng chỉ không còn
  // trong doanh thu. Đây là dòng app tự thêm, không có trong sổ chi của Core nên không xoá được.
  const mapped = useMemo<Expense[]>(
    () => [
      ...expenses.map((e) => ({
        id: String(e.id),
        title: e.description,
        amount: e.amountVnd,
        category: (e.category ?? 'khac') as ExpenseCategory,
        createdAt: e.expenseAt,
        source: 'manual' as const,
      })),
      ...sales
        .filter((s) => s.saleStatus === 'VOIDED' && s.voidedAt && !sameMonth(new Date(s.soldAt), new Date(s.voidedAt)))
        .map((s) => ({
          id: `${CANCELLED_ORDER_PREFIX}${s.id}`,
          title: `Huỷ đơn #${s.id}${s.customerName ? ` · ${s.customerName}` : ''}`,
          amount: s.totalVnd,
          category: CANCELLED_ORDER as ExpenseCategory,
          createdAt: s.voidedAt as string,
          source: 'manual' as const,
        })),
    ],
    [expenses, sales],
  );

  const months = [0, 1, 2, 3].map((m) => {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    return { m, label: `Th${d.getMonth() + 1}`, total: monthExpenses(mapped, m).reduce((a, e) => a + e.amount, 0) };
  });
  const list = monthExpenses(mapped, month).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const total = list.reduce((a, e) => a + e.amount, 0);
  // Doanh thu tính từ `saleApi.list()` (đơn đã xác nhận qua checkout thật), loại đơn đã huỷ — checkout không còn
  // ghi vào `app.invoices` (dữ liệu mẫu cũ) nên không thể lấy doanh thu từ đó nữa.
  const revenue = sales
    .filter((s) => s.saleStatus !== 'VOIDED' && inMonthOffset(s.soldAt, month, now))
    .reduce((a, s) => a + s.totalVnd, 0);
  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    list.forEach((e) => (map[e.category] = (map[e.category] ?? 0) + e.amount));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [list]);

  const removeExpense = async (id: number) => {
    try {
      await expenseApi.archive(id);
      setExpenses((cur) => cur.filter((e) => e.id !== id));
      triggerFeedback('success');
      toast('Đã xoá khoản chi');
    } catch (e) {
      triggerFeedback('error');
      toast(errorMessage(e), 'err');
    }
  };

  return (
    <Screen footer={<Button title="Thêm chi phí" icon="plus" onPress={() => setAdding(true)} />}>
      <Header title="Chi phí" subtitle="Các khoản chi đã ghi" />

      {loading ? (
        <LoadingState label="Đang tải chi phí…" />
      ) : error ? (
        <>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {months.map((m) => {
              const on = m.m === month;
              return (
                <Pressable
                  key={m.m}
                  onPress={() => setMonth(m.m)}
                  style={({ pressed }) => [styles.month, on && styles.monthOn, pressed && styles.monthPressed]}
                >
                  <T size={12} color={on ? colors.ink : colors.faint}>
                    {m.label}
                  </T>
                  <T w="extrabold" size={15} color={colors.ink}>
                    {compact(m.total)}
                  </T>
                </Pressable>
              );
            })}
          </ScrollView>

          <Card style={styles.hero}>
            <T size={12} color={colors.muted}>
              Chi phí {months[month].label}
            </T>
            <T w="extrabold" size={32}>
              {vnd(total)}
            </T>
            <View style={styles.heroSplit}>
              <View style={{ flex: 1 }}>
                <T size={12} color={colors.muted}>
                  Doanh thu
                </T>
                <T w="bold" size={14}>
                  {vnd(revenue)}
                </T>
              </View>
              <View style={{ flex: 1 }}>
                <T size={12} color={colors.muted}>
                  Thu − chi, chưa trừ vốn
                </T>
                <T w="bold" size={14}>
                  {vnd(revenue - total)}
                </T>
              </View>
            </View>
          </Card>

          {byCat.length ? (
            <Card style={{ marginTop: 12 }}>
              <T w="bold" size={14} style={{ marginBottom: 10 }}>
                Theo loại chi
              </T>
              <View style={styles.stack}>
                {byCat.map(([k, v]) => (
                  <View key={k} style={{ flex: v, backgroundColor: catMeta(k).color }} />
                ))}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
                {byCat.map(([k, v]) => (
                  <Row key={k} gap={6}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: catMeta(k).color }} />
                    <T size={12} color={colors.muted}>
                      {catMeta(k).label} · {Math.round((v / total) * 100)}%
                    </T>
                  </Row>
                ))}
              </View>
            </Card>
          ) : null}

          <SectionTitle title="Khoản chi" />
          <Card style={{ paddingVertical: 4 }}>
            {list.length ? (
              list.map((e, i) => {
                const meta = catMeta(e.category);
                const d = new Date(e.createdAt);
                const cancelledSaleId = e.id.startsWith(CANCELLED_ORDER_PREFIX) ? e.id.slice(CANCELLED_ORDER_PREFIX.length) : null;
                return (
                  <Pressable
                    key={e.id}
                    // Dòng "Huỷ đơn" mở đơn đó; khoản chi thật nhấn giữ để xoá
                    onPress={cancelledSaleId ? () => router.push(`/invoice/${cancelledSaleId}`) : undefined}
                    onLongPress={cancelledSaleId ? undefined : () => setDelId(Number(e.id))}
                    style={[styles.row, i < list.length - 1 && styles.rowBorder]}
                  >
                    <Tile name={e.title} palette={[meta.bg, meta.color]} size={40} />
                    <View style={{ flex: 1 }}>
                      <T w="semibold" size={14} numberOfLines={1}>
                        {e.title}
                      </T>
                      <Row gap={6}>
                        <T size={12} color={colors.faint}>
                          {ddmm(d)} · {hhmm(d)} · {meta.label}
                        </T>
                        {e.source === 'voice' ? <Feather name="mic" size={12} color={colors.primary} /> : null}
                      </Row>
                    </View>
                    <T w="bold" size={14} color={colors.red}>
                      -{vnd(e.amount)}
                    </T>
                  </Pressable>
                );
              })
            ) : (
              <EmptyState icon="credit-card" title="Chưa có khoản chi" hint="Ghi khoản chi để theo dõi chênh lệch ước tính" />
            )}
          </Card>
          <T size={12} color={colors.faint} style={{ textAlign: 'center', marginTop: 8, marginBottom: 70 }}>
            Nhấn giữ một khoản chi để xoá
          </T>
        </>
      )}

      <AddExpenseSheet visible={adding} onClose={() => setAdding(false)} onSaved={load} />
      <Dialog
        visible={delId != null}
        danger
        icon="trash-2"
        title="Xoá khoản chi này?"
        message="Khoản chi sẽ bị xoá khỏi sổ và báo cáo."
        confirm="Xoá"
        onCancel={() => setDelId(null)}
        onConfirm={() => {
          if (delId != null) removeExpense(delId);
          setDelId(null);
        }}
      />
    </Screen>
  );
}

function AddExpenseSheet({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [heard, setHeard] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<ExpenseCategory>('nguyenlieu');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const voice = useVoiceRecorder({
    onResult: (text) => {
      setHeard(text);
      const parsed = parseExpenseVoice(text);
      if (parsed.title) setTitle(parsed.title);
      if (parsed.amount) setAmount(String(parsed.amount));
      triggerFeedback('success');
      toast(parsed.amount ? `Đã nhận diện ${vnd(parsed.amount)}` : 'Đã nhận diện giọng nói');
    },
    onError: (msg) => {
      triggerFeedback('error');
      toast(msg, 'err');
    },
  });

  useEffect(() => {
    if (!visible) {
      voice.cancelRecording();
      setHeard('');
      setTitle('');
      setAmount('');
      setErr('');
    }
  }, [visible]);

  const toggleRecording = async () => {
    Keyboard.dismiss();
    if (voice.isRecording) {
      await voice.stopRecording();
    } else {
      triggerFeedback('selection');
      setHeard('');
      voice.startRecording();
    }
  };

  const amt = parseInt(amount.replace(/\D/g, ''), 10) || 0;
  const save = async () => {
    if (!title.trim() || !amt || busy) return;
    setErr('');
    setBusy(true);
    try {
      await expenseApi.create({
        description: title.trim(),
        amountVnd: amt,
        category: cat,
        paymentMethod: undefined,
        expenseAt: undefined,
      });
      triggerFeedback('success');
      toast(`Đã ghi chi phí ${vnd(amt)}`);
      onSaved();
      onClose();
    } catch (e) {
      triggerFeedback('error');
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Thêm chi phí">
      {/* Thanh trợ lý giọng nói thông minh - 1 chạm để nói */}
      <Pressable
        onPress={toggleRecording}
        accessibilityRole="button"
        accessibilityLabel={voice.isRecording ? 'Dừng nhận diện giọng nói' : 'Nhập chi phí bằng giọng nói'}
        style={({ pressed }) => [
          styles.voiceCard,
          voice.isRecording ? styles.voiceCardRecording : heard ? styles.voiceCardHeard : null,
          pressed && { opacity: 0.82 },
        ]}
      >
        <View
          style={[
            styles.voiceMicBtn,
            voice.isRecording
              ? styles.voiceMicBtnRecording
              : heard
                ? styles.voiceMicBtnHeard
                : null,
          ]}
        >
          <Feather
            name={voice.isRecording ? 'square' : 'mic'}
            size={18}
            color={voice.isRecording ? colors.white : heard ? colors.brand : colors.white}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            {voice.isRecording ? <View style={styles.voiceDot} /> : null}
            <T
              w="bold"
              size={13}
              color={voice.isRecording ? colors.red : heard ? colors.green : colors.brand}
            >
              {voice.isRecording
                ? 'Đang nghe bạn nói...'
                : heard
                  ? 'Đã tự động điền'
                  : 'Nói để điền nhanh'}
            </T>
          </Row>
          <T
            size={12}
            color={voice.isRecording ? colors.ink : heard ? colors.inkSecondary : colors.muted}
            numberOfLines={1}
          >
            {voice.partialText
              ? `“${voice.partialText}”`
              : heard
                ? `“${heard}”`
                : 'Chạm để nói (VD: “Mua 2 cây đá 20k”)'}
          </T>
        </View>
        {voice.isRecording ? (
          <View style={[styles.voicePill, styles.voicePillRecording]}>
            <T w="bold" size={12} color={colors.white}>
              Dừng
            </T>
          </View>
        ) : heard ? (
          <Row gap={4} style={styles.voicePill}>
            <Feather name="rotate-ccw" size={11} color={colors.brand} />
            <T w="bold" size={12} color={colors.brand}>
              Nói lại
            </T>
          </Row>
        ) : (
          <View style={styles.voicePill}>
            <T w="bold" size={12} color={colors.brand}>
              Bấm nói
            </T>
          </View>
        )}
      </Pressable>

      <View style={{ marginTop: 6 }}>
        <Field
          label="Nội dung"
          placeholder="VD: Mua 2 cây đá"
          value={title}
          onChangeText={setTitle}
        />
        <Field
          label="Số tiền (đ)"
          placeholder="0"
          keyboardType="number-pad"
          value={amt ? amt.toLocaleString('vi-VN') : ''}
          onChangeText={setAmount}
        />
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          Loại chi
        </T>
        <Chips<ExpenseCategory>
          scroll={false}
          value={cat}
          onChange={setCat}
          options={Object.entries(expenseCategoryMeta).map(([k, v]) => ({
            key: k as ExpenseCategory,
            label: v.label,
          }))}
        />
        {err ? (
          <T size={12} color={colors.red} style={{ marginTop: 8 }}>
            {err}
          </T>
        ) : null}
        <Button
          title="Lưu khoản chi"
          onPress={save}
          disabled={!title.trim() || !amt || busy}
          loading={busy}
          style={{ marginTop: 16 }}
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  month: { width: 76, backgroundColor: colors.white, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border },
  monthOn: { backgroundColor: 'rgba(26,25,22,0.035)', borderColor: colors.ink },
  monthPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
  hero: { marginTop: 12, borderRadius: 22, padding: 18 },
  heroSplit: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  stack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  voiceCard: {
    backgroundColor: colors.brandTint,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  voiceCardRecording: {
    backgroundColor: colors.redSoft,
    borderColor: colors.red,
  },
  voiceCardHeard: {
    backgroundColor: '#F3FAF0',
    borderColor: '#C9E4B9',
  },
  voiceMicBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceMicBtnRecording: {
    backgroundColor: colors.red,
  },
  voiceMicBtnHeard: {
    backgroundColor: colors.brandSoft,
  },
  voicePill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: colors.brandSoft,
  },
  voicePillRecording: {
    backgroundColor: colors.red,
  },
  voiceDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.red,
  },
});
