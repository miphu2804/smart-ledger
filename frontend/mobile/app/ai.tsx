import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, IconBtn, Row, T } from '../src/components/ui';
import type { ChatMessage } from '../src/data/types';
import { normalizeText, vnd } from '../src/lib/format';
import { bestSellers, monthExpenses, summary } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, font } from '../src/theme';

const QUICK = [
  'Hôm nay bán được bao nhiêu?',
  'Món nào bán chạy nhất tuần này?',
  'Nên nhập thêm hàng gì?',
  'Tháng này lời bao nhiêu?',
  'Ai đang nợ tiền?',
];

/** Trợ lý AI — câu trả lời GIẢ LẬP tính từ dữ liệu mẫu trong app. */
export default function Ai() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [msgs, setMsgs] = useState<ChatMessage[]>([
    {
      id: 'hi',
      from: 'ai',
      text: `Chào ${app.user.name.split(' ').slice(-1)[0]}! Đây là trợ lý mô phỏng với dữ liệu mẫu của ${app.store.name}. Bạn muốn hỏi gì về việc buôn bán hôm nay?`,
    },
  ]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [msgs, typing]);

  const answer = (q: string): string => {
    const n = normalizeText(q);
    if (/no|thieu|chua tra/.test(n)) {
      const owing = app.debts.filter((d) => d.total > d.paid);
      if (!owing.length) return 'Hiện không có khách nào nợ 🎉';
      return `Đang có ${owing.length} khách nợ:\n${owing.map((d) => `• ${d.name}: ${vnd(d.total - d.paid)}`).join('\n')}\nBạn có thể nhắn nhắc nợ trong mục Sổ nợ.`;
    }
    if (/nhap|het hang|ton kho/.test(n)) {
      const low = app.products.filter((p) => p.tracked && p.stock <= 6);
      const top = bestSellers(app.invoices, 'week').slice(0, 3);
      return `Dữ liệu mẫu 7 ngày qua:\n${low.map((p) => `• ${p.name}: còn ${p.stock}, cần kiểm tra tồn`).join('\n') || '• Chưa có mặt hàng dưới ngưỡng cảnh báo'}\n\n${top.length ? `Bán chạy: ${top.map((t) => t.name).join(', ')}.` : 'Chưa có đơn đã chốt trong kỳ.'} Chưa đủ dữ liệu để tính số lượng cần nhập.`;
    }
    if (/chay|ban nhieu|top/.test(n)) {
      const top = bestSellers(app.invoices, 'week').slice(0, 5);
      return `Top 5 món bán chạy 7 ngày qua:\n${top.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} phần (${vnd(t.revenue)})`).join('\n')}`;
    }
    if (/loi|lai|chi phi/.test(n)) {
      const s = summary(app.invoices, app.products, 'month');
      const exp = monthExpenses(app.expenses, 0).reduce((a, e) => a + e.amount, 0);
      return `Tháng này:\n• Doanh thu: ${vnd(s.revenue)}\n• Lãi gộp (trừ giá vốn): ${vnd(s.profit)}\n• Chi phí khác: ${vnd(exp)}\n→ Ước tính còn lại: ${vnd(s.profit - exp)}\n(Số liệu tham khảo, dựa trên giá vốn bạn đã nhập.)`;
    }
    if (/hom qua/.test(n)) {
      const s = summary(app.invoices, app.products, 'yesterday');
      return `Hôm qua tiệm có ${s.count} đơn, doanh thu ${vnd(s.revenue)}.`;
    }
    if (/hom nay|bao nhieu|doanh thu/.test(n)) {
      const s = summary(app.invoices, app.products, 'today');
      const y = summary(app.invoices, app.products, 'yesterday');
      const comparison = y.revenue
        ? ` (${s.revenue >= y.revenue ? '+' : ''}${Math.round(((s.revenue - y.revenue) / y.revenue) * 100)}% so với hôm qua)`
        : '';
      return `Hôm nay tiệm có ${s.count} đơn, doanh thu ${vnd(s.revenue)}${comparison}. ${Math.round(s.voiceRatio * 100)}% đơn được tạo bằng giọng nói.`;
    }
    return 'Mình chưa hiểu câu hỏi này 😅. Bạn thử hỏi về doanh thu, món bán chạy, nhập hàng, lời lãi hoặc công nợ nhé.';
  };

  const send = (q: string) => {
    if (!q.trim()) return;
    setMsgs((m) => [...m, { id: `u${Date.now()}`, from: 'user', text: q.trim() }]);
    setText('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id: `a${Date.now()}`, from: 'ai', text: answer(q) }]);
    }, 700);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header
          title="Trợ lý AI"
          subtitle="Bản demo · trả lời từ dữ liệu mẫu"
          right={
            <View style={styles.badge}>
              <Feather name="star" size={16} color={colors.ink} />
            </View>
          }
        />
      </View>
      <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.from === 'user' ? styles.user : styles.ai]}>
            <T size={14} color={m.from === 'user' ? colors.white : colors.ink} style={{ lineHeight: 20 }}>
              {m.text}
            </T>
          </View>
        ))}
        {typing ? (
          <View style={[styles.bubble, styles.ai]}>
            <T size={14} color={colors.faint}>
              Đang xem sổ…
            </T>
          </View>
        ) : null}
      </ScrollView>
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 10 }}>
          {QUICK.map((q) => (
            <Pressable key={q} onPress={() => send(q)} style={styles.quick}>
              <T w="semibold" size={12} color={colors.ink}>
                {q}
              </T>
            </Pressable>
          ))}
        </ScrollView>
        <Row style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
            placeholder="Hỏi trợ lý…"
            placeholderTextColor={colors.faint}
            style={styles.input}
            returnKeyType="send"
          />
          <IconBtn
            name="send"
            bg={text.trim() ? colors.ink : colors.border}
            color={text.trim() ? colors.white : colors.muted}
            size={44}
            onPress={() => send(text)}
            label="Gửi"
          />
        </Row>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderBottomRightRadius: 5 },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 5 },
  bottom: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  quick: { backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, minHeight: 44, justifyContent: 'center' },
  inputRow: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border, borderRadius: 14, paddingLeft: 14, paddingRight: 6, minHeight: 52 },
  input: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.ink, height: '100%', outlineStyle: 'none' } as never,
});
