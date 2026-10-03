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
import { AgentAvatar, type AgentEmotion } from '../src/components/AgentAvatar';
import { Header, Row, T } from '../src/components/ui';
import type { ChatMessage } from '../src/data/types';
import { normalizeText, vnd } from '../src/lib/format';
import { bestSellers, monthExpenses, summary } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, font, shadow } from '../src/theme';

type ExtendedChatMessage = ChatMessage & {
  emotion?: AgentEmotion;
};

const QUICK = [
  { label: 'Doanh thu hôm nay?', icon: 'trending-up' as const, emotion: 'happy' as const },
  { label: 'Món bán chạy tuần này', icon: 'award' as const, emotion: 'idea' as const },
  { label: 'Nên nhập thêm hàng gì?', icon: 'package' as const, emotion: 'question' as const },
  { label: 'Tháng này lời bao nhiêu?', icon: 'dollar-sign' as const, emotion: 'excited' as const },
  { label: 'Ai đang nợ tiền?', icon: 'users' as const, emotion: 'sorry' as const },
];

/** Trợ lý AI — Phân tích dữ liệu & giải đáp thông minh */
export default function Ai() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<AgentEmotion>('happy');
  const [msgs, setMsgs] = useState<ExtendedChatMessage[]>([
    {
      id: 'hi',
      from: 'ai',
      text: `Chào ${app.user.name.split(' ').slice(-1)[0]}! Mình là trợ lý Sổ Nghe Lời. Bạn muốn xem phân tích doanh thu, tồn kho hay công nợ hôm nay?`,
      emotion: 'happy',
    },
  ]);

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [msgs, typing]);

  const answer = (q: string): { text: string; emotion: AgentEmotion } => {
    const n = normalizeText(q);
    if (/no|thieu|chua tra/.test(n)) {
      const owing = app.debts.filter((d) => d.total > d.paid);
      if (!owing.length) {
        return { text: 'Tuyệt vời! Hiện tại không có công nợ nào đang mở.', emotion: 'happy' };
      }
      return {
        text: `Đang có ${owing.length} khách nợ:\n${owing.map((d) => `• ${d.name}: ${vnd(d.total - d.paid)}`).join('\n')}\n\nBạn có thể vào mục Công nợ để gửi nhắc nợ nhanh qua Zalo / SMS.`,
        emotion: 'sorry',
      };
    }
    if (/nhap|het hang|ton kho/.test(n)) {
      const low = app.products.filter((p) => p.tracked && p.stock <= 6);
      const top = bestSellers(app.invoices, 'week').slice(0, 3);
      return {
        text: `Trong 7 ngày qua:\n${low.map((p) => `• ${p.name}: còn ${p.stock} (cần kiểm tra kho)`).join('\n') || '• Chưa có mặt hàng nào dưới ngưỡng báo động'}\n\n${top.length ? `Món bán chạy: ${top.map((t) => t.name).join(', ')}.` : 'Chưa có đơn đã chốt trong kỳ.'}`,
        emotion: 'idea',
      };
    }
    if (/chay|ban nhieu|top/.test(n)) {
      const top = bestSellers(app.invoices, 'week').slice(0, 5);
      if (!top.length) {
        return { text: 'Chưa có đủ đơn hàng trong tuần để xếp hạng món bán chạy.', emotion: 'question' };
      }
      return {
        text: `Top ${top.length} món bán chạy 7 ngày qua:\n${top.map((t, i) => `${i + 1}. ${t.name} — ${t.qty} phần (${vnd(t.revenue)})`).join('\n')}`,
        emotion: 'excited',
      };
    }
    if (/loi|lai|chi phi/.test(n)) {
      const s = summary(app.invoices, app.products, 'month');
      const exp = monthExpenses(app.expenses, 0).reduce((a, e) => a + e.amount, 0);
      return {
        text: `Tháng này:\n• Doanh thu: ${vnd(s.revenue)}\n• Lãi gộp (trừ giá vốn): ${vnd(s.profit)}\n• Chi phí khác: ${vnd(exp)}\n→ Ước tính còn lại: ${vnd(s.profit - exp)}\n\n(Số liệu ước tính theo giá vốn bạn đã nhập trên hệ thống.)`,
        emotion: 'happy',
      };
    }
    if (/hom qua/.test(n)) {
      const s = summary(app.invoices, app.products, 'yesterday');
      return {
        text: `Hôm qua tiệm chốt được ${s.count} đơn hàng, tổng doanh thu đạt ${vnd(s.revenue)}.`,
        emotion: 'happy',
      };
    }
    if (/hom nay|bao nhieu|doanh thu/.test(n)) {
      const s = summary(app.invoices, app.products, 'today');
      const y = summary(app.invoices, app.products, 'yesterday');
      const comparison = y.revenue
        ? ` (${s.revenue >= y.revenue ? '+' : ''}${Math.round(((s.revenue - y.revenue) / y.revenue) * 100)}% so với hôm qua)`
        : '';
      return {
        text: `Hôm nay tiệm có ${s.count} đơn, doanh thu ${vnd(s.revenue)}${comparison}. Trong đó ${Math.round(s.voiceRatio * 100)}% đơn ghi nhanh bằng giọng nói.`,
        emotion: 'excited',
      };
    }
    return {
      text: 'Mình chưa hiểu rõ câu hỏi này. Bạn hãy thử bấm các gợi ý bên dưới hoặc hỏi về: doanh thu, món bán chạy, cảnh báo tồn kho, công nợ nhé!',
      emotion: 'question',
    };
  };

  const send = (q: string) => {
    const message = q.trim();
    if (!message || typing) return;
    setMsgs((m) => [...m, { id: `u${Date.now()}`, from: 'user', text: message }]);
    setText('');
    setTyping(true);
    setCurrentEmotion('idea');
    setTimeout(() => {
      const res = answer(message);
      setTyping(false);
      setCurrentEmotion(res.emotion);
      setMsgs((m) => [...m, { id: `a${Date.now()}`, from: 'ai', text: res.text, emotion: res.emotion }]);
    }, 650);
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.headerWrap, { paddingTop: insets.top + 4 }]}>
        <Row style={{ alignItems: 'center' }} gap={10}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={styles.backBtn}
            accessibilityLabel="Quay lại"
          >
            <Feather name="chevron-left" size={20} color={colors.ink} />
          </Pressable>
          <AgentAvatar emotion={currentEmotion} size={40} badge />
          <View style={{ flex: 1 }}>
            <T w="extrabold" size={17} color={colors.ink}>
              Trợ lý Sổ Nghe Lời
            </T>
            <Row gap={5} style={{ alignItems: 'center', marginTop: 1 }}>
              <View style={styles.onlineDot} />
              <T size={11.5} color={colors.muted}>
                Sẵn sàng giải đáp dữ liệu tiệm
              </T>
            </Row>
          </View>
        </Row>
      </View>

      <ScrollView
        ref={scroll}
        style={styles.chat}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.messages}>
          {msgs.map((m) => {
            const isUser = m.from === 'user';
            return (
              <View key={m.id} style={[styles.messageRow, isUser && styles.userMessageRow]}>
                {!isUser ? (
                  <AgentAvatar emotion={m.emotion ?? 'default'} size={34} style={{ marginTop: 2 }} />
                ) : null}
                <View style={[styles.bubble, isUser ? styles.userBubble : styles.assistantBubble]}>
                  {!isUser ? (
                    <Row style={styles.assistantBubbleHeader}>
                      <Row gap={3} style={{ alignItems: 'center' }}>
                        <View style={{ width: 2, height: 7, backgroundColor: colors.brand, borderRadius: 1 }} />
                        <View style={{ width: 2, height: 11, backgroundColor: colors.brand, borderRadius: 1 }} />
                        <View style={{ width: 2, height: 6, backgroundColor: colors.brand, borderRadius: 1 }} />
                        <T w="bold" size={11.5} color={colors.brand} style={{ marginLeft: 3 }}>
                          Trợ lý AI
                        </T>
                      </Row>
                    </Row>
                  ) : null}
                  <T size={13.5} color={isUser ? colors.white : colors.ink} style={styles.messageText}>
                    {m.text}
                  </T>
                </View>
              </View>
            );
          })}

          {typing ? (
            <View style={styles.messageRow}>
              <AgentAvatar emotion="idea" size={34} style={{ marginTop: 2 }} />
              <View style={[styles.bubble, styles.assistantBubble, styles.typingBubble]}>
                <T size={12.5} color={colors.muted}>
                  Đang phân tích số liệu…
                </T>
                <Feather name="more-horizontal" size={16} color={colors.brand} />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Suggestion Chips & Composer Bar (Đề xuất nằm ngay sát trên thanh nhập) */}
      <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        {!typing ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickChipsScroll}
            style={styles.quickChipsWrapper}
            keyboardShouldPersistTaps="handled"
          >
            {QUICK.map((q) => (
              <Pressable
                key={q.label}
                onPress={() => send(q.label)}
                style={({ pressed }) => [styles.quickChip, pressed && styles.pressed]}
              >
                <Feather name={q.icon} size={13} color={colors.brand} />
                <T w="semibold" size={12} color={colors.ink}>
                  {q.label}
                </T>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => send(text)}
            placeholder="Nhập câu hỏi cho trợ lý…"
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
            <Feather name="mic" size={18} color={colors.brand} />
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
            <Feather name="arrow-up" size={18} color={text.trim() && !typing ? colors.white : colors.muted} />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  headerWrap: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(0),
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.data.revenue,
  },
  chat: { flex: 1 },
  chatContent: {
    flexGrow: 1,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 16,
  },
  messages: { gap: 12 },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    width: '100%',
  },
  userMessageRow: {
    justifyContent: 'flex-end',
    alignSelf: 'flex-end',
  },
  bubble: {
    borderRadius: 18,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  assistantBubble: {
    flex: 1,
    minWidth: 0,
    maxWidth: '86%',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: 4,
    ...shadow(1),
  },
  assistantBubbleHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: colors.brand,
    borderBottomRightRadius: 4,
  },
  messageText: {
    lineHeight: 20.5,
    flexWrap: 'wrap',
  },
  typingBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    maxWidth: '75%',
  },
  pressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  quickChipsWrapper: {
    marginBottom: 7,
  },
  quickChipsScroll: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    gap: 6,
  },
  quickChip: {
    height: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(0),
  },
  composerWrap: {
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.borderLight,
  },
  composer: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 18,
    ...shadow(1),
  },
  input: {
    flex: 1,
    height: 40,
    paddingHorizontal: 10,
    fontFamily: font.medium,
    fontSize: 13.5,
    color: colors.ink,
    outlineStyle: 'none',
  } as never,
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voiceButton: {
    backgroundColor: colors.brandSoft,
  },
  sendButton: {
    backgroundColor: colors.brand,
  },
  sendDisabled: {
    backgroundColor: colors.brandSoft,
    opacity: 0.7,
  },
});
