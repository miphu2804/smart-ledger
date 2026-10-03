import React from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, shadow } from '../theme';

export function CollapsibleHeader({
  scrollY,
  topInset,
  expandedHeight,
  collapsedHeight = 66,
  pinned,
  children,
}: {
  scrollY: Animated.Value;
  topInset: number;
  expandedHeight: number;
  collapsedHeight?: number;
  pinned: React.ReactNode;
  children: React.ReactNode;
}) {
  const distance = Math.max(1, expandedHeight - collapsedHeight);
  const height = scrollY.interpolate({
    inputRange: [0, distance],
    outputRange: [expandedHeight + topInset, collapsedHeight + topInset],
    extrapolate: 'clamp',
  });
  const bodyOpacity = scrollY.interpolate({
    inputRange: [0, distance * 0.68, distance],
    outputRange: [1, 0.18, 0],
    extrapolate: 'clamp',
  });
  const bodyTranslate = scrollY.interpolate({
    inputRange: [0, distance],
    outputRange: [0, -16],
    extrapolate: 'clamp',
  });
  const dividerOpacity = scrollY.interpolate({
    inputRange: [0, distance * 0.8, distance],
    outputRange: [0, 0.35, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.shell, { height }]}>
      <View style={[styles.pinned, { top: topInset, height: collapsedHeight }]}>{pinned}</View>
      <Animated.View
        style={[
          styles.body,
          { top: topInset + collapsedHeight, opacity: bodyOpacity, transform: [{ translateY: bodyTranslate }] },
        ]}
      >
        {children}
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.divider, { opacity: dividerOpacity }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
    backgroundColor: 'rgba(247,246,242,0.98)',
  },
  pinned: { position: 'absolute', left: 16, right: 16, justifyContent: 'center' },
  body: { position: 'absolute', left: 16, right: 16, bottom: 0 },
  divider: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    ...shadow(0),
  },
});
