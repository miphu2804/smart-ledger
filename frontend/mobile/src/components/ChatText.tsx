import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, font } from '../theme';
import { T } from './ui';

// Chỉ render hai dạng: `**đậm**` và dòng bắt đầu bằng "- " hoặc "* "; mọi ký hiệu markdown khác giữ nguyên chữ.
const BULLET = /^\s*[-*]\s+/;
// Cặp `**` không dính `*` khác nên `****` và `***x***` giữ nguyên chữ thay vì ghép sai cặp.
const BOLD = /(?<!\*)\*\*(?!\*)([^*]+)(?<!\*)\*\*(?!\*)/g;

function inline(line: string) {
  return line.split(BOLD).map((part, i) =>
    i % 2 ? (
      <Text key={i} style={{ fontFamily: font.bold }}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

/** Bỏ dòng trống liền nhau và bullet không có nội dung để bong bóng không thừa khoảng trống. */
function toLines(text: string) {
  const lines: { text: string; bullet: boolean; blank: boolean }[] = [];
  for (const raw of text.trim().split('\n')) {
    const bullet = BULLET.test(raw);
    const content = bullet ? raw.replace(BULLET, '') : raw;
    const blank = !content.trim();
    if (blank && (bullet || lines.at(-1)?.blank)) continue;
    lines.push({ text: content, bullet, blank });
  }
  return lines;
}

// Props chỉ là chuỗi nên memo giúp việc gõ ở ô nhập không parse lại mọi tin nhắn.
export const ChatText = React.memo(function ChatText({ text, color = colors.ink }: { text: string; color?: string }) {
  return (
    <View style={styles.wrap}>
      {toLines(text).map((line, i) =>
        line.blank ? (
          <View key={i} style={styles.gap} />
        ) : (
          <View key={i} style={line.bullet ? styles.bulletRow : undefined}>
            {line.bullet ? <T size={13.5} color={color} style={styles.dot}>•</T> : null}
            <T size={13.5} color={color} style={styles.line}>
              {inline(line.text)}
            </T>
          </View>
        ),
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexShrink: 1 },
  gap: { height: 8 },
  bulletRow: { flexDirection: 'row', gap: 6 },
  dot: { lineHeight: 20.5 },
  line: { lineHeight: 20.5, flexShrink: 1, flexWrap: 'wrap' },
});
