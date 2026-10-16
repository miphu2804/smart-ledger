import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import type { ThoughtStep } from '../data/types';
import { nextThinkingPhrase } from '../lib/thinkingPhrases';
import { colors } from '../theme';
import { T } from './ui';

// Mẫu "orbit" 3×3 của LatticeLoader (React Bits): độ trễ của mỗi chấm theo bước, đi vòng quanh ô
// giữa bỏ trống. Một vòng = 8 bước × 108ms.
const ORBIT = [0, 1, 2, 7, null, 3, 6, 5, 4];
const CYCLE_STEPS = 8;
const CYCLE_MS = 864;
const IDLE = 0.15;
const SETTLED = 0.55;
const DOT = 6;
const GAP = 2;
const GRID = DOT * 3 + GAP * 2;
const PHRASE_MS = 3500;
const SLIDE_MS = 240;
const SLIDE_PX = 6;
// Dải sáng của nhãn: một lượt quét 1.8s, chữ ngoài dải mờ còn DIM (shimmer của React Bits).
const SHIMMER_MS = 1800;
const SHIMMER_DIM = 0.4;
const SHIMMER_BAND = 0.18;
const USE_NATIVE = Platform.OS !== 'web';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

interface ThoughtLineProps {
  /** Còn đang chờ trợ lý: lưới chạy, đồng hồ đếm, câu chờ đổi. Hết việc thì gập thành "Đã suy nghĩ". */
  working: boolean;
  /** Các bước trợ lý đã và đang làm; mở ra khi đang làm, gập lại khi xong, chạm tiêu đề để mở lại. */
  steps?: ThoughtStep[];
  /** Giây đã suy nghĩ của lượt đã xong; bỏ trống thì đồng hồ tự đếm từ lúc dòng này hiện. */
  elapsed?: number;
  color?: string;
}

/**
 * Dòng suy nghĩ của trợ lý, theo "Thought Line" của React Bits: tiêu đề có đồng hồ, kèm các bước đã làm,
 * gập thành một dòng khi xong. Ngôi sao của mẫu gốc được thay bằng lưới chấm của LatticeLoader.
 */
export function ThoughtLine({ working, steps = [], elapsed, color = colors.brand }: ThoughtLineProps) {
  const [phrase, setPhrase] = useState(() => nextThinkingPhrase());
  const [tenths, setTenths] = useState(() => Math.round((elapsed ?? 0) * 10));
  const [open, setOpen] = useState(working);
  const clock = useRef(new Animated.Value(0)).current;
  // Giữ qua các lần `working` đổi: lượt có tool bị `reset` rồi chạy lại vẫn tính từ lúc đầu.
  const startedAt = useRef(Date.now() - (elapsed ?? 0) * 1000);
  // Đồng hồ render lại 10 lần/giây: dựng node animation một lần thay vì mỗi lần render.
  const opacities = useMemo(() => ORBIT.map((delay) => (delay == null ? IDLE * 0.47 : dotOpacity(clock, delay))), [clock]);

  useEffect(() => {
    if (!working) {
      setOpen(false);
      return;
    }
    setOpen(true);
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // Người bật giảm chuyển động chỉ thấy lưới đứng yên; chữ và đồng hồ vẫn chạy.
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.timing(clock, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }),
      );
      loop.start();
    });
    const timer = setInterval(() => setTenths(Math.floor((Date.now() - startedAt.current) / 100)), 100);
    const rotate = setInterval(() => setPhrase((current) => nextThinkingPhrase(current)), PHRASE_MS);
    return () => {
      cancelled = true;
      loop?.stop();
      clearInterval(timer);
      clearInterval(rotate);
    };
  }, [working, clock]);

  const hasSteps = steps.length > 0;
  const time = elapsedText(tenths);
  return (
    <View>
      <Pressable
        disabled={!hasSteps}
        onPress={() => setOpen((value) => !value)}
        style={styles.row}
        accessibilityRole={hasSteps ? 'button' : 'progressbar'}
        accessibilityState={hasSteps ? { expanded: open } : undefined}
        accessibilityLabel={working ? 'Trợ lý đang suy nghĩ' : `Đã suy nghĩ ${time}`}
      >
        <View style={styles.grid}>
          {ORBIT.map((delay, i) => (
            <Animated.View
              key={i}
              style={[styles.dot, { backgroundColor: color, opacity: working ? opacities[i] : delay == null ? IDLE * 0.47 : SETTLED }]}
            />
          ))}
        </View>
        {/* Đổi câu chờ hay gập lại thành "Đã suy nghĩ" thì nhãn trượt lên và hiện dần. */}
        <SlideIn trigger={working ? phrase : 'settled'} style={styles.label}>
          {working ? (
            <ShimmerText text={phrase} color={colors.ink} />
          ) : (
            <T w="semibold" size={13} color={colors.muted} numberOfLines={1}>
              Đã suy nghĩ
            </T>
          )}
        </SlideIn>
        <T w="medium" size={11.5} color={colors.faint} style={{ fontFamily: MONO }}>
          {time}
        </T>
        {hasSteps ? <Feather name={open ? 'chevron-up' : 'chevron-down'} size={13} color={colors.faint} /> : null}
      </Pressable>
      {open && hasSteps ? (
        <View style={styles.steps}>
          {steps.map((step) => (
            <SlideIn key={step.id} trigger={step.id} style={styles.step}>
              <View style={styles.mark}>
                {step.done ? <Feather name="check" size={11} color={colors.faint} /> : <View style={[styles.running, { backgroundColor: color }]} />}
              </View>
              <T w="medium" size={12.5} color={step.done ? colors.faint : colors.muted}>
                {step.label}
              </T>
            </SlideIn>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Trượt từ dưới lên và hiện dần mỗi khi `trigger` đổi (và lúc mới hiện). */
function SlideIn({ trigger, style, children }: { trigger: string; style?: StyleProp<ViewStyle>; children: React.ReactNode }) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, { toValue: 1, duration: SLIDE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: USE_NATIVE }).start();
  }, [trigger, progress]);
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [SLIDE_PX, 0] });
  return <Animated.View style={[style, { opacity: progress, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/**
 * Nhãn đang chờ: một dải sáng quét qua từng chữ. Mỗi chữ là một view riêng vì opacity không áp được lên
 * đoạn Text lồng nhau; mỗi chữ dựng sẵn đường nội suy theo vị trí của nó nên chạy được bằng native driver.
 */
function ShimmerText({ text, color }: { text: string; color: string }) {
  const sweep = useRef(new Animated.Value(0)).current;
  const chars = useMemo(() => Array.from(text), [text]);
  const opacities = useMemo(() => chars.map((_, i) => charOpacity(sweep, i / Math.max(chars.length - 1, 1))), [chars, sweep]);

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: SHIMMER_MS, easing: Easing.linear, useNativeDriver: USE_NATIVE }));
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [sweep]);

  return (
    <View style={styles.shimmer}>
      {chars.map((char, i) => (
        <Animated.View key={i} style={{ opacity: opacities[i] }}>
          <T w="semibold" size={13} color={color}>
            {char === ' ' ? '\u00A0' : char}
          </T>
        </Animated.View>
      ))}
    </View>
  );
}

/** Dải tâm đi từ trước chữ đầu tới sau chữ cuối; chữ ở vị trí `at` (0–1) sáng khi dải đi ngang qua nó. */
function charOpacity(sweep: Animated.Value, at: number) {
  const span = 1 + 2 * SHIMMER_BAND;
  const peak = (at + SHIMMER_BAND) / span;
  const reach = SHIMMER_BAND / span;
  return sweep.interpolate({
    inputRange: [0, peak - reach, peak, peak + reach, 1],
    outputRange: [SHIMMER_DIM, SHIMMER_DIM, 1, SHIMMER_DIM, SHIMMER_DIM],
  });
}

/** Mỗi chấm sáng ở 18–42% vòng của riêng nó, lệch pha theo độ trễ, giống keyframe `lattice-on`. */
function dotOpacity(clock: Animated.Value, delay: number) {
  const phase = Animated.modulo(Animated.add(clock, 1 - delay / CYCLE_STEPS), 1);
  return phase.interpolate(LATTICE_ON);
}

// Native driver không nhận `easing` trong `interpolate`, nên đường cong bezier được lấy mẫu sẵn
// thành 8 mốc tuyến tính mỗi đoạn giữa các keyframe để giữ dáng nhấp nháy cũ.
const LATTICE_ON = easedRange([0, 0.18, 0.42, 0.62, 1], [IDLE, 1, 1, IDLE, IDLE], Easing.bezier(0.77, 0, 0.175, 1), 8);

function easedRange(keys: number[], levels: number[], ease: (t: number) => number, samples: number) {
  const inputRange: number[] = [];
  const outputRange: number[] = [];
  for (let i = 0; i < keys.length - 1; i++) {
    for (let k = 0; k < samples; k++) {
      const t = k / samples;
      inputRange.push(keys[i] + t * (keys[i + 1] - keys[i]));
      outputRange.push(levels[i] + ease(t) * (levels[i + 1] - levels[i]));
    }
  }
  inputRange.push(keys[keys.length - 1]);
  outputRange.push(levels[levels.length - 1]);
  return { inputRange, outputRange };
}

function elapsedText(tenths: number) {
  return tenths < 600 ? `${(tenths / 10).toFixed(1)}s` : `${Math.floor(tenths / 600)}m ${Math.floor((tenths % 600) / 10)}s`;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  grid: { width: GRID, flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  label: { flexShrink: 1 },
  shimmer: { flexDirection: 'row', flexWrap: 'wrap' },
  // Lệch vào dưới nhãn, qua cột lưới chấm.
  steps: { gap: 6, paddingTop: 8, paddingLeft: GRID + 9 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  mark: { width: 11, height: 11, alignItems: 'center', justifyContent: 'center' },
  running: { width: 5, height: 5, borderRadius: 2.5 },
});
