import React, { useRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { colors, font, shadow } from '../theme';
import { SlingSendButton } from './SlingSendButton';
import { VoicePillButton } from './VoicePillButton';

interface ChatComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  /** Trợ lý đang trả lời: chưa gửi và chưa ghi âm được. */
  busy: boolean;
}

/** Ô nhập của trợ lý: gõ hoặc nói rồi gửi. Màn Trợ lý và bảng hỏi trợ lý dùng chung. */
export function ChatComposer({ value, onChangeText, onSend, busy }: ChatComposerProps) {
  const voiceBase = useRef<string | null>(null);

  // Chữ nói ra được đổ vào ô nhập, nối sau phần đã gõ; người dùng xem lại rồi bấm gửi.
  const dictate = (spoken: string, done = false) => {
    if (voiceBase.current === null) voiceBase.current = value.trim();
    const base = voiceBase.current;
    onChangeText(base && spoken ? `${base} ${spoken}` : base || spoken);
    if (done) voiceBase.current = null;
  };

  return (
    <View style={styles.composer}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSend}
        multiline
        numberOfLines={1}
        textAlignVertical="center"
        placeholder="Nhập câu hỏi cho trợ lý…"
        placeholderTextColor={colors.faint}
        accessibilityLabel="Tin nhắn cho trợ lý"
        style={styles.input}
        returnKeyType="send"
      />
      <VoicePillButton disabled={busy} onPartial={(t) => dictate(t)} onTranscript={(t) => dictate(t, true)} />
      <SlingSendButton disabled={!value.trim() || busy} onSend={onSend} />
    </View>
  );
}

const styles = StyleSheet.create({
  composer: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderWidth: 1,
    borderColor: colors.white,
    borderRadius: 30,
    ...shadow(2),
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 112,
    paddingHorizontal: 12,
    // Android tự đệm trên dưới cho TextInput, làm ô cao cố định cắt mất dấu tiếng Việt phía trên; bỏ đệm dọc
    paddingVertical: 0,
    // textAlignVertical chỉ có tác dụng trên Android; nơi khác đệm (minHeight - lineHeight) / 2 để chữ nằm giữa ô.
    ...(Platform.OS === 'android' ? null : { paddingVertical: 11 }),
    lineHeight: 20,
    fontFamily: font.medium,
    fontSize: 13.5,
    color: colors.ink,
    outlineStyle: 'none',
  } as never,
});
