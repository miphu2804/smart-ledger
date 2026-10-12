import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BarcodeScannerModal } from '../src/components/BarcodeScannerModal';
import { CollapsibleHeader } from '../src/components/CollapsibleHeader';
import { useToast } from '../src/components/brand';
import { ProductPhotoCamera } from '../src/components/ProductPhotoCamera';
import { ProductThumb } from '../src/components/ProductThumb';
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
  Toggle,
} from '../src/components/ui';
import type { CategoryView, ProductView } from '../src/data/types';
import { categoryApi, productApi } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { normalizeText, vnd } from '../src/lib/format';
import { triggerFeedback } from '../src/lib/feedback';
import { buildProductPatch, isWholeNumber, resolveThreshold, stockLevel } from '../src/lib/productForm';
import { PHOTO_SOURCE, PhotoError, pickImageOnWeb, type PickedImage } from '../src/lib/productPhoto';
import { colors } from '../src/theme';

/** 'all' | 'low' | id danh mục dạng chuỗi (Chips cần K extends string) */
type Tab = 'all' | 'low' | string;

/** Cần nhập thêm: đã hết hàng, hoặc tồn chạm ngưỡng riêng của mặt hàng (mặt hàng chưa đặt ngưỡng không bị tính). */
const needsRestock = (p: ProductView) => {
  const level = stockLevel(p);
  return level === 'low' || level === 'out';
};

/** Số tồn để hiển thị: tối đa 3 chữ số thập phân, bỏ số 0 thừa. */
const formatQty = (n: number | null | undefined) => Number((n ?? 0).toFixed(3));

export default function Products() {
  const insets = useSafeAreaInsets();
  const toast = useToast();
  // /products?tab=low (từ "Kiểm tra hàng sắp hết" ở Tổng quan) mở thẳng danh sách cần nhập thêm
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'low' ? 'low' : 'all');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<ProductView | 'new' | null>(null);
  /** Mặt hàng đang mở sheet nhập hàng nhanh (bấm "Nhập hàng" ngay trên dòng) */
  const [stockInFor, setStockInFor] = useState<ProductView | null>(null);

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
          onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
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
              <ProductThumb name={p.name} uri={p.imageUrl} size={42} />
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
              {p.tracked ? (
                <Button title="Nhập hàng" icon="plus" variant="soft" small onPress={() => setStockInFor(p)} />
              ) : (
                <Feather name="chevron-right" size={18} color={colors.disabled} />
              )}
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
      <Sheet visible={!!stockInFor} onClose={() => setStockInFor(null)} title="Nhập hàng">
        {stockInFor ? (
          <>
            <Row gap={12} style={{ marginBottom: 14 }}>
              <ProductThumb name={stockInFor.name} uri={stockInFor.imageUrl} size={42} />
              <View style={{ flex: 1 }}>
                <T w="semibold" size={15}>
                  {stockInFor.name}
                </T>
                <T size={12.5} color={colors.muted}>
                  Tồn hiện tại: {formatQty(stockInFor.stockQuantity)} {stockInFor.unit}
                </T>
              </View>
            </Row>
            <StockInFields
              key={stockInFor.id}
              product={stockInFor}
              currentStock={stockInFor.stockQuantity ?? 0}
              autoFocus
              onDone={(updated, qty) => {
                // Core trả mặt hàng sau khi cộng tồn: cập nhật ngay dòng đó, không cần tải lại cả danh sách
                setProducts((cur) => cur.map((x) => (x.id === updated.id ? updated : x)));
                setStockInFor(null);
                toast(`Đã nhập ${qty} ${updated.unit} · tồn mới ${formatQty(updated.stockQuantity)}`);
              }}
            />
          </>
        ) : null}
      </Sheet>
    </View>
  );
}

/**
 * Ô số lượng, lý do và nút "Nhập vào kho" (POST /products/{id}/stock-in). Dùng chung cho sheet nhập nhanh trên danh sách
 * và mục "Nhập hàng" trong form sửa mặt hàng.
 */
function StockInFields({
  product,
  currentStock,
  autoFocus,
  onDone,
}: {
  product: ProductView;
  /** Tồn đang hiển thị ở nơi gọi, để xem trước tồn sau khi nhập */
  currentStock: number;
  autoFocus?: boolean;
  onDone: (updated: ProductView, qty: number) => void;
}) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const amount = isWholeNumber(qty) ? Number(qty.trim()) : 0;

  const submit = async () => {
    if (busy || qty.trim() === '') return;
    if (!isWholeNumber(qty) || amount <= 0 || amount > 999999999999) {
      setErr('Số lượng nhập phải là số nguyên dương, chỉ gồm chữ số (không có dấu trừ, dấu chấm hay dấu phẩy).');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const updated = await productApi.stockIn(product.id, { quantity: amount, reason: reason.trim() || null });
      triggerFeedback('success');
      setQty('');
      setReason('');
      onDone(updated, amount);
    } catch (e) {
      triggerFeedback('error');
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field
        label="Số lượng nhập"
        keyboardType="number-pad"
        placeholder="VD: 24"
        value={qty}
        onChangeText={(t) => {
          setQty(t);
          setErr('');
        }}
        autoFocus={autoFocus}
        onSubmitEditing={submit}
      />
      {amount > 0 ? (
        <T size={12.5} color={colors.muted} style={{ marginTop: -6, marginBottom: 12 }}>
          Tồn sau khi nhập: {formatQty(currentStock + amount)} {product.unit}
        </T>
      ) : null}
      <Field label="Lý do (tuỳ chọn)" placeholder="VD: Nhập thêm từ nhà cung cấp" value={reason} onChangeText={setReason} />
      {err ? (
        <T size={12} color={colors.red} style={{ marginBottom: 8 }}>
          {err}
        </T>
      ) : null}
      <Button title="Nhập vào kho" disabled={qty.trim() === '' || busy} loading={busy} onPress={submit} />
    </>
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
  /** Ảnh đang hiện ở form: ảnh đã lưu ở Core (mặt hàng cũ) hoặc ảnh vừa chọn của mặt hàng mới */
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  /** Mặt hàng mới chưa có id: giữ ảnh đã chọn, tải lên ngay sau khi tạo xong */
  const [pendingPhoto, setPendingPhoto] = useState<PickedImage | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoErr, setPhotoErr] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  /**
   * Tăng mỗi lần form nạp lại (mở mặt hàng khác, đóng rồi mở lại). Form luôn nằm trong cây React, nên kết quả tải hoặc xoá
   * ảnh về muộn của lần mở trước phải so số này trước khi ghi vào state, kẻo hiện nhầm sang mặt hàng đang mở.
   */
  const photoSession = useRef(0);

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
    setTracked(p?.tracked ?? true);
    setCatKey(p?.categoryId != null ? String(p.categoryId) : 'none');
    setMode('manual');
    setErr('');
    setAddingCat(false);
    setNewCatName('');
    photoSession.current += 1;
    setPhotoUrl(p?.imageUrl ?? null);
    setPendingPhoto(null);
    setPhotoBusy(false);
    setPhotoErr('');
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
    let photoFailure = '';
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
        const created = await productApi.create({
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
        // Core nhận ảnh qua endpoint riêng sau khi mặt hàng đã có id. Lỗi ảnh không làm mất mặt hàng vừa tạo.
        if (pendingPhoto) {
          try {
            await productApi.uploadImage(created.id, pendingPhoto);
          } catch (e) {
            photoFailure = errorMessage(e);
          }
        }
      }
      if (photoFailure) {
        triggerFeedback('warning');
        toast(`Đã thêm "${name.trim()}" nhưng chưa lưu được ảnh: ${photoFailure}. Mở lại mặt hàng để thêm ảnh.`, 'err');
      } else {
        triggerFeedback('success');
        toast(p ? 'Đã cập nhật mặt hàng' : `Đã thêm "${name.trim()}"`);
      }
      onSaved();
      onClose();
    } catch (e) {
      triggerFeedback('error');
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Mặt hàng đã có: tải ảnh lên ngay khi chọn (như nhập hàng, không chờ "Lưu thay đổi"). Mặt hàng mới: giữ lại chờ tạo xong.
  const applyPhoto = async (image: PickedImage) => {
    const session = photoSession.current;
    const current = () => session === photoSession.current;
    setPhotoErr('');
    if (!p) {
      setPendingPhoto(image);
      setPhotoUrl(image.uri);
      return;
    }
    setPhotoBusy(true);
    try {
      const updated = await productApi.uploadImage(p.id, image);
      triggerFeedback('success');
      onChanged();
      if (current()) setPhotoUrl(updated.imageUrl);
    } catch (e) {
      triggerFeedback('error');
      // Form đã chuyển sang việc khác thì không còn chỗ hiện lỗi của mặt hàng này: báo bằng toast
      if (current()) setPhotoErr(errorMessage(e));
      else toast(`Chưa lưu được ảnh cho "${p.name}": ${errorMessage(e)}`, 'err');
    } finally {
      if (current()) setPhotoBusy(false);
    }
  };

  const choosePhoto = async () => {
    if (photoBusy) return;
    setPhotoErr('');
    if (PHOTO_SOURCE === 'camera') {
      setCameraOpen(true);
      return;
    }
    const session = photoSession.current;
    try {
      const image = await pickImageOnWeb();
      // Form đã đóng hoặc mở mặt hàng khác trong lúc hộp chọn file còn mở: bỏ ảnh vừa chọn
      if (!image || session !== photoSession.current) return;
      await applyPhoto(image);
    } catch (e) {
      if (session !== photoSession.current) return;
      setPhotoErr(e instanceof PhotoError ? e.message : 'Không đọc được ảnh này. Hãy chọn ảnh khác');
    }
  };

  const removePhoto = async () => {
    if (photoBusy) return;
    setPhotoErr('');
    if (!p) {
      setPendingPhoto(null);
      setPhotoUrl(null);
      return;
    }
    const session = photoSession.current;
    const current = () => session === photoSession.current;
    setPhotoBusy(true);
    try {
      await productApi.deleteImage(p.id);
      onChanged();
      if (current()) setPhotoUrl(null);
    } catch (e) {
      triggerFeedback('error');
      if (current()) setPhotoErr(errorMessage(e));
      else toast(`Chưa xoá được ảnh của "${p.name}": ${errorMessage(e)}`, 'err');
    } finally {
      if (current()) setPhotoBusy(false);
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
          <Row gap={12} style={styles.photoRow}>
            <ProductThumb name={name || 'mặt hàng'} uri={photoUrl} size={72} busy={photoBusy} placeholder="icon" />
            <View style={{ flex: 1 }}>
              <T w="semibold" size={14}>
                Ảnh mặt hàng
              </T>
              <T size={12} color={colors.faint}>
                {photoUrl ? 'Ảnh này hiện trên thẻ ở màn Bán hàng.' : 'Tuỳ chọn. Chưa có ảnh thì app dùng ảnh minh hoạ theo tên.'}
              </T>
              <Row gap={8} style={{ marginTop: 8 }}>
                <Button
                  title={photoUrl ? 'Đổi ảnh' : PHOTO_SOURCE === 'camera' ? 'Chụp ảnh' : 'Chọn ảnh'}
                  icon="camera"
                  variant="soft"
                  small
                  disabled={photoBusy}
                  onPress={choosePhoto}
                />
                {photoUrl ? <Button title="Xoá ảnh" icon="trash-2" variant="ghost" small disabled={photoBusy} onPress={removePhoto} /> : null}
              </Row>
            </View>
          </Row>
          {photoErr ? (
            <T size={12} color={colors.red} style={{ marginTop: -6, marginBottom: 10 }}>
              {photoErr}
            </T>
          ) : null}
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
                    {formatQty(stockNow)} {p.unit}
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
                  <StockInFields
                    product={p}
                    currentStock={stockNow ?? 0}
                    onDone={(updated, qty) => {
                      setStockNow(updated.stockQuantity);
                      setStockInOpen(false);
                      toast(`Đã nhập ${qty} ${p.unit} vào kho`);
                      onChanged();
                    }}
                  />
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
      <ProductPhotoCamera
        visible={cameraOpen}
        onClose={() => setCameraOpen(false)}
        onPicked={(image) => {
          setCameraOpen(false);
          applyPhoto(image);
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
  photoRow: { alignItems: 'center', marginBottom: 14, padding: 12, borderRadius: 14, backgroundColor: colors.bg },
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
