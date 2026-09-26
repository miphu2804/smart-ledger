import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
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
import type { CategoryView, ProductView } from '../src/data/types';
import { categoryApi, productApi, ProductWriteRequest } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { normalizeText, vnd } from '../src/lib/format';
import { colors, shadow } from '../src/theme';

/** 'all' | 'low' | id danh mục dạng chuỗi (Chips cần K extends string) */
type Tab = 'all' | 'low' | string;

export default function Products() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<ProductView | 'new' | null>(null);

  const [products, setProducts] = useState<ProductView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
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

  const list = useMemo(
    () =>
      products.filter((p) => {
        if (tab === 'low' && !(p.tracked && (p.stockQuantity ?? 0) <= 6)) return false;
        if (tab !== 'all' && tab !== 'low' && String(p.categoryId ?? '') !== tab) return false;
        return !q || normalizeText(p.name).includes(normalizeText(q));
      }),
    [products, tab, q],
  );
  const stockValue = products.reduce((a, p) => a + (p.tracked ? (p.stockQuantity ?? 0) * (p.costPriceVnd ?? 0) : 0), 0);
  const low = products.filter((p) => p.tracked && (p.stockQuantity ?? 0) <= 6).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header title="Hàng hoá" subtitle="Sản phẩm & tồn kho — cùng một nơi" />
        <Row style={{ alignItems: 'stretch' }}>
          <Stat label="Mặt hàng" value={String(products.length)} />
          <Stat label="Giá trị tồn (vốn)" value={vnd(stockValue)} color={colors.primary} flex={2} />
          <Stat label="Sắp hết" value={String(low)} color={colors.gold} bg={colors.goldSoft} />
        </Row>
        <Field placeholder="Tìm sản phẩm…" value={q} onChangeText={setQ} style={{ marginTop: 12, marginBottom: 10 }} />
        <Chips<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'all', label: 'Tất cả' },
            { key: 'low', label: 'Sắp hết', icon: 'alert-triangle' },
            ...categories.map((c) => ({ key: String(c.id), label: c.name })),
          ]}
        />
      </View>
      {loading ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(p) => String(p.id)}
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
                    {vnd(p.sellingPriceVnd)}
                  </T>
                  {!p.tracked ? (
                    <Badge text="Bán theo yêu cầu" color={colors.purple} bg={colors.purpleSoft} />
                  ) : (p.stockQuantity ?? 0) === 0 ? (
                    <Badge text="Hết hàng" color={colors.red} bg={colors.redSoft} />
                  ) : (p.stockQuantity ?? 0) <= 6 ? (
                    <Badge text={`Sắp hết · ${p.stockQuantity}`} color={colors.gold} bg={colors.goldSoft} />
                  ) : (
                    <Badge text={`Còn ${p.stockQuantity}`} color={colors.green} bg={colors.greenSoft} />
                  )}
                </Row>
              </View>
              <Feather name="chevron-right" size={18} color={colors.disabled} />
            </Pressable>
          )}
        />
      )}
      <Pressable
        onPress={() => setForm('new')}
        style={[styles.fab, shadow(3), { bottom: insets.bottom + 24 }]}
        accessibilityLabel="Thêm sản phẩm"
      >
        <Feather name="plus" size={26} color={colors.accentInk} />
      </Pressable>
      <ProductForm
        value={form}
        categories={categories}
        onCategoryCreated={(c) => setCategories((cur) => [...cur, c])}
        onClose={() => setForm(null)}
        onSaved={load}
      />
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

function ProductForm({
  value,
  categories,
  onCategoryCreated,
  onClose,
  onSaved,
}: {
  value: ProductView | 'new' | null;
  categories: CategoryView[];
  onCategoryCreated: (c: CategoryView) => void;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = value === 'new';
  const p = value && value !== 'new' ? value : null;
  const [mode, setMode] = useState<'manual' | 'ai'>('manual');
  const [name, setName] = useState('');
  const [unit, setUnit] = useState('');
  const [price, setPrice] = useState('');
  const [cost, setCost] = useState('');
  const [stock, setStock] = useState('');
  const [tracked, setTracked] = useState(true);
  const [catKey, setCatKey] = useState('none');
  const [scanning, setScanning] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [lastKey, setLastKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [catBusy, setCatBusy] = useState(false);

  // nạp dữ liệu khi mở form
  const key = value === 'new' ? 'new' : (p ? String(p.id) : null);
  if (key !== lastKey) {
    setLastKey(key);
    setName(p?.name ?? '');
    setUnit(p?.unit ?? '');
    setPrice(p ? String(p.sellingPriceVnd) : '');
    setCost(p?.costPriceVnd != null ? String(p.costPriceVnd) : '');
    setStock(p?.stockQuantity != null ? String(Math.round(p.stockQuantity)) : '');
    setTracked(p?.tracked ?? true);
    setCatKey(p?.categoryId != null ? String(p.categoryId) : 'none');
    setMode('manual');
    setErr('');
    setAddingCat(false);
    setNewCatName('');
  }

  const num = (s: string) => parseInt(s.replace(/\D/g, ''), 10) || 0;
  const valid = name.trim() && unit.trim() && num(price) > 0;

  const save = async () => {
    setErr('');
    const priceNum = num(price);
    const costNum = num(cost) || Math.round(priceNum * 0.7);
    const payload: ProductWriteRequest = {
      categoryId: catKey === 'none' ? null : Number(catKey),
      name: name.trim(),
      unit: unit.trim(),
      sellingPriceVnd: priceNum,
      costPriceVnd: costNum,
      tracked,
      stockQuantity: tracked ? num(stock) : null,
    };
    setBusy(true);
    try {
      if (p) await productApi.update(p.id, payload);
      else await productApi.create(payload);
      toast(p ? 'Đã cập nhật sản phẩm' : `Đã thêm "${payload.name}"`);
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const createCategory = async () => {
    if (!newCatName.trim()) return;
    setCatBusy(true);
    try {
      const c = await categoryApi.create({ name: newCatName.trim() });
      onCategoryCreated(c);
      setCatKey(String(c.id));
      setAddingCat(false);
      setNewCatName('');
    } catch (e) {
      toast(errorMessage(e), 'err');
    } finally {
      setCatBusy(false);
    }
  };

  const aiScan = () => {
    setScanning(true);
    setTimeout(() => {
      setScanning(false);
      setName('Sữa chua nếp cẩm');
      setUnit('hộp');
      setPrice('12000');
      setCost('7000');
      setStock('24');
      setTracked(true);
      setMode('manual');
      toast('Đã điền thông tin gợi ý. Hãy kiểm tra trước khi lưu.');
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
            { key: 'manual', label: 'Nhập tay', icon: 'edit-3' },
            { key: 'ai', label: 'Chụp ảnh (AI)', icon: 'camera' },
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
          <Field label="Đơn vị" placeholder="VD: ly, chai, cái" value={unit} onChangeText={setUnit} />
          <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
            Nhóm hàng
          </T>
          <Chips
            scroll={false}
            style={{ marginBottom: 8 }}
            value={catKey}
            onChange={setCatKey}
            options={[{ key: 'none', label: 'Chưa phân loại' }, ...categories.map((c) => ({ key: String(c.id), label: c.name }))]}
          />
          {addingCat ? (
            <Row style={{ alignItems: 'flex-start', marginBottom: 4 }}>
              <Field
                placeholder="Tên danh mục mới"
                value={newCatName}
                onChangeText={setNewCatName}
                style={{ flex: 1, marginBottom: 0 }}
              />
              <Button
                title={catBusy ? '…' : 'Thêm'}
                small
                loading={catBusy}
                disabled={!newCatName.trim()}
                onPress={createCategory}
                style={{ marginLeft: 8, height: 44 }}
              />
            </Row>
          ) : (
            <Pressable onPress={() => setAddingCat(true)} style={{ marginBottom: 12 }}>
              <Row gap={4}>
                <Feather name="plus-circle" size={14} color={colors.primary} />
                <T w="semibold" size={12.5} color={colors.primary}>
                  Thêm danh mục mới
                </T>
              </Row>
            </Pressable>
          )}
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
          {err ? (
            <T size={12} color={colors.red} style={{ marginBottom: 8 }}>
              {err}
            </T>
          ) : null}
          <Button
            title={isNew ? 'Thêm sản phẩm' : 'Lưu thay đổi'}
            disabled={!valid || busy}
            loading={busy}
            onPress={save}
            style={{ marginTop: 6 }}
          />
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
        title={`Xoá "${p?.name ?? ''}"?`}
        message="Hoá đơn cũ vẫn giữ nguyên, chỉ xoá khỏi danh mục bán hàng."
        confirm="Xoá"
        onCancel={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (!p) return;
          setConfirmDel(false);
          try {
            await productApi.archive(p.id);
            toast('Đã xoá sản phẩm');
            onSaved();
            onClose();
          } catch (e) {
            toast(errorMessage(e), 'err');
          }
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
