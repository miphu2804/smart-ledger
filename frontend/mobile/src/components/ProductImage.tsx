import React from 'react';
import { Image, StyleSheet, View, type ImageStyle, type StyleProp } from 'react-native';
import { hashIndex } from '../lib/format';
import { tilePalette } from '../theme';
import { T } from './ui';

/**
 * Ảnh của một mặt hàng ở các ô ảnh lớn nhỏ (thẻ ở màn Bán hàng, dòng trong đơn): ảnh chủ tiệm đã gắn, hoặc ô màu có chữ
 * cái đầu của tên khi chưa có ảnh, giống ô ở danh sách Hàng hoá. App không tự lấy ảnh minh hoạ trên mạng cho món chưa có
 * ảnh: ảnh "gần giống" dễ làm chủ tiệm tưởng là ảnh của món mình.
 * `style` là khung ảnh (kích thước, bo góc); `letterSize` là cỡ chữ cái khi chưa có ảnh.
 */
export function ProductImage({
  name,
  uri,
  style,
  letterSize = 18,
}: {
  name: string;
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  letterSize?: number;
}) {
  if (uri && uri.trim()) {
    return <Image source={{ uri }} style={style} resizeMode="cover" accessibilityLabel={`Ảnh ${name}`} />;
  }
  const [bg, fg] = tilePalette[hashIndex(name || '?', tilePalette.length)];
  const letter = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={[StyleSheet.flatten(style) as object, styles.placeholder, { backgroundColor: bg }]} accessibilityLabel={`${name}, chưa có ảnh`}>
      <T w="extrabold" size={letterSize} color={fg}>
        {letter}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', justifyContent: 'center' },
});
