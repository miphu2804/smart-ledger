import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme';
import { MascotBadge } from './MascotBadge';
import { T } from './ui';

const RING_SIZE = 64;
const VISIBLE_AT_EDGE = 56;
const MENU_WIDTH = 224;
const MENU_ITEM_HEIGHT = 60;
const MENU_GAP = 10;
const MENU_HEIGHT = MENU_ITEM_HEIGHT * 3 + MENU_GAP * 2;
const TAB_BAR_HEIGHT = 58;
const SALES_CART_HEIGHT = 92;
const EDGE = 12;
const HOLD_MS = 500;

type Point = { x: number; y: number };
type Bounds = { width: number; height: number; top: number; bottom: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function insideScreen(point: Point, bounds: Bounds): Point {
  const minY = bounds.top + EDGE;
  return {
    x: clamp(point.x, EDGE, Math.max(EDGE, bounds.width - VISIBLE_AT_EDGE)),
    y: clamp(
      point.y,
      minY,
      Math.max(minY, bounds.height - bounds.bottom - TAB_BAR_HEIGHT - RING_SIZE - EDGE),
    ),
  };
}

function restingPoint(bounds: Bounds, isSales: boolean, isHome: boolean): Point {
  let y = bounds.height - bounds.bottom - TAB_BAR_HEIGHT - RING_SIZE - 16;
  if (isSales) y = bounds.top + EDGE;
  else if (isHome) y = bounds.top + 90;
  return {
    x: bounds.width - VISIBLE_AT_EDGE,
    y,
  };
}

/** Entry AI nổi trên các tab cấp cao; voice và chat hiện vẫn dùng dữ liệu demo. */
export function ZenRing() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const isSales = pathname === '/sales';
  const isHome = pathname === '/';
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [menuOpen, setMenuOpen] = useState(false);
  const [showHint, setShowHint] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [hoveredAction, setHoveredAction] = useState<string | null>(null);
  const position = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const point = useRef<Point>({ x: 0, y: 0 });
  const start = useRef<Point>({ x: 0, y: 0 });
  const bounds = useRef<Bounds>({ width: 0, height: 0, top: 0, bottom: 8 });
  const placed = useRef(false);
  const userMoved = useRef(false);
  const moved = useRef(false);
  const held = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  useEffect(() => {
    const timer = setTimeout(() => setShowHint(false), 4000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => () => clearHold(), []);

  useEffect(() => {
    if (!placed.current) return;
    bounds.current = {
      ...bounds.current,
      top: insets.top,
      bottom: Math.max(insets.bottom, 8) + (isSales ? SALES_CART_HEIGHT : 0),
    };
    point.current = insideScreen(
      userMoved.current ? point.current : restingPoint(bounds.current, isSales, isHome),
      bounds.current,
    );
    position.setValue(point.current);
    setShowHint(false);
  }, [isSales, isHome, insets.top, insets.bottom, position]);

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

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { ...point.current };
        moved.current = false;
        held.current = false;
        clearHold();
        holdTimer.current = setTimeout(() => {
          held.current = true;
          openVoice();
        }, HOLD_MS);
      },
      onPanResponderMove: (_, gesture) => {
        if (Math.hypot(gesture.dx, gesture.dy) > 7 && !moved.current) {
          moved.current = true;
          userMoved.current = true;
          clearHold();
          setDragging(true);
          setMenuOpen(false);
          setShowHint(false);
        }
        if (moved.current) {
          point.current = insideScreen(
            { x: start.current.x + gesture.dx, y: start.current.y + gesture.dy },
            bounds.current,
          );
          position.setValue(point.current);
        }
      },
      onPanResponderRelease: () => {
        clearHold();
        setDragging(false);
        if (!moved.current && !held.current) {
          setShowHint(false);
          setMenuOpen((open) => !open);
        }
      },
      onPanResponderTerminate: () => {
        clearHold();
        setDragging(false);
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const onLayout = (width: number, height: number) => {
    if (width < RING_SIZE + EDGE * 2 || height < RING_SIZE + EDGE * 2) return;
    const nextBounds = { width, height, top: insets.top, bottom: Math.max(insets.bottom, 8) + (isSales ? SALES_CART_HEIGHT : 0) };
    bounds.current = nextBounds;
    point.current = insideScreen(
      placed.current ? point.current : restingPoint(nextBounds, isSales, isHome),
      nextBounds,
    );
    placed.current = true;
    position.setValue(point.current);
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
  const hintLeft = point.current.x > viewport.width / 2 ? point.current.x - 94 : point.current.x + RING_SIZE + 8;

  return (
    <View
      pointerEvents="box-none"
      style={styles.overlay}
      onLayout={(event) => onLayout(event.nativeEvent.layout.width, event.nativeEvent.layout.height)}
    >
      {viewport.width > 0 ? (
        <>
          {menuOpen ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setMenuOpen(false)} accessibilityLabel="Đóng menu trợ lý" />
              <View style={[styles.menu, { left: menuLeft, top: menuTop }]}>
                {menuActions.map((action, index) => (
                  <Pressable
                    key={action.title}
                    style={({ pressed }) => [
                      styles.menuAction,
                      {
                        width: MENU_WIDTH - (index === 0 ? 16 : index === 2 ? 8 : 0),
                        alignSelf: menuSide === 'right' ? 'flex-start' : menuSide === 'left' ? 'flex-end' : 'center',
                      },
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
                ))}
              </View>
            </View>
          ) : null}
          {showHint && !isSales ? (
            <View pointerEvents="none" style={[styles.hint, { left: hintLeft, top: isHome ? point.current.y - 40 : point.current.y + 13 }]}>
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
              else setMenuOpen((open) => !open);
            }}
            style={[styles.ring, { left: position.x, top: position.y }, dragging && styles.ringDragging]}
          >
            <MascotBadge size={RING_SIZE} />
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
    position: 'absolute', width: RING_SIZE, height: RING_SIZE, borderRadius: RING_SIZE / 2,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center', ...ringShadow,
  },
  ringDragging: { transform: [{ scale: 1.06 }], ...dragShadow },
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
