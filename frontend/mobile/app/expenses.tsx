import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import {
  Button,
  Card,
  Chips,
  Dialog,
  EmptyState,
  Field,
  Header,
  Row,
  Screen,
  SectionTitle,
  Sheet,
  T,
  Tile,
} from '../src/components/ui';
import { expenseCategoryMeta, expenseVoiceSamples } from '../src/data/mock';
import type { Expense, ExpenseCategory, ExpenseView } from '../src/data/types';
import { errorMessage } from '../src/lib/errors';
import { compact, ddmm, hhmm, vnd } from '../src/lib/format';
import { expenseApi } from '../src/lib/expenseApi';
import { parseExpense } from '../src/lib/parseOrder';
import { monthExpenses, monthRevenue } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/** Thông tin hiển thị (nhãn/màu) của một loại chi — dùng cho cả key hợp lệ và chuỗi lạ (fallback) */
function catMeta(key: string) {
  return expenseCategoryMeta[key] ?? { label: key, color: colors.muted, bg: colors.border };
}

export default function Expenses() {
  const app = useApp();
  const toast = useToast();
  const [month, setMonth] = useState(0);
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState<number | null>(null);
  const now = new Date();

  const [expenses, setExpenses] = useState<ExpenseView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setExpenses(await expenseApi.list());
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
  const mapped = useMemo<Expense[]>(
    () =>
      expenses.map((e) => ({
        id: String(e.id),
        title: e.description,
        amount: e.amountVnd,
        category: (e.category ?? 'khac') as ExpenseCategory,
        createdAt: e.expenseAt,
        source: 'manual' as const,
      })),
    [expenses],
  );

  const months = [0, 1, 2, 3].map((m) => {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    return { m, label: `Th${d.getMonth() + 1}`, total: monthExpenses(mapped, m).reduce((a, e) => a + e.amount, 0) };
  });
  const list = monthExpenses(mapped, month);
  const total = list.reduce((a, e) => a + e.amount, 0);
  const revenue = monthRevenue(app.invoices, month);
  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    list.forEach((e) => (map[e.category] = (map[e.category] ?? 0) + e.amount));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [list]);

  const removeExpense = async (id: number) => {
    try {
      await expenseApi.archive(id);
      setExpenses((cur) => cur.filter((e) => e.id !== id));
    } catch (e) {
      toast(errorMessage(e), 'err');
    }
  };

  return (
    <Screen footer={<Button title="Thêm chi phí" icon="plus" onPress={() => setAdding(true)} />}>
      <Header title="Chi phí" subtitle="Các khoản chi đã ghi" />

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
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
                <Pressable key={m.m} onPress={() => setMonth(m.m)} style={[styles.month, on && styles.monthOn]}>
                  <T size={12} color={on ? colors.accentInk : colors.faint}>
                    {m.label}
                  </T>
                  <T w="extrabold" size={15} color={on ? colors.accentInk : colors.ink}>
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
                return (
                  <Pressable
                    key={e.id}
                    onLongPress={() => setDelId(Number(e.id))}
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
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const [rec, setRec] = useState(false);
  const [heard, setHeard] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<ExpenseCategory>('nguyenlieu');
  const [sampleIdx, setSampleIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!visible) {
      setRec(false);
      setHeard('');
      setTitle('');
      setAmount('');
      setErr('');
    }
  }, [visible]);

  const startRec = () => {
    const sample = expenseVoiceSamples[sampleIdx % expenseVoiceSamples.length];
    setSampleIdx((i) => i + 1);
    setRec(true);
    setHeard('');
    const words = sample.split(' ');
    words.forEach((_, i) => setTimeout(() => setHeard(words.slice(0, i + 1).join(' ')), 180 * (i + 1)));
    setTimeout(
      () => {
        setRec(false);
        const p = parseExpense(sample);
        setTitle(p.title);
        setAmount(String(p.amount));
        setCat(/điện|nước/i.test(sample) ? 'dien' : /mặt bằng/i.test(sample) ? 'matbang' : 'nguyenlieu');
      },
      180 * words.length + 500,
    );
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
      toast(`Đã ghi chi phí ${vnd(amt)}`);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Thêm chi phí">
      <Chips<'voice' | 'manual'>
        scroll={false}
        value={mode}
        onChange={setMode}
        options={[
          { key: 'voice', label: 'Nói', icon: 'mic' },
          { key: 'manual', label: 'Nhập tay', icon: 'edit-3' },
        ]}
      />
      {mode === 'voice' ? (
        <View style={styles.voiceBox}>
          <T
            w="semibold"
            size={14}
            style={{ textAlign: 'center', minHeight: 40, marginTop: 6 }}
            color={heard ? colors.ink : colors.faint}
          >
            {heard || 'Ví dụ: “Nhập bánh mì với nguyên liệu hết 850 nghìn”'}
          </T>
          <Button
            title={rec ? 'Đang áp dụng câu gợi ý…' : title ? 'Thử câu khác' : 'Dùng câu gợi ý'}
            icon="mic"
            variant="gold"
            onPress={startRec}
            disabled={rec}
            style={{ marginTop: 8 }}
          />
        </View>
      ) : null}
      {mode === 'manual' || title ? (
        <View style={{ marginTop: 14 }}>
          <Field label="Nội dung" placeholder="VD: Tiền điện tháng 9" value={title} onChangeText={setTitle} />
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
            options={Object.entries(expenseCategoryMeta).map(([k, v]) => ({ key: k as ExpenseCategory, label: v.label }))}
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
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  month: { width: 76, backgroundColor: colors.white, borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border },
  monthOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  hero: { marginTop: 12, borderRadius: 22, padding: 18 },
  heroSplit: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: colors.border },
  stack: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', gap: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  voiceBox: { marginTop: 14, backgroundColor: colors.white, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: colors.border },
});
