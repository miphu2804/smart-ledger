import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { parseChatMarkdown, type ChartSpec, type ChatBlock, type Inline } from '../lib/chatMarkdown';
import { colors, font } from '../theme';
import { AreaChart, BarChart } from './charts';
import { T } from './ui';

const SIZE = 13.5;
// Bề ngang tối thiểu cho mỗi điểm biểu đồ, đủ cho nhãn hai chữ như "Giặt tẩy" ở cỡ 12.
const CHART_SLOT = 58;
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

function Inlines({ inlines, color }: { inlines: Inline[]; color: string }) {
  return inlines.map((part, i) =>
    part.code ? (
      <T key={i} size={12.5} color={color} style={styles.inlineCode}>
        {part.text}
      </T>
    ) : part.bold ? (
      <T key={i} size={SIZE} color={color} style={{ fontFamily: font.bold }}>
        {part.text}
      </T>
    ) : (
      part.text
    ),
  );
}

function ChartCard({ spec }: { spec: ChartSpec }) {
  // Mặc định chọn điểm cao nhất; chạm cột khác để xem giá trị của nó.
  const [selected, setSelected] = useState(() =>
    spec.data.reduce((best, point, i) => (point.value > spec.data[best].value ? i : best), 0),
  );
  return (
    <View style={styles.card}>
      {spec.title ? (
        <T w="bold" size={12.5} style={{ marginBottom: 8 }}>
          {spec.title}
        </T>
      ) : null}
      {/* Mỗi điểm cần đủ chỗ cho nhãn: ít điểm thì giãn cho đầy thẻ, nhiều điểm thì cuộn ngang thay vì tràn. */}
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1, minWidth: spec.data.length * CHART_SLOT }}>
          {/* AreaChart ghi "đ" sau giá trị nên số lượng luôn vẽ bằng cột. */}
          {spec.type === 'line' && spec.unit === 'vnd' ? (
            <AreaChart data={spec.data} height={120} />
          ) : (
            <BarChart data={spec.data} height={110} selected={selected} onSelect={setSelected} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

type BlockProps = { block: ChatBlock; color: string };

// Mỗi delta parse lại cả câu và tạo object block mới, nên so theo nội dung: khi stream chỉ khối cuối
// đổi, các khối đã xong (bảng, biểu đồ) không render lại.
const Block = React.memo(BlockView, (prev, next) => prev.color === next.color && sameBlock(prev.block, next.block));

function sameBlock(a: ChatBlock, b: ChatBlock) {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

function BlockView({ block, color }: BlockProps) {
  switch (block.kind) {
    case 'gap':
      return <View style={styles.gap} />;
    case 'heading':
      return (
        <T w="bold" size={14.5} color={color} style={styles.line}>
          <Inlines inlines={block.inlines} color={color} />
        </T>
      );
    case 'bullet':
    case 'ordered':
      return (
        <View style={styles.listRow}>
          <T size={SIZE} color={color} style={styles.marker}>
            {block.kind === 'ordered' ? block.marker : '•'}
          </T>
          <T size={SIZE} color={color} style={styles.line}>
            <Inlines inlines={block.inlines} color={color} />
          </T>
        </View>
      );
    case 'code':
      return (
        <ScrollView horizontal style={styles.codeBlock} contentContainerStyle={{ padding: 10 }}>
          <T size={12} color={colors.ink} style={{ fontFamily: MONO }}>
            {block.text}
          </T>
        </ScrollView>
      );
    case 'table': {
      const widths = columnWidths([block.header, ...block.rows]);
      return (
        <ScrollView horizontal style={styles.table} contentContainerStyle={{ flexGrow: 1 }}>
          <View style={{ flexGrow: 1 }}>
            {[block.header, ...block.rows].map((cells, r) => (
              <View key={r} style={[styles.tableRow, r === 0 && styles.tableHead]}>
                {widths.map((width, c) => (
                  <T key={c} size={12.5} color={color} w={r === 0 ? 'bold' : 'medium'} style={[styles.cell, { flexBasis: width, flexGrow: width }]}>
                    <Inlines inlines={cells[c] ?? []} color={color} />
                  </T>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
    case 'chart':
      return <ChartCard spec={block.spec} />;
    case 'chartPending':
      return (
        <View style={[styles.card, styles.chartNote]}>
          <T size={12.5} color={colors.muted}>
            Đang vẽ biểu đồ…
          </T>
        </View>
      );
    case 'chartInvalid':
      return (
        <View style={[styles.card, styles.chartNote]}>
          <T size={12.5} color={colors.muted}>
            Không hiện được biểu đồ này.
          </T>
        </View>
      );
    default:
      return (
        <T size={SIZE} color={color} style={styles.line}>
          <Inlines inlines={block.inlines} color={color} />
        </T>
      );
  }
}

/**
 * Cùng một cột rộng như nhau ở mọi hàng, theo ô dài nhất, để tiêu đề thẳng hàng với dữ liệu. Bảng hẹp
 * hơn bong bóng thì các cột giãn theo tỉ lệ này cho đầy; bảng rộng hơn thì cuộn ngang.
 */
function columnWidths(rows: Inline[][][]) {
  return rows[0].map((_, c) => {
    const longest = Math.max(...rows.map((cells) => (cells[c] ?? []).reduce((n, part) => n + part.text.length, 0)));
    return Math.min(170, Math.max(64, longest * 8 + 20));
  });
}

/**
 * Câu trả lời của Trợ lý AI, cả khi đang stream (`streaming`) lẫn khi đã lưu: cùng một parser nên
 * bong bóng không đổi dạng lúc `done` thay chữ đang stream bằng câu đã lưu.
 */
// Props chỉ là chuỗi nên memo giúp việc gõ ở ô nhập không parse lại mọi tin nhắn.
export const ChatText = React.memo(function ChatText({
  text,
  color = colors.ink,
  streaming = false,
}: {
  text: string;
  color?: string;
  streaming?: boolean;
}) {
  const blocks = useMemo(() => parseChatMarkdown(text, streaming), [text, streaming]);
  return (
    <View style={styles.wrap}>
      {blocks.map((block, i) => (
        <Block key={i} block={block} color={color} />
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { flexShrink: 1, gap: 2 },
  gap: { height: 8 },
  listRow: { flexDirection: 'row', gap: 6 },
  marker: { lineHeight: 20.5, minWidth: 8 },
  line: { lineHeight: 20.5, flexShrink: 1, flexWrap: 'wrap' },
  inlineCode: { fontFamily: MONO, backgroundColor: colors.primarySoft },
  codeBlock: { backgroundColor: colors.primarySoft, borderRadius: 10, marginVertical: 4 },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginVertical: 4 },
  tableRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tableHead: { borderTopWidth: 0, backgroundColor: colors.primaryTint },
  cell: { paddingHorizontal: 8, paddingVertical: 6, lineHeight: 18 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, marginVertical: 4 },
  chartNote: { alignItems: 'center', paddingVertical: 16 },
});
