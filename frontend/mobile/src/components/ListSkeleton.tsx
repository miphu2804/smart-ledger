import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useReducedMotion } from '../motion';
import { colors } from '../theme';

/**
 * Khung chờ của danh sách đang tải lần đầu, để màn không trắng. Cả khối nhấp nháy bằng MỘT hiệu ứng ở ngoài cùng (trên web
 * hiệu ứng chạy bằng JavaScript, mỗi ô một vòng lặp như `Skeleton` sẽ nặng); các ô bên trong là khối màu tĩnh.
 */
function Pulse({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const opacity = useRef(new Animated.Value(0.6)).current;
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.6, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return (
    <Animated.View style={[style, { opacity }]} accessibilityLabel="Đang tải" accessibilityRole="progressbar">
      {children}
    </Animated.View>
  );
}

const Block = ({ style }: { style: StyleProp<ViewStyle> }) => <View style={[styles.block, style]} />;

/** Lưới thẻ hàng (2 cột) đang tải, cùng khe và tỉ lệ với thẻ thật ở Bán hàng. */
export function ProductGridSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <Pulse style={styles.grid}>
      {Array.from({ length: rows * 2 }, (_, i) => (
        <View key={i} style={i % 2 === 0 ? styles.cellLeft : styles.cellRight}>
          <View style={styles.card}>
            <Block style={styles.cardImage} />
            <View style={styles.cardBody}>
              <Block style={{ width: '70%', height: 13 }} />
              <Block style={{ width: '45%', height: 15, marginTop: 14 }} />
            </View>
          </View>
        </View>
      ))}
    </Pulse>
  );
}

/** Danh sách dòng (đơn hàng, hàng dạng danh sách) đang tải; `header` thêm một khối như thẻ tổng ở đầu. */
export function RowListSkeleton({ rows = 5, header = false, style }: { rows?: number; header?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <Pulse style={[styles.rows, style]}>
      {header ? <Block style={styles.headerCard} /> : null}
      <Block style={{ width: '45%', height: 14, marginTop: header ? 6 : 0 }} />
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.row}>
          <Block style={styles.rowIcon} />
          <View style={{ flex: 1, gap: 8 }}>
            <Block style={{ width: '50%', height: 13 }} />
            <Block style={{ width: '80%', height: 11 }} />
          </View>
          <Block style={{ width: 64, height: 22, borderRadius: 11 }} />
        </View>
      ))}
    </Pulse>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.border,
    borderRadius: 8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
  },
  cellLeft: { width: '50%', paddingRight: 4 },
  cellRight: { width: '50%', paddingLeft: 4 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  cardImage: {
    aspectRatio: 1,
    width: '100%',
    borderRadius: 0,
  },
  cardBody: {
    padding: 12,
  },
  rows: {
    gap: 8,
  },
  headerCard: {
    height: 76,
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
  },
});
