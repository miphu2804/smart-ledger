import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { dayKey, pad, parseDayKey } from '../lib/format';
import { colors, shadow } from '../theme';
import { T } from './ui';

const WEEKDAY_LABELS = ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN'];

/**
 * Lịch một tháng để chọn một khoảng ngày, dựng bằng View thường vì app chưa có thư viện chọn ngày. Tuần bắt đầu từ thứ Hai.
 * `from`, `to`, `max` là ngày dạng `yyyy-mm-dd` (xem `dayKey`). Ngày đầu và ngày cuối là ô tròn tô đậm, các ngày ở giữa
 * nằm trên một dải nền nhạt; ngày sau `max` bị mờ và không bấm được. Lịch chỉ báo ngày vừa chạm qua `onPick`, nơi dùng
 * quyết định đó là ngày đầu hay ngày cuối.
 * Tháng đang hiện chỉ lấy từ `to` (hoặc `from`) lúc dựng: nơi dùng đổi `key` khi muốn lịch nhảy sang tháng khác.
 */
export function MonthCalendar({
  from,
  to,
  onPick,
  max,
}: {
  from: string | null;
  to: string | null;
  onPick: (day: string) => void;
  max?: string | null;
}) {
  const [shown, setShown] = useState(() => {
    const base = parseDayKey(to ?? from ?? max ?? dayKey(new Date()));
    return { year: base.getFullYear(), month: base.getMonth() };
  });

  // Số ô trống trước ngày 1 (thứ Hai = cột đầu) và số ngày của tháng
  const lead = (new Date(shown.year, shown.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(shown.year, shown.month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) => cells.slice(i * 7, i * 7 + 7));

  const move = (delta: number) =>
    setShown((cur) => {
      const d = new Date(cur.year, cur.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  const canGoNext = !max || dayKey(new Date(shown.year, shown.month + 1, 1)) <= max;
  const hasRange = !!from && !!to && from !== to;

  return (
    <View>
      <View style={styles.head}>
        <T w="bold" size={17} color={colors.brand}>
          Tháng {shown.month + 1}, {shown.year}
        </T>
        <View style={styles.navRow}>
          <Pressable onPress={() => move(-1)} hitSlop={8} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Tháng trước">
            <Feather name="chevron-left" size={18} color={colors.brand} />
          </Pressable>
          <Pressable
            onPress={() => move(1)}
            disabled={!canGoNext}
            hitSlop={8}
            style={[styles.navBtn, !canGoNext && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Tháng sau"
          >
            <Feather name="chevron-right" size={18} color={colors.brand} />
          </Pressable>
        </View>
      </View>

      <View style={styles.week}>
        {WEEKDAY_LABELS.map((label) => (
          <View key={label} style={styles.cell}>
            <T w="semibold" size={12.5} color={colors.faint}>
              {label}
            </T>
          </View>
        ))}
      </View>

      {weeks.map((week, row) => (
        <View key={row} style={styles.week}>
          {week.map((day, col) => {
            if (day == null) return <View key={col} style={styles.cell} />;
            const key = dayKey(new Date(shown.year, shown.month, day));
            const disabled = !!max && key > max;
            const isStart = key === from;
            const isEnd = key === to;
            const selected = isStart || isEnd;
            const inRange = hasRange && key >= from! && key <= to!;
            // Ngày đầu nằm ở cột cuối, hoặc ngày cuối nằm ở cột đầu: nửa dải của ô đó không nối với ô nào nên bỏ
            const showBand = inRange && !(isStart && col === 6) && !(isEnd && col === 0);
            return (
              <Pressable
                key={col}
                onPress={() => onPick(key)}
                disabled={disabled}
                style={styles.cell}
                accessibilityRole="button"
                accessibilityState={{ selected, disabled }}
                accessibilityLabel={`Ngày ${day} tháng ${shown.month + 1} năm ${shown.year}`}
              >
                {/* Dải nền nối ngày đầu với ngày cuối: ở hai đầu chỉ tô nửa ô, sát mép tuần thì bo góc */}
                {showBand ? (
                  <View
                    style={[
                      styles.band,
                      isStart && { left: '50%' },
                      isEnd && { right: '50%' },
                      col === 0 && !isStart && styles.bandLeftEdge,
                      col === 6 && !isEnd && styles.bandRightEdge,
                    ]}
                  />
                ) : null}
                <View style={[styles.day, selected && styles.daySelected]}>
                  <T w={selected || inRange ? 'bold' : 'semibold'} size={14} color={selected ? colors.brandInk : disabled ? colors.disabled : colors.ink}>
                    {pad(day)}
                  </T>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.brandTint,
    borderRadius: 14,
    paddingLeft: 14,
    paddingRight: 8,
    paddingVertical: 8,
    marginBottom: 6,
  },
  navRow: { flexDirection: 'row', gap: 10 },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    ...shadow(1),
  },
  week: { flexDirection: 'row' },
  cell: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center' },
  band: { position: 'absolute', top: 3, bottom: 3, left: 0, right: 0, backgroundColor: colors.brandSoft },
  bandLeftEdge: { borderTopLeftRadius: 18, borderBottomLeftRadius: 18 },
  bandRightEdge: { borderTopRightRadius: 18, borderBottomRightRadius: 18 },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  daySelected: { backgroundColor: colors.brand },
});
