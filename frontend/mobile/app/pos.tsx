import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../src/components/brand';
import { Badge, Button, Chips, EmptyState, Field, Header, IconBtn, Row, Sheet, Stepper, T, Tile } from '../src/components/ui';
import { categoryMeta } from '../src/data/mock';
import type { LineItem } from '../src/data/types';
import { normalizeText, vnd } from '../src/lib/format';
import { itemsTotal } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

export default function Pos() {
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

  const list = useMemo(
    () =>
      app.products.filter(
        (p) => (cat === 'all' || p.category === cat) && (!q || normalizeText(p.name).includes(normalizeText(q))),
      ),
    [app.products, cat, q],
  );

  const cartItems: LineItem[] = [
    ...Object.entries(app.cart).flatMap(([id, qty]) => {
      const p = app.products.find((x) => x.id === id);
      return p ? [{ productId: id, name: p.name, price: p.price, qty }] : [];
    }),
    ...custom,
  ];
  const total = itemsTotal(cartItems);
  const count = cartItems.reduce((a, i) => a + i.qty, 0);
  const cats = ['all', ...Array.from(new Set(app.products.map((p) => p.category)))];

  const pay = () => {
    app.setDraft({ items: cartItems, source: 'pos' });
    setCustom([]);
    router.push('/checkout');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header
          title="Chọn hàng (POS)"
          subtitle={`${app.products.length} sản phẩm`}
          right={
            <IconBtn
              name="maximize"
              bg={colors.primary}
              color={colors.white}
              onPress={() => toast('Quét mã vạch — sẽ có ở bản chính thức')}
              label="Quét mã"
            />
          }
        />
        <Field placeholder="Tìm hàng…" value={q} onChangeText={setQ} style={{ marginBottom: 10 }} />
        <Chips value={cat} onChange={setCat} options={cats.map((c) => ({ key: c, label: categoryMeta[c] ?? c }))} />
      </View>

      <FlatList
        data={list}
        numColumns={2}
        keyExtractor={(p) => p.id}
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
          const inCart = app.cart[p.id] ?? 0;
          const out = p.tracked && p.stock <= inCart;
          return (
            <Pressable
              onPress={() => (out ? toast(`${p.name} đã hết hàng`, 'err') : app.addToCart(p.id))}
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
                  {vnd(p.price)}
                </T>
                <View style={[styles.plus, out && { backgroundColor: colors.disabled }]}>
                  <Feather name="plus" size={16} color={colors.accentInk} />
                </View>
              </Row>
              <T size={12} color={p.tracked && p.stock <= 6 ? colors.red : colors.faint} numberOfLines={1} style={{ marginTop: 3 }}>
                {p.tracked ? (p.stock ? `Còn ${p.stock}` : 'Hết hàng') : 'Bán theo yêu cầu'}
              </T>
            </Pressable>
          );
        }}
      />

      <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
            key={it.productId ?? it.name}
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
                if (it.productId) app.addToCart(it.productId, v - it.qty);
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
              app.clearCart();
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
