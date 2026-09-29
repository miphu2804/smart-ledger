import React, { useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { compact, vnd } from '../lib/format';
import { colors } from '../theme';
import { T } from './ui';

type Point = { label: string; value: number };

/** Biểu đồ vùng (area) giống màn "Doanh thu" trong prototype. Chạm để xem giá trị. */
export function AreaChart({ data, height = 150, color = colors.primary }: { data: Point[]; height?: number; color?: string }) {
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value)) * 1.15;
  const padX = 8;
  const innerW = Math.max(1, w - padX * 2);
  const step = data.length > 1 ? innerW / (data.length - 1) : 0;
  const pts = data.map((d, i) => ({ x: padX + i * step, y: 10 + (height - 20) * (1 - d.value / max) }));

  // đường cong mượt (Catmull-Rom → Bezier)
  let line = '';
  pts.forEach((p, i) => {
    if (i === 0) {
      line = `M${p.x},${p.y}`;
      return;
    }
    const p0 = pts[i - 2] ?? pts[i - 1];
    const p1 = pts[i - 1];
    const p3 = pts[i + 1] ?? p;
    const clampY = (y: number) => Math.min(height - 2, Math.max(2, y));
    const c1x = p1.x + (p.x - p0.x) / 6;
    const c1y = clampY(p1.y + (p.y - p0.y) / 6);
    const c2x = p.x - (p3.x - p1.x) / 6;
    const c2y = clampY(p.y - (p3.y - p1.y) / 6);
    line += ` C${c1x},${c1y} ${c2x},${c2y} ${p.x},${p.y}`;
  });
  const area = pts.length ? `${line} L${pts[pts.length - 1].x},${height} L${pts[0].x},${height} Z` : '';
  const active = sel ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}>
      <View style={{ height }}>
        {w > 0 ? (
          <Svg width={w} height={height}>
            <Defs>
              <LinearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                <Stop offset="1" stopColor={color} stopOpacity={0.01} />
              </LinearGradient>
            </Defs>
            {[0.25, 0.5, 0.75].map((f) => (
              <Line key={f} x1={0} x2={w} y1={height * f} y2={height * f} stroke={colors.border} strokeDasharray="3 5" />
            ))}
            <Path d={area} fill="url(#g)" />
            <Path d={line} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
            {pts[active] ? (
              <>
                <Line x1={pts[active].x} x2={pts[active].x} y1={pts[active].y} y2={height} stroke={color} strokeOpacity={0.25} />
                <Circle cx={pts[active].x} cy={pts[active].y} r={6} fill={colors.white} stroke={color} strokeWidth={3} />
              </>
            ) : null}
          </Svg>
        ) : null}
        {w > 0 && pts[active] ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: Math.min(Math.max(pts[active].x - 44, 0), w - 88),
              top: Math.max(pts[active].y - 50, 0),
              width: 88,
              backgroundColor: colors.ink,
              borderRadius: 9,
              paddingVertical: 5,
              alignItems: 'center',
            }}
          >
            <T size={12} color={colors.white}>
              {data[active].label}
            </T>
            <T w="bold" size={12} color={colors.white}>
              {data[active].value.toLocaleString('vi-VN')}đ
            </T>
          </View>
        ) : null}
        {/* vùng chạm */}
        <View style={{ position: 'absolute', inset: 0, flexDirection: 'row' } as never}>
          {data.map((d, i) => (
            <Pressable
              key={d.label + i}
              style={{ flex: 1 }}
              onPress={() => setSel(i)}
              accessibilityLabel={`${d.label}: ${d.value}`}
            />
          ))}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
        {data.map((d, i) => (
          <T
            key={d.label + i}
            size={12}
            color={i === active ? colors.primary : colors.faint}
            w={i === active ? 'bold' : 'medium'}
          >
            {d.label}
          </T>
        ))}
      </View>
    </View>
  );
}

/** Biểu đồ cột đơn giản */
export function BarChart({
  data,
  height = 120,
  color = colors.primary,
  highlightLast = true,
  onSelect,
  selected,
}: {
  data: Point[];
  height?: number;
  color?: string;
  highlightLast?: boolean;
  onSelect?: (i: number) => void;
  selected?: number;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const activeIdx = selected ?? (highlightLast ? data.length - 1 : -1);
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', height, gap: 6 }}>
        {data.map((d, i) => {
          const active = i === activeIdx;
          return (
            <Pressable
              key={d.label + i}
              style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height }}
              onPress={() => onSelect?.(i)}
              disabled={!onSelect}
              accessibilityRole={onSelect ? 'button' : undefined}
              accessibilityLabel={`${d.label}: ${vnd(d.value)}`}
            >
              {active ? (
                <T w="bold" size={12} color={color} style={{ marginBottom: 4 }}>
                  {compact(d.value)}
                </T>
              ) : null}
              <View
                style={{
                  width: '72%',
                  maxWidth: 30,
                  height: Math.max(4, (d.value / max) * (height - 22)),
                  borderRadius: 8,
                  backgroundColor: active ? color : colors.primarySoft,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
        {data.map((d, i) => (
          <T
            key={d.label + i}
            size={12}
            color={i === activeIdx ? colors.ink : colors.faint}
            style={{ flex: 1, textAlign: 'center' }}
          >
            {d.label}
          </T>
        ))}
      </View>
    </View>
  );
}
