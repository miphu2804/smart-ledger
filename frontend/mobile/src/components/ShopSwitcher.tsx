import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { triggerFeedback } from '../lib/feedback';
import { isShopUsable } from '../lib/shopSwitch';
import { useApp } from '../store/AppStore';
import { colors } from '../theme';
import { useToast } from './brand';
import { T } from './ui';

/** Danh sách cửa hàng của tài khoản trong menu chuyển nhanh: chọn để đổi cửa hàng đang dùng, hoặc tạo thêm cửa hàng. */
export function ShopSwitcher({ onDone }: { onDone: () => void }) {
  const app = useApp();
  const toast = useToast();
  return (
    <View style={styles.wrap}>
      {app.shops.map((shop) => {
        const id = String(shop.id);
        const current = id === app.shopId;
        const usable = isShopUsable(shop);
        return (
          <Pressable
            key={id}
            disabled={!usable}
            onPress={() => {
              triggerFeedback('selection');
              if (!current) {
                app.switchShop(id);
                toast(`Đang dùng ${shop.name}`);
              }
              onDone();
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: current, disabled: !usable }}
            accessibilityLabel={usable ? `Dùng ${shop.name}` : `${shop.name}, đang tạm ngưng`}
            style={({ pressed }) => [styles.row, current && styles.rowCurrent, pressed && styles.rowPressed]}
          >
            <T w={current ? 'bold' : 'semibold'} size={13.5} color={usable ? colors.ink : colors.faint} numberOfLines={1} style={{ flex: 1 }}>
              {shop.name}
            </T>
            {usable ? null : (
              <T size={11.5} color={colors.faint}>
                Tạm ngưng
              </T>
            )}
            {current ? <Feather name="check" size={16} color={colors.brand} /> : null}
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => {
          triggerFeedback('selection');
          onDone();
          router.push('/shop-new');
        }}
        accessibilityRole="button"
        accessibilityLabel="Tạo cửa hàng mới"
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      >
        <Feather name="plus" size={16} color={colors.brand} />
        <T w="bold" size={13.5} color={colors.brand} style={{ flex: 1 }}>
          Tạo cửa hàng mới
        </T>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: 8, gap: 2, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 10, borderRadius: 12 },
  rowCurrent: { backgroundColor: colors.brandSoft },
  rowPressed: { backgroundColor: colors.primaryTint },
});
