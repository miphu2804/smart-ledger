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
import { AgentAvatar } from '../src/components/AgentAvatar';
import { Dialog, EmptyState, Field, IconBtn, Row, Sheet, T } from '../src/components/ui';
import type { AgentConversationSummary, AgentConversationView, AgentMessageView, ChatMessage } from '../src/data/types';
import { agentApi } from '../src/lib/agentApi';
import { ApiError } from '../src/lib/api';
import { hhmm, relDay } from '../src/lib/format';
import { useApp } from '../src/store/AppStore';
import { colors, font, shadow } from '../src/theme';

// Trợ lý đọc hồ sơ tiệm, sản phẩm và đơn bán; chi phí và công nợ xem ở màn khác.
const QUICK = [
  { label: 'Gợi ý nhập hàng 7 ngày qua', icon: 'shopping-cart' },
  { label: 'Doanh thu 7 ngày qua?', icon: 'trending-up' },
  { label: 'Món nào sắp hết hàng?', icon: 'package' },
  { label: 'Năm món đắt nhất?', icon: 'award' },
  { label: 'Tiệm có bao nhiêu mặt hàng?', icon: 'grid' },
] as const;

/** Lỗi gửi tin → câu báo tiếng Việt. Câu đã gõ được trả lại ô nhập để gửi lại (FR-021, AC-011). */
function chatErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'timeout') return 'Trợ lý trả lời quá lâu nên đã dừng chờ.';
    if (err.code === 'network') return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.';
    if (err.code === 'ai_unavailable' || err.status === 503) return 'Trợ lý AI đang tạm lỗi hoặc quá tải.';
    if (err.code === 'conversation_not_found') return 'Cuộc trò chuyện cũ không còn. Gửi lại để bắt đầu cuộc mới.';
  }
  return 'Chưa gửi được tin nhắn cho trợ lý.';
}

/** Lỗi khi xem/đổi tên/xoá lịch sử → câu báo tiếng Việt. */
function historyErrorMessage(err: unknown, fallback = 'Chưa tải được lịch sử trò chuyện.'): string {
  if (err instanceof ApiError) {
    if (err.code === 'conversation_not_found') return 'Cuộc trò chuyện này không còn.';
    if (err.code === 'network') return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.';
    if (err.code === 'ai_unavailable' || err.status === 503) return 'Trợ lý AI đang tạm lỗi, thử lại sau.';
  }
  return fallback;
}

function welcome(name: string): ChatMessage {
  return { id: 'hi', from: 'ai', text: `Chào ${name.split(' ').slice(-1)[0]}! Bạn muốn hỏi gì về tiệm và hàng hoá?` };
}

function toChatMessage(m: AgentMessageView): ChatMessage {
  return { id: `${m.role === 'USER' ? 'u' : 'a'}${m.message_id}`, from: m.role === 'USER' ? 'user' : 'ai', text: m.content };
}

function conversationTitle(c: AgentConversationSummary): string {
  return c.title?.trim() || 'Cuộc trò chuyện chưa đặt tên';
}

function lastActive(iso: string): string {
  const d = new Date(iso);
  return `${relDay(d)} · ${hhmm(d)}`;
}

/** Trợ lý AI — gửi qua agentApi (Core `/api/v1/agent/chat`; khi bật mock thì mockCore trả lời giả). */
export default function Ai() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<ChatMessage[]>(() => [welcome(app.user.name)]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const startNew = () => {
    setConversationId(null);
    setMsgs([welcome(app.user.name)]);
    setError(null);
  };

  // Khoá đổi hội thoại khi đang chờ trả lời, kẻo câu trả lời cũ bị nối vào hội thoại vừa mở.
  const openHistory = () => {
    if (!typing) setHistoryOpen(true);
  };

  const showConversation = (view: AgentConversationView) => {
    setConversationId(view.conversation_id);
    setMsgs([welcome(app.user.name), ...view.messages.map(toChatMessage)]);
    setError(null);
    setHistoryOpen(false);
  };

  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [msgs, typing]);

  const send = async (q: string) => {
    const message = q.trim();
    if (!message || typing) return;
    const userMessage: ChatMessage = { id: `u${Date.now()}`, from: 'user', text: message };
    setMsgs((m) => [...m, userMessage]);
    setText('');
    setError(null);
    setTyping(true);
    try {
      const reply = await agentApi.chat({ conversation_id: conversationId, message });
      setConversationId(reply.conversation_id);
      setMsgs((m) => [...m, { id: `a${reply.message_id}`, from: 'ai', text: reply.answer }]);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'conversation_not_found') setConversationId(null);
      // Không mất câu đã gõ: gỡ bong bóng chưa gửi được và trả câu về ô nhập (trừ khi đã gõ câu khác).
      setMsgs((m) => m.filter((x) => x.id !== userMessage.id));
      setText((current) => (current.trim() ? current : message));
      setError(chatErrorMessage(err));
    } finally {
      setTyping(false);
    }
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
          <AgentAvatar emotion={typing ? 'idea' : 'happy'} size={40} badge />
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
          <IconBtn
            name="edit"
            label="Cuộc trò chuyện mới"
            color={typing ? colors.faint : colors.ink}
            onPress={() => !typing && startNew()}
          />
          <IconBtn name="clock" label="Lịch sử trò chuyện" color={typing ? colors.faint : colors.ink} onPress={openHistory} />
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
                  <AgentAvatar emotion={'default'} size={34} style={{ marginTop: 2 }} />
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
                accessibilityRole="button"
                accessibilityLabel={`Hỏi trợ lý: ${q.label}`}
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

        {error ? (
          <View style={styles.errorCard} accessibilityRole="alert">
            <View style={styles.errorHeader}>
              <Feather name="alert-circle" size={16} color={colors.red} />
              <T w="semibold" size={13} color={colors.ink} style={styles.errorText}>
                {error} Câu hỏi vẫn còn trong ô nhập để bạn gửi lại.
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Đóng thông báo lỗi"
                hitSlop={8}
                onPress={() => setError(null)}
              >
                <Feather name="x" size={16} color={colors.muted} />
              </Pressable>
            </View>
            <T size={12} color={colors.muted}>
              Trong lúc chờ, bạn có thể xem số liệu trực tiếp:
            </T>
            <View style={styles.errorActions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/analytics')}
                style={({ pressed }) => [styles.errorAction, pressed && styles.pressed]}
              >
                <Feather name="bar-chart-2" size={14} color={colors.primary} />
                <T w="semibold" size={12} color={colors.primary}>
                  Mở Phân tích
                </T>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/products')}
                style={({ pressed }) => [styles.errorAction, pressed && styles.pressed]}
              >
                <Feather name="package" size={14} color={colors.primary} />
                <T w="semibold" size={12} color={colors.primary}>
                  Mở Sản phẩm
                </T>
              </Pressable>
            </View>
          </View>
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

      <HistorySheet
        visible={historyOpen}
        activeId={conversationId}
        onClose={() => setHistoryOpen(false)}
        onOpen={showConversation}
        onActiveGone={startNew}
      />
    </KeyboardAvoidingView>
  );
}

/** Lịch sử trò chuyện: tải danh sách mỗi lần mở, mở/đổi tên/xoá hội thoại. */
function HistorySheet({
  visible,
  activeId,
  onClose,
  onOpen,
  onActiveGone,
}: {
  visible: boolean;
  activeId: number | null;
  onClose: () => void;
  onOpen: (view: AgentConversationView) => void;
  /** Hội thoại đang hiện trên màn chat đã bị xoá hoặc không còn. */
  onActiveGone: () => void;
}) {
  const [history, setHistory] = useState<AgentConversationSummary[] | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<AgentConversationSummary | null>(null);
  const [renameText, setRenameText] = useState('');
  const [deleting, setDeleting] = useState<AgentConversationSummary | null>(null);
  const [opening, setOpening] = useState<number | null>(null);

  const loadHistory = async () => {
    try {
      setHistory(await agentApi.listConversations());
    } catch (err) {
      setHistoryError(historyErrorMessage(err));
    }
  };

  useEffect(() => {
    if (!visible) return;
    setHistoryError(null);
    void loadHistory();
  }, [visible]);

  // Mỗi lần chỉ mở một hội thoại, kẻo phản hồi về sau ghi đè hội thoại người dùng bấm sau cùng.
  const openConversation = async (c: AgentConversationSummary) => {
    if (opening !== null) return;
    setOpening(c.conversation_id);
    setHistoryError(null);
    try {
      onOpen(await agentApi.getConversation(c.conversation_id));
    } catch (err) {
      setHistoryError(historyErrorMessage(err, 'Chưa mở được cuộc trò chuyện.'));
      const gone = err instanceof ApiError && err.code === 'conversation_not_found';
      if (gone && c.conversation_id === activeId) onActiveGone();
      void loadHistory();
    } finally {
      setOpening(null);
    }
  };

  const saveRename = async () => {
    const title = renameText.trim();
    if (!renaming || !title) return;
    const target = renaming;
    setRenaming(null);
    try {
      const updated = await agentApi.rename(target.conversation_id, title.slice(0, 255));
      setHistory((list) => list?.map((c) => (c.conversation_id === updated.conversation_id ? updated : c)) ?? null);
    } catch (err) {
      setHistoryError(historyErrorMessage(err, 'Chưa đổi tên được cuộc trò chuyện.'));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const target = deleting;
    setDeleting(null);
    try {
      await agentApi.remove(target.conversation_id);
      setHistory((list) => list?.filter((c) => c.conversation_id !== target.conversation_id) ?? null);
      if (target.conversation_id === activeId) onActiveGone();
    } catch (err) {
      setHistoryError(historyErrorMessage(err, 'Chưa xoá được cuộc trò chuyện.'));
    }
  };

  return (
    <Sheet visible={visible} onClose={onClose} title="Lịch sử trò chuyện">
      {historyError ? (
        <T size={13} color={colors.red} style={styles.historyError} accessibilityRole="alert">
          {historyError}
        </T>
      ) : null}
      {history === null && !historyError ? (
        <T size={13} color={colors.muted}>
          Đang tải…
        </T>
      ) : null}
      {history?.length === 0 ? (
        <EmptyState icon="message-circle" title="Chưa có cuộc trò chuyện" hint="Hỏi trợ lý một câu để bắt đầu." />
      ) : null}
      {history?.map((c) => (
        <View key={c.conversation_id} style={styles.historyRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Mở ${conversationTitle(c)}`}
            onPress={() => openConversation(c)}
            style={({ pressed }) => [styles.historyMain, pressed && styles.pressed]}
          >
            <T w="semibold" size={14} numberOfLines={1} color={c.conversation_id === activeId ? colors.primary : colors.ink}>
              {conversationTitle(c)}
            </T>
            <T size={12} color={colors.faint}>
              {opening === c.conversation_id ? 'Đang mở…' : lastActive(c.last_message_at)}
            </T>
          </Pressable>
          <IconBtn
            name="edit-2"
            size={36}
            bg={colors.bg}
            label={`Đổi tên ${conversationTitle(c)}`}
            onPress={() => {
              setRenameText(c.title ?? '');
              setRenaming(c);
            }}
          />
          <IconBtn
            name="trash-2"
            size={36}
            bg={colors.bg}
            color={colors.red}
            label={`Xoá ${conversationTitle(c)}`}
            onPress={() => setDeleting(c)}
          />
        </View>
      ))}

      {/* Dialog nằm trong Sheet: iOS không mở được Modal ngang hàng khi Sheet đang hiện. */}
      <Dialog
        visible={renaming !== null}
        icon="edit-2"
        title="Đổi tên cuộc trò chuyện"
        confirm="Lưu"
        cancel="Huỷ"
        onCancel={() => setRenaming(null)}
        onConfirm={saveRename}
      >
        <Field
          value={renameText}
          onChangeText={setRenameText}
          placeholder="Tên cuộc trò chuyện"
          maxLength={255}
          autoFocus
          style={styles.renameField}
        />
      </Dialog>

      <Dialog
        visible={deleting !== null}
        danger
        icon="trash-2"
        title={`Xoá "${deleting ? conversationTitle(deleting) : ''}"?`}
        message="Trợ lý sẽ không còn nhớ nội dung cuộc trò chuyện này."
        confirm="Xoá"
        onCancel={() => setDeleting(null)}
        onConfirm={confirmDelete}
      />
    </Sheet>
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
  errorCard: {
    gap: 6,
    marginBottom: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.redSoft,
  },
  errorHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  errorText: { flex: 1, lineHeight: 18 },
  errorActions: { flexDirection: 'row', gap: 8 },
  errorAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historyError: { marginBottom: 10 },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  historyMain: { flex: 1, gap: 2 },
  renameField: { marginTop: 14, marginBottom: 0 },
});
