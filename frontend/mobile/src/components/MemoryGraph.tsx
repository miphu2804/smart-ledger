import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Text as SvgText } from 'react-native-svg';
import type { AgentMemoryItem } from '../data/types';
import { ddmmyyyy } from '../lib/format';
import { colors } from '../theme';
import { Button, Row, T } from './ui';

// Mỗi loại ghi nhớ một góc phần tư, theo thứ tự kim đồng hồ từ trên cùng.
const TYPES = [
  { key: 'preference', label: 'Sở thích' },
  { key: 'semantic', label: 'Thông tin' },
  { key: 'procedural', label: 'Cách làm' },
  { key: 'episodic', label: 'Sự kiện' },
] as const;
// Ghi nhớ không dùng quá số ngày này nằm ở vòng ngoài cùng và mờ đi.
const STALE_DAYS = 30;
// Bán kính (theo nửa cạnh khung) của đĩa "mới dùng", và của vòng giữ ghi nhớ đã cũ.
const RECENT_R = 0.6;
const STALE_R = 0.75;
const LABEL_CHARS = 16;
const DAY_MS = 86_400_000;

type Node = { item: AgentMemoryItem; x: number; y: number; r: number; stale: boolean };

/**
 * Bản đồ bộ nhớ dài hạn, theo "My Fish" của Sakana Chat: càng gần tâm là càng mới dùng, chấm càng to là
 * càng hay dùng, mỗi loại ghi nhớ một góc. Chạm một chấm để xem chi tiết; đường nối chỉ tới các ghi nhớ
 * sinh ra từ cùng một cuộc trò chuyện.
 */
export function MemoryGraph({
  items,
  onDelete,
  onOpenSource,
}: {
  items: AgentMemoryItem[];
  onDelete: (item: AgentMemoryItem) => void;
  onOpenSource: (conversationId: number) => void;
}) {
  const [size, setSize] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Chỉ tính lại khi danh sách hay khung đổi, để chạm chọn chấm không làm các chấm xê dịch.
  const nodes = useMemo(() => (size ? layout(items, size, Date.now()) : []), [items, size]);
  const selected = nodes.find((n) => n.item.id === selectedId) ?? null;
  const related = selected
    ? nodes.filter((n) => n !== selected && n.item.source_conversation_id === selected.item.source_conversation_id)
    : [];
  const c = size / 2;
  // Thẻ chi tiết trượt nhẹ lên mỗi khi đổi chấm được chọn.
  const slide = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [selectedId, slide]);
  const enter = { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }] };

  return (
    <View>
      <View style={styles.canvas} onLayout={(e) => setSize(e.nativeEvent.layout.width)}>
        {size ? (
          <Svg width={size} height={size}>
            {/* Đĩa nền là vùng "dùng trong STALE_DAYS ngày"; vòng mờ ngoài cùng giữ ghi nhớ đã lâu không dùng. */}
            <Circle cx={c} cy={c} r={c * RECENT_R} fill={colors.bg} />
            <Circle cx={c} cy={c} r={c * STALE_R} stroke={colors.border} strokeDasharray="3 5" fill="none" />
            {TYPES.map((t, i) => {
              const a = sectorAngle(i, 0.5);
              return (
                <SvgText
                  key={t.key}
                  x={c + Math.cos(a) * c * 0.9}
                  y={c + Math.sin(a) * c * 0.9 + 4}
                  fontSize={12}
                  fontWeight="bold"
                  fill={colors.ink}
                  textAnchor="middle"
                >
                  {t.label}
                </SvgText>
              );
            })}
            {selected
              ? related.map((n) => (
                  <Line
                    key={n.item.id}
                    x1={selected.x}
                    y1={selected.y}
                    x2={n.x}
                    y2={n.y}
                    stroke={colors.brand}
                    strokeWidth={1.5}
                  />
                ))
              : null}
            {nodes.map((n) => {
              const on = n === selected;
              return (
                <G key={n.item.id} onPress={() => setSelectedId(on ? null : n.item.id)}>
                  {/* Vùng chạm rộng hơn chấm để ngón tay chạm trúng chấm nhỏ. */}
                  <Circle cx={n.x} cy={n.y} r={Math.max(n.r, 16)} fill="transparent" />
                  <Circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r}
                    fill={on ? colors.brand : colors.white}
                    stroke={n.stale ? colors.faint : colors.brand}
                    strokeWidth={on ? 0 : 1.5}
                    opacity={n.stale && !on ? 0.5 : 1}
                  />
                  <SvgText
                    x={n.x + (n.x >= c ? n.r + 4 : -n.r - 4)}
                    y={n.y + 3.5}
                    fontSize={10}
                    fill={n.stale ? colors.faint : colors.ink}
                    textAnchor={n.x >= c ? 'start' : 'end'}
                  >
                    {shortLabel(n.item.content)}
                  </SvgText>
                </G>
              );
            })}
          </Svg>
        ) : null}
      </View>

      {/* Thẻ luôn giữ cùng chiều cao, có chọn hay không, để khung cài đặt không co giãn khi đổi chấm. */}
      <View style={styles.detail}>
        {selected ? (
          <Animated.View style={enter}>
            <T size={11.5} color={colors.muted}>
              {TYPES.find((t) => t.key === selected.item.memory_type)?.label ?? selected.item.memory_type}
            </T>
            <T w="bold" size={14.5} color={colors.ink} style={{ marginTop: 2 }} numberOfLines={2}>
              {selected.item.content}
            </T>
            <T size={12} color={colors.muted} style={{ marginTop: 6 }} numberOfLines={1}>
              {usage(selected.item)}
            </T>
            <Row gap={8} style={{ marginTop: 12 }}>
              <Button
                title="Mở hội thoại gốc"
                variant="soft"
                small
                onPress={() => onOpenSource(selected.item.source_conversation_id)}
              />
              <Button title="Xoá ghi nhớ" variant="danger" small onPress={() => onDelete(selected.item)} />
            </Row>
          </Animated.View>
        ) : (
          <T size={12.5} color={colors.muted}>
            Chạm một chấm trên bản đồ để xem và xoá ghi nhớ.
          </T>
        )}
      </View>
    </View>
  );
}

/** Vài chữ đầu của ghi nhớ làm nhãn cạnh chấm; đủ nội dung xem ở thẻ chi tiết. */
function shortLabel(text: string) {
  // Ghi nhớ hầu hết mở đầu bằng chủ ngữ "Chủ shop …", không giúp phân biệt nên bỏ khỏi nhãn.
  const content = text.replace(/^chủ (shop|tiệm|cửa hàng)\s+/i, '');
  return content.length > LABEL_CHARS ? `${content.slice(0, LABEL_CHARS).trimEnd()}…` : content;
}

function usage(item: AgentMemoryItem) {
  const remembered = `Nhớ từ ${ddmmyyyy(new Date(item.created_at))}`;
  if (!item.last_used_at) return `${remembered} · chưa dùng lần nào`;
  return `${remembered} · dùng ${item.use_count} lần, gần nhất ${ddmmyyyy(new Date(item.last_used_at))}`;
}

/** Góc (radian) tại vị trí `t` ∈ [0, 1] trong góc phần tư `i`; góc 0 bắt đầu ở hướng 12 giờ. */
function sectorAngle(i: number, t: number) {
  return -Math.PI / 2 + (i + t) * (Math.PI / 2);
}

function layout(items: AgentMemoryItem[], size: number, now: number): Node[] {
  const c = size / 2;
  const placed: Node[] = [];
  // Xếp theo id để chấm nào bị đẩy chỉ phụ thuộc các chấm cũ hơn, không đổi khi thêm ghi nhớ mới.
  [...items]
    .sort((x, y) => x.id - y.id)
    .forEach((item) => {
      const i = TYPES.findIndex((t) => t.key === item.memory_type);
      if (i < 0) return;
      const days = (now - new Date(item.last_used_at ?? item.created_at).getTime()) / DAY_MS;
      const recency = Math.min(Math.max(days, 0), STALE_DAYS) / STALE_DAYS;
      // Góc lấy từ id nên mỗi ghi nhớ giữ chỗ cố định khi ghi nhớ khác được thêm hay xoá;
      // chừa mép góc phần tư để chấm không đè lên ranh giới nhóm.
      const a = sectorAngle(i, 0.12 + 0.76 * spread(item.id));
      // Chừa khoảng giữa để các chấm không dồn vào tâm; ghi nhớ đã cũ nằm trên vòng ngoài.
      const dist = c * (days > STALE_DAYS ? STALE_R : 0.2 + (RECENT_R - 0.25) * recency);
      const r = Math.min(5 + 1.5 * Math.log1p(item.use_count), 11);
      const at = (d: number) => ({ x: c + Math.cos(a) * d, y: c + Math.sin(a) * d });
      let p = at(dist);
      // Đè chấm đã đặt thì lùi dần ra ngoài; giới hạn để chấm không ra khỏi vòng ngoài.
      for (let d = dist; d < c * STALE_R && placed.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < n.r + r + 14);) {
        d += 8;
        p = at(d);
      }
      placed.push({ item, ...p, r, stale: days > STALE_DAYS });
    });
  return placed;
}

/** Số trong [0, 1) cố định theo `id` (băm Knuth), rải các ghi nhớ trong nhóm mà không cần thứ tự. */
function spread(id: number) {
  return (Math.imul(id, 2654435761) >>> 0) / 2 ** 32;
}

const styles = StyleSheet.create({
  canvas: { width: '100%', aspectRatio: 1 },
  detail: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    // Vừa nhãn, 2 dòng nội dung, dòng sử dụng và hàng nút.
    height: 168,
  },
});
