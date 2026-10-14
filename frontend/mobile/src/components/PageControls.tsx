import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { pageNumbers } from '../lib/pageNumbers';
import { colors } from '../theme';
import { T } from './ui';

/** Thanh phân trang theo số trang: trang trước/sau và các nút số, kèm "21–40 / 181 sản phẩm". `page` đánh số từ 0. */
export function PageControls({
  page,
  pageSize,
  total,
  unit,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  unit: string;
  onPage: (page: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const first = page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);
  return (
    <View style={styles.wrap}>
      <T size={12} color={colors.muted}>
        {first}–{last} / {total} {unit}
      </T>
      <View style={styles.row} accessibilityRole="toolbar" accessibilityLabel="Phân trang">
        <Pressable
          onPress={() => onPage(page - 1)}
          disabled={page <= 0}
          style={[styles.btn, page <= 0 && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Trang trước"
          accessibilityState={{ disabled: page <= 0 }}
        >
          <Feather name="chevron-left" size={18} color={colors.ink} />
        </Pressable>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === '…' ? (
            <T key={`gap${i}`} size={13} color={colors.faint} style={styles.gap}>
              …
            </T>
          ) : (
            <Pressable
              key={p}
              onPress={() => onPage(p)}
              style={[styles.btn, p === page && styles.active]}
              accessibilityRole="button"
              accessibilityLabel={`Trang ${p + 1}`}
              accessibilityState={{ selected: p === page }}
            >
              <T w={p === page ? 'bold' : 'semibold'} size={13.5} color={p === page ? colors.white : colors.ink}>
                {p + 1}
              </T>
            </Pressable>
          ),
        )}
        <Pressable
          onPress={() => onPage(page + 1)}
          disabled={page >= totalPages - 1}
          style={[styles.btn, page >= totalPages - 1 && styles.disabled]}
          accessibilityRole="button"
          accessibilityLabel="Trang sau"
          accessibilityState={{ disabled: page >= totalPages - 1 }}
        >
          <Feather name="chevron-right" size={18} color={colors.ink} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8, marginTop: 14 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 4 },
  btn: {
    minWidth: 40,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  active: { backgroundColor: colors.brand, borderColor: colors.brand },
  disabled: { opacity: 0.4 },
  gap: { width: 20, textAlign: 'center' },
});
