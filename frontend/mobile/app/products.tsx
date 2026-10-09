import { Feather } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeScannerModal } from '../src/components/BarcodeScannerModal';
import { CollapsibleHeader } from '../src/components/CollapsibleHeader';
import { useToast } from '../src/components/brand';
import {
  Badge,
  Button,
  Chips,
  Dialog,
  EmptyState,
  Field,
  Header,
  LoadingState,
  Row,
  Sheet,
  T,
  Tile,
  Toggle,
} from '../src/components/ui';
import type { CategoryView, ProductView } from '../src/data/types';
import { categoryApi, productApi } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { normalizeText, vnd } from '../src/lib/format';
import { triggerFeedback } from '../src/lib/feedback';
import { buildProductPatch, isWholeNumber, resolveThreshold, stockLevel } from '../src/lib/productForm';
import { colors } from '../src/theme';

/** 'all' | 'low' | id danh mục dạng chuỗi (Chips cần K extends string) */
type Tab = 'all' | 'low' | string;

/** Cần nhập thêm: đã hết hàng, hoặc tồn chạm ngưỡng riêng của mặt hàng (mặt hàng chưa đặt ngưỡng không bị tính). */
const needsRestock = (p: ProductView) => {
  const level = stockLevel(p);
  return level === 'low' || level === 'out';
};

export default function Products() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<ProductView | 'new' | null>(null);

  const [products, setProducts] = useState<ProductView[]>([]);
  const [categories, setCategories] = useState<CategoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const scrollY = useRef(new Animated.Value(0)).current;

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
        if (tab === 'low' && !needsRestock(p)) return false;
        if (tab !== 'all' && tab !== 'low' && String(p.categoryId ?? '') !== tab) return false;
        return (
          !q ||
          normalizeText(p.name).includes(normalizeText(q))
        );
      }),
    [products, tab, q],
  );
  const stockValue = products.reduce((a, p) => a + (p.tracked ? (p.stockQuantity ?? 0) * (p.costPriceVnd ?? 0) : 0), 0);
  const low = products.filter(needsRestock).length;
  const headerHeight = 260;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <CollapsibleHeader
        scrollY={scrollY}
        topInset={insets.top}
        expandedHeight={headerHeight}
        pinned={
          <Header
            title="Hàng hoá"
            subtitle="Giá bán và tồn kho"
            right={<Button title="Thêm" icon="plus" small onPress={() => setForm('new')} />}
          />
        }
      >
        <Row style={{ alignItems: 'stretch' }}>
          <Stat label="Mặt hàng" value={String(products.length)} />
          <Stat label="Giá trị tồn (vốn)" value={vnd(stockValue)} color={colors.primary} flex={2} />
          <Stat label="Sắp hết" value={String(low)} color={colors.gold} bg={colors.goldSoft} />
        </Row>
        <Field placeholder="Tìm theo tên hoặc mã vạch…" value={q} onChangeText={setQ} style={{ marginTop: 12, marginBottom: 10 }} />
        <Chips<Tab>
          value={tab}
          onChange={setTab}
          options={[
            { key: 'all', label: 'Tất cả' },
            { key: 'low', label: 'Sắp hết', icon: 'alert-triangle' },
            ...categories.map((c) => ({ key: String(c.id), label: c.name })),
          ]}
        />
      </CollapsibleHeader>
      {loading ? (
        <View style={{ paddingTop: insets.top + headerHeight }}>
          <LoadingState label="Đang tải hàng hoá…" />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: insets.top + headerHeight }}>
          <EmptyState icon="alert-triangle" title="Không tải được danh sách" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </View>
      ) : (
        <Animated.FlatList
          data={list}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + headerHeight + 6, paddingBottom: 100 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
          ListEmptyComponent={
            <EmptyState
              icon={q ? 'search' : tab === 'low' ? 'check-circle' : 'package'}
              tone={tab === 'low' && !q ? 'success' : 'neutral'}
              title={q ? 'Không tìm thấy mặt hàng' : tab === 'low' ? 'Không có mặt hàng sắp hết' : 'Chưa có mặt hàng'}
              hint={q ? 'Thử tên hoặc mã vạch khác' : tab === 'low' ? 'Tồn kho đang ở mức ổn định' : 'Nhấn Thêm để tạo mặt hàng đầu tiên'}
            />
          }
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
                  ) : stockLevel(p) === 'out' ? (
                    <Badge text="Hết hàng" color={colors.red} bg={colors.redSoft} />
                  ) : stockLevel(p) === 'low' ? (
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
      <ProductForm
        value={form}
        categories={categories}
        onCategoryCreated={(c) => setCategories((cur) => [...cur, c])}
        onClose={() => setForm(null)}
        onSaved={load}
        onChanged={load}
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
  onChanged,
}: {
  value: ProductView | 'new' | null;
  categories: CategoryView[];
  onCategoryCreated: (c: CategoryView) => void;
  onClose: () => void;
  /** Đã lưu xong: tải lại danh sách rồi đóng form */
  onSaved: () => void;
  /** Dữ liệu đổi nhưng form còn mở (nhập hàng): chỉ tải lại danh sách */
  onChanged: () => void;
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
  const [threshold, setThreshold] = useState('');
  /** Chữ ngưỡng lúc mở form: còn y nguyên khi lưu thì giữ giá trị gốc, kể cả khi có phần thập phân */
  const [thresholdInit, setThresholdInit] = useState('');
  /** Tồn đang hiện ở form sửa: lấy từ mặt hàng, cập nhật sau mỗi lần nhập hàng */
  const [stockNow, setStockNow] = useState<number | null>(null);
  const [stockInOpen, setStockInOpen] = useState(false);
  const [inQty, setInQty] = useState('');
  const [inReason, setInReason] = useState('');
  const [inBusy, setInBusy] = useState(false);
  const [inErr, setInErr] = useState('');
  const [tracked, setTracked] = useState(true);
  const [catKey, setCatKey] = useState('none');
  const [scanning, setScanning] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [barcode, setBarcode] = useState('');
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
    setBarcode(p?.barcode ?? '');
    setPrice(p ? String(p.sellingPriceVnd) : '');
    setCost(p?.costPriceVnd != null ? String(p.costPriceVnd) : '');
    setStock(p?.stockQuantity != null ? String(Math.round(p.stockQuantity)) : '');
    const thresholdText = p?.lowStockThreshold != null ? String(p.lowStockThreshold) : '';
    setThreshold(thresholdText);
    setThresholdInit(thresholdText);
    setStockNow(p?.stockQuantity ?? null);
    setStockInOpen(false);
    setInQty('');
    setInReason('');
    setInErr('');
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
    if (isNew && tracked && stock.trim() !== '' && !isWholeNumber(stock)) {
      setErr('Số lượng tồn chỉ gồm chữ số, không có dấu trừ, dấu chấm hay dấu phẩy.');
      return;
    }
    const resolved = resolveThreshold(threshold, thresholdInit, p?.lowStockThreshold ?? null);
    if (tracked && !resolved.ok) {
      setErr('Ngưỡng báo sắp hết chỉ gồm chữ số, không có dấu trừ, dấu chấm hay dấu phẩy.');
      return;
    }
    const priceNum = num(price);
    const costNum = cost.trim() === '' ? null : num(cost);
    const categoryId = catKey === 'none' ? null : Number(catKey);
    const lowStockThreshold = resolved.ok ? resolved.value : null;
    setBusy(true);
    try {
      if (p) {
        // Core không nhận tồn qua PATCH: tồn đổi bằng "Nhập hàng" (stock-in). Không đổi gì thì khỏi gửi.
        const patch = buildProductPatch(p, {
          name,
          unit,
          barcode,
          sellingPriceVnd: priceNum,
          costPriceVnd: costNum,
          categoryId,
          tracked,
          lowStockThreshold,
        });
        if (Object.keys(patch).length > 0) await productApi.update(p.id, patch);
      } else {
        await productApi.create({
          categoryId,
          name: name.trim(),
          unit: unit.trim(),
          barcode: barcode.trim() || undefined,
          sellingPriceVnd: priceNum,
          costPriceVnd: costNum,
          tracked,
          stockQuantity: tracked ? num(stock) : null,
          lowStockThreshold: tracked ? lowStockThreshold : null,
        });
      }
      triggerFeedback('success');
      toast(p ? 'Đã cập nhật mặt hàng' : `Đã thêm "${name.trim()}"`);
      onSaved();
      onClose();
    } catch (e) {
      triggerFeedback('error');
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitStockIn = async () => {
    if (!p || inBusy) return;
    if (!isWholeNumber(inQty) || Number(inQty.trim()) <= 0 || Number(inQty.trim()) > 999999999999) {
      setInErr('Số lượng nhập phải là số nguyên dương, chỉ gồm chữ số (không có dấu trừ, dấu chấm hay dấu phẩy).');
      return;
    }
    const qty = Number(inQty.trim());
    setInBusy(true);
    setInErr('');
    try {
      const updated = await productApi.stockIn(p.id, { quantity: qty, reason: inReason.trim() || null });
      setStockNow(updated.stockQuantity);
      setInQty('');
      setInReason('');
      setStockInOpen(false);
      triggerFeedback('success');
      toast(`Đã nhập ${qty} ${p.unit} vào kho`);
      onChanged();
    } catch (e) {
      triggerFeedback('error');
      setInErr(errorMessage(e));
    } finally {
      setInBusy(false);
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
      setBarcode('8935049500999');
      setPrice('12000');
      setCost('7000');
      setStock('24');
      setTracked(true);
      setMode('manual');
      toast('Đã điền thông tin gợi ý. Hãy kiểm tra trước khi lưu.');
    }, 1400);
  };

  return (
    <Sheet visible={!!value} onClose={onClose} title={isNew ? 'Thêm mặt hàng' : 'Sửa mặt hàng'}>
      {isNew ? (
        <Chips<'manual' | 'ai'>
          scroll={false}
          style={{ marginBottom: 14 }}
          value={mode}
          onChange={setMode}
          options={[
            { key: 'manual', label: 'Nhập tay', icon: 'edit-3' },
            { key: 'ai', label: 'Chụp ảnh', icon: 'camera' },
          ]}
        />
      ) : null}
      {mode === 'ai' ? (
        <View style={styles.scan}>
          <Feather name="camera" size={34} color={colors.brand} />
          <T w="semibold" size={13} color={colors.muted} style={{ textAlign: 'center', marginTop: 8 }}>
            Chụp bao bì hoặc bảng giá để điền nhanh thông tin. Hãy kiểm tra trước khi lưu.
          </T>
          <Button
            title={scanning ? 'Đang nhận diện…' : 'Chụp ảnh'}
            loading={scanning}
            onPress={aiScan}
            style={{ marginTop: 14, alignSelf: 'stretch' }}
          />
        </View>
      ) : (
        <>
          <Field label="Tên mặt hàng" placeholder="VD: Nước suối" value={name} onChangeText={setName} />

          <Row gap={8} style={{ alignItems: 'flex-end', marginBottom: 14 }}>
            <Field
              label="Mã vạch (EAN-13, UPC...)"
              placeholder="VD: 8934563138165"
              value={barcode}
              onChangeText={setBarcode}
              style={{ flex: 1, marginBottom: 0 }}
            />
            <Button
              title="Quét"
              icon="camera"
              variant="soft"
              small
              onPress={() => setScannerOpen(true)}
              style={{ height: 48 }}
            />
          </Row>

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
                <Feather name="plus-circle" size={14} color={colors.brand} />
                <T w="semibold" size={12.5} color={colors.brand}>
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
          {tracked && isNew ? (
            <Field label="Số lượng tồn" keyboardType="number-pad" placeholder="0" value={stock} onChangeText={setStock} />
          ) : null}
          {tracked ? (
            <Field
              label="Báo sắp hết khi tồn còn từ (tuỳ chọn)"
              keyboardType="number-pad"
              placeholder="Để trống = không báo sắp hết"
              value={threshold}
              onChangeText={setThreshold}
            />
          ) : null}
          {p && p.tracked && tracked ? (
            <View style={styles.stockBox}>
              <Row>
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={14}>
                    Tồn kho hiện tại
                  </T>
                  <T size={12} color={colors.faint}>
                    {Number((stockNow ?? 0).toFixed(3))} {p.unit}
                  </T>
                </View>
                <Button
                  title={stockInOpen ? 'Đóng' : 'Nhập hàng'}
                  icon={stockInOpen ? 'x' : 'plus'}
                  variant="soft"
                  small
                  onPress={() => setStockInOpen((open) => !open)}
                />
              </Row>
              {stockInOpen ? (
                <View style={{ marginTop: 12 }}>
                  <Field label="Số lượng nhập" keyboardType="number-pad" placeholder="VD: 24" value={inQty} onChangeText={setInQty} />
                  <Field label="Lý do (tuỳ chọn)" placeholder="VD: Nhập thêm từ nhà cung cấp" value={inReason} onChangeText={setInReason} />
                  {inErr ? (
                    <T size={12} color={colors.red} style={{ marginBottom: 8 }}>
                      {inErr}
                    </T>
                  ) : null}
                  <Button title="Nhập vào kho" disabled={inQty.trim() === '' || inBusy} loading={inBusy} onPress={submitStockIn} />
                </View>
              ) : null}
            </View>
          ) : null}
          {p && !p.tracked && tracked ? (
            <T size={12} color={colors.faint} style={{ marginBottom: 8 }}>
              Sau khi lưu, tồn của mặt hàng bắt đầu từ 0. Mở lại mặt hàng và bấm "Nhập hàng" để thêm tồn.
            </T>
          ) : null}
          {p && p.tracked && !tracked ? (
            <T size={12} color={colors.faint} style={{ marginBottom: 8 }}>
              Tắt theo dõi tồn kho sẽ xoá số tồn hiện tại của mặt hàng này.
            </T>
          ) : null}
          {err ? (
            <T size={12} color={colors.red} style={{ marginBottom: 8 }}>
              {err}
            </T>
          ) : null}
          <Button
            title={isNew ? 'Thêm mặt hàng' : 'Lưu thay đổi'}
            disabled={!valid || busy}
            loading={busy}
            onPress={save}
            style={{ marginTop: 6 }}
          />
          {p ? (
            <Button
              title="Xoá mặt hàng"
              variant="ghost"
              icon="trash-2"
              onPress={() => setConfirmDel(true)}
              style={{ marginTop: 6 }}
            />
          ) : null}
        </>
      )}

      <BarcodeScannerModal
        visible={scannerOpen}
        mode="input"
        onClose={() => setScannerOpen(false)}
        onBarcodeScanned={(code) => {
          setBarcode(code);
          setScannerOpen(false);
        }}
      />
      <Dialog
        visible={confirmDel}
        danger
        icon="trash-2"
        title={`Xoá "${p?.name ?? ''}"?`}
        message="Đơn cũ vẫn giữ nguyên, chỉ xoá khỏi danh mục bán hàng."
        confirm="Xoá"
        onCancel={() => setConfirmDel(false)}
        onConfirm={async () => {
          if (!p) return;
          setConfirmDel(false);
          try {
            await productApi.archive(p.id);
            triggerFeedback('success');
            toast('Đã xoá mặt hàng');
            onSaved();
            onClose();
          } catch (e) {
            triggerFeedback('error');
            toast(errorMessage(e), 'err');
          }
        }}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  stat: { paddingVertical: 10, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: colors.border },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderColor: colors.border,
  },
  trackRow: { marginTop: 16, marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: colors.bg },
  stockBox: { marginBottom: 12, padding: 12, borderRadius: 14, backgroundColor: colors.bg },
  scan: {
    alignItems: 'center',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#D8CDF8',
    borderRadius: 18,
    padding: 22,
    backgroundColor: colors.brandTint,
  },
});
