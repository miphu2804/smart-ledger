import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { colors, font } from '../theme';

/**
 * Lề của phần đầu các tab có ô tìm (Bán hàng, Đơn hàng): cùng một toạ độ để chuyển tab qua lại tiêu đề, ô tìm và hàng nút lọc
 * nằm yên một chỗ. `top` cộng thêm vào vùng an toàn phía trên.
 */
export const TAB_HEADER_SIDE = 14;
export const TAB_HEADER_TOP = 4;

/**
 * Ô tìm của phần đầu tab: kính lúp, ô nhập, nút xoá khi có chữ và nút phễu nằm trong ô ở mép phải. Phễu tô màu khi bộ lọc
 * đang khác mặc định. Bán hàng và Đơn hàng dùng chung để hai ô trùng kích thước và vị trí. `leading` (nút mở menu chuyển
 * nhanh) nằm bên trái ô, cùng chiều cao.
 */
export function TabSearchBar({
  value,
  onChangeText,
  placeholder,
  searchLabel,
  onFilterPress,
  filterActive,
  filterLabel,
  leading,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Nhãn đọc màn hình của ô nhập */
  searchLabel: string;
  onFilterPress: () => void;
  filterActive: boolean;
  /** Nhãn đọc màn hình của nút phễu, nên nói bộ lọc đang chọn */
  filterLabel: string;
  leading?: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      {leading}
      <View style={styles.box}>
        <Feather name="search" size={18} color={colors.faint} />
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          style={styles.input}
          returnKeyType="search"
          accessibilityLabel={searchLabel}
        />
        {value ? (
          <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityRole="button" accessibilityLabel="Xoá tìm kiếm">
            <Feather name="x-circle" size={15} color={colors.muted} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={onFilterPress}
          hitSlop={6}
          style={({ pressed }) => [styles.filterBtn, filterActive && styles.filterBtnActive, pressed && { opacity: 0.75 }]}
          accessibilityRole="button"
          accessibilityLabel={filterLabel}
        >
          <Feather name="filter" size={16} color={filterActive ? colors.brand : colors.inkSecondary} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  box: {
    flex: 1,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
    paddingRight: 5,
  },
  input: {
    flex: 1,
    height: 38,
    // Android tự đệm trên dưới ~10dp cho TextInput: với chiều cao cố định, phần còn lại thấp hơn một dòng chữ nên dấu tiếng Việt
    // ở trên bị cắt ("Tìm" thành "Iim"). Bỏ đệm dọc để chữ dùng hết chiều cao ô (Android canh giữa ô một dòng).
    paddingVertical: 0,
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.ink,
    outlineStyle: 'none',
  } as never,
  filterBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: {
    backgroundColor: colors.brandTint,
  },
});
