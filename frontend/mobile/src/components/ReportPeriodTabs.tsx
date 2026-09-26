import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { periodLabel, type Period } from '../lib/stats';
import { colors, shadow } from '../theme';
import { T } from './ui';

export type ReportPeriod = Extract<Period, 'today' | 'yesterday' | 'month'>;

const options: ReportPeriod[] = ['today', 'yesterday', 'month'];

export function ReportPeriodTabs({ value, onChange }: { value: ReportPeriod; onChange: (period: ReportPeriod) => void }) {
  return (
    <View style={styles.selector}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={[styles.option, active && styles.active]}
          >
            <T w={active ? 'bold' : 'semibold'} size={14} color={active ? colors.ink : colors.muted}>
              {periodLabel[option]}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  selector: { flexDirection: 'row', backgroundColor: '#F1F0ED', borderRadius: 14, padding: 4 },
  option: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 11 },
  active: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, ...shadow(0) },
});
