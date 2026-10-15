import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { dayKey, ddmmyyyy, parseDayKey } from '../lib/format';
import { lastDaysRange, matchingPreset, RANGE_PRESETS, type RangePreset } from '../lib/saleFilter';
import { colors } from '../theme';
import { MonthCalendar } from './MonthCalendar';
import { Button, Row, Sheet, T } from './ui';

/**
 * Bảng chọn khoảng ngày của màn Đơn hàng: ba khoảng có sẵn (7, 15, 30 ngày gần nhất), lịch để chọn ngày đầu rồi ngày cuối,
 * và dòng "Từ ngày – Đến ngày" cho thấy khoảng đang chọn. Chỉ nút "Chọn khoảng ngày" mới trả khoảng về màn hình; đóng bảng
 * theo cách khác thì bỏ lựa chọn dở.
 */
export function DateRangeSheet({
  visible,
  from,
  to,
  onApply,
  onClose,
}: {
  visible: boolean;
  /** Khoảng đang lọc ở màn hình; chưa lọc theo khoảng ngày thì cả hai là null */
  from: string | null;
  to: string | null;
  onApply: (from: string, to: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<{ from: string | null; to: string | null }>({ from, to });
  // Tăng khi chọn một khoảng có sẵn: lịch dựng lại và nhảy tới tháng của ngày cuối
  const [calendarKey, setCalendarKey] = useState(0);
  // nạp lại lựa chọn mỗi lần mở bảng; chưa có khoảng nào thì gợi ý 7 ngày gần nhất
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(from && to ? { from, to } : lastDaysRange(RANGE_PRESETS[0]));
      setCalendarKey((cur) => cur + 1);
    }
  }

  const today = dayKey(new Date());
  const activePreset = matchingPreset(draft.from, draft.to);

  const choosePreset = (days: RangePreset) => {
    setDraft(lastDaysRange(days));
    setCalendarKey((cur) => cur + 1);
  };

  // Chạm lần đầu (hoặc khi đã có đủ hai đầu) là chọn lại ngày đầu; chạm tiếp một ngày không sớm hơn là ngày cuối
  const pickDay = (day: string) =>
    setDraft((cur) => (!cur.from || cur.to || day < cur.from ? { from: day, to: null } : { from: cur.from, to: day }));

  const dayText = (day: string | null) => (day ? ddmmyyyy(parseDayKey(day)) : '--/--/----');

  return (
    <Sheet visible={visible} onClose={onClose} title="Lọc theo ngày">
      <Row gap={8} style={{ marginBottom: 12 }}>
        {RANGE_PRESETS.map((days) => {
          const active = activePreset === days;
          return (
            <Pressable
              key={days}
              onPress={() => choosePreset(days)}
              style={({ pressed }) => [styles.preset, active && styles.presetActive, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${days} ngày gần nhất`}
            >
              <T w={active ? 'bold' : 'semibold'} size={13.5} color={active ? colors.brandInk : colors.muted}>
                {days} Ngày
              </T>
            </Pressable>
          );
        })}
      </Row>

      <MonthCalendar key={calendarKey} from={draft.from} to={draft.to} max={today} onPick={pickDay} />

      <View style={styles.rangeRow}>
        <View>
          <T size={12.5} color={colors.faint}>
            Từ ngày
          </T>
          <T w="bold" size={16} style={{ marginTop: 2 }}>
            {dayText(draft.from)}
          </T>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T size={12.5} color={colors.faint}>
            Đến ngày
          </T>
          <T w="bold" size={16} color={draft.to ? colors.ink : colors.disabled} style={{ marginTop: 2 }}>
            {dayText(draft.to)}
          </T>
        </View>
      </View>

      <Button
        title="Chọn khoảng ngày"
        disabled={!draft.from}
        // Mới chạm một ngày rồi bấm chọn: lọc đúng ngày đó
        onPress={() => draft.from && onApply(draft.from, draft.to ?? draft.from)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  preset: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { borderColor: colors.brand, backgroundColor: colors.brand },
  rangeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 8,
    paddingTop: 12,
    marginBottom: 14,
  },
});
