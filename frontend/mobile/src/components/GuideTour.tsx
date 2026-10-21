import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerFeedback } from '../lib/feedback';
import { GUIDE_STEPS, personalizeStep, type GuideTarget } from '../lib/guideSteps';
import { useReducedMotion } from '../motion';
import { colors } from '../theme';
import { T } from './ui';

/**
 * Hướng dẫn dạng lớp phủ trên các tab chính: làm tối màn hình, chừa sáng đúng nút đang nói tới (khung sáng chạy từ nút này sang
 * nút kia) và một thẻ Bobi giải thích với Quay lại / Tiếp / Bỏ qua. Chạm vào chính nút đang sáng cũng sang bước kế (không mở nút đó).
 * Các nút tự đăng ký vị trí bằng `useGuideTarget(key)` (gắn vào `ref`); lớp phủ đo bằng `measureInWindow` lúc tới bước đó và trừ
 * vị trí của chính lớp phủ, nên đúng cả trên web (khung app nằm giữa trang). Không đo được (nút chưa hiện) thì thẻ nằm giữa màn.
 * Bật/tắt do AppStore (`guideDismissed`): chạy một lần cho mỗi tài khoản trên máy, xem lại ở tab Quản lý.
 */
type Registry = { register: (key: GuideTarget, node: View | null) => void };

const GuideContext = createContext<Registry | null>(null);

/** Gắn vào `ref` của nút để lớp phủ hướng dẫn khoanh sáng được nút đó. */
export function useGuideTarget(key: GuideTarget) {
  const ctx = useContext(GuideContext);
  return useCallback((node: View | null) => ctx?.register(key, node), [ctx, key]);
}

export function GuideTourProvider({
  active,
  onFinish,
  userName,
  children,
}: {
  active: boolean;
  onFinish: () => void;
  /** Họ tên chủ tiệm: Bobi gọi tên trong lời chào và lời kết */
  userName?: string;
  children: React.ReactNode;
}) {
  const nodes = useRef(new Map<GuideTarget, View>()).current;
  const registry = useMemo<Registry>(
    () => ({
      register: (key, node) => {
        if (node) nodes.set(key, node);
        else nodes.delete(key);
      },
    }),
    [nodes],
  );
  return (
    <GuideContext.Provider value={registry}>
      <View style={styles.root}>
        {/* Hướng dẫn mở thì ẩn nội dung nền khỏi TalkBack: `accessibilityViewIsModal` của lớp phủ chỉ có tác dụng trên iOS */}
        <View style={styles.content} importantForAccessibility={active ? 'no-hide-descendants' : 'auto'}>
          {children}
        </View>
        {active ? <GuideOverlay nodes={nodes} onFinish={onFinish} userName={userName} /> : null}
      </View>
    </GuideContext.Provider>
  );
}

type Rect = { x: number; y: number; w: number; h: number };

/** Khoảng hở quanh nút trong khung sáng */
const PAD = 6;
const MOVE_MS = 260;
/** Bo góc của khung sáng (trừ mascot tròn) */
const RADIUS = 16;
const BOBI = require('../../assets/bobi-bubble.png');

function GuideOverlay({ nodes, onFinish, userName }: { nodes: Map<GuideTarget, View>; onFinish: () => void; userName?: string }) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const rootRef = useRef<View>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = useMemo(() => personalizeStep(GUIDE_STEPS[index], userName), [index, userName]);
  const last = index === GUIDE_STEPS.length - 1;

  const fade = useRef(new Animated.Value(0)).current;
  const card = useRef(new Animated.Value(0)).current;
  const hole = useRef({
    x: new Animated.Value(0),
    y: new Animated.Value(0),
    w: new Animated.Value(0),
    h: new Animated.Value(0),
  }).current;
  const placed = useRef(false);

  useEffect(() => {
    Animated.timing(fade, { toValue: 1, duration: reduced ? 0 : 220, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [fade, reduced]);

  // Đo nút của bước hiện tại (thử lại vài lần khi nút chưa kịp hiện hay chưa có kích thước)
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const target = step.target;
    if (!target) {
      setRect(null);
      return;
    }
    const measure = (attempt: number) => {
      const node = nodes.get(target);
      const root = rootRef.current;
      const retry = () => {
        if (attempt < 8) timer = setTimeout(() => !cancelled && measure(attempt + 1), 120);
        else if (!cancelled) setRect(null);
      };
      if (!node || !root) return retry();
      root.measureInWindow((ox, oy) => {
        node.measureInWindow((x, y, w, h) => {
          if (cancelled) return;
          if (!w || !h) return retry();
          setRect({ x: x - ox - PAD, y: y - oy - PAD, w: w + PAD * 2, h: h + PAD * 2 });
        });
      });
    };
    timer = setTimeout(() => measure(0), 60);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [nodes, step.target, size.width, size.height]);

  // Khung sáng chạy từ nút cũ sang nút mới; lần đầu (hoặc giảm chuyển động) thì đặt thẳng
  useEffect(() => {
    if (!rect) return;
    const to = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
    if (reduced || !placed.current) {
      hole.x.setValue(to.x);
      hole.y.setValue(to.y);
      hole.w.setValue(to.w);
      hole.h.setValue(to.h);
      placed.current = true;
      return;
    }
    Animated.parallel(
      (Object.keys(to) as (keyof Rect)[]).map((k) =>
        Animated.timing(hole[k], { toValue: to[k], duration: MOVE_MS, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ),
    ).start();
  }, [rect, reduced, hole]);

  // Thẻ giải thích hiện dần ở mỗi bước; trình đọc màn hình đọc tiêu đề bước mới
  useEffect(() => {
    card.setValue(reduced ? 1 : 0);
    if (!reduced) Animated.timing(card, { toValue: 1, duration: 200, delay: 80, useNativeDriver: Platform.OS !== 'web' }).start();
    AccessibilityInfo.announceForAccessibility?.(`${step.title}. ${step.body}`);
  }, [index, card, reduced, step.title, step.body]);

  const finish = useCallback(() => {
    triggerFeedback('selection');
    onFinish();
  }, [onFinish]);
  const next = useCallback(() => {
    triggerFeedback('selection');
    if (last) onFinish();
    else setIndex((i) => i + 1);
  }, [last, onFinish]);
  const back = useCallback(() => {
    triggerFeedback('selection');
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  // Nút back của Android: lùi một bước, ở bước đầu thì đóng hướng dẫn
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) back();
      else finish();
      return true;
    });
    return () => sub.remove();
  }, [index, back, finish]);

  // Thẻ nằm dưới nút khi nút ở nửa trên màn hình, ngược lại nằm trên nút; không có nút thì nằm giữa
  const cardPlacement: ViewStyle = !rect
    ? { top: Math.max(insets.top + 24, size.height * 0.28) }
    : rect.y + rect.h / 2 < size.height / 2
      ? { top: rect.y + rect.h + 14 }
      : { bottom: Math.max(16, size.height - rect.y + 14) };

  // Độ dày viền của lớp tối: đủ phủ hết màn từ bất kỳ vị trí nào của lỗ
  const span = Math.max(size.width, size.height, 1000);
  return (
    <View
      ref={rootRef}
      collapsable={false}
      style={[StyleSheet.absoluteFill, styles.layer]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      accessibilityViewIsModal
    >
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
        {rect ? (
          <>
            {/* Lớp tối có lỗ bo góc đúng bằng khung sáng: một khung viền rất dày (dày hơn cả màn hình) ôm quanh lỗ, bo góc ngoài
                = bo góc lỗ + độ dày viền nên góc trong cũng bo đúng, không lộ bốn góc sáng như khi ghép bốn mảng chữ nhật.
                Chạm vào phần tối không làm gì (chặn thao tác bên dưới). */}
            <Animated.View
              style={[
                styles.frame,
                {
                  borderWidth: span,
                  left: Animated.subtract(hole.x, span),
                  top: Animated.subtract(hole.y, span),
                  width: Animated.add(hole.w, span * 2),
                  height: Animated.add(hole.h, span * 2),
                  borderRadius: step.round ? Animated.add(Animated.multiply(hole.h, 0.5), span) : RADIUS + span,
                },
              ]}
              onStartShouldSetResponder={() => true}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.ring, step.round && styles.ringRound, { left: hole.x, top: hole.y, width: hole.w, height: hole.h }]}
            />
            {/* Chạm vào nút đang sáng: sang bước kế thay vì mở nút đó. Đặt theo vị trí đã đo (không theo khung đang chạy): trên
                Android một nút con nằm trong khung chạy bằng Animated không được tính lại kích thước nên chạm bị lọt xuống nút thật. */}
            <Pressable
              style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h }}
              onPress={next}
              accessibilityRole="button"
              accessibilityLabel={last ? 'Xong hướng dẫn' : 'Sang bước tiếp theo'}
            />
          </>
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.dim]} onStartShouldSetResponder={() => true} />
        )}

        <Animated.View
          style={[
            styles.card,
            cardPlacement,
            {
              opacity: card,
              transform: [{ translateY: card.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
            },
          ]}
        >
          <View style={styles.cardMain}>
            {/* Bobi "nói" lời hướng dẫn: dấu thương hiệu ở mọi bước, to hơn ở thẻ chào */}
            <Image
              source={BOBI}
              style={index === 0 ? styles.bobiLarge : styles.bobi}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
            <View style={styles.cardText}>
              <View style={styles.cardHead}>
                <T w="bold" size={11} color={colors.brand} style={styles.counter}>
                  {index === 0 ? 'HƯỚNG DẪN NHANH' : `BƯỚC ${index}/${GUIDE_STEPS.length - 1}`}
                </T>
                {!last ? (
                  <Pressable onPress={finish} hitSlop={10} accessibilityRole="button" accessibilityLabel="Bỏ qua hướng dẫn">
                    <T w="semibold" size={13} color={colors.muted}>
                      Bỏ qua
                    </T>
                  </Pressable>
                ) : null}
              </View>
              <T w="extrabold" size={17} color={colors.ink} style={{ marginTop: 2 }}>
                {step.title}
              </T>
              <T size={13.5} color={colors.inkSecondary} style={styles.body}>
                {step.body}
              </T>
            </View>
          </View>
          <View style={styles.actions}>
            <View style={styles.dots}>
              {GUIDE_STEPS.map((s, i) => (
                <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
            {index > 0 ? (
              <Pressable
                onPress={back}
                accessibilityRole="button"
                style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}
              >
                <T w="bold" size={14} color={colors.ink}>
                  Quay lại
                </T>
              </Pressable>
            ) : null}
            <Pressable
              onPress={next}
              accessibilityRole="button"
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}
            >
              <T w="bold" size={14} color={colors.white}>
                {index === 0 ? 'Bắt đầu' : last ? 'Xong' : 'Tiếp'}
              </T>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const DIM = 'rgba(17, 12, 38, 0.72)';

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1 },
  // Trên menu chuyển nhanh (200), thanh tab (40) và mascot (10)
  layer: { zIndex: 300, elevation: 40 },
  dim: { position: 'absolute', backgroundColor: DIM },
  frame: { position: 'absolute', borderColor: DIM },
  ring: {
    position: 'absolute',
    borderRadius: RADIUS,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  ringRound: { borderRadius: 999 },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
    ...Platform.select({
      web: { boxShadow: '0 12px 32px rgba(17, 12, 38, 0.35)' } as ViewStyle,
      default: {
        shadowColor: '#110C26',
        shadowOpacity: 0.3,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      },
    }),
  },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardText: { flex: 1, minWidth: 0 },
  bobi: { width: 52, height: 52 },
  bobiLarge: { width: 68, height: 68 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  counter: { letterSpacing: 0.6 },
  body: { marginTop: 4, lineHeight: 20 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14 },
  dots: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { width: 16, backgroundColor: colors.brand },
  btn: { height: 40, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.primarySoft },
  btnPrimary: { backgroundColor: colors.brand },
  pressed: { opacity: 0.85 },
});
