import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Header, T } from '../src/components/ui';
import type { ChatMessage } from '../src/data/types';
import { normalizeText, vnd } from '../src/lib/format';
import { bestSellers, monthExpenses, summary } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, font } from '../src/theme';

const QUICK = [
  { label: 'Doanh thu hôm nay?', icon: 'trending-up' },
  { label: 'Món bán chạy tuần này', icon: 'award' },
  { label: 'Nên nhập thêm hàng gì?', icon: 'package' },
  { label: 'Tháng này lời bao nhiêu?', icon: 'dollar-sign' },
  { label: 'Ai đang nợ tiền?', icon: 'users' },
] as const;

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
      text: `Chào ${app.user.name.split(' ').slice(-1)[0]}! Bạn muốn hỏi gì về việc buôn bán hôm nay?`,
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
      return `Trong 7 ngày qua:\n${low.map((p) => `• ${p.name}: còn ${p.stock}, cần kiểm tra tồn`).join('\n') || '• Chưa có mặt hàng dưới ngưỡng cảnh báo'}\n\n${top.length ? `Bán chạy: ${top.map((t) => t.name).join(', ')}.` : 'Chưa có đơn đã chốt trong kỳ.'} Chưa đủ dữ liệu để tính số lượng cần nhập.`;
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
    const message = q.trim();
    if (!message || typing) return;
    setMsgs((m) => [...m, { id: `u${Date.now()}`, from: 'user', text: message }]);
    setText('');
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setMsgs((m) => [...m, { id: `a${Date.now()}`, from: 'ai', text: answer(message) }]);
    }, 700);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.headerWrap, { paddingTop: insets.top }]}>
        <Header title="Trợ lý AI" subtitle="Hỏi về doanh thu, hàng hoá và công nợ" />
      </View>

      <ScrollView
        ref={scroll}
        style={styles.chat}
        contentContainerStyle={[styles.chatContent, msgs.length === 1 && styles.welcomeContent]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.messages}>
          {msgs.map((m) => {
            const isUser = m.from === 'user';
            return (
              <View key={m.id} style={[styles.messageRow, isUser && styles.userMessageRow]}>
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                  {!isUser ? (
                    <T w="bold" size={10} color={colors.primary} style={styles.sender}>
                      TRỢ LÝ
                    </T>
                  ) : null}
                  <T size={14} color={isUser ? colors.white : colors.ink} style={styles.messageText}>
                    {m.text}
                  </T>
                </View>
              </View>
            );
          })}
          {typing ? (
            <View style={styles.messageRow}>
              <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
                <T size={13} color={colors.muted}>
                  Đang trả lời…
                </T>
                <Feather name="more-horizontal" size={17} color={colors.primary} />
              </View>
            </View>
          ) : null}
        </View>

        {msgs.length === 1 && !typing ? (
          <View style={styles.suggestionSection}>
            <T w="bold" size={11} color={colors.muted} style={styles.suggestionHeading}>
              CÂU HỎI GỢI Ý
            </T>
            <View style={styles.suggestionGrid}>
              {QUICK.map((q) => (
                <Pressable
                  key={q.label}
                  accessibilityRole="button"
                  accessibilityLabel={`Hỏi trợ lý: ${q.label}`}
                  onPress={() => send(q.label)}
                  style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
                >
                  <Feather name={q.icon} size={16} color={colors.primary} />
                  <T w="semibold" size={12} color={colors.ink} style={styles.suggestionText}>
                    {q.label}
                  </T>
                  <Feather name="arrow-up-right" size={14} color={colors.faint} />
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
            placeholder="Hỏi trợ lý…"
            placeholderTextColor={colors.faint}
            accessibilityLabel="Tin nhắn cho trợ lý"
            style={styles.input}
            returnKeyType="send"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Mở nhập bằng giọng nói"
            hitSlop={6}
            onPress={() => router.push('/voice')}
            style={({ pressed }) => [styles.actionButton, styles.voiceButton, pressed && styles.pressed]}
          >
            <Feather name="mic" size={19} color={colors.primary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Gửi tin nhắn"
            disabled={!text.trim() || typing}
            hitSlop={4}
            onPress={() => send(text)}
            style={({ pressed }) => [
              styles.actionButton,
              styles.sendButton,
              (!text.trim() || typing) && styles.sendDisabled,
              pressed && styles.pressed,
            ]}
          >
            <Feather name="arrow-up" size={20} color={text.trim() && !typing ? colors.white : colors.muted} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerWrap: { paddingHorizontal: 16 },
  chat: { flex: 1 },
  chatContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 16 },
  welcomeContent: { justifyContent: 'center' },
  messages: { gap: 12 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end' },
  userMessageRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '90%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11 },
  assistantBubble: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 5,
  },
  userBubble: { backgroundColor: colors.primary, borderBottomRightRadius: 5 },
  sender: { letterSpacing: 0.5, marginBottom: 4 },
  messageText: { lineHeight: 20 },
  typingBubble: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  suggestionSection: { marginTop: 24 },
  suggestionHeading: { letterSpacing: 0.7, marginBottom: 10, marginLeft: 2 },
  suggestionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: {
    width: '48%',
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  suggestionText: { flex: 1, lineHeight: 16 },
  pressed: { opacity: 0.72, transform: [{ scale: 0.98 }] },
  composerWrap: { paddingHorizontal: 16, paddingTop: 10, backgroundColor: colors.bg },
  composer: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    padding: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
  },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: 10,
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.ink,
    outlineStyle: 'none',
  } as never,
  actionButton: {
    width: 44,
    height: 44,
    borderWidth: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButton: { backgroundColor: 'transparent' },
  sendButton: { backgroundColor: colors.primary },
  sendDisabled: { backgroundColor: colors.border },
});
