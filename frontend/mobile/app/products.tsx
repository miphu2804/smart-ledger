import { Feather } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../src/components/brand';
import {
  Badge,
  Button,
  Chips,
  Dialog,
  EmptyState,
  Field,
  Header,
  Row,
  Sheet,
  T,
  Tile,
  Toggle,
} from '../src/components/ui';
import { categoryMeta } from '../src/data/mock';
import type { Category, Product } from '../src/data/types';
import { normalizeText, vnd } from '../src/lib/format';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

type Tab = 'all' | Category | 'low';

export default function Products() {
  const app = useApp();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<Product | 'new' | null>(null);

  const list = useMemo(
    () =>
      app.products.filter((p) => {
        if (tab === 'low' && !(p.tracked && p.stock <= 6)) return false;
        if (tab !== 'all' && tab !== 'low' && p.category !== tab) return false;
        return !q || normalizeText(p.name).includes(normalizeText(q));
      }),
    [app.products, tab, q],
  );
  const stockValue = app.products.reduce((a, p) => a + (p.tracked ? p.stock * p.cost : 0), 0);
  const low = app.products.filter((p) => p.tracked && p.stock <= 6).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header title="Hàng hoá" subtitle="Sản phẩm & tồn kho — cùng một nơi" />
        <Row style={{ alignItems: 'stretch' }}>
          <Stat label="Mặt hàng" value={String(app.products.length)} />
          <Stat label="Giá trị tồn (vốn)" value={vnd(stockValue)} color={colors.primary} flex={2} />
          <Stat label="Sắp hết" value={String(low)} color={colors.gold} bg={colors.goldSoft} />
        </Row>
        <Field placeholder="Tìm sản phẩm…" value={q} onChangeText={setQ} style={{ marginTop: 12, marginBottom: 10 }} />
        <Chips<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'all', label: 'Tất cả' },
            { key: 'low', label: '⚠ Sắp hết' },
            ...(['drink', 'food', 'grocery', 'fresh', 'other'] as Category[]).map((c) => ({ key: c, label: categoryMeta[c] })),
          ]}
        />
      </View>
      <FlatList
        data={list}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={<EmptyState icon="package" title="Không có sản phẩm" hint="Bấm + để thêm sản phẩm mới" />}
        renderItem={({ item: p }) => (
          <Pressable onPress={() => setForm(p)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}>
            <Tile name={p.name} text={p.name[0]} size={42} />
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>
                {p.name}
              </T>
              <Row gap={6} style={{ marginTop: 3 }}>
                <T w="bold" size={13} color={colors.primary}>
                  {vnd(p.price)}
                </T>
                {!p.tracked ? (
                  <Badge text="Bán theo yêu cầu" color={colors.purple} bg={colors.purpleSoft} />
                ) : p.stock === 0 ? (
                  <Badge text="Hết hàng" color={colors.red} bg={colors.redSoft} />
                ) : p.stock <= 6 ? (
                  <Badge text={`Sắp hết · ${p.stock}`} color={colors.gold} bg={colors.goldSoft} />
                ) : (
                  <Badge text={`Còn ${p.stock}`} color={colors.green} bg={colors.greenSoft} />
                )}
              </Row>
            </View>
            <Feather name="chevron-right" size={18} color={colors.disabled} />
          </Pressable>
        )}
      />
      <Pressable
        onPress={() => setForm('new')}
        style={[styles.fab, shadow(3), { bottom: insets.bottom + 24 }]}
        accessibilityLabel="Thêm sản phẩm"
      >
        <Feather name="plus" size={26} color={colors.accentInk} />
      </Pressable>
      <ProductForm value={form} onClose={() => setForm(null)} />
    </View>
  );
}

function Stat({
  label,
  value,
  color = colors.ink,
  bg = colors.white,
  flex = 1,
}: {
  label: string;
  value: string;
  color?: string;
  bg?: string;
  flex?: number;
}) {
  return (
    <View style={[styles.stat, { backgroundColor: bg, flex }]}>
      <T size={12} color={colors.faint}>
        {label}
      </T>
      <T w="extrabold" size={16} color={color} numberOfLines={1}>
        {value}
      </T>
    </View>
  );
}

function ProductForm({ value, onClose }: { value: Product | 'new' | null; onClose: () => void }) {
  const app = useApp();
  const toast = useToast();
  const isNew = value === 'new';
  const p = value && value !== 'new' ? value : null;
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [tracked, setTracked] = useState(true);
  const [cat, setCat] = useState<Category>('grocery');
  const [scanning, setScanning] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);

  // nạp dữ liệu khi mở form
  const key = value === 'new' ? 'new' : (p?.id ?? null);
  if (key !== lastKey) {
    setLastKey(key);
    setName(p?.name ?? '');
    setPrice(p ? String(p.price) : '');
    setCost(p ? String(p.cost) : '');
    setStock(p ? String(p.stock) : '');
    setTracked(p?.tracked ?? true);
    setCat(p?.category ?? 'grocery');
    setMode('manual');
  }

  const num = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;
  const valid = name.trim() && num(price) > 0;

  const save = () => {
    const data = {
      name: name.trim(),
      price: num(price),
      cost: num(cost) || Math.round(num(price) * 0.7),
      stock: tracked ? num(stock) : 0,
      tracked,
      category: cat,
    };
    if (p) app.updateProduct(p.id, data);
    else app.addProduct({ ...data, aliases: [data.name] });
    toast(p ? 'Đã cập nhật sản phẩm' : `Đã thêm “${data.name}”`);
    onClose();
  };

  const aiScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setName('Sữa chua nếp cẩm');
      setPrice('12000');
      setCost('7000');
      setStock('24');
      setCat('food');
      setTracked(true);
      setMode('manual');
      toast('AI đã nhận diện sản phẩm từ ảnh (giả lập)');
    }, 1400);
  };

  return (
    <Sheet visible={!!value} onClose={onClose} title={isNew ? 'Thêm sản phẩm' : 'Sửa sản phẩm'}>
      {isNew ? (
        <Chips<'manual' | 'ai'>
          scroll={false}
          style={{ marginBottom: 14 }}
          value={mode}
          onChange={setMode}
          options={[
            { key: 'manual', label: '⌨️ Nhập tay' },
            { key: 'ai', label: '📷 Chụp ảnh (AI)' },
          ]}
        />
      ) : null}
      {mode === 'ai' ? (
        <View style={styles.scan}>
          <Feather name="camera" size={34} color={colors.primary} />
          <T w="semibold" size={13} color={colors.muted} style={{ textAlign: 'center', marginTop: 8 }}>
            Chụp bao bì hoặc bảng giá — AI sẽ điền tên, giá giúp bạn
          </T>
          <Button
            title={scanning ? 'Đang nhận diện…' : 'Chụp ảnh mẫu'}
            loading={scanning}
            onPress={aiScan}
            style={{ marginTop: 14, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <>
          <Field label="Tên sản phẩm" placeholder="VD: Nước suối" value={name} onChangeText={setName} />
          <Row style={{ alignItems: 'flex-start' }}>
            <Field
              label="Giá bán (đ)"
              keyboardType="number-pad"
              placeholder="5000"
              value={price}
              onChangeText={setPrice}
              style={{ flex: 1 }}
            />
            <Field
              label="Giá vốn (đ)"
              keyboardType="number-pad"
              placeholder="Tuỳ chọn"
              value={cost}
              onChangeText={setCost}
              style={{ flex: 1 }}
            />
          </Row>
          <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
            Nhóm hàng
          </T>
          <Chips<Category>
            scroll={false}
            value={cat}
            onChange={setCat}
            options={(['drink', 'food', 'grocery', 'fresh', 'other'] as Category[]).map((c) => ({
              key: c,
              label: categoryMeta[c],
            }))}
          />
          <Row style={styles.trackRow}>
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>
                Theo dõi tồn kho
              </T>
              <T size={12} color={colors.faint}>
                Tắt nếu làm theo yêu cầu (trà đá, bánh mì…)
              </T>
            </View>
            <Toggle value={tracked} onChange={setTracked} />
          </Row>
          {tracked ? (
            <Field label="Số lượng tồn" keyboardType="number-pad" placeholder="0" value={stock} onChangeText={setStock} />
          ) : null}
          <Button title={isNew ? 'Thêm sản phẩm' : 'Lưu thay đổi'} disabled={!valid} onPress={save} style={{ marginTop: 6 }} />
          {p ? (
            <Button
              title="Xoá sản phẩm"
              variant="ghost"
              icon="trash-2"
              onPress={() => setConfirmDel(true)}
              style={{ marginTop: 6 }}
            />
          ) : null}
        </>
      )}
      <Dialog
        visible={confirmDel}
        danger
        icon="trash-2"
        title={`Xoá “${p?.name ?? ''}”?`}
        message="Hoá đơn cũ vẫn giữ nguyên, chỉ xoá khỏi danh mục bán hàng."
        confirm="Xoá"
        onCancel={() => setConfirmDel(false)}
        onConfirm={() => {
          if (p) app.deleteProduct(p.id);
          setConfirmDel(false);
          toast('Đã xoá sản phẩm');
          onClose();
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stat: { borderRadius: 14, padding: 10, borderWidth: 1, borderColor: colors.border, ...shadow(1) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(1),
  },
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackRow: { marginTop: 16, marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: colors.bg },
  scan: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.primaryLight,
    borderRadius: 18,
    padding: 22,
    backgroundColor: colors.primaryTint,
  },
});
