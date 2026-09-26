import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
import type { ExpenseCategory } from '../src/data/types';
import { compact, ddmm, hhmm, vnd } from '../src/lib/format';
import { parseExpense } from '../src/lib/parseOrder';
import { monthExpenses, monthRevenue } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

export default function Expenses() {
  const app = useApp();
  const [month, setMonth] = useState(0);
  const [adding, setAdding] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const now = new Date();

  const months = [0, 1, 2, 3].map((m) => {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    return { m, label: `Th${d.getMonth() + 1}`, total: monthExpenses(app.expenses, m).reduce((a, e) => a + e.amount, 0) };
  });
  const list = monthExpenses(app.expenses, month);
  const total = list.reduce((a, e) => a + e.amount, 0);
  const revenue = monthRevenue(app.invoices, month);
  const byCat = useMemo(() => {
    const map: Record<string, number> = {};
    list.forEach((e) => (map[e.category] = (map[e.category] ?? 0) + e.amount));
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [list]);

  return (
    <Screen footer={<Button title="Thêm chi phí" icon="plus" onPress={() => setAdding(true)} />}>
      <Header title="Chi phí" subtitle="Các khoản chi đã ghi" />

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
              <View key={k} style={{ flex: v, backgroundColor: expenseCategoryMeta[k].color }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10 }}>
            {byCat.map(([k, v]) => (
              <Row key={k} gap={6}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: expenseCategoryMeta[k].color }} />
                <T size={12} color={colors.muted}>
                  {expenseCategoryMeta[k].label} · {Math.round((v / total) * 100)}%
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
            const meta = expenseCategoryMeta[e.category];
            const d = new Date(e.createdAt);
            return (
              <Pressable
                key={e.id}
                onLongPress={() => setDelId(e.id)}
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

      <AddExpenseSheet visible={adding} onClose={() => setAdding(false)} />
      <Dialog
        visible={!!delId}
        danger
        icon="trash-2"
        title="Xoá khoản chi này?"
        message="Khoản chi sẽ bị xoá khỏi sổ và báo cáo."
        confirm="Xoá"
        onCancel={() => setDelId(null)}
        onConfirm={() => {
          if (delId) app.deleteExpense(delId);
          setDelId(null);
        }}
      />
    </Screen>
  );
}

function AddExpenseSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { addExpense } = useApp();
  const toast = useToast();
  const [mode, setMode] = useState<'voice' | 'manual'>('voice');
  const [rec, setRec] = useState(false);
  const [heard, setHeard] = useState('');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [cat, setCat] = useState<ExpenseCategory>('nguyenlieu');
  const [sampleIdx, setSampleIdx] = useState(0);

  useEffect(() => {
    if (!visible) {
      setRec(false);
      setHeard('');
      setTitle('');
      setAmount('');
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
  const save = () => {
    addExpense({ title: title.trim(), amount: amt, category: cat, source: mode });
    toast(`Đã ghi chi phí ${vnd(amt)}`);
    onClose();
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
          <Button title="Lưu khoản chi" onPress={save} disabled={!title.trim() || !amt} style={{ marginTop: 16 }} />
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
