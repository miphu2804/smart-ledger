import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { dur, spring, useReducedMotion } from '../motion';
import { colors } from '../theme';
import { MascotBadge } from './MascotBadge';
import { T } from './ui';

const RING_SIZE = 64;
const DOCK = 8;
const MENU_WIDTH = 224;
const MENU_ITEM_HEIGHT = 60;
const MENU_GAP = 10;
const MENU_HEIGHT = MENU_ITEM_HEIGHT * 3 + MENU_GAP * 2;
const TAB_BAR_HEIGHT = 58;
const SALES_CART_HEIGHT = 92;
const EDGE = 12;
const HOLD_MS = 500;
const HOLD_DELAY_MS = 150;
const IDLE_MS = 3000;
const IDLE_OPACITY = 0.55;
const SNAP_LOOKAHEAD_MS = 200;
const HOLD_SIZE = RING_SIZE + 12;
const HOLD_RADIUS = RING_SIZE / 2 + 3;
const HOLD_LENGTH = 2 * Math.PI * HOLD_RADIUS;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type Side = 'left' | 'right';
type Anchor = { side: Side; y: number };
type Point = { x: number; y: number };
type Bounds = { width: number; height: number; top: number; bottom: number };

/** Vị trí người dùng chọn, giữ ngoài component để mọi tab dùng chung một tọa độ. */
let savedAnchor: Anchor | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function yRange(bounds: Bounds) {
  const min = bounds.top + EDGE;
  return { min, max: Math.max(min, bounds.height - bounds.bottom - TAB_BAR_HEIGHT - RING_SIZE - EDGE) };
}

/** Điểm hiển thị của một anchor: dính cạnh, còn tung độ chỉ bị kẹp, không ghi đè anchor đã lưu. */
function dockPoint(anchor: Anchor, bounds: Bounds): Point {
  const { min, max } = yRange(bounds);
  return {
    x: anchor.side === 'left' ? DOCK : bounds.width - RING_SIZE - DOCK,
    y: clamp(anchor.y, min, max),
  };
}

function settle(value: Animated.Value, toValue: number, reduced: boolean) {
  return reduced
    ? Animated.timing(value, { toValue, duration: 100, useNativeDriver: true })
    : Animated.spring(value, { toValue, ...spring.soft, useNativeDriver: true });
}

/** Entry AI nổi trên các tab cấp cao; kéo được, thả thì dính cạnh trái/phải như AssistiveTouch. */
export function ZenRing() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isSales = pathname === '/sales';
  const reduced = useReducedMotion();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuMounted, setMenuMounted] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const pos = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const hold = useRef(new Animated.Value(0)).current;
  const scrim = useRef(new Animated.Value(0)).current;
  const items = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const point = useRef<Point>({ x: 0, y: 0 });
  const start = useRef<Point>({ x: 0, y: 0 });
  const anchor = useRef<Anchor | null>(savedAnchor);
  const bounds = useRef<Bounds>({ width: 0, height: 0, top: 0, bottom: 8 });
  const placed = useRef(false);
  const moved = useRef(false);
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const bottomInset = () => Math.max(insets.bottom, 8) + (isSales ? SALES_CART_HEIGHT : 0);

  const glide = (to: Point, vx = 0, vy = 0) => {
    if (reduced) {
      pos.setValue(to);
      point.current = to;
      return;
    }
    const velocity = (n: number) => clamp(n * 1000, -3000, 3000); // PanResponder: px/ms, Animated.spring: px/s
    Animated.parallel([
      Animated.spring(pos.x, { toValue: to.x, velocity: velocity(vx), ...spring.soft, useNativeDriver: true }),
      Animated.spring(pos.y, { toValue: to.y, velocity: velocity(vy), ...spring.soft, useNativeDriver: true }),
    ]).start();
  };

  /** Thả tay: chọn cạnh theo vị trí dự đoán để cú hất nhẹ vẫn bay sang cạnh xa, tung độ giữ nguyên. */
  const dock = (vx: number, vy: number) => {
    const b = bounds.current;
    const side: Side = point.current.x + RING_SIZE / 2 + vx * SNAP_LOOKAHEAD_MS > b.width / 2 ? 'right' : 'left';
    const { min, max } = yRange(b);
    const next: Anchor = { side, y: clamp(point.current.y + vy * 80, min, max) };
    anchor.current = savedAnchor = next;
    glide(dockPoint(next, b), vx, vy);
  };

  const wake = (stayAwake = false) => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = null;
    Animated.timing(fade, { toValue: 1, duration: 120, useNativeDriver: true }).start();
    if (stayAwake) return;
    idleTimer.current = setTimeout(
      () => Animated.timing(fade, { toValue: IDLE_OPACITY, duration: 400, useNativeDriver: true }).start(),
      IDLE_MS,
    );
  };

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    hold.stopAnimation();
    hold.setValue(0);
  };

  const openVoice = () => {
    setMenuOpen(false);
    setShowHint(false);
    router.push('/voice');
  };
  const openChat = () => {
    setMenuOpen(false);
    router.push('/ai');
  };
  const openInsights = () => {
    setMenuOpen(false);
    router.push({ pathname: '/analytics', params: { period: 'today' } });
  };
  const toggleMenu = () => {
    setShowHint(false);
    setMenuOpen((open) => !open);
  };

  const press = () => {
    settle(scale, 0.93, reduced).start();
    if (reduced) return;
    Animated.timing(hold, { toValue: 1, duration: HOLD_MS - HOLD_DELAY_MS, delay: HOLD_DELAY_MS, easing: Easing.linear, useNativeDriver: false }).start();
  };

  // Handler của PanResponder được tạo một lần, nên luôn gọi qua ref để thấy state/prop mới nhất.
  const api = useRef({ dock, wake, clearHold, openVoice, toggleMenu, press, settle: (_to: number) => {} });
  api.current = { dock, wake, clearHold, openVoice, toggleMenu, press, settle: (to) => settle(scale, to, reduced).start() };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        const a = api.current;
        start.current = { ...point.current };
        moved.current = false;
        held.current = false;
        a.clearHold();
        a.wake(true);
        a.press();
        holdTimer.current = setTimeout(() => {
          held.current = true;
          a.openVoice();
        }, HOLD_MS);
      },
      onPanResponderMove: (_, gesture) => {
        const a = api.current;
        if (!moved.current && Math.hypot(gesture.dx, gesture.dy) > 7) {
          moved.current = true;
          a.clearHold();
          setDragging(true);
          setMenuOpen(false);
          setShowHint(false);
          a.settle(1.08);
        }
        if (!moved.current) return;
        const b = bounds.current;
        const { min, max } = yRange(b);
        const next = {
          x: clamp(start.current.x + gesture.dx, 4, Math.max(4, b.width - RING_SIZE - 4)),
          y: clamp(start.current.y + gesture.dy, min, max),
        };
        point.current = next;
        pos.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const a = api.current;
        a.clearHold();
        setDragging(false);
        a.settle(1);
        if (moved.current) {
          a.dock(gesture.vx, gesture.vy);
          a.wake();
        } else if (held.current) a.wake();
        else a.toggleMenu();
      },
      onPanResponderTerminate: () => {
        const a = api.current;
        a.clearHold();
        setDragging(false);
        a.settle(1);
        if (moved.current) a.dock(0, 0);
        a.wake();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  useEffect(() => {
    const id = pos.addListener((value) => {
      point.current = value;
    });
    return () => pos.removeListener(id);
  }, [pos]);

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 4000);
    wake();
    return () => {
      clearTimeout(timer);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (holdTimer.current) clearTimeout(holdTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Đổi tab/route: ring trượt tránh vật cản (giỏ hàng) hoặc trở về đúng anchor đã lưu, không nhảy vị trí.
  useEffect(() => {
    if (!placed.current || !anchor.current) return;
    bounds.current = { ...bounds.current, top: insets.top, bottom: bottomInset() };
    glide(dockPoint(anchor.current, bounds.current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSales, insets.top, insets.bottom]);

  // Menu bung ra từ ring và thu lại; giữ mounted tới khi animation đóng xong.
  useEffect(() => {
    const target = menuOpen ? 1 : 0;
    if (menuOpen) setMenuMounted(true);
    wake(menuOpen);
    const step = (value: Animated.Value) =>
      menuOpen && !reduced
        ? Animated.spring(value, { toValue: 1, ...spring.soft, useNativeDriver: true })
        : Animated.timing(value, { toValue: target, duration: menuOpen ? dur.fast : 130, useNativeDriver: true });
    const run = Animated.parallel([
      Animated.timing(scrim, { toValue: target, duration: menuOpen ? dur.base : 130, useNativeDriver: true }),
      Animated.stagger(menuOpen && !reduced ? 45 : 0, items.map(step)),
    ]);
    run.start(({ finished }) => {
      if (finished && !menuOpen) setMenuMounted(false);
    });
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuOpen, reduced]);

  const onLayout = (width: number, height: number) => {
    if (width < RING_SIZE + EDGE * 2 || height < RING_SIZE + EDGE * 2) return;
    const next = { width, height, top: insets.top, bottom: bottomInset() };
    bounds.current = next;
    if (!anchor.current) anchor.current = savedAnchor = { side: 'right', y: Math.round(height * 0.6) };
    const to = dockPoint(anchor.current, next);
    if (placed.current) glide(to);
    else {
      placed.current = true;
      point.current = to;
      pos.setValue(to);
    }
    setViewport({ width, height });
  };

  const leftRoom = point.current.x - EDGE;
  const rightRoom = viewport.width - point.current.x - RING_SIZE - EDGE;
  const menuSide = leftRoom >= MENU_WIDTH + EDGE ? 'left' : rightRoom >= MENU_WIDTH + EDGE ? 'right' : 'below';
  const menuLeft = menuSide === 'left'
    ? point.current.x - MENU_WIDTH - EDGE
    : menuSide === 'right'
      ? point.current.x + RING_SIZE + EDGE
      : clamp(point.current.x + RING_SIZE / 2 - MENU_WIDTH / 2, EDGE, Math.max(EDGE, viewport.width - MENU_WIDTH - EDGE));
  const menuBottomLimit = Math.max(insets.top + 8, viewport.height - bounds.current.bottom - TAB_BAR_HEIGHT - MENU_HEIGHT - 8);
  const menuTop = clamp(
    menuSide === 'below'
      ? (point.current.y + RING_SIZE + MENU_HEIGHT + 8 <= menuBottomLimit + MENU_HEIGHT
        ? point.current.y + RING_SIZE + 8
        : point.current.y - MENU_HEIGHT - 8)
      : point.current.y + RING_SIZE / 2 - MENU_HEIGHT / 2,
    insets.top + 8,
    menuBottomLimit,
  );
  const menuActions = [
    { title: 'Chatbot', subtitle: 'Hỏi về việc bán hàng', icon: 'message-circle' as const, onPress: openChat },
    { title: 'Giọng nói', subtitle: 'Lên đơn bằng giọng nói', icon: 'mic' as const, onPress: openVoice },
    { title: 'Gợi ý', subtitle: 'Xem phân tích nhanh', icon: 'bar-chart-2' as const, onPress: openInsights },
  ];
  const slideX = menuSide === 'left' ? 36 : menuSide === 'right' ? -36 : 0;
  const slideY = menuSide === 'below' ? -20 : 0;
  const hintLeft = anchor.current?.side === 'left' ? point.current.x + RING_SIZE + 8 : point.current.x - 94;

  return (
    <View
      pointerEvents="box-none"
      style={styles.overlay}
      onLayout={(event) => onLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
    >
      {viewport.width > 0 ? (
        <>
          {menuMounted ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, { opacity: scrim }]} />
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Đóng menu trợ lý" />
              <View style={[styles.menu, { left: menuLeft, top: menuTop }]}>
                {menuActions.map((action, index) => {
                  const shown = items[index];
                  return (
                    <Animated.View
                      key={action.title}
                      style={{
                        alignSelf: menuSide === 'right' ? 'flex-start' : menuSide === 'left' ? 'flex-end' : 'center',
                        opacity: shown,
                        transform: [
                          { translateX: shown.interpolate({ inputRange: [0, 1], outputRange: [slideX, 0] }) },
                          { translateY: shown.interpolate({ inputRange: [0, 1], outputRange: [slideY, 0] }) },
                          { scale: shown.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
                        ],
                      }}
                    >
                      <Pressable
                        style={({ pressed }) => [
                          styles.menuAction,
                          { width: MENU_WIDTH - (index === 0 ? 16 : index === 2 ? 8 : 0) },
                          hoveredAction === action.title && styles.menuActionHover,
                          pressed && styles.menuActionPressed,
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`${action.title}. ${action.subtitle}`}
                        onHoverIn={() => setHoveredAction(action.title)}
                        onHoverOut={() => setHoveredAction(null)}
                        onPress={action.onPress}
                      >
                        <View style={styles.menuIcon}><Feather name={action.icon} size={19} color={colors.accentInk} /></View>
                        <View style={{ flex: 1 }}>
                          <T w="bold" size={15}>{action.title}</T>
                          <T size={12} color={colors.muted}>{action.subtitle}</T>
                        </View>
                      </Pressable>
                    </Animated.View>
                  );
                })}
              </View>
            </View>
          ) : null}
          {showHint && !isSales ? (
            <View pointerEvents="none" style={[styles.hint, { left: hintLeft, top: point.current.y + 13 }]}>
              <T w="semibold" size={12} color={colors.muted}>Giữ để nói</T>
            </View>
          ) : null}
          <Animated.View
            {...pan.panHandlers}
            accessible
            accessibilityRole="button"
            accessibilityLabel="Mascot trợ lý AI"
            accessibilityHint="Chạm để chọn Chatbot, Giọng nói hoặc Gợi ý. Giữ để mở Giọng nói. Có thể kéo đến vị trí khác."
            accessibilityActions={[{ name: 'activate', label: 'Mở tùy chọn AI' }, { name: 'longpress', label: 'Mở Giọng nói' }]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'longpress') openVoice();
              else toggleMenu();
            }}
            style={[
              styles.ring,
              { opacity: fade, transform: [{ translateX: pos.x }, { translateY: pos.y }, { scale }] },
              dragging && styles.ringDragging,
            ]}
          >
            <MascotBadge size={RING_SIZE} />
            <Svg pointerEvents="none" width={HOLD_SIZE} height={HOLD_SIZE} style={styles.holdRing}>
              <AnimatedCircle
                cx={HOLD_SIZE / 2}
                cy={HOLD_SIZE / 2}
                r={HOLD_RADIUS}
                stroke={colors.primary}
                strokeWidth={3}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={HOLD_LENGTH}
                strokeDashoffset={hold.interpolate({ inputRange: [0, 1], outputRange: [HOLD_LENGTH, 0] })}
                rotation={-90}
                origin={`${HOLD_SIZE / 2}, ${HOLD_SIZE / 2}`}
              />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

const ringShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 5px 16px rgba(26,25,22,0.19), 0 12px 26px rgba(26,25,22,0.13)' } as ViewStyle,
  default: { shadowColor: '#1A1916', shadowOpacity: 0.28, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
})!;
const dragShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 9px 26px rgba(26,25,22,0.23)' } as ViewStyle,
  default: { shadowColor: '#1A1916', shadowOpacity: 0.34, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 13 },
})!;
const menuShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 7px 22px rgba(26,25,22,0.13), 0 2px 5px rgba(26,25,22,0.05)' } as ViewStyle,
  default: { shadowColor: '#1A1916', shadowOpacity: 0.16, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 7 },
})!;
const hoverShadow = Platform.select<ViewStyle>({
  web: { boxShadow: '0 12px 28px rgba(26,25,22,0.18), 0 3px 8px rgba(26,25,22,0.07)' } as ViewStyle,
  default: { shadowColor: '#1A1916', shadowOpacity: 0.22, shadowRadius: 17, shadowOffset: { width: 0, height: 8 }, elevation: 9 },
})!;

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 10 },
  ring: {
    position: 'absolute', left: 0, top: 0, width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', ...ringShadow,
  },
  ringDragging: dragShadow,
  holdRing: { position: 'absolute', left: -(HOLD_SIZE - RING_SIZE) / 2, top: -(HOLD_SIZE - RING_SIZE) / 2 },
  scrim: { backgroundColor: 'rgba(26,25,22,0.12)' },
  hint: {
    position: 'absolute', paddingHorizontal: 11, height: 36, borderRadius: 18,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select<ViewStyle>({
      web: { boxShadow: '0 2px 7px rgba(42,41,38,0.05)' } as ViewStyle,
      default: { shadowColor: '#2A2926', shadowOpacity: 0.08, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
    })!,
  },
  menu: {
    position: 'absolute', width: MENU_WIDTH, gap: MENU_GAP,
  },
  menuAction: {
    height: MENU_ITEM_HEIGHT, flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 11, borderRadius: 30,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    ...menuShadow,
  },
  menuActionHover: { transform: [{ translateY: -2 }], ...hoverShadow },
  menuActionPressed: { transform: [{ scale: 0.98 }] },
  menuIcon: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
});
