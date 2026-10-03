import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

export function MascotBadge({ size }: { size: number }) {
  return (
    <View style={[styles.container, { width: size, height: size }]}>
      <Image
        source={require('../../assets/bubblelogo.png')}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});


