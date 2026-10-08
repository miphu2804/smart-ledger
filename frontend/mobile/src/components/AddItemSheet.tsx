/** Chọn thêm món từ danh mục thật (Core) — bên gọi truyền danh sách sản phẩm đã fetch. */
import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import type { LineItem, ProductView } from '../data/types';
import { vnd } from '../lib/format';
import { triggerFeedback } from '../lib/feedback';
import { colors } from '../theme';
import { EmptyState, Sheet, T } from './ui';

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
      {products.length ? products.map((p) => (
        <Pressable
          key={p.id}
          onPress={() => {
            triggerFeedback('selection');
            onPick({ productId: p.id, name: p.name, price: p.sellingPriceVnd, qty: 1 });
            onClose();
          }}
          style={({ pressed }) => [styles.pick, pressed && { backgroundColor: colors.brandTint }]}
        >
          <T w="semibold" size={14} style={{ flex: 1 }}>
            {p.name}
          </T>
          <T w="bold" size={13} color={colors.data.revenue}>
            {vnd(p.sellingPriceVnd)}
          </T>
          <Feather name="plus-circle" size={18} color={colors.brand} />
        </Pressable>
      )) : <EmptyState icon="package" title="Chưa có mặt hàng" hint="Thêm mặt hàng trong Tiện ích trước" />}
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
