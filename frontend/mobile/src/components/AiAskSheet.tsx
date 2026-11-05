import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ChatMessage, ThoughtStep } from '../data/types';
import { agentApi, agentErrorMessage } from '../lib/agentApi';
import { followUpSuggestions, revenueSuggestions } from '../lib/aiSuggestions';
import { ApiError } from '../lib/api';
import { splitActions } from '../lib/chatMarkdown';
import { triggerFeedback } from '../lib/feedback';
import { ddmmyyyy, hhmm } from '../lib/format';
import { applyToolEvent } from '../lib/toolSteps';
import { colors } from '../theme';
import { ChatComposer } from './ChatComposer';
import { ChatText, ScreenActions, StreamingChatText } from './ChatText';
import { ThoughtLine } from './ThoughtLine';
import { IconBtn, KEYBOARD_AVOID_BEHAVIOR, Row, T } from './ui';

/** Hàng gợi ý dưới thẻ tổng: chạm một gợi ý thì mở bảng hỏi trợ lý với đúng câu đó. */
export function AiSuggestions({ onAsk }: { onAsk: (question: string) => void }) {
  return (
    <View style={styles.strip}>
      <Image source={require('../../assets/voice/agent-default.png')} resizeMode="contain" style={styles.stripMascot} accessibilityLabel="Trợ lý Bobi" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stripChips}>
        {revenueSuggestions().map((q) => (
          <Pressable
            key={q}
            onPress={() => {
              triggerFeedback('selection');
              onAsk(q);
            }}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
            accessibilityRole="button"
            accessibilityLabel={`Hỏi trợ lý: ${q}`}
          >
            <Feather name="zap" size={13} color={colors.brand} />
            <T w="semibold" size={13} color={colors.brand} numberOfLines={1}>
              {q}
            </T>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

/**
 * Bảng hỏi trợ lý trượt từ dưới lên (như "Chat với Moni AI" của MoMo): mở là gửi ngay `question` qua cùng API với màn Trợ lý,
 * chữ trả lời hiện dần, dưới câu trả lời có gợi ý hỏi tiếp và ô hỏi thêm. Hội thoại được lưu như mọi hội thoại khác, xem lại
 * ở Trợ lý → Lịch sử. Lỗi AI hiện câu báo và trả câu hỏi về ô nhập (FR-021). `question` null là đóng.
 */
export function AiAskSheet({ question, onClose }: { question: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  // Mỗi lần mở là một phiên; câu trả lời của phiên đã đóng về muộn thì bỏ.
  const session = useRef(0);
  const [openedAt, setOpenedAt] = useState(() => new Date());
  // Mở màn hình từ nút trong câu trả lời thì bảng ẩn đi nhưng giữ hội thoại; quay lại màn này là bảng hiện lại
  // đúng đoạn chat đó, như màn Trợ lý vẫn còn trong ngăn điều hướng.
  const [parked, setParked] = useState(false);
  useFocusEffect(useCallback(() => setParked(false), []));
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [steps, setSteps] = useState<ThoughtStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState('');

  const send = async (q: string, conversation: number | null, mine: number) => {
    const message = q.trim();
    if (!message) return;
    const userMessage: ChatMessage = { id: `u${Date.now()}`, from: 'user', text: message };
    setMsgs((m) => [...m, userMessage]);
    setText('');
    setError(null);
    setTyping(true);
    let turnSteps: ThoughtStep[] = [];
    try {
      const reply = await agentApi.chatStream(
        { conversation_id: conversation, message },
        (t) => mine === session.current && setDraft(t),
        undefined,
        (event) => mine === session.current && setSteps((turnSteps = applyToolEvent(turnSteps, event))),
      );
      if (mine !== session.current) return;
      setConversationId(reply.conversation_id);
      setMsgs((m) => [...m, { id: `a${reply.message_id}`, from: 'ai', text: reply.answer }]);
    } catch (err) {
      if (mine !== session.current) return;
      if (err instanceof ApiError && err.code === 'conversation_not_found') setConversationId(null);
      setMsgs((m) => m.filter((x) => x.id !== userMessage.id));
      setText((current) => (current.trim() ? current : message));
      setError(agentErrorMessage(err));
    } finally {
      if (mine === session.current) {
        setDraft('');
        setSteps([]);
        setTyping(false);
      }
    }
  };

  // Mở với một câu hỏi: bắt đầu phiên mới và gửi ngay
  useEffect(() => {
    const mine = ++session.current;
    setMsgs([]);
    setConversationId(null);
    setError(null);
    setText('');
    setDraft('');
    setSteps([]);
    setTyping(false);
    if (question) {
      setOpenedAt(new Date());
      void send(question, null, mine);
    }
    // send đọc state qua tham số, chỉ chạy lại khi đổi câu hỏi
  }, [question]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [msgs, typing, draft]);

  const ask = (q: string) => {
    if (typing || !q.trim()) return;
    triggerFeedback('selection');
    void send(q, conversationId, session.current);
  };

  const asked = msgs.filter((m) => m.from === 'user').map((m) => m.text);
  const lastIsAnswer = msgs.length > 0 && msgs[msgs.length - 1].from === 'ai';

  // Hiện dần như `Sheet` (cài đặt trợ lý): kiểu "slide" kéo cả nền tối trượt lên theo bảng, chậm và nặng.
  return (
    <Modal visible={question !== null && !parked} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={KEYBOARD_AVOID_BEHAVIOR} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Đóng" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <Row style={styles.header}>
            <View style={styles.headerSide} />
            <T w="bold" size={17} color={colors.ink} style={styles.title} numberOfLines={1}>
              Hỏi Trợ lý Bobi
            </T>
            <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
              <IconBtn name="x" size={34} bg={colors.bg} onPress={onClose} label="Đóng" />
            </View>
          </Row>

          <ScrollView ref={scroll} style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <T size={12} color={colors.faint} style={styles.center}>
              {ddmmyyyy(openedAt)}, {hhmm(openedAt)}
            </T>
            <T size={12} color={colors.muted} style={[styles.center, styles.disclaimer]}>
              {/* Mỗi câu một dòng, để dòng không bị cắt giữa câu thứ hai. */}
              Bobi đọc số liệu của tiệm để trả lời và có thể nhầm.{'\n'}Hội thoại được lưu ở Trợ lý.
            </T>

            {/* Câu trả lời không có bong bóng nên khoảng cách giữa các tin do `gap` của khối này lo, không dựa vào lề bong bóng. */}
            <View style={styles.messages}>
              {msgs.map((m) => {
                if (m.from === 'user') {
                  return (
                    <View key={m.id} style={styles.userRow}>
                      <View style={styles.userBubble}>
                        <T size={14} color={colors.white} style={styles.userText}>
                          {m.text}
                        </T>
                      </View>
                    </View>
                  );
                }
                const reply = splitActions(m.text);
                return (
                  <View key={m.id}>
                    <ChatText text={reply.text} />
                    {reply.screens.length ? <ScreenActions screens={reply.screens} style={styles.actions} onOpen={() => setParked(true)} /> : null}
                  </View>
                );
              })}

              {typing ? <View>{draft ? <StreamingChatText text={splitActions(draft, true).text} /> : <ThoughtLine steps={steps} />}</View> : null}

              {error ? (
                <Row gap={6} style={styles.error}>
                  <Feather name="alert-circle" size={14} color={colors.red} />
                  <T size={13} color={colors.red} style={{ flex: 1 }}>
                    {error}
                  </T>
                </Row>
              ) : null}

              {lastIsAnswer && !typing ? (
                <View style={styles.followUps}>
                  {followUpSuggestions(asked).map((q) => (
                    <Pressable key={q} onPress={() => ask(q)} style={({ pressed }) => [styles.followUp, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel={`Hỏi tiếp: ${q}`}>
                      <T w="semibold" size={13.5} color={colors.brand}>
                        {q}
                      </T>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>

          {/* Cùng ô nhập với màn Trợ lý; không có nút sang màn Trợ lý vì từ đó không quay lại được bảng này. */}
          <View style={styles.composerWrap}>
            <ChatComposer value={text} onChangeText={setText} onSend={() => ask(text)} busy={typing} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  strip: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 10,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandTint,
  },
  stripMascot: { width: 28, height: 28 },
  stripChips: { gap: 8, paddingRight: 10 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.white,
  },
  pressed: { opacity: 0.72 },
  backdrop: { flex: 1, backgroundColor: 'rgba(26,25,22,0.44)', justifyContent: 'flex-end' },
  sheet: {
    height: '88%',
    backgroundColor: colors.white,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  grabber: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: 8 },
  header: { marginBottom: 6 },
  headerSide: { width: 40 },
  title: { flex: 1, textAlign: 'center' },
  // Vùng cuộn tràn ra mép bảng rồi thụt lề lại bên trong, để bóng của nút mở màn hình không bị cắt thẳng ở mép trái.
  body: { flex: 1, marginHorizontal: -16 },
  bodyContent: { paddingHorizontal: 16, paddingBottom: 20 },
  center: { textAlign: 'center' },
  disclaimer: { marginTop: 2, marginBottom: 20 },
  messages: { gap: 20 },
  userRow: { alignItems: 'flex-end' },
  userBubble: {
    maxWidth: '82%',
    backgroundColor: colors.brand,
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  userText: { lineHeight: 20.5 },
  // Nút mở màn hình cách chữ trả lời một khoảng, vì bóng tím của nút loang lên trên và che dòng cuối.
  actions: { marginTop: 14 },
  error: { alignItems: 'flex-start' },
  followUps: { alignItems: 'flex-end', gap: 10 },
  followUp: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    backgroundColor: colors.brandTint,
    maxWidth: '86%',
  },
  composerWrap: { paddingTop: 8 },
});
