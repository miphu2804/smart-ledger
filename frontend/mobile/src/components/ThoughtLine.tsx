import { Feather } from '@expo/vector-icons';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
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
const DOT = 6;
const GAP = 2;
const GRID = DOT * 3 + GAP * 2;
const PHRASE_MS = 3500;
const SLIDE_MS = 240;
const SLIDE_PX = 6;
// Nhãn bước chạy chữ dần: mỗi chữ một nhịp, đủ nhanh để đọc như chữ đang được gõ ra.
const STREAM_MS_PER_CHAR = 18;
// Dải sáng của nhãn: một lượt quét 1.8s, chữ ngoài dải mờ còn DIM (shimmer của React Bits).
const SHIMMER_MS = 1800;
const SHIMMER_DIM = 0.4;
const SHIMMER_BAND = 0.18;
const USE_NATIVE = Platform.OS !== 'web';
const MONO = Platform.select({ ios: 'Menlo', default: 'monospace' });

interface ThoughtLineProps {
  /** Các bước trợ lý đang làm (mỗi lần gọi tool một bước): bước đã xong có dấu tick. */
  steps?: ThoughtStep[];
  color?: string;
}

/**
 * Dòng suy nghĩ của trợ lý lúc chờ câu trả lời, theo "Thought Line" của React Bits: lưới chấm chạy, câu chờ
 * đổi dần, đồng hồ đếm. Khi trợ lý gọi tool thì bước đang làm thế chỗ câu chờ, chữ chạy dần như đang gõ.
 * Ngôi sao của mẫu gốc được thay bằng lưới chấm của LatticeLoader.
 * Có chữ đầu tiên thì màn chat bỏ cả bong bóng này.
 */
export function ThoughtLine({ steps = [], color = colors.brand }: ThoughtLineProps) {
  const [phrase, setPhrase] = useState(() => nextThinkingPhrase());
  const [tenths, setTenths] = useState(0);
  const clock = useRef(new Animated.Value(0)).current;
  // Đồng hồ render lại 10 lần/giây: dựng node animation một lần thay vì mỗi lần render.
  const opacities = useMemo(() => ORBIT.map((delay) => (delay == null ? IDLE * 0.47 : dotOpacity(clock, delay))), [clock]);
  const current = steps[steps.length - 1];

  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    // Người bật giảm chuyển động chỉ thấy lưới đứng yên; chữ và đồng hồ vẫn chạy.
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (cancelled || reduce) return;
      loop = Animated.loop(
        Animated.timing(clock, { toValue: 1, duration: CYCLE_MS, easing: Easing.linear, useNativeDriver: USE_NATIVE }),
      );
      loop.start();
    });
    const startedAt = Date.now();
    const timer = setInterval(() => setTenths(Math.floor((Date.now() - startedAt) / 100)), 100);
    const rotate = setInterval(() => setPhrase((current) => nextThinkingPhrase(current)), PHRASE_MS);
    return () => {
      cancelled = true;
      loop?.stop();
      clearInterval(timer);
      clearInterval(rotate);
    };
  }, [clock]);

  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Trợ lý đang suy nghĩ">
      <View style={styles.row}>
        <View style={styles.grid}>
          {ORBIT.map((delay, i) => (
            <Animated.View key={i} style={[styles.dot, { backgroundColor: color, opacity: opacities[i] }]} />
          ))}
        </View>
        {/* Mỗi lúc chỉ một việc ở ô đầu hàng: bước tool mới nhất thế chỗ câu chờ và bước trước nó. */}
        {current ? (
          // Nhãn bắt đầu đúng chỗ câu chờ; dấu tick đứng sau nhãn nên chữ không dịch khi tool xong.
          <SlideIn key={current.id} trigger={current.id} style={styles.step}>
            <StreamedLabel text={current.label} color={colors.muted} />
            {current.done ? <Feather name="check" size={11} color={colors.faint} /> : null}
          </SlideIn>
        ) : (
          <SlideIn trigger={phrase} style={styles.label}>
            <ShimmerText text={phrase} color={colors.ink} />
          </SlideIn>
        )}
        <T w="medium" size={11.5} color={colors.faint} style={{ fontFamily: MONO }}>
          {elapsedText(tenths)}
        </T>
      </View>
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
  const sweep = useSweep();
  const chars = useMemo(() => Array.from(text), [text]);
  const opacities = useMemo(() => chars.map((_, i) => charOpacity(sweep, i / Math.max(chars.length - 1, 1))), [chars, sweep]);
  return <CharRun chars={chars} opacities={opacities} w="semibold" size={13} color={color} />;
}

/** Nhịp quét sáng lặp mãi của nhãn; người bật giảm chuyển động thì dải sáng đứng yên. */
function useSweep() {
  const sweep = useRef(new Animated.Value(0)).current;
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
  return sweep;
}

/**
 * Nhãn của bước đang làm, chạy chữ dần như đang được gõ ra. Mọi chữ đã nằm sẵn trong hàng nên bề rộng
 * không đổi: bong bóng và đồng hồ không nhảy theo từng chữ, chỉ độ hiện của từng chữ tăng dần.
 * Dải sáng quét qua như câu chờ cả khi tool đã xong: trợ lý vẫn đang viết câu trả lời, chỉ dấu tick báo bước xong.
 */
function StreamedLabel({ text, color }: { text: string; color: string }) {
  const progress = useRef(new Animated.Value(0)).current;
  const sweep = useSweep();
  const chars = useMemo(() => Array.from(text), [text]);
  const opacities = useMemo(
    () =>
      chars.map((_, i) => {
        const typed = progress.interpolate({
          inputRange: [i / chars.length, (i + 1) / chars.length],
          outputRange: [0, 1],
          extrapolate: 'clamp',
        });
        return Animated.multiply(typed, charOpacity(sweep, i / Math.max(chars.length - 1, 1)));
      }),
    [chars, progress, sweep],
  );

  useEffect(() => {
    Animated.timing(progress, {
      toValue: 1,
      duration: chars.length * STREAM_MS_PER_CHAR,
      easing: Easing.linear,
      useNativeDriver: USE_NATIVE,
    }).start();
  }, [progress, chars.length]);

  return <CharRun chars={chars} opacities={opacities} w="medium" size={12.5} color={color} />;
}

/** Mỗi chữ một view vì opacity không áp được lên đoạn Text lồng nhau; nhãn quét sáng và nhãn chạy chữ dùng chung. */
function CharRun({
  chars,
  opacities,
  ...text
}: {
  chars: string[];
  opacities: Animated.AnimatedInterpolation<number>[] | Animated.AnimatedMultiplication<number>[];
} & React.ComponentProps<typeof T>) {
  return (
    <View style={styles.shimmer}>
      {chars.map((char, i) => (
        <Animated.View key={i} style={{ opacity: opacities[i] }}>
          <T {...text}>{char === ' ' ? '\u00A0' : char}</T>
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
  // Câu chờ (hoặc bước đang làm) và đồng hồ chung một hàng.
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 9, rowGap: 4 },
  grid: { width: GRID, flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2 },
  label: { flexShrink: 1 },
  shimmer: { flexDirection: 'row', flexWrap: 'wrap' },
  step: { flexDirection: 'row', alignItems: 'center', gap: 5 },
});
