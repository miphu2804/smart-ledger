import { Feather } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { Tile } from './ui';

/**
 * Ảnh nhỏ của mặt hàng. Có `uri` thì hiện ảnh; chưa có thì hiện ô chữ cái như trước (`placeholder="tile"`) hoặc ô có
 * biểu tượng ảnh (`placeholder="icon"`, dùng trong form). `busy` phủ vòng quay khi đang tải ảnh lên hoặc xoá.
 */
export function ProductThumb({
  name,
  uri,
  size = 42,
  busy = false,
  placeholder = 'tile',
}: {
  name: string;
  uri?: string | null;
  size?: number;
  busy?: boolean;
  placeholder?: 'tile' | 'icon';
}) {
  if (!uri && placeholder === 'tile' && !busy) return <Tile name={name} text={name[0]} size={size} />;
  return (
    <View style={[styles.box, { width: size, height: size, borderRadius: size * 0.3 }]}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" accessibilityLabel={`Ảnh ${name}`} />
      ) : (
        <Feather name="image" size={size * 0.38} color={colors.disabled} />
      )}
      {busy ? (
        <View style={styles.busy}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  busy: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
});
