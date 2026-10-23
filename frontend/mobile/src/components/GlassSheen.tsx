import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

/** Static highlight: no animation loop, no touch interception or native blur dependency. */
export function GlassSheen({ radius = 18, tinted = false }: { radius?: number; tinted?: boolean }) {
  return <LinearGradient pointerEvents="none"
    colors={tinted ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0.09)'] : ['rgba(255,255,255,0.85)', 'rgba(255,255,255,0.08)', 'rgba(255,255,255,0.42)']}
    style={[StyleSheet.absoluteFill, { borderRadius: radius }]} />;
}
