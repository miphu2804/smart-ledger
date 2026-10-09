import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Platform, Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeScannerModal } from '../src/components/BarcodeScannerModal';
import { useToast } from '../src/components/brand';
import { Button, Dialog, EmptyState, Field, Row, Sheet, Stepper, T } from '../src/components/ui';
import type { CategoryView, LineItem, ProductView } from '../src/data/types';
import { categoryApi, productApi } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { triggerFeedback } from '../src/lib/feedback';
import { abbr, hashIndex, normalizeText, vnd } from '../src/lib/format';
import { getProductImage } from '../src/lib/productImages';
import { itemsTotal } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, font, shadow } from '../src/theme';

const salesColors = {
  primary: colors.brand, // #482AAC
  primarySoft: colors.brandSoft,
  primaryTint: colors.brandTint,
  primaryBorder: colors.brandBorder,
  pageBg: colors.bg,
  cardBg: colors.card,
  border: colors.border,
  borderLight: colors.borderLight,
  muted: colors.muted,
  faint: colors.faint,
  ink: colors.ink,
  inkSecondary: colors.inkSecondary,
  stockGreen: colors.data.revenue,
  stockGreenBg: colors.data.revenueSoft,
  stockGreenBorder: '#C2E7B0',
};

const productTones = [
  { bg: '#EFEDE7', fg: '#4B463F', badgeBg: '#FFFFFF', badgeFg: colors.data.revenue },
  { bg: '#F8E9C8', fg: '#78510C', badgeBg: '#FFFFFF', badgeFg: colors.data.revenue },
  { bg: '#E8E6DD', fg: '#4D5148', badgeBg: '#FFFFFF', badgeFg: colors.data.revenue },
  { bg: '#EFF2E7', fg: '#45513E', badgeBg: '#FFFFFF', badgeFg: colors.data.revenue },
  { bg: '#F8E2DE', fg: '#862B20', badgeBg: '#FFFFFF', badgeFg: colors.data.revenue },
  { bg: '#EAF1E1', fg: '#355A25', badgeBg: '#FFFFFF', badgeFg: colors.data.revenue },
];

function categoryMeta(label: string): { icon: React.ComponentProps<typeof Feather>['name']; color: string } {
  const key = normalizeText(label);
  if (key.includes('uong') || key.includes('drink')) return { icon: 'coffee', color: colors.brand };
  if (key.includes('an') || key.includes('food')) return { icon: 'coffee', color: colors.muted };
  if (key.includes('tap') || key.includes('grocery')) return { icon: 'shopping-bag', color: colors.data.expense };
  if (key.includes('thuc') || key.includes('nong')) return { icon: 'package', color: colors.data.revenue };
  return { icon: 'archive', color: colors.brand };
}

function PosCategoryChips({
  value,
  options,
  onChange,
}: {
  value: string;
  options: Array<{ key: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catScroll}>
      {options.map((option) => {
        const active = option.key === value;
        const meta = option.key === 'all' ? { icon: 'grid' as const, color: '#FFFFFF' } : categoryMeta(option.label);
        return (
          <Pressable
            key={option.key}
            onPress={() => {
              triggerFeedback('selection');
              onChange(option.key);
            }}
            style={({ pressed }) => [styles.catPill, active && styles.catPillActive, pressed && { opacity: 0.8 }]}
          >
            <Feather
              name={meta.icon}
              size={14}
              color={active ? '#FFFFFF' : meta.color}
            />
            <T
              w={active ? 'bold' : 'medium'}
              size={13}
              color={active ? '#FFFFFF' : salesColors.inkSecondary}
              numberOfLines={1}
            >
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PosActionButton({
  icon,
  label,
  onPress,
  compact,
  tone = 'purple',
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress: () => void;
  compact?: boolean;
  tone?: 'purple' | 'gold';
}) {
  const isPurple = tone === 'purple';
  return (
    <Pressable
      onPress={() => {
        triggerFeedback('selection');
        onPress();
      }}
      style={({ pressed }) => [
        compact
          ? isPurple
            ? styles.actionCompactPurple
            : styles.actionCompactGold
          : isPurple
            ? styles.actionHeroPurple
            : styles.actionHeroGold,
        pressed && { opacity: 0.84, transform: [{ scale: 0.97 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather
        name={icon}
        size={compact ? 17 : 16}
        color={isPurple ? '#F8DF69' : colors.brand}
      />
      {!compact ? (
        <T w="bold" size={13} color={isPurple ? colors.white : colors.ink} numberOfLines={1}>
          {label}
        </T>
      ) : null}
    </Pressable>
  );
}

function PosSearchBox({
  value,
  onChangeText,
  onBarcodePress,
  compact,
}: {
  value: string;
  onChangeText: (value: string) => void;
  onBarcodePress?: () => void;
  compact?: boolean;
}) {
  return (
    <View style={[styles.searchBox, compact && styles.searchBoxCompact]}>
      <Feather name="search" size={compact ? 16 : 18} color={salesColors.faint} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder="Tìm theo tên hoặc mã vạch..."
        placeholderTextColor="#9CA3AF"
        style={[styles.searchInput, compact && styles.searchInputCompact]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}>
          <Feather name="x-circle" size={15} color={salesColors.muted} />
        </Pressable>
      ) : onBarcodePress && !compact ? (
        <Pressable onPress={onBarcodePress} hitSlop={8} style={styles.barcodeScanIconBtn} accessibilityLabel="Quét mã vạch">
          <Feather name="maximize" size={16} color={salesColors.inkSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

function PosCollapsibleHeader({
  scrollY,
  topInset,
  expandedHeight,
  collapsedHeight,
  pinned,
  onBodyHeight,
  children,
}: {
  scrollY: Animated.Value;
  topInset: number;
  expandedHeight: number;
  collapsedHeight: number;
  pinned: React.ReactNode;
  onBodyHeight: (height: number) => void;
  children: React.ReactNode;
}) {
  const distance = Math.max(1, expandedHeight - collapsedHeight);
  // Chỉ dùng transform và opacity để chạy ở luồng giao diện: khung cố định chiều cao rồi trượt lên, phần ghim và thân bù ngược (xem CollapsibleHeader).
  const shellTranslate = scrollY.interpolate({
    inputRange: [0, distance],
    outputRange: [0, -distance],
    extrapolate: 'clamp',
  });
  const counterTranslate = scrollY.interpolate({
    inputRange: [0, distance],
    outputRange: [0, distance],
    extrapolate: 'clamp',
  });
  const bodyOpacity = scrollY.interpolate({
    inputRange: [0, distance * 0.55, distance],
    outputRange: [1, 0.15, 0],
    extrapolate: 'clamp',
  });
  const bodyTranslate = scrollY.interpolate({
    inputRange: [0, distance],
    outputRange: [0, -12],
    extrapolate: 'clamp',
  });
  const compactOpacity = scrollY.interpolate({
    inputRange: [0, distance * 0.6, distance],
    outputRange: [0, 0.3, 1],
    extrapolate: 'clamp',
  });

  return (
    <Animated.View style={[styles.posHeaderShell, { height: expandedHeight + topInset, transform: [{ translateY: shellTranslate }] }]}>
      <Animated.View
        style={[
          styles.posHeaderPinned,
          { top: topInset + 4, height: collapsedHeight, opacity: compactOpacity, transform: [{ translateY: counterTranslate }] },
        ]}
      >
        {pinned}
      </Animated.View>
      <Animated.View
        onLayout={(e) => onBodyHeight(e.nativeEvent.layout.height)}
        style={[
          styles.posHeaderBody,
          { top: topInset + 4, opacity: bodyOpacity, transform: [{ translateY: counterTranslate }, { translateY: bodyTranslate }] },
        ]}
      >
        {children}
      </Animated.View>
    </Animated.View>
  );
}

/** Thẻ chỉ dựng lại khi sản phẩm, số lượng trong giỏ hoặc kiểu xem đổi; các callback luôn gọi setCart/toast nên không bị cũ. */
function sameCard(a: ProductCardProps, b: ProductCardProps) {
  return a.product === b.product && a.inCart === b.inCart && a.viewMode === b.viewMode;
}

interface ProductCardProps {
  product: ProductView;
  inCart: number;
  viewMode: 'grid' | 'list';
  onAdd: () => void;
  onSubtract: () => void;
  onOutOfStock: () => void;
}

function ProductCard({ product: p, inCart, viewMode, onAdd, onSubtract, onOutOfStock }: ProductCardProps) {
  const [favorite, setFavorite] = useState(false);
  const stock = p.stockQuantity ?? 0;
  const out = p.tracked && stock <= inCart;
  const isOutOfStock = p.tracked && stock === 0;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inCartRef = useRef(inCart);
  inCartRef.current = inCart;

  const tone = productTones[hashIndex(p.name, productTones.length)];

  const stopTimer = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const handleLongPress = () => {
    if (inCartRef.current > 0) {
      onSubtract();
      stopTimer();
      intervalRef.current = setInterval(() => {
        if (inCartRef.current > 0) {
          onSubtract();
        } else {
          stopTimer();
        }
      }, 200);
    }
  };

  const handlePressOut = () => {
    stopTimer();
  };

  useEffect(() => {
    return () => stopTimer();
  }, []);

  const handleCardPress = () => {
    if (out) {
      onOutOfStock();
    } else {
      triggerFeedback('selection');
      onAdd();
    }
  };

  if (viewMode === 'list') {
    return (
      <Pressable
        onPress={handleCardPress}
        onLongPress={handleLongPress}
        onPressOut={handlePressOut}
        delayLongPress={300}
        style={({ pressed }) => [
          styles.listCard,
          inCart > 0 && styles.listCardActive,
          isOutOfStock && styles.cardDisabled,
          pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${p.name}, giá ${vnd(p.sellingPriceVnd)}, đã chọn ${inCart}`}
      >
        <View style={styles.listThumb}>
          <Image
            source={{ uri: getProductImage(p.name, p.imageUrl) }}
            style={styles.listThumbImage}
            resizeMode="cover"
          />
          {p.tracked ? (
            <View style={styles.listStockBadge}>
              <T w="bold" size={9.5} color={stock === 0 ? colors.red : salesColors.stockGreen}>
                {stock === 0 ? 'Hết' : stock}
              </T>
            </View>
          ) : null}
        </View>

        <View style={styles.listInfo}>
          <T w="bold" size={14} numberOfLines={2} style={styles.listProductName}>
            {p.name}
          </T>
          <Row gap={6} style={{ marginTop: 2 }}>
            {p.barcode ? (
              <T size={11.5} color={salesColors.muted}>
                {p.barcode}
              </T>
            ) : null}
            {p.unit ? (
              <T size={11.5} color={salesColors.muted}>
                · {p.unit}
              </T>
            ) : null}
          </Row>
          <T w="extrabold" size={16} color={salesColors.primary} style={{ marginTop: 2 }}>
            {vnd(p.sellingPriceVnd)}
          </T>
        </View>

        {inCart > 0 ? (
          <View style={styles.listCartControls}>
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                onSubtract();
              }}
              style={({ pressed }) => [styles.listBtn, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Giảm số lượng"
            >
              <Feather name="minus" size={13} color={salesColors.ink} />
            </Pressable>
            <View style={styles.listQtyBox}>
              <T w="bold" size={13} color={salesColors.ink}>
                {inCart}
              </T>
            </View>
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                if (out) onOutOfStock();
                else onAdd();
              }}
              style={({ pressed }) => [styles.listBtn, styles.listBtnAdd, pressed && { opacity: 0.6 }]}
              accessibilityLabel="Tăng số lượng"
            >
              <Feather name="plus" size={14} color={colors.white} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            hitSlop={8}
            onPress={(e) => {
              e.stopPropagation();
              handleCardPress();
            }}
            style={({ pressed }) => [styles.listQuickAddBtn, isOutOfStock && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Thêm"
          >
            <Feather name="plus" size={18} color={salesColors.primary} />
          </Pressable>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handleCardPress}
      onLongPress={handleLongPress}
      onPressOut={handlePressOut}
      delayLongPress={300}
      style={({ pressed }) => [
        styles.card,
        inCart > 0 && styles.cardActive,
        isOutOfStock && styles.cardDisabled,
        pressed && { transform: [{ scale: 0.98 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}, giá ${vnd(p.sellingPriceVnd)}, đã chọn ${inCart}`}
    >
      {/* Top Image / Monogram Container */}
      <View style={[styles.imageContainer, { backgroundColor: tone.bg }]}>
        {/* Favorite heart button */}
        <Pressable
          hitSlop={6}
          onPress={(e) => {
            e.stopPropagation();
            setFavorite((f) => !f);
          }}
          style={styles.favoriteBtn}
          accessibilityLabel="Yêu thích"
        >
          <Feather
            name={favorite ? 'heart' : 'heart'}
            size={13}
            color={favorite ? colors.red : salesColors.muted}
          />
        </Pressable>

        {/* Stock badge top right */}
        {p.tracked ? (
          <View style={styles.imageBadgeWrap}>
            <Feather name="box" size={11.5} color={stock === 0 ? colors.red : salesColors.stockGreen} />
            <T w="bold" size={11} color={stock === 0 ? colors.red : salesColors.stockGreen}>
              {stock === 0 ? 'Hết hàng' : `Còn ${stock}`}
            </T>
          </View>
        ) : null}

        {/* Product Photo */}
        <Image
          source={{ uri: getProductImage(p.name, p.imageUrl) }}
          style={styles.productGridImage}
          resizeMode="cover"
        />
      </View>

      {/* Info Area */}
      <View style={styles.infoContainer}>
        <T w="semibold" size={12.5} numberOfLines={2} ellipsizeMode="tail" style={styles.productName}>
          {p.name}
        </T>

        <Row style={styles.priceRow}>
          <T w="extrabold" size={15.5} color={salesColors.primary}>
            {vnd(p.sellingPriceVnd)}
          </T>

          {inCart > 0 ? (
            <View style={styles.cartBar}>
              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  onSubtract();
                }}
                style={({ pressed }) => [styles.cartBtn, styles.cartBtnMinus, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Giảm số lượng"
              >
                <Feather name="minus" size={12} color={salesColors.ink} />
              </Pressable>

              <View style={styles.cartQty}>
                <T w="bold" size={12} color={salesColors.ink}>
                  {inCart}
                </T>
              </View>

              <Pressable
                hitSlop={8}
                onPress={(e) => {
                  e.stopPropagation();
                  if (out) onOutOfStock();
                  else onAdd();
                }}
                style={({ pressed }) => [styles.cartBtn, styles.cartBtnPlus, pressed && { opacity: 0.6 }]}
                accessibilityLabel="Tăng số lượng"
              >
                <Feather name="plus" size={13} color={colors.white} />
              </Pressable>
            </View>
          ) : (
            <Pressable
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                handleCardPress();
              }}
              style={({ pressed }) => [styles.quickAddBtn, isOutOfStock && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}
              accessibilityLabel="Thêm"
            >
              <Feather name="plus" size={18} color={salesColors.primary} />
            </Pressable>
          )}
        </Row>
      </View>
    </Pressable>
  );
}

const MemoProductCard = React.memo(ProductCard, sameCard);

export default function Pos({ inTab = false }: { inTab?: boolean }) {
  const app = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [sortMode, setSortMode] = useState<'name' | 'price' | 'stock'>('name');
  const [stockFilter, setStockFilter] = useState<'all' | 'available' | 'low'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [cartOpen, setCartOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cName, setCName] = useState('');
  const [cPrice, setCPrice] = useState('');
  const [cUnit, setCUnit] = useState('cái');
  const [cBusy, setCBusy] = useState(false);
  const [cErr, setCErr] = useState('');

  const [products, setProducts] = useState<ProductView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scrollY = useRef(new Animated.Value(0)).current;
  // Chiều cao thật của phần thân header (tiêu đề + ô tìm + danh mục). Chữ hệ thống to hơn (iOS, cỡ chữ lớn) làm thân cao hơn
  // số cố định nên thanh danh mục bị cắt; đo ra để header luôn vừa nội dung.
  const [headerBodyHeight, setHeaderBodyHeight] = useState(0);
  const cartBarAnim = useRef(new Animated.Value(0)).current;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ps, cs] = await Promise.all([productApi.list(), categoryApi.list()]);
      setProducts(ps);
      setCategories(cs);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const addToCart = (id: number, delta = 1) =>
    setCart((cur) => {
      const q2 = Math.max(0, (cur[id] ?? 0) + delta);
      const next = { ...cur, [id]: q2 };
      if (!q2) delete next[id];
      return next;
    });

  const list = useMemo(() => {
    const filtered = products.filter((p) => {
      if (cat !== 'all') {
        if (cat === 'none' ? p.categoryId != null : String(p.categoryId ?? '') !== cat) return false;
      }
      if (stockFilter === 'available' && p.tracked && (p.stockQuantity ?? 0) <= 0) return false;
      if (stockFilter === 'low' && (!p.tracked || (p.stockQuantity ?? 0) > 6)) return false;
      return (
        !q ||
        normalizeText(p.name).includes(normalizeText(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q.toLowerCase().trim()))
      );
    });
    return [...filtered].sort((a, b) => {
      if (sortMode === 'price') return a.sellingPriceVnd - b.sellingPriceVnd;
      if (sortMode === 'stock') return (b.stockQuantity ?? 0) - (a.stockQuantity ?? 0);
      return a.name.localeCompare(b.name, 'vi');
    });
  }, [products, cat, q, sortMode, stockFilter]);

  // Hai cột bằng nhau: màn trừ lề 10 hai bên và khe 8 giữa hai thẻ
  const { width: windowWidth } = useWindowDimensions();
  const gridCardWidth = (windowWidth - 20 - 8) / 2;

  const cartItems: LineItem[] = Object.entries(cart).flatMap(([id, qty]) => {
    const p = products.find((x) => x.id === Number(id));
    return p ? [{ productId: p.id, name: p.name, price: p.sellingPriceVnd, qty }] : [];
  });
  const total = itemsTotal(cartItems);
  const count = cartItems.reduce((a, i) => a + i.qty, 0);

  useEffect(() => {
    Animated.spring(cartBarAnim, {
      toValue: count > 0 ? 1 : 0,
      friction: 8,
      tension: 50,
      useNativeDriver: true,
    }).start();
  }, [count > 0]);
  const hasUncategorized = products.some((p) => p.categoryId == null);
  const cats = ['all', ...(hasUncategorized ? ['none'] : []), ...categories.map((c) => String(c.id))];
  const catLabel = (c: string) =>
    c === 'all' ? 'Tất cả' : c === 'none' ? 'Chưa phân loại' : categories.find((x) => String(x.id) === c)?.name ?? c;

  const sortLabel = sortMode === 'name' ? 'Tên A-Z' : sortMode === 'price' ? 'Giá tăng dần' : 'Tồn kho giảm';
  const stockLabel = stockFilter === 'all' ? 'Tồn kho' : stockFilter === 'available' ? 'Còn hàng' : 'Sắp hết';
  const cycleSort = () => {
    triggerFeedback('selection');
    setSortMode((cur) => (cur === 'name' ? 'price' : cur === 'price' ? 'stock' : 'name'));
  };
  const cycleStock = () => {
    triggerFeedback('selection');
    setStockFilter((cur) => (cur === 'all' ? 'available' : cur === 'available' ? 'low' : 'all'));
  };

  const pay = () => {
    app.setDraft({ items: cartItems, source: 'pos' });
    setCart({});
    router.push('/checkout');
  };

  // 4 = khoảng cách từ mép trên, 6 = khoảng đệm dưới của posHeaderBody; 152 là chiều cao tối thiểu trước khi đo xong.
  const headerHeight = Math.max(152, Math.ceil(headerBodyHeight) + 10);
  const collapsedHeaderHeight = 56;

  const addCustomItem = async () => {
    const price = parseInt(cPrice.replace(/\D/g, ''), 10) || 0;
    if (!cName.trim() || !price || cBusy) return;
    setCErr('');
    setCBusy(true);
    try {
      const created = await productApi.create({
        name: cName.trim(),
        unit: cUnit.trim() || 'cái',
        sellingPriceVnd: price,
        tracked: false,
        stockQuantity: null,
      });
      setProducts((cur) => [...cur, created]);
      addToCart(created.id, 1);
      setCName('');
      setCPrice('');
      setCUnit('cái');
      setCustomOpen(false);
      toast(`Đã thêm món "${created.name}"`);
    } catch (e) {
      setCErr(errorMessage(e));
    } finally {
      setCBusy(false);
    }
  };

  const handleBarcodeScanned = (product: ProductView) => {
    const stock = product.stockQuantity ?? 0;
    const inCart = cart[product.id] ?? 0;
    if (product.tracked && stock <= inCart) {
      toast(`${product.name} đã hết hàng`, 'err');
      return;
    }
    addToCart(product.id, 1);
    toast(`Đã thêm ${product.name}`);
  };

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <PosCollapsibleHeader
        scrollY={scrollY}
        topInset={insets.top}
        expandedHeight={headerHeight}
        collapsedHeight={collapsedHeaderHeight}
        onBodyHeight={setHeaderBodyHeight}
        pinned={
          <Row gap={8} style={styles.pinnedHeader}>
            <PosSearchBox value={q} onChangeText={setQ} compact />
            <PosActionButton tone="gold" icon="maximize" label="Quét mã" compact onPress={() => setScannerOpen(true)} />
            <PosActionButton tone="purple" icon="mic" label="Đọc đơn" compact onPress={() => router.push('/voice')} />
          </Row>
        }
      >
        <View style={styles.headerBlock}>
          <Row style={styles.heroRow} gap={8}>
            <View style={{ flex: 1 }}>
              {!inTab ? (
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))} style={styles.backBtn} accessibilityLabel="Quay lại">
                  <Feather name="chevron-left" size={18} color={salesColors.ink} />
                </Pressable>
              ) : null}
              <T w="extrabold" size={26} color={salesColors.ink}>
                Bán hàng
              </T>
              <T w="medium" size={13} color={salesColors.muted} style={{ marginTop: 1 }}>
                {products.length} sản phẩm
              </T>
            </View>
            <PosActionButton tone="gold" icon="maximize" label="Quét mã" onPress={() => setScannerOpen(true)} />
            <PosActionButton tone="purple" icon="mic" label="Đọc đơn" onPress={() => router.push('/voice')} />
          </Row>

          <PosSearchBox
            value={q}
            onChangeText={setQ}
            onBarcodePress={() => setScannerOpen(true)}
          />
          <PosCategoryChips value={cat} onChange={setCat} options={cats.map((c) => ({ key: c, label: catLabel(c) }))} />
        </View>
      </PosCollapsibleHeader>

      {loading ? (
        <View style={{ paddingTop: insets.top + headerHeight + 20, alignItems: 'center' }}>
          <ActivityIndicator color={salesColors.primary} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + headerHeight + 10 }}>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách hàng" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </View>
      ) : (
        <Animated.FlatList
          key={viewMode}
          data={list}
          numColumns={viewMode === 'grid' ? 2 : 1}
          keyExtractor={(p) => String(p.id)}
          renderItem={({ item: p }) => (
            <View style={viewMode === 'grid' ? { width: gridCardWidth } : undefined}>
              <MemoProductCard
                product={p}
                viewMode={viewMode}
                inCart={cart[p.id] ?? 0}
                onAdd={() => addToCart(p.id, 1)}
                onSubtract={() => addToCart(p.id, -1)}
                onOutOfStock={() => toast(`${p.name} đã hết hàng`, 'err')}
              />
            </View>
          )}
          columnWrapperStyle={viewMode === 'grid' ? { gap: 8, alignItems: 'flex-start' } : undefined}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={
            <>
          {/* Filter & Toolbar */}
          <Row style={styles.filterRow} gap={8}>
            <Pressable
              onPress={cycleSort}
              style={({ pressed }) => [styles.filterPill, sortMode !== 'name' && styles.filterPillActive, pressed && { opacity: 0.76 }]}
            >
              <Feather name="sliders" size={13} color={salesColors.inkSecondary} />
              <T w="semibold" size={12.5} color={salesColors.ink}>
                {sortLabel}
              </T>
              <Feather name="chevron-down" size={13} color={salesColors.muted} />
            </Pressable>

            <Pressable
              onPress={cycleStock}
              style={({ pressed }) => [styles.filterPill, stockFilter !== 'all' && styles.filterPillActive, pressed && { opacity: 0.76 }]}
            >
              <Feather name="box" size={13} color={salesColors.inkSecondary} />
              <T w="semibold" size={12.5} color={salesColors.ink}>
                {stockLabel}
              </T>
              <Feather name="chevron-down" size={13} color={salesColors.muted} />
            </Pressable>

            <View style={{ flex: 1 }} />

            <View style={styles.viewToggle}>
              <Pressable
                onPress={() => {
                  triggerFeedback('selection');
                  setViewMode('grid');
                }}
                style={viewMode === 'grid' ? styles.viewToggleActive : styles.viewToggleBtn}
                accessibilityLabel="Chế độ lưới"
              >
                <Feather name="grid" size={15} color={viewMode === 'grid' ? colors.white : salesColors.muted} />
              </Pressable>
              <Pressable
                onPress={() => {
                  triggerFeedback('selection');
                  setViewMode('list');
                }}
                style={viewMode === 'list' ? styles.viewToggleActive : styles.viewToggleBtn}
                accessibilityLabel="Chế độ danh sách"
              >
                <Feather name="list" size={15} color={viewMode === 'list' ? colors.white : salesColors.muted} />
              </Pressable>
            </View>
          </Row>

            </>
          }
          ListEmptyComponent={<EmptyState icon="search" title="Không tìm thấy hàng" hint="Thử từ khoá khác hoặc thêm món ngoài danh mục" />}
          ListFooterComponent={
            <>
          <Button
            title="Thêm món ngoài danh mục"
            icon="plus"
            variant="outline"
            onPress={() => setCustomOpen(true)}
            style={{ marginTop: 14, marginHorizontal: 4 }}
          />
            </>
          }
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: 10,
            paddingTop: insets.top + headerHeight + 10,
            paddingBottom: inTab ? (insets.bottom + (count > 0 ? 190 : 96)) : (insets.bottom + (count > 0 ? 110 : 28)),
          }}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        />
      )}

      {/* Floating Bottom Cart Bar (Appears elevated above bottom tab bar only when cart has items) */}
      {count > 0 ? (
        <Animated.View
          style={[
            styles.bar,
            {
              bottom: inTab ? (insets.bottom + 104) : Math.max(insets.bottom, 24),
              opacity: cartBarAnim,
              transform: [
                {
                  translateY: cartBarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [36, 0],
                  }),
                },
                {
                  scale: cartBarAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.94, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <Pressable
            onPress={() => setCartOpen(true)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
          >
            <View style={styles.cartIcon}>
              <Feather name="shopping-cart" size={18} color="#F8DF69" />
              <View style={styles.cartBadge}>
                <T w="extrabold" size={10} color="#78350F">
                  {count}
                </T>
              </View>
            </View>
            <View>
              <T size={11.5} color="rgba(255, 255, 255, 0.72)">
                {`${cartItems.length} món đã chọn`}
              </T>
              <T w="extrabold" size={17} color="#FFFFFF">
                {vnd(total)}
              </T>
            </View>
          </Pressable>

          <View style={styles.cartDivider} />

          <Pressable
            onPress={pay}
            style={({ pressed }) => [
              styles.checkoutBtn,
              styles.checkoutBtnActive,
              pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
            ]}
          >
            <T w="bold" size={13.5} color="#1E1B4B">
              Thanh toán
            </T>
            <Feather name="arrow-right" size={14} color="#1E1B4B" />
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Cart Sheet */}
      <Sheet visible={cartOpen} onClose={() => setCartOpen(false)} title="Đơn đang chọn">
        {cartItems.map((it) => (
          <Row
            key={`${it.productId ?? it.name}`}
            style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: salesColors.borderLight, alignItems: 'center' }}
          >
            <View style={styles.cartItemThumbWrap}>
              <Image
                source={{ uri: getProductImage(it.name) }}
                style={styles.cartItemThumb}
                resizeMode="cover"
              />
            </View>
            <View style={{ flex: 1, paddingRight: 8, marginLeft: 10 }}>
              <T w="semibold" size={14} color={salesColors.ink}>
                {it.name}
              </T>
              <T w="bold" size={13} color={salesColors.primary} style={{ marginTop: 2 }}>
                {vnd(it.price)}
              </T>
            </View>
            <Stepper
              value={it.qty}
              onChange={(v) => {
                if (typeof it.productId === 'number') addToCart(it.productId, v - it.qty);
                if (count - it.qty + v <= 0) setCartOpen(false);
              }}
            />
          </Row>
        ))}
        <Row style={{ marginTop: 14 }}>
          <Button
            title="Xoá hết"
            variant="danger"
            small
            onPress={() => setConfirmClear(true)}
          />
          <View style={{ flex: 1 }} />
          <T w="extrabold" size={19} color={salesColors.primary}>
            {vnd(total)}
          </T>
        </Row>
        <Button
          title="Thanh toán"
          onPress={() => {
            setCartOpen(false);
            pay();
          }}
          style={[{ backgroundColor: salesColors.primary }, { marginTop: 14 }]}
        />
      </Sheet>

      {/* Custom Item Sheet */}
      <Sheet visible={customOpen} onClose={() => setCustomOpen(false)} title="Món ngoài danh mục">
        <Field label="Tên món" placeholder="VD: Bánh bao" value={cName} onChangeText={setCName} />
        <Field label="Giá bán (đ)" placeholder="VD: 12000" keyboardType="number-pad" value={cPrice} onChangeText={setCPrice} />
        <Field label="Đơn vị" placeholder="VD: cái, ly, phần" value={cUnit} onChangeText={setCUnit} />
        {cErr ? (
          <T size={12} color={colors.red} style={{ marginBottom: 8 }}>
            {cErr}
          </T>
        ) : null}
        <Button
          title="Thêm vào đơn"
          disabled={!cName.trim() || !parseInt(cPrice, 10) || cBusy}
          loading={cBusy}
          onPress={addCustomItem}
        />
      </Sheet>

      {/* Barcode Scanner Modal */}
      <BarcodeScannerModal
        visible={scannerOpen}
        onClose={() => setScannerOpen(false)}
        products={products}
        cartItems={cartItems}
        onAddToCart={(p, delta) => addToCart(p.id, delta)}
        onClearCart={() => setCart({})}
        onCheckout={() => {
          setScannerOpen(false);
          pay();
        }}
        onProductCreated={(p) => setProducts((cur) => [...cur, p])}
      />

      {/* Confirm Clear Cart Dialog */}
      <Dialog
        visible={confirmClear}
        danger
        icon="trash-2"
        title="Xoá giỏ hàng?"
        message="Các món đã chọn trong giỏ sẽ bị xoá."
        confirm="Xoá"
        cancel="Giữ lại"
        onConfirm={() => {
          setCart({});
          setCartOpen(false);
          setConfirmClear(false);
          triggerFeedback('selection');
        }}
        onCancel={() => setConfirmClear(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: salesColors.pageBg,
  },
  posHeaderShell: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    overflow: 'hidden',
    backgroundColor: salesColors.pageBg,
    borderBottomWidth: 1,
    borderBottomColor: salesColors.border,
  },
  posHeaderBody: {
    position: 'absolute',
    left: 14,
    right: 14,
  },
  posHeaderPinned: {
    position: 'absolute',
    left: 14,
    right: 14,
    justifyContent: 'center',
  },
  heroRow: {
    paddingTop: 2,
    paddingBottom: 4,
    alignItems: 'center',
  },
  headerBlock: {
    paddingBottom: 2,
  },
  pinnedHeader: {
    alignItems: 'center',
  },
  backBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: salesColors.cardBg,
    borderWidth: 1,
    borderColor: salesColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  actionHeroPurple: {
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandPressed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    ...shadow(1),
  },
  actionHeroGold: {
    height: 38,
    borderRadius: 13,
    backgroundColor: colors.goldSoft,
    borderWidth: 1.2,
    borderColor: colors.goldBright,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    flexDirection: 'row',
    gap: 6,
    ...shadow(1),
  },
  actionCompactPurple: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.brand,
    borderWidth: 1,
    borderColor: colors.brandPressed,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(1),
  },
  actionCompactGold: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: colors.goldSoft,
    borderWidth: 1.2,
    borderColor: colors.goldBright,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(1),
  },
  searchBox: {
    height: 42,
    borderRadius: 13,
    backgroundColor: salesColors.cardBg,
    borderWidth: 1,
    borderColor: salesColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchBoxCompact: {
    flex: 1,
    height: 36,
    borderRadius: 10,
    marginBottom: 0,
    paddingHorizontal: 10,
    gap: 6,
  },
  barcodeScanIconBtn: {
    padding: 4,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontFamily: font.medium,
    fontSize: 14,
    color: salesColors.ink,
    outlineStyle: 'none',
  } as never,
  searchInputCompact: {
    height: 32,
    fontSize: 12.5,
  } as never,
  catScroll: {
    gap: 6,
    paddingRight: 14,
  },
  catPill: {
    height: 32,
    minWidth: 62,
    borderRadius: 16,
    backgroundColor: salesColors.cardBg,
    borderWidth: 1,
    borderColor: salesColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
  },
  catPillActive: {
    backgroundColor: salesColors.primary,
    borderColor: salesColors.primary,
  },
  filterRow: {
    minHeight: 36,
    marginBottom: 10,
    alignItems: 'center',
  },
  filterPill: {
    height: 34,
    borderRadius: 12,
    backgroundColor: salesColors.cardBg,
    borderWidth: 1,
    borderColor: salesColors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 11,
  },
  filterPillActive: {
    borderColor: salesColors.primary,
    backgroundColor: salesColors.primaryTint,
  },
  viewToggle: {
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECEEF5',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 2.5,
    gap: 2,
  },
  viewToggleActive: {
    width: 29,
    height: 29,
    borderRadius: 8,
    backgroundColor: salesColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggleBtn: {
    width: 29,
    height: 29,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    backgroundColor: salesColors.cardBg,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: salesColors.border,
    overflow: 'hidden',
    ...shadow(1),
  },
  cardActive: {
    borderColor: salesColors.primary,
    borderWidth: 1.5,
  },
  cardDisabled: {
    opacity: 0.45,
  },
  imageContainer: {
    width: '100%',
    height: 172,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    alignSelf: 'stretch',
  },
  productGridImage: {
    width: '100%',
    height: '100%',
  },
  favoriteBtn: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(0),
  },
  imageBadgeWrap: {
    position: 'absolute',
    top: 8,
    right: 8,
    minHeight: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    ...shadow(0),
  },
  canBody: {
    width: 58,
    height: 58,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: {
    letterSpacing: -0.5,
  },
  infoContainer: {
    paddingHorizontal: 9,
    paddingTop: 8,
    paddingBottom: 10,
  },
  productName: {
    fontSize: 12.5,
    lineHeight: 16.5,
    color: salesColors.ink,
    minHeight: 33,
  },
  priceRow: {
    marginTop: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  quickAddBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: salesColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 2,
    paddingVertical: 2,
    height: 28,
  },
  cartBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: salesColors.cardBg,
  },
  cartBtnMinus: {
    borderWidth: 1,
    borderColor: salesColors.border,
  },
  cartBtnPlus: {
    backgroundColor: salesColors.primary,
  },
  cartQty: {
    minWidth: 26,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listCard: {
    backgroundColor: salesColors.cardBg,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: salesColors.border,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...shadow(1),
  },
  listCardActive: {
    borderColor: salesColors.primary,
    borderWidth: 1.5,
  },
  listThumb: {
    width: 54,
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: salesColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  listThumbImage: {
    width: '100%',
    height: '100%',
  },
  cartItemThumbWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: salesColors.border,
  },
  cartItemThumb: {
    width: '100%',
    height: '100%',
  },
  listStockBadge: {
    position: 'absolute',
    bottom: -3,
    right: -3,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderWidth: 1,
    borderColor: salesColors.border,
  },
  listInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  listProductName: {
    lineHeight: 18,
    color: salesColors.ink,
  },
  listCartControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  listBtn: {
    width: 28,
    height: 28,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: salesColors.cardBg,
  },
  listBtnAdd: {
    backgroundColor: salesColors.primary,
  },
  listQtyBox: {
    minWidth: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listQuickAddBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: salesColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 26,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    ...shadow(3),
    zIndex: 35,
  },
  cartIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.goldBright,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  cartDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.20)',
  },
  checkoutBtn: {
    height: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
  },
  checkoutBtnActive: {
    backgroundColor: colors.goldBright,
  },
  checkoutBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
});
