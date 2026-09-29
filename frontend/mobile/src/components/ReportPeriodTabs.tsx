import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { spring, useReducedMotion } from '../motion';
import { periodLabel, type Period } from '../lib/stats';
import { colors, shadow } from '../theme';
import { T } from './ui';

export type ReportPeriod = Extract<Period, 'today' | 'thisWeek' | 'month'>;

const options: ReportPeriod[] = ['today', 'thisWeek', 'month'];
const PADDING = 4;

export function ReportPeriodTabs({ value, onChange }: { value: ReportPeriod; onChange: (period: ReportPeriod) => void }) {
  const [optionWidth, setOptionWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();
  const placed = useRef(false);
  const index = options.indexOf(value);

  useEffect(() => {
    if (!optionWidth) return;
    const target = index * optionWidth;
    if (!placed.current || reduced) {
      placed.current = true;
      x.setValue(target);
      return;
    }
    Animated.spring(x, { toValue: target, ...spring.snappy, useNativeDriver: true }).start();
  }, [index, optionWidth, reduced, x]);

  return (
    <View
      accessibilityRole="tablist"
      style={styles.selector}
      onLayout={(event) => setOptionWidth((event.nativeEvent.layout.width - PADDING * 2) / options.length)}
    >
      {optionWidth > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.indicator, { width: optionWidth, transform: [{ translateX: x }] }]} />
      ) : null}
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={styles.option}
          >
            <T w="bold" size={14} color={active ? colors.ink : colors.muted}>
              {periodLabel[option]}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: 'row', backgroundColor: '#F1F0ED', borderRadius: 14, padding: PADDING },
  option: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  indicator: {
    position: 'absolute',
    top: PADDING,
    left: PADDING,
    height: 44,
    borderRadius: 11,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(0),
  },
});
