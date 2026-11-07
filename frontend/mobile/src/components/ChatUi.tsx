import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { Path, Polyline } from 'react-native-svg';
import { SCREEN_LINKS } from '../lib/chatMarkdown';
import type { Point, Series, Tone, UiNode, Unit } from '../lib/chatUi';
import { compact, vnd } from '../lib/format';
import { colors } from '../theme';
import { AreaChart, BarChart } from './charts';
import { Button, T } from './ui';

// Màu chuỗi theo thứ tự cố định để cùng một chuỗi giữ một màu trong mọi thẻ của câu trả lời.
const SERIES_COLORS = [
  colors.data.revenue,
  colors.data.order,
  colors.data.product,
  colors.data.profit,
  colors.data.customer,
  colors.data.expense,
];
// Bề ngang tối thiểu cho mỗi điểm hoặc nhóm cột, như CHART_SLOT của khối ```chart.
const SLOT = 58;

const TONES: Record<Tone, { fg: string; bg: string }> = {
  neutral: { fg: colors.inkSecondary, bg: colors.surfaceMuted },
  good: { fg: colors.green, bg: colors.greenSoft },
  bad: { fg: colors.red, bg: colors.redSoft },
  warn: { fg: colors.gold, bg: colors.goldSoft },
};

function format(value: number, unit: Unit = 'vnd') {
  if (unit === 'percent') return `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
  return unit === 'vnd' ? vnd(value) : value.toLocaleString('vi-VN');
}

function short(value: number, unit: Unit) {
  return unit === 'vnd' ? compact(value) : format(value, unit);
}

/** Một khối ```ui đã qua `readUi`; chỉ vẽ, không ghi dữ liệu. */
export function UiBlock({ node }: { node: UiNode }) {
  return (
    <View style={styles.block}>
      <UiView node={node} />
    </View>
  );
}

function UiView({ node }: { node: UiNode }) {
  switch (node.type) {
    case 'Card':
      return (
        <View style={styles.card}>
          {node.title ? (
            <T w="bold" size={13}>
              {node.title}
            </T>
          ) : null}
          {node.children.map((child, i) => (
            <UiView key={i} node={child} />
          ))}
        </View>
      );
    case 'Row':
      return (
        <View style={styles.row}>
          {node.children.map((child, i) => (
            <View key={i} style={styles.rowItem}>
              <UiView node={child} />
            </View>
          ))}
        </View>
      );
    case 'Metric':
      return <Metric {...node} />;
    case 'LineChart':
    case 'BarChart':
      return <PointChart type={node.type} title={node.title} unit={node.unit} data={node.data} />;
    case 'HBarChart':
      return <HBarChart {...node} />;
    case 'Donut':
      return <Donut {...node} />;
    case 'GroupedBar':
    case 'StackedBar':
      return <MultiBar {...node} />;
    case 'Progress':
      return <Progress {...node} />;
    case 'Table':
      return <Table {...node} />;
    case 'List':
      return <List {...node} />;
    case 'OrderCard':
      return <OrderCard {...node} />;
    case 'Badge':
      return <Badge text={node.text} tone={node.tone} />;
    case 'Text':
      return (
        <T size={13} color={colors.inkSecondary} style={{ lineHeight: 19 }}>
          {node.text}
        </T>
      );
    case 'ScreenButton':
      return (
        <Button
          title={SCREEN_LINKS[node.screen].label}
          variant="outline"
          small
          onPress={() => router.navigate(SCREEN_LINKS[node.screen].route)}
        />
      );
  }
}

function ChartTitle({ title }: { title?: string }) {
  return title ? (
    <T w="semibold" size={12.5} color={colors.inkSecondary}>
      {title}
    </T>
  ) : null;
}

function Badge({ text, tone }: { text: string; tone: Tone }) {
  return (
    <View style={[styles.badge, { backgroundColor: TONES[tone].bg }]}>
      <T w="semibold" size={11.5} color={TONES[tone].fg}>
        {text}
      </T>
    </View>
  );
}

function Metric({ label, value, unit, change, trend }: Extract<UiNode, { type: 'Metric' }>) {
  const tone: Tone = change === undefined || change === 0 ? 'neutral' : change > 0 ? 'good' : 'bad';
  return (
    <View style={styles.metric}>
      <T size={12} color={colors.muted}>
        {label}
      </T>
      <T w="bold" size={19} numberOfLines={1} adjustsFontSizeToFit>
        {format(value, unit)}
      </T>
      <View style={styles.metricFoot}>
        {change !== undefined ? (
          <Badge
            text={`${change > 0 ? '▲' : change < 0 ? '▼' : '•'} ${Math.abs(change).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`}
            tone={tone}
          />
        ) : null}
        {trend && trend.length > 1 ? <Sparkline values={trend} color={TONES[tone === 'neutral' ? 'good' : tone].fg} /> : null}
      </View>
    </View>
  );
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const w = 64;
  const h = 22;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`).join(' ');
  return (
    <Svg width={w} height={h}>
      <Polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
}

function PointChart({ type, title, unit, data }: { type: 'LineChart' | 'BarChart'; title?: string; unit: Unit; data: Point[] }) {
  const [selected, setSelected] = useState(() => data.reduce((best, p, i) => (p.value > data[best].value ? i : best), 0));
  return (
    <View style={styles.chart}>
      <ChartTitle title={title} />
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        {/* 44 per point keeps a week of bars on screen; the bar labels shrink to fit their slot. */}
        <View style={{ flexGrow: 1, minWidth: data.length * 44 }}>
          {type === 'LineChart' ? (
            <AreaChart data={data} height={120} format={(v) => format(v, unit)} />
          ) : (
            <BarChart data={data} height={110} selected={selected} onSelect={setSelected} />
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Xếp hạng theo cột ngang: tên món dài vẫn đọc được trọn, khác cột đứng chỉ có 12 ký tự. */
function HBarChart({ title, unit, data }: { title?: string; unit: Unit; data: Point[] }) {
  const max = Math.max(1, ...data.map((p) => p.value));
  return (
    <View style={styles.chart}>
      <ChartTitle title={title} />
      {data.map((p, i) => (
        <View key={i} accessible accessibilityLabel={`${p.label}: ${format(p.value, unit)}`} style={{ gap: 4 }}>
          <View style={styles.spread}>
            <T size={12.5} numberOfLines={1} style={{ flexShrink: 1 }}>
              {p.label}
            </T>
            <T w="semibold" size={12.5}>
              {format(p.value, unit)}
            </T>
          </View>
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                { width: `${(p.value / max) * 100}%`, backgroundColor: SERIES_COLORS[0], opacity: i === 0 ? 1 : 0.55 },
              ]}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

function Donut({ title, unit, data }: { title?: string; unit: Unit; data: Point[] }) {
  const [selected, setSelected] = useState<number | null>(null);
  const total = data.reduce((sum, p) => sum + p.value, 0);
  const size = 128;
  const stroke = 20;
  // Leaves room for the focused slice, drawn 4 wider, so its outer edge is not cut by the canvas.
  const r = (size - stroke - 4) / 2;
  let start = 0;
  const focus = selected ?? data.reduce((best, p, i) => (p.value > data[best].value ? i : best), 0);
  return (
    <View style={styles.chart}>
      <ChartTitle title={title} />
      <View style={styles.donutRow}>
        <View style={{ width: size, height: size }}>
          <Svg width={size} height={size}>
            {/* Each slice is its own arc path: dashes on one circle cut the first slice on iOS. */}
            {data.map((p, i) => {
              const share = p.value / total;
              const slice = (
                <Path
                  key={i}
                  d={arc(size / 2, r, start, start + share)}
                  fill="none"
                  stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                  strokeWidth={i === focus ? stroke + 4 : stroke}
                  opacity={i === focus ? 1 : 0.7}
                />
              );
              start += share;
              return slice;
            })}
          </Svg>
          <View style={styles.donutCenter} pointerEvents="none">
            <T w="bold" size={15}>
              {Math.round((data[focus].value / total) * 100)}%
            </T>
            <T size={11} color={colors.muted} numberOfLines={1}>
              {data[focus].label}
            </T>
          </View>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          {data.map((p, i) => (
            <Pressable
              key={i}
              onPress={() => setSelected(i)}
              accessibilityRole="button"
              accessibilityLabel={`${p.label}: ${format(p.value, unit)}`}
              style={styles.legendRow}
            >
              <View style={[styles.dot, { backgroundColor: SERIES_COLORS[i % SERIES_COLORS.length] }]} />
              <View style={{ flex: 1 }}>
                <T size={12} w={i === focus ? 'bold' : 'medium'} numberOfLines={1}>
                  {p.label}
                </T>
                <T size={11.5} color={colors.muted}>
                  {short(p.value, unit)}
                </T>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

/** SVG arc from share `from` to share `to` of a full turn, clockwise from 12 o'clock, leaving a small gap after it. */
function arc(center: number, r: number, from: number, to: number) {
  const gap = 0.006;
  const end = Math.max(from, Math.min(to - gap, from + 0.9999));
  const point = (share: number) => {
    const angle = share * 2 * Math.PI - Math.PI / 2;
    return `${center + r * Math.cos(angle)} ${center + r * Math.sin(angle)}`;
  };
  return `M ${point(from)} A ${r} ${r} 0 ${end - from > 0.5 ? 1 : 0} 1 ${point(end)}`;
}

function Legend({ series }: { series: Series[] }) {
  return (
    <View style={styles.legend}>
      {series.map((s, i) => (
        <View key={i} style={styles.legendRow}>
          <View style={[styles.dot, { backgroundColor: SERIES_COLORS[i] }]} />
          <T size={12}>{s.name}</T>
        </View>
      ))}
    </View>
  );
}

/** Cột nhóm (so sánh kỳ) hoặc cột chồng (cơ cấu theo từng mốc); chạm một nhóm để xem số của từng chuỗi. */
function MultiBar({
  type,
  title,
  unit,
  labels,
  series,
}: {
  type: 'GroupedBar' | 'StackedBar';
  title?: string;
  unit: Unit;
  labels: string[];
  series: Series[];
}) {
  const [selected, setSelected] = useState(labels.length - 1);
  const height = 120;
  const totals = labels.map((_, i) => series.reduce((sum, s) => sum + s.values[i], 0));
  const max = Math.max(1, ...(type === 'StackedBar' ? totals : series.flatMap((s) => s.values)));
  return (
    <View style={styles.chart}>
      <ChartTitle title={title} />
      <Legend series={series} />
      <ScrollView horizontal contentContainerStyle={{ flexGrow: 1 }}>
        <View style={{ flexGrow: 1, minWidth: labels.length * SLOT }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
            {labels.map((label, i) => (
              <Pressable
                key={i}
                onPress={() => setSelected(i)}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${series.map((s) => `${s.name} ${format(s.values[i], unit)}`).join(', ')}`}
                style={{ flex: 1, height, justifyContent: 'flex-end', alignItems: 'center', opacity: i === selected ? 1 : 0.6 }}
              >
                {type === 'StackedBar' ? (
                  <View
                    style={{
                      width: '60%',
                      maxWidth: 30,
                      height: (totals[i] / max) * height,
                      borderRadius: 6,
                      overflow: 'hidden',
                      flexDirection: 'column-reverse',
                    }}
                  >
                    {series.map((s, k) => (
                      <View
                        key={k}
                        style={{
                          height: totals[i] ? `${(s.values[i] / totals[i]) * 100}%` : 0,
                          backgroundColor: SERIES_COLORS[k],
                        }}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, height }}>
                    {series.map((s, k) => (
                      <View
                        key={k}
                        style={{
                          width: 10,
                          height: s.values[i] ? Math.max(2, (s.values[i] / max) * height) : 0,
                          borderRadius: 4,
                          backgroundColor: SERIES_COLORS[k],
                        }}
                      />
                    ))}
                  </View>
                )}
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            {labels.map((label, i) => (
              <T
                key={i}
                size={12}
                color={i === selected ? colors.ink : colors.faint}
                w={i === selected ? 'bold' : 'medium'}
                style={{ flex: 1, textAlign: 'center' }}
              >
                {label}
              </T>
            ))}
          </View>
        </View>
      </ScrollView>
      <View style={styles.selection}>
        <T w="semibold" size={12}>
          {labels[selected]}
        </T>
        {series.map((s, k) => (
          <T key={k} size={12} color={colors.inkSecondary}>
            {s.name}:{' '}
            <T w="bold" size={12}>
              {format(s.values[selected], unit)}
            </T>
          </T>
        ))}
      </View>
    </View>
  );
}

function Progress({ label, value, max, unit }: Extract<UiNode, { type: 'Progress' }>) {
  const ratio = Math.min(1, value / max);
  const color = ratio >= 1 ? colors.red : ratio >= 0.8 ? colors.goldBright : colors.data.revenue;
  return (
    <View style={{ gap: 5 }}>
      <View style={styles.spread}>
        <T size={12.5}>{label}</T>
        <T size={12} color={colors.muted}>
          {format(value, unit)} / {format(max, unit)}
        </T>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${ratio * 100}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

function Table({ columns, rows }: Extract<UiNode, { type: 'Table' }>) {
  return (
    <ScrollView horizontal style={styles.table} contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ flexGrow: 1 }}>
        {[columns, ...rows].map((cells, r) => (
          <View key={r} style={[styles.tableRow, r === 0 && styles.tableHead]}>
            {cells.map((cell, c) => (
              <T
                key={c}
                size={12.5}
                w={r === 0 ? 'bold' : 'medium'}
                style={[styles.cell, typeof cell === 'number' && { textAlign: 'right' }, c === 0 && { minWidth: 96 }]}
              >
                {typeof cell === 'number' ? cell.toLocaleString('vi-VN') : cell}
              </T>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function List({ items }: Extract<UiNode, { type: 'List' }>) {
  return (
    <View>
      {items.map((item, i) => (
        <View key={i} style={[styles.listRow, i > 0 && styles.divider]}>
          <View style={{ flex: 1 }}>
            <T size={12.5}>{item.label}</T>
            {item.note ? (
              <T size={11.5} color={colors.muted}>
                {item.note}
              </T>
            ) : null}
          </View>
          {item.value !== undefined ? (
            <T w="semibold" size={12.5}>
              {item.word ? `${format(item.value, 'count')} ${item.word}` : format(item.value, item.unit)}
            </T>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function OrderCard({ code, date, customer, status, items, total }: Extract<UiNode, { type: 'OrderCard' }>) {
  return (
    <View style={styles.order}>
      <View style={styles.spread}>
        <T w="bold" size={13.5}>
          {code}
        </T>
        {status ? <Badge text={status} tone="neutral" /> : null}
      </View>
      {date || customer ? (
        <T size={12} color={colors.muted}>
          {[date, customer].filter(Boolean).join(' · ')}
        </T>
      ) : null}
      <View style={styles.receipt}>
        {items.map((item, i) => (
          <View key={i} style={styles.spread}>
            <T size={12.5} style={{ flexShrink: 1 }}>
              {item.qty.toLocaleString('vi-VN')} × {item.name}
            </T>
            <T size={12.5}>{vnd(item.qty * item.price)}</T>
          </View>
        ))}
      </View>
      <View style={styles.spread}>
        <T w="semibold" size={13}>
          Tổng
        </T>
        <T w="bold" size={14}>
          {vnd(total)}
        </T>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginVertical: 4 },
  card: { borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, gap: 12, backgroundColor: colors.card },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rowItem: { flexGrow: 1, flexBasis: 120 },
  metric: { backgroundColor: colors.primaryTint, borderRadius: 12, padding: 10, gap: 2 },
  metricFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 22, marginTop: 2 },
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chart: { gap: 8 },
  spread: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  donutCenter: { position: 'absolute', top: 0, bottom: 0, left: 24, right: 24, alignItems: 'center', justifyContent: 'center' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  selection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    backgroundColor: colors.primaryTint,
    borderRadius: 8,
    padding: 8,
  },
  table: { borderWidth: 1, borderColor: colors.border, borderRadius: 10 },
  tableRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  tableHead: { borderTopWidth: 0, backgroundColor: colors.primaryTint },
  cell: { flexGrow: 1, flexBasis: 72, paddingHorizontal: 8, paddingVertical: 6, lineHeight: 18 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  order: { borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 12, gap: 8, backgroundColor: colors.card },
  receipt: {
    gap: 4,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderStyle: 'dashed',
    borderColor: colors.border,
  },
});
