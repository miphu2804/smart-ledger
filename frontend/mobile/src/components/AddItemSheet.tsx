import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LineItem, ProductView } from '../data/types';
import { vnd } from '../lib/format';
import { colors } from '../theme';
import { Sheet, T } from './ui';

/** Chọn thêm món từ danh mục thật (Core) — bên gọi truyền danh sách sản phẩm đã fetch. */
export function AddItemSheet({
  visible,
  onClose,
  onPick,
  products,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (li: LineItem) => void;
  products: ProductView[];
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Thêm món">
      {products.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            onPick({ productId: p.id, name: p.name, price: p.sellingPriceVnd, qty: 1 });
            onClose();
          }}
          style={({ pressed }) => [styles.pick, pressed && { backgroundColor: colors.primaryTint }]}
        >
          <T w="semibold" size={14} style={{ flex: 1 }}>
            {p.name}
          </T>
          <T w="bold" size={13} color={colors.primary}>
            {vnd(p.sellingPriceVnd)}
          </T>
          <Feather name="plus-circle" size={18} color={colors.primary} />
        </Pressable>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  pick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 13,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderRadius: 8,
  },
});
