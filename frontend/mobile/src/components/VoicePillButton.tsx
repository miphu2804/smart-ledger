import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { triggerFeedback } from '../lib/feedback';
import { speechEngine, type SpeechSession } from '../lib/speech';
import { colors, font } from '../theme';
import { useToast } from './brand';
import { COMPOSER_ACTION_SIZE } from './SlingSendButton';

const OPEN_WIDTH = 124;
const BARS = [0.55, 0.9, 0.65, 1, 0.6];
const HOLD_MS = 300;

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Nút mic phình thành viên thuốc có thanh equalizer theo mức mic thật và đồng hồ khi đang ghi (React Bits "Voice Pill").
 * Chạm để bắt đầu rồi chạm lần nữa để dừng, hoặc giữ rồi thả; chữ đang nghe được trả về qua `onPartial`, kết quả cuối (có thể rỗng) qua `onTranscript`.
 */
export function VoicePillButton({
  disabled,
  onPartial,
  onTranscript,
}: {
  disabled?: boolean;
  onPartial: (text: string) => void;
  onTranscript: (text: string) => void;
}) {
  const toast = useToast();
  const open = useRef(new Animated.Value(0)).current;
  const level = useRef(new Animated.Value(0)).current;
  const session = useRef<SpeechSession | null>(null);
  const partial = useRef('');
  const peak = useRef(0);
  const starting = useRef(false);
  const stopWanted = useRef(false);
  const ownPress = useRef(false);
  const downAt = useRef(0);
  const mounted = useRef(true);
  const [phase, setPhase] = useState<'idle' | 'listening' | 'processing'>('idle');
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      const s = session.current;
      session.current = null;
      if (s) void s.stop().catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'listening') return;
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => setElapsed(Date.now() - startedAt), 250);
    return () => clearInterval(timer);
  }, [phase]);

  const swell = (to: 0 | 1) =>
    Animated.spring(open, { toValue: to, friction: 7, tension: 120, useNativeDriver: false }).start();

  const reset = () => {
    session.current = null;
    starting.current = false;
    stopWanted.current = false;
    level.setValue(0);
    swell(0);
    setPhase('idle');
  };

  const finish = async (s: SpeechSession) => {
    session.current = null;
    setPhase('processing');
    triggerFeedback('selection');
    try {
      const text = ((await s.stop()) || partial.current).trim();
      if (!mounted.current) return;
      onTranscript(text);
      if (!text)
        toast(
          peak.current < 0.05
            ? 'Micro không thu được âm thanh. Kiểm tra micro của máy.'
            : 'Chưa nhận ra chữ nào, bạn nói to và gần micro hơn nhé.',
          'err',
        );
    } catch (e) {
      if (mounted.current) toast(`Không xử lý được giọng nói: ${e instanceof Error ? e.message : String(e)}`, 'err');
    }
    if (mounted.current) reset();
  };

  const stop = () => {
    if (session.current) void finish(session.current);
    else if (starting.current) stopWanted.current = true; // mic còn đang bật: dừng ngay khi có phiên
  };

  const begin = async () => {
    if (!speechEngine.supported) {
      toast('Bản app này chưa hỗ trợ nhập bằng giọng nói. Hãy gõ câu hỏi.', 'err');
      return;
    }
    if (!speechEngine.isReady()) {
      toast('Đang tải model giọng nói, thử lại sau ít giây.', 'err');
      speechEngine.prepare().catch((e) => toast(e instanceof Error ? e.message : String(e), 'err'));
      return;
    }
    if (!(await speechEngine.requestPermission())) {
      toast('Cần cấp quyền micro để nhập bằng giọng nói.', 'err');
      return;
    }
    starting.current = true;
    stopWanted.current = false;
    partial.current = '';
    peak.current = 0;
    triggerFeedback('selection');
    swell(1);
    try {
      const s = await speechEngine.start({
        onPartial: (t) => {
          partial.current = t;
          onPartial(t);
        },
        onLevel: (v) => {
          peak.current = Math.max(peak.current, v);
          Animated.timing(level, { toValue: v, duration: 80, useNativeDriver: false }).start();
        },
        onError: (m) => toast(m, 'err'),
      });
      if (!mounted.current) {
        void s.stop().catch(() => undefined);
        return;
      }
      starting.current = false;
      session.current = s;
      setPhase('listening');
      if (stopWanted.current) stop();
    } catch (e) {
      if (!mounted.current) return;
      toast(e instanceof Error ? e.message : String(e), 'err');
      reset();
    }
  };

  const onPressIn = () => {
    if (disabled || phase === 'processing') return;
    downAt.current = Date.now();
    ownPress.current = phase === 'idle' && !starting.current;
    if (ownPress.current) void begin();
    else stop(); // đang ghi: chạm để dừng
  };
  const onPressOut = () => {
    // Giữ rồi thả thì dừng; chạm nhanh thì tiếp tục ghi cho đến lần chạm sau.
    if (ownPress.current && Date.now() - downAt.current >= HOLD_MS) stop();
    ownPress.current = false;
  };

  const width = open.interpolate({ inputRange: [0, 1], outputRange: [COMPOSER_ACTION_SIZE, OPEN_WIDTH] });
  const fade = open.interpolate({ inputRange: [0.5, 1], outputRange: [0, 1], extrapolate: 'clamp' });
  const micShift = open.interpolate({ inputRange: [0, 1], outputRange: [0, -(OPEN_WIDTH - COMPOSER_ACTION_SIZE) / 2 + 4] });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={phase === 'listening' ? 'Dừng ghi âm' : 'Nhập bằng giọng nói'}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={4}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
    >
      <Animated.View style={[styles.pill, { width }]}>
        <Animated.View style={{ transform: [{ translateX: micShift }] }}>
          <Feather name="mic" size={19} color={colors.brand} />
        </Animated.View>
        <Animated.View style={[styles.live, { opacity: fade }]}>
          {BARS.map((top, i) => (
            <Animated.View
              key={i}
              style={[styles.bar, { transform: [{ scaleY: level.interpolate({ inputRange: [0, 1], outputRange: [0.2, top] }) }] }]}
            />
          ))}
          <Text style={styles.time}>{phase === 'processing' ? '…' : clock(elapsed)}</Text>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: COMPOSER_ACTION_SIZE,
    borderRadius: COMPOSER_ACTION_SIZE / 2,
    backgroundColor: colors.brandSoft,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  live: { position: 'absolute', right: 12, flexDirection: 'row', alignItems: 'center', gap: 3, height: 20 },
  bar: { width: 3, height: 20, borderRadius: 2, backgroundColor: colors.brand },
  time: { marginLeft: 5, width: 30, fontFamily: font.semibold, fontSize: 12, color: colors.brand },
});
