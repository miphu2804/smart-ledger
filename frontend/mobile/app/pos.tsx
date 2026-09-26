import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../src/components/brand';
import { Badge, Button, Chips, EmptyState, Field, Header, Row, Sheet, Stepper, T, Tile } from '../src/components/ui';
import type { CategoryView, LineItem, ProductView } from '../src/data/types';
import { categoryApi, productApi } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { normalizeText, vnd } from '../src/lib/format';
import { itemsTotal } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

export default function Pos({ inTab = false }: { inTab?: boolean }) {
  const app = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [cartOpen, setCartOpen] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState<LineItem[]>([]);
  const [cName, setCName] = useState('');
  const [cPrice, setCPrice] = useState('');

  const [products, setProducts] = useState<ProductView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [cart, setCart] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  useEffect(() => {
    load();
  }, [load]);

  const addToCart = (id: number, delta = 1) =>
    setCart((cur) => {
      const q2 = Math.max(0, (cur[id] ?? 0) + delta);
      const next = { ...cur, [id]: q2 };
      if (!q2) delete next[id];
      return next;
    });

  const list = useMemo(
    () =>
      products.filter((p) => {
        if (cat !== 'all') {
          if (cat === 'none' ? p.categoryId != null : String(p.categoryId ?? '') !== cat) return false;
        }
        return !q || normalizeText(p.name).includes(normalizeText(q));
      }),
    [products, cat, q],
  );

  const cartItems: LineItem[] = [
    ...Object.entries(cart).flatMap(([id, qty]) => {
      const p = products.find((x) => x.id === Number(id));
      return p ? [{ productId: p.id, name: p.name, price: p.sellingPriceVnd, qty }] : [];
    }),
    ...custom,
  ];
  const total = itemsTotal(cartItems);
  const count = cartItems.reduce((a, i) => a + i.qty, 0);
  const hasUncategorized = products.some((p) => p.categoryId == null);
  const cats = ['all', ...(hasUncategorized ? ['none'] : []), ...categories.map((c) => String(c.id))];
  const catLabel = (c: string) => (c === 'all' ? 'Tất cả' : c === 'none' ? 'Chưa phân loại' : categories.find((x) => String(x.id) === c)?.name ?? c);

  const pay = () => {
    app.setDraft({ items: cartItems, source: 'pos' });
    setCart({});
    setCustom([]);
    router.push('/checkout');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header title={inTab ? 'Bán hàng' : 'Chọn hàng'} subtitle={`${products.length} sản phẩm`} back={!inTab} big={inTab} />
        <Field placeholder="Tìm hàng…" value={q} onChangeText={setQ} style={{ marginBottom: 10 }} />
        <Chips value={cat} onChange={setCat} options={cats.map((c) => ({ key: c, label: catLabel(c) }))} />
      </View>

      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách hàng" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </View>
      ) : (
        <FlatList
          data={list}
          numColumns={2}
          keyExtractor={(p) => String(p.id)}
          columnWrapperStyle={{ gap: 12 }}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 30 }}
          ListEmptyComponent={
            <EmptyState icon="search" title="Không tìm thấy hàng" hint="Thử từ khoá khác hoặc thêm món ngoài danh mục" />
          }
          ListFooterComponent={
            <Button
              title="Thêm món ngoài danh mục"
              icon="plus"
              variant="outline"
              onPress={() => setCustomOpen(true)}
              style={{ marginTop: 4 }}
            />
          }
          renderItem={({ item: p }) => {
            const inCart = cart[p.id] ?? 0;
            const stock = p.stockQuantity ?? 0;
            const out = p.tracked && stock <= inCart;
            return (
              <Pressable
                onPress={() => (out ? toast(`${p.name} đã hết hàng`, 'err') : addToCart(p.id))}
                style={({ pressed }) => [styles.card, inCart > 0 && styles.cardOn, pressed && { transform: [{ scale: 0.97 }] }]}
              >
                <View style={styles.tileWrap}>
                  <Tile name={p.name} text={p.name[0]} size={56} />
                  {inCart ? (
                    <View style={styles.qty}>
                      <T w="extrabold" size={12} color={colors.white}>
                        {inCart}
                      </T>
                    </View>
                  ) : null}
                </View>
                <T w="semibold" size={13.5} numberOfLines={1} style={{ marginTop: 10 }}>
                  {p.name}
                </T>
                <Row style={{ marginTop: 4, alignItems: 'flex-end' }}>
                  <T w="extrabold" size={14} color={colors.primary} style={{ flex: 1 }}>
                    {vnd(p.sellingPriceVnd)}
                  </T>
                  <View style={[styles.plus, out && { backgroundColor: colors.disabled }]}>
                    <Feather name="plus" size={16} color={colors.accentInk} />
                  </View>
                </Row>
                <T size={12} color={p.tracked && stock <= 6 ? colors.red : colors.faint} numberOfLines={1} style={{ marginTop: 3 }}>
                  {p.tracked ? (stock ? `Còn ${stock}` : 'Hết hàng') : 'Bán theo yêu cầu'}
                </T>
              </Pressable>
            );
          }}
        />
      )}

      <View style={[styles.bar, { paddingBottom: inTab ? 12 : Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => count && setCartOpen(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}
        >
          <View style={styles.cartIcon}>
            <Feather name="shopping-cart" size={20} color={colors.primary} />
            {count ? (
              <View style={styles.cartBadge}>
                <T w="bold" size={12} color={colors.accentInk}>
                  {count}
                </T>
              </View>
            ) : null}
          </View>
          <View>
            <T size={12} color={colors.faint}>
              {count ? `${cartItems.length} món · Xem đơn ▴` : 'Chưa có món nào'}
            </T>
            <T w="extrabold" size={20}>
              {vnd(total)}
            </T>
          </View>
        </Pressable>
        <Button title="Thanh toán" onPress={pay} disabled={!count} style={{ paddingHorizontal: 26 }} />
      </View>

      <Sheet visible={cartOpen} onClose={() => setCartOpen(false)} title="Đơn đang chọn">
        {cartItems.map((it) => (
          <Row
            key={`${it.productId ?? it.name}`}
            style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}
          >
            <View style={{ flex: 1 }}>
              <Row gap={6}>
                <T w="semibold" size={14}>
                  {it.name}
                </T>
                {!it.productId ? <Badge text="Ngoài DM" color={colors.gold} bg={colors.goldSoft} /> : null}
              </Row>
              <T size={12} color={colors.faint}>
                {vnd(it.price)}
              </T>
            </View>
            <Stepper
              value={it.qty}
              onChange={(v) => {
                if (typeof it.productId === 'number') addToCart(it.productId, v - it.qty);
                else setCustom((c) => (v <= 0 ? c.filter((x) => x !== it) : c.map((x) => (x === it ? { ...x, qty: v } : x))));
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
            onPress={() => {
              setCart({});
              setCustom([]);
              setCartOpen(false);
            }}
          />
          <View style={{ flex: 1 }} />
          <T w="extrabold" size={20} color={colors.primary}>
            {vnd(total)}
          </T>
        </Row>
        <Button
          title="Thanh toán"
          onPress={() => {
            setCartOpen(false);
            pay();
          }}
          style={{ marginTop: 14 }}
        />
      </Sheet>

      <Sheet visible={customOpen} onClose={() => setCustomOpen(false)} title="Món ngoài danh mục">
        <Field label="Tên món" placeholder="VD: Bánh bao" value={cName} onChangeText={setCName} />
        <Field label="Giá bán (đ)" placeholder="VD: 12000" keyboardType="number-pad" value={cPrice} onChangeText={setCPrice} />
        <Button
          title="Thêm vào đơn"
          disabled={!cName.trim() || !parseInt(cPrice, 10)}
          onPress={() => {
            setCustom((c) => [...c, { name: cName.trim(), price: parseInt(cPrice.replace(/\D/g, ''), 10), qty: 1 }]);
            setCName('');
            setCPrice('');
            setCustomOpen(false);
          }}
        />
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(1),
  },
  cardOn: { borderColor: colors.accent, backgroundColor: colors.primaryTint },
  tileWrap: { alignItems: 'flex-start' },
  qty: {
    position: 'absolute',
    left: 42,
    top: -6,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    borderWidth: 2,
    borderColor: colors.white,
  },
  plus: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cartIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cartBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
});
