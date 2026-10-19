import { Feather } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Easing,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { triggerFeedback } from '../lib/feedback';
import { activeQuickNavKey, opensAfterDrag, QUICK_NAV_SECTIONS, type QuickNavItem } from '../lib/quickNav';
import { useReducedMotion } from '../motion';
import { useApp } from '../store/AppStore';
import { colors } from '../theme';
import { T } from './ui';

/**
 * Menu chuyển nhanh bên trái trên các tab chính: bấm nút ☰ ở đầu màn (QuickNavButton) hoặc vuốt từ mép trái thì một bảng
 * trượt ra, liệt kê các màn chính của app; chạm một mục là chuyển ngay. Đóng bằng chạm ra ngoài, vuốt sang trái (trên bảng
 * hay trên nền tối), nút X hoặc nút back của Android.
 *
 * Cử chỉ theo kiểu ngăn kéo quen thuộc của Android/iOS: mép bảng chạy theo ngón tay, thả tay thì bảng chạy tiếp với đúng vận
 * tốc của ngón tay (lò xo không nảy) về trạng thái mở hoặc đóng; mở bằng nút thì trượt ra nhanh rồi chậm dần, đóng thì ngược
 * lại. Trên Android bật điều hướng bằng cử chỉ, vuốt từ mép trái là "quay lại" của hệ thống nên ở đó mở bằng nút ☰.
 */
type QuickNavApi = { open: () => void };

const QuickNavContext = createContext<QuickNavApi | null>(null);

/** Vùng sát mép trái nhận cử chỉ vuốt mở menu. */
const EDGE_WIDTH = 24;
/** Quãng ngón tay phải đi ngang (và ngang rõ hơn dọc) trước khi menu nhận cử chỉ, để không cướp thao tác cuộn hay chạm. */
const DRAG_SLOP = 8;
const OPEN_MS = 260;
const CLOSE_MS = 200;
// Đường cong "emphasized" của Material 3: mở thì lao ra rồi chậm dần, đóng thì tăng tốc dần rồi biến mất
const OPEN_EASING = Easing.bezier(0.05, 0.7, 0.1, 1);
const CLOSE_EASING = Easing.bezier(0.3, 0, 0.8, 0.15);

const horizontal = (dx: number, dy: number) => Math.abs(dx) > DRAG_SLOP && Math.abs(dx) > Math.abs(dy) * 1.5;
const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function QuickNavProvider({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const panelWidth = Math.min(320, Math.round(width * 0.82));
  const progress = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  // Đang trượt đóng: lớp menu (kể cả nền tối đã gần trong suốt) thôi nhận chạm ngay, để chạm vào màn bên dưới không bị nuốt
  const [closing, setClosing] = useState(false);
  const widthRef = useRef(panelWidth);
  widthRef.current = panelWidth;
  const visibleRef = useRef(false);
  visibleRef.current = visible;

  /** `velocity` (phần bảng mỗi giây) có khi thả tay sau khi kéo: chạy tiếp bằng lò xo từ vận tốc đó để không bị khựng. */
  const animateTo = useCallback(
    (to: 0 | 1, velocity?: number) => {
      setClosing(to === 0);
      const done = ({ finished }: { finished: boolean }) => {
        if (finished && to === 0) setVisible(false);
      };
      if (reducedMotion) {
        progress.setValue(to);
        done({ finished: true });
        return;
      }
      const useNativeDriver = Platform.OS !== 'web';
      const animation =
        velocity === undefined
          ? Animated.timing(progress, {
              toValue: to,
              duration: to ? OPEN_MS : CLOSE_MS,
              easing: to ? OPEN_EASING : CLOSE_EASING,
              useNativeDriver,
            })
          : Animated.spring(progress, {
              toValue: to,
              velocity,
              stiffness: 420,
              damping: 42,
              overshootClamping: true,
              restDisplacementThreshold: 0.002,
              restSpeedThreshold: 0.02,
              useNativeDriver,
            });
      animation.start(done);
    },
    [progress, reducedMotion],
  );

  const open = useCallback(() => {
    triggerFeedback('selection');
    setVisible(true);
    animateTo(1);
  }, [animateTo]);

  const close = useCallback(() => animateTo(0), [animateTo]);

  const release = useCallback(
    (openRatio: number, vx: number, startedOpen: boolean) => {
      const velocity = (vx * 1000) / widthRef.current;
      if (opensAfterDrag(openRatio, vx, startedOpen)) {
        if (!startedOpen) triggerFeedback('selection');
        animateTo(1, velocity);
      } else animateTo(0, velocity);
    },
    [animateTo],
  );

  // Vuốt từ mép trái: mép phải của bảng nằm ngay dưới ngón tay
  const edgePan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) =>
          !visibleRef.current && g.x0 <= EDGE_WIDTH && g.dx > 0 && horizontal(g.dx, g.dy),
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (_, g) => {
          progress.stopAnimation();
          progress.setValue(clamp01(g.moveX / widthRef.current));
          setClosing(false);
          setVisible(true);
        },
        onPanResponderMove: (_, g) => progress.setValue(clamp01(g.moveX / widthRef.current)),
        onPanResponderRelease: (_, g) => release(g.moveX / widthRef.current, g.vx, false),
        onPanResponderTerminate: (_, g) => release(g.moveX / widthRef.current, 0, false),
      }),
    [progress, release],
  );

  // Vuốt sang trái khi menu đang mở, trên bảng hay trên nền tối. Bắt ở pha capture để nút của các mục không giữ cử chỉ lại.
  // Bắt đầu trên bảng thì bảng lùi theo quãng ngón tay đi; bắt đầu trên nền tối thì bảng đứng yên tới khi ngón tay chạm mép bảng.
  const overlayPan = useMemo(() => {
    const ratio = (g: { x0: number; dx: number; moveX: number }) =>
      clamp01(g.x0 > widthRef.current ? g.moveX / widthRef.current : 1 + g.dx / widthRef.current);
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dx < 0 && horizontal(g.dx, g.dy),
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => progress.stopAnimation(),
      onPanResponderMove: (_, g) => progress.setValue(ratio(g)),
      onPanResponderRelease: (_, g) => release(ratio(g), g.vx, true),
      onPanResponderTerminate: (_, g) => release(ratio(g), 0, true),
    });
  }, [progress, release]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [close, visible]);

  const go = useCallback(
    (item: QuickNavItem) => {
      triggerFeedback('selection');
      close();
      if (item.tab) router.navigate(item.href);
      else router.push(item.href);
    },
    [close],
  );

  const api = useMemo(() => ({ open }), [open]);

  return (
    <QuickNavContext.Provider value={api}>
      <View style={styles.root} {...edgePan.panHandlers}>
        {children}
        {visible ? (
          <QuickNavPanel
            progress={progress}
            panelWidth={panelWidth}
            interactive={!closing}
            onClose={close}
            onSelect={go}
            panHandlers={overlayPan.panHandlers}
          />
        ) : null}
      </View>
    </QuickNavContext.Provider>
  );
}

export function useQuickNav() {
  return useContext(QuickNavContext);
}

function QuickNavPanel({
  progress,
  panelWidth,
  interactive,
  onClose,
  onSelect,
  panHandlers,
}: {
  progress: Animated.Value;
  panelWidth: number;
  interactive: boolean;
  onClose: () => void;
  onSelect: (item: QuickNavItem) => void;
  panHandlers: ReturnType<typeof PanResponder.create>['panHandlers'];
}) {
  const insets = useSafeAreaInsets();
  const app = useApp();
  const activeKey = activeQuickNavKey(usePathname());
  const storeName = app.store.name.trim();
  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-panelWidth, 0] });

  return (
    <View style={[StyleSheet.absoluteFill, styles.layer]} pointerEvents={interactive ? 'auto' : 'none'} {...panHandlers}>
      {/* Bảng trắng nằm dưới thanh trạng thái: chữ và biểu tượng của thanh trạng thái phải tối (Tổng quan đang để sáng) */}
      <StatusBar style="dark" />
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng menu" />
      </Animated.View>
      <Animated.View
        accessibilityViewIsModal
        accessibilityLabel="Menu chuyển nhanh"
        style={[
          styles.panel,
          { width: panelWidth, paddingTop: insets.top + 14, paddingBottom: insets.bottom + 12, transform: [{ translateX }] },
        ]}
      >
        <View style={styles.panelHeader}>
          <View style={styles.avatar}>
            <T w="extrabold" size={17} color={colors.white}>
              {storeName.charAt(0).toUpperCase() || 'S'}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T w="extrabold" size={15.5} color={colors.ink} numberOfLines={1}>
              {storeName || 'Sổ Nghe Lời'}
            </T>
            <T size={12} color={colors.muted} numberOfLines={1} style={{ marginTop: 2 }}>
              Chuyển nhanh
            </T>
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Đóng menu"
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}
          >
            <Feather name="x" size={18} color={colors.ink} />
          </Pressable>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {QUICK_NAV_SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <T w="bold" size={11.5} color={colors.muted} style={styles.sectionTitle}>
                {section.title}
              </T>
              {section.items.map((item) => {
                const active = item.key === activeKey;
                return (
                  <Pressable
                    key={item.key}
                    onPress={() => onSelect(item)}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [styles.item, active && styles.itemActive, pressed && !active && styles.itemPressed]}
                  >
                    <View style={[styles.itemIcon, active && styles.itemIconActive]}>
                      <Feather
                        name={item.icon as React.ComponentProps<typeof Feather>['name']}
                        size={18}
                        color={active ? colors.white : colors.brand}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w="bold" size={14.5} color={active ? colors.brand : colors.ink} numberOfLines={1}>
                        {item.label}
                      </T>
                      <T size={11.5} color={colors.muted} numberOfLines={1} style={{ marginTop: 1 }}>
                        {item.hint}
                      </T>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/**
 * Nút ☰ mở menu chuyển nhanh, đặt ở đầu các tab chính. `dark` dùng trên nền tím của Tổng quan; `compact` là cỡ nhỏ cho phần
 * đầu đã thu gọn khi cuộn (cùng cỡ với các nút gọn của Bán hàng), để mở được menu mà không phải cuộn lên.
 */
export function QuickNavButton({
  tone = 'light',
  compact = false,
  style,
}: {
  tone?: 'light' | 'dark';
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const nav = useQuickNav();
  if (!nav) return null;
  return (
    <Pressable
      onPress={nav.open}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Mở menu chuyển nhanh"
      style={({ pressed }) => [
        tone === 'dark' ? styles.buttonDark : styles.buttonLight,
        compact && styles.buttonCompact,
        pressed && styles.pressed,
        style,
      ]}
    >
      <Feather name="menu" size={compact ? 18 : tone === 'dark' ? 22 : 20} color={tone === 'dark' ? colors.white : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // Trên mascot nổi (ZenRing, zIndex 10, elevation tới 13) và thanh tab (zIndex 40)
  layer: { zIndex: 200, elevation: 30 },
  backdrop: { backgroundColor: 'rgba(26, 25, 22, 0.45)' },
  panel: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.card,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 14,
    ...(Platform.select({
      web: { boxShadow: '8px 0 32px rgba(26, 25, 22, 0.18)' } as ViewStyle,
      default: {
        shadowColor: '#1A1916',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 6, height: 0 },
        elevation: 16,
      },
    })),
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingTop: 6, paddingBottom: 8 },
  section: { marginTop: 12 },
  sectionTitle: { paddingHorizontal: 6, marginBottom: 6, letterSpacing: 0.4 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 8,
    paddingVertical: 7,
    borderRadius: 16,
  },
  itemActive: { backgroundColor: colors.brandSoft },
  itemPressed: { backgroundColor: colors.primaryTint },
  itemIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.brandTint,
    borderWidth: 1,
    borderColor: colors.brandBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemIconActive: { backgroundColor: colors.brand, borderColor: colors.brand },
  // Cùng cỡ và bo góc với ô tìm của Bán hàng và Đơn hàng (TabSearchBar)
  buttonLight: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDark: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(31, 18, 80, 0.56)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: { width: 36, height: 36, borderRadius: 11 },
  pressed: { opacity: 0.75 },
});
