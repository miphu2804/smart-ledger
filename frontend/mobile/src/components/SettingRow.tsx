import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Badge, T, Toggle } from './ui';

/**
 * Một dòng cài đặt (màn Cài đặt, Cài đặt thông báo). Bốn loại, theo prop truyền vào:
 * - `value`/`onChange`: công tắc thật; chạm cả dòng hay chạm công tắc đều đổi.
 * - `onPress`: mở màn khác, có mũi tên.
 * - `always`: luôn bật, không cho tắt (vd. thông báo tình trạng tiệm); ghi "Luôn bật".
 * - còn lại (`soon`): app chưa có tính năng này; làm mờ, ghi "Sắp có", không bấm được.
 * Trình đọc màn hình nhận trạng thái qua `aria-checked`/`aria-disabled` (React Native Web không đổi `accessibilityState` thành ARIA).
 */
export function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
  onPress,
  always = false,
  last = false,
  tint = colors.brand,
  tintBg = colors.brandSoft,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  value?: boolean;
  onChange?: (value: boolean) => void;
  onPress?: () => void;
  always?: boolean;
  /** Dòng cuối trong thẻ: bỏ đường kẻ dưới */
  last?: boolean;
  /** Màu biểu tượng và nền ô biểu tượng (mặc định tím thương hiệu) */
  tint?: string;
  tintBg?: string;
  /** Chỉ để đọc cho rõ ở chỗ gọi: không có công tắc, không bấm được thì là "Sắp có" */
  soon?: boolean;
}) {
  const soon = !onChange && !onPress && !always;
  const content = (
    <>
      <View style={[styles.iconBox, { backgroundColor: soon ? colors.primarySoft : tintBg }]}>
        <Feather name={icon} size={19} color={soon ? colors.disabled : tint} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={15} color={soon ? colors.muted : colors.ink}>
          {title}
        </T>
        <T size={12.5} color={colors.muted} style={{ marginTop: 3 }}>
          {subtitle}
        </T>
      </View>
    </>
  );

  if (onChange) {
    const on = !!value;
    return (
      <Pressable
        onPress={() => onChange(!on)}
        style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}
        accessibilityRole="switch"
        accessibilityLabel={title}
        accessibilityHint={subtitle}
        aria-checked={on}
      >
        {content}
        {/* Cả dòng đã là công tắc cho trình đọc màn hình: ẩn công tắc con để không đọc hai lần */}
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Toggle value={on} onChange={onChange} />
        </View>
      </Pressable>
    );
  }

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityHint={subtitle}
      >
        {content}
        <Feather name="chevron-right" size={18} color={colors.disabled} />
      </Pressable>
    );
  }

  return (
    <View
      style={[styles.row, !last && styles.rowBorder, soon && styles.rowSoon]}
      accessible
      accessibilityLabel={`${title}, ${soon ? 'sắp có' : 'luôn bật'}`}
      aria-disabled={soon}
    >
      {content}
      {/* Badge tự canh lên đầu (alignSelf flex-start): bọc lại để nằm giữa dòng như công tắc */}
      <View style={styles.badgeSlot}>
        {soon ? <Badge text="Sắp có" /> : <Badge text="Luôn bật" color={colors.green} bg={colors.greenSoft} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 8,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowSoon: { opacity: 0.6 },
  pressed: { opacity: 0.85 },
  badgeSlot: { alignSelf: 'center' },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
