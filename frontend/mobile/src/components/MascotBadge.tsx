import React from 'react';
import { Image, View } from 'react-native';

/** Use the round badge in the user's original image without changing the asset. */
export function MascotBadge({ size }: { size: number }) {
  const scale = size / 224;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
      <Image
        source={require('../../assets/assistant-mascot-badge.png')}
        resizeMode="stretch"
        style={{
          position: 'absolute',
          width: 334 * scale,
          height: 312 * scale,
          left: -72 * scale,
          top: -40 * scale,
        }}
      />
    </View>
  );
}
