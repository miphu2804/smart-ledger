import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddItemSheet } from '../src/components/AddItemSheet';
import { useToast } from '../src/components/brand';
import { Waveform } from '../src/components/charts';
import { Button, Dialog, Field, Header, IconBtn, Row, Stepper, T } from '../src/components/ui';
import { voiceSamples } from '../src/data/mock';
import type { LineItem, ProductView } from '../src/data/types';
import { productApi } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { expenseApi } from '../src/lib/expenseApi';
import { hhmm, vnd } from '../src/lib/format';
import { type ParsedExpenseItem, parseOrder } from '../src/lib/parseOrder';
import { itemsTotal } from '../src/lib/stats';
import { useApp } from '../src/store/AppStore';
import { colors, font, shadow } from '../src/theme';

type Msg = { id: number; from: 'user' | 'ai'; text: string };
let sampleCursor = 0;

export default function Voice() {
  const app = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recognitionRef = useRef<any>(null);
  const fullTranscriptRef = useRef('');

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState('');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const [pending, setPending] = useState<LineItem[]>([]);
  const [newPrice, setNewPrice] = useState('');
  const [newUnit, setNewUnit] = useState('cái');
  const [priceErr, setPriceErr] = useState('');
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  /**
   * Khoản chi nhận diện được — hiển thị bản nháp để xác nhận.
   * NFR-006/AC-010: Không ghi ngay, người dùng phải bấm "Lưu chi phí".
   */
  const [pendingExpenses, setPendingExpenses] = useState<ParsedExpenseItem[]>([]);
  const [expenseBusy, setExpenseBusy] = useState(false);

  const [products, setProducts] = useState<ProductView[]>([]);

  const loadProducts = useCallback(async () => {
    try {
      setProducts(await productApi.list());
    } catch (e) {
      toast(`Không tải được danh mục hàng: ${errorMessage(e)}`, 'err');
    }
  }, [toast]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Danh sách rút gọn cho bộ nhận diện giọng nói (tên/giá) — xem `parseOrder`
  const parseableProducts = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name, price: p.sellingPriceVnd })),
    [products],
  );

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [msgs, items, partial]);

  const push = (from: Msg['from'], t: string) => setMsgs((m) => [...m, { id: Date.now() + Math.random(), from, text: t }]);

  const mergeItems = (add: LineItem[]) =>
    setItems((cur) => {
      const next = cur.map((x) => ({ ...x }));
      add.forEach((a) => {
        const ex = next.find((x) => (a.productId ? x.productId === a.productId : x.name === a.name));
        if (ex) ex.qty += a.qty;
        else next.push({ ...a });
      });
      return next;
    });

  const handleUtterance = (utter: string) => {
    push('user', utter);
    setTranscripts((t) => [...t, utter]);
    const { items: found, unknown, missingQuantityItems, expenses } = parseOrder(utter, parseableProducts);

    setTimeout(() => {
      const responseParts: string[] = [];

      // 1. Các món ghi nhận thành công có số lượng
      if (found.length) {
        mergeItems(found);
        responseParts.push(`Đã ghi ${found.map((f) => `${f.qty} ${f.name}`).join(', ')}.`);
      }

      // 2. Món có tên nhưng thiếu số lượng
      if (missingQuantityItems && missingQuantityItems.length > 0) {
        responseParts.push(
          `Bạn đã gọi món "${missingQuantityItems.join(', ')}" nhưng chưa có số lượng. Mời bạn nói lại số lượng nhé (ví dụ: "1 ${missingQuantityItems[0]}").`,
        );
      }

      // 3. Món chưa có trong danh mục
      if (unknown.length) {
        setPending(unknown);
        setNewPrice(unknown[0].price ? String(unknown[0].price) : '');
        responseParts.push(`"${unknown[0].name}" chưa có trong danh mục. Bạn có muốn thêm vào không?`);
      }

      // 4. Khoản chi phát hiện được — hiển thị bản nháp, KHÔNG ghi ngay (NFR-006/AC-010)
      if (expenses && expenses.length > 0) {
        setPendingExpenses((cur) => [...cur, ...expenses]);
        responseParts.push(
          `Mình nghe thấy khoản chi: ${expenses.map((e) => `${e.title} (${vnd(e.amount)})`).join(', ')}. Bấm "Lưu chi phí" để xác nhận.`,
        );
      }

      // 5. Không nhận diện được thông tin nào
      if (
        !found.length &&
        !unknown.length &&
        (!missingQuantityItems || !missingQuantityItems.length) &&
        (!expenses || !expenses.length)
      ) {
        responseParts.push(
          'Mình chưa nhận diện được món hàng. Bạn thử nói lại kèm số lượng nhé, ví dụ: "2 ly cà phê sữa" hoặc "1 bánh mì ốp la".',
        );
      }

      if (responseParts.length > 0) {
        push('ai', responseParts.join('\n'));
      }
    }, 250);
  };

  const startRecording = () => {
    if (recording) return;
    fullTranscriptRef.current = '';
    setPartial('');
    setRecording(true);

    // Khởi động Web Speech API trên trình duyệt nếu có
    const SpeechRecognition =
      typeof window !== 'undefined'
        ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        : null;

    if (SpeechRecognition) {
      try {
        const reco = new SpeechRecognition();
        reco.lang = 'vi-VN';
        reco.continuous = true;
        reco.interimResults = true;

        reco.onresult = (event: any) => {
          let accumulated = '';
          for (let i = 0; i < event.results.length; i++) {
            accumulated += event.results[i][0].transcript + ' ';
          }
          const raw = accumulated.trim();
          if (raw) {
            // Chuẩn hóa phát âm ngay trên giao diện hiển thị (vd: xì tin -> sting, tai gơ -> bia tiger)
            const cleaned = raw
              .replace(/(?<!\p{L})(xì\s*ting|tin\s*dâu|xiting|siting|xì\s*tin|xi\s*tin|xitin)(?!\p{L})/gui, 'Sting')
              .replace(/(?<!\p{L})(tai\s*gơ|taigo|bia\s*tai\s*gơ)(?!\p{L})/gui, 'Bia Tiger');
            setPartial(cleaned);
            fullTranscriptRef.current = raw;
          }
        };

        reco.onerror = (err: any) => {
          console.warn('[SpeechRecognition Error]:', err);
        };

        recognitionRef.current = reco;
        reco.start();
        return;
      } catch (e) {
        console.warn('SpeechRecognition init failed:', e);
      }
    }

    // Giả lập giọng nói khi test hoặc thiết bị chưa có Web Speech API
    // ⚠️ Chỉ dùng để demo UI — không xử lý đơn từ sample khi không có mic thật.
    const sample = voiceSamples[sampleCursor++ % voiceSamples.length];
    const words = sample.split(' ');
    fullTranscriptRef.current = sample;
    timers.current.forEach(clearTimeout);
    timers.current = words.map((_, i) =>
      setTimeout(() => setPartial(words.slice(0, i + 1).join(' ')), 200 * (i + 1)),
    );
  };

  const finishRecording = (manualText?: string) => {
    if (!recording && !manualText) return;

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }

    timers.current.forEach(clearTimeout);
    setRecording(false);

    // Chỉ xử lý nếu có Web Speech API thật (fullTranscriptRef không phải từ sample)
    const finalText = manualText || (recognitionRef.current ? fullTranscriptRef.current : '') || partial;
    setPartial('');

    if (finalText && finalText.trim() && !finalText.includes('Đang nghe…')) {
      handleUtterance(finalText.trim());
    }
  };

  const sendText = () => {
    if (!text.trim()) return;
    handleUtterance(text.trim());
    setText('');
  };

  const resolvePending = async (action: 'catalog' | 'skip') => {
    const [first, ...rest] = pending;
    if (!first || catalogBusy) return;
    const price = parseInt(newPrice.replace(/\D/g, ''), 10) || 0;
    // Thiếu giá bán thì giữ nguyên hộp thoại, không để mất món; chỉ "Bỏ qua" mới được bỏ món.
    if (action === 'catalog' && !price) {
      setPriceErr(`Nhập giá bán cho "${first.name}" để thêm vào đơn`);
      return;
    }
    if (action === 'catalog') {
      setCatalogBusy(true);
      try {
        // Core không hỗ trợ món ngoài danh mục — phải tạo Product thật trước khi thêm vào đơn.
        const created = await productApi.create({
          name: first.name,
          unit: newUnit.trim() || 'cái',
          sellingPriceVnd: price,
          tracked: false,
          stockQuantity: null,
        });
        setProducts((cur) => [...cur, created]);
        mergeItems([{ productId: created.id, name: created.name, price: created.sellingPriceVnd, qty: first.qty }]);
        push('ai', `Đã thêm "${first.name}" (${vnd(price)}) vào danh mục và vào đơn.`);
      } catch (e) {
        setPriceErr(`Không thêm được "${first.name}" vào danh mục: ${errorMessage(e)}`);
        return;
      } finally {
        setCatalogBusy(false);
      }
    } else {
      push('ai', `Đã bỏ qua "${first.name}".`);
    }
    setPriceErr('');
    setPending(rest);
    setNewPrice(rest[0]?.price ? String(rest[0].price) : '');
    setNewUnit('cái');
  };

  // Lưu từng khoản lên Core. Khoản nào lỗi thì dừng và giữ lại (cùng các khoản sau nó) để bấm lưu lại; chỉ báo "đã lưu"
  // cho những khoản Core đã nhận thật.
  const confirmExpenses = async () => {
    if (expenseBusy || !pendingExpenses.length) return;
    setExpenseBusy(true);
    const saved: ParsedExpenseItem[] = [];
    let failure = '';
    for (const e of pendingExpenses) {
      try {
        await expenseApi.create({ category: e.category, description: e.title, amountVnd: e.amount });
        saved.push(e);
      } catch (err) {
        failure = errorMessage(err);
        break;
      }
    }
    setExpenseBusy(false);
    if (saved.length) {
      push('ai', `Đã lưu ${saved.length} khoản chi: ${saved.map((e) => `${e.title} (${vnd(e.amount)})`).join(', ')}.`);
    }
    if (failure) {
      push('ai', `Không lưu được khoản chi: ${failure}. Bạn bấm "Lưu chi phí" để thử lại.`);
    }
    // Khoản đã lưu luôn đứng đầu danh sách chờ; các khoản nói thêm trong lúc lưu nằm phía sau nên được giữ nguyên.
    setPendingExpenses((cur) => cur.slice(saved.length));
  };

  const total = itemsTotal(items);
  const count = items.reduce((a, i) => a + i.qty, 0);

  const checkout = () => {
    app.setDraft({ items, source: 'voice', transcript: transcripts.join(' · ') });
    router.push('/checkout');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }}>
      <View style={{ paddingHorizontal: 16 }}>
        <Header
          title="Bán hàng Giọng nói"
          subtitle={`Hôm nay, ${hhmm(new Date())} · ${app.store.name}`}
          right={
            <Pressable onPress={checkout} disabled={!items.length} hitSlop={8} style={styles.headerAction}>
              <T w="bold" size={14} color={items.length ? colors.primary : colors.disabled}>
                Lưu đơn
              </T>
            </Pressable>
          }
        />
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16, paddingBottom: 24, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        {!msgs.length && !recording ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <Feather name="mic" size={30} color={colors.ink} />
            </View>
            <T w="extrabold" size={20} style={{ marginTop: 16, textAlign: 'center' }}>
              Đơn này bạn bán hàng gì?
            </T>
            <T size={13} color={colors.faint} style={{ marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
              Nhấn giữ mic để nói, chọn câu gợi ý hoặc nhập bên dưới.
            </T>
            <T w="bold" size={12} color={colors.muted} style={{ marginTop: 22, marginBottom: 8 }}>
              THỬ GÕ NHANH
            </T>
            {['2 ly cà phê sữa 50 nghìn', 'bán 3 bánh mì, 2 coca', 'cho 1 bạc xỉu với chi 20k mua đá'].map((s) => (
              <Pressable key={s} onPress={() => handleUtterance(s)} style={styles.sample}>
                <T w="semibold" size={13} color={colors.primary}>
                  "{s}"
                </T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.from === 'user' ? styles.user : styles.ai]}>
            {m.from === 'ai' ? (
              <Row gap={5} style={{ marginBottom: 3 }}>
                <Feather name="star" size={12} color={colors.primary} />
                <T w="bold" size={12} color={colors.primary}>
                  Sổ Nghe Lời
                </T>
              </Row>
            ) : null}
            <T size={13.5} color={m.from === 'user' ? colors.white : colors.ink} style={{ lineHeight: 19 }}>
              {m.text}
            </T>
          </View>
        ))}

        {recording ? (
          <View style={[styles.bubble, styles.user, { opacity: 0.85 }]}>
            <T size={13.5} color={colors.white}>
              {partial || 'Đang lắng nghe…'}
            </T>
          </View>
        ) : null}

        {/* Bản nháp khoản chi — chờ xác nhận (NFR-006/AC-010) */}
        {pendingExpenses.length > 0 ? (
          <View style={styles.expenseDraft}>
            <Row gap={6} style={{ marginBottom: 8 }}>
              <Feather name="alert-circle" size={14} color={colors.gold} />
              <T w="bold" size={13} color={colors.gold}>
                Khoản chi chờ xác nhận
              </T>
            </Row>
            {pendingExpenses.map((e, i) => (
              <Row key={i} style={{ paddingVertical: 4 }}>
                <T size={13} style={{ flex: 1 }}>
                  {e.title}
                </T>
                <T w="bold" size={13} color={colors.ink}>
                  {vnd(e.amount)}
                </T>
              </Row>
            ))}
            <Row gap={8} style={{ marginTop: 10 }}>
              <Button
                title="Bỏ qua"
                variant="ghost"
                small
                disabled={expenseBusy}
                onPress={() => {
                  push('ai', 'Đã bỏ qua khoản chi.');
                  setPendingExpenses([]);
                }}
                style={{ flex: 1 }}
              />
              <Button
                title="Lưu chi phí"
                variant="soft"
                small
                loading={expenseBusy}
                disabled={expenseBusy}
                onPress={confirmExpenses}
                style={{ flex: 1 }}
              />
            </Row>
          </View>
        ) : null}

        {items.length ? (
          <View style={styles.order}>
            <Row style={{ marginBottom: 6 }}>
              <Feather name="star" size={13} color={colors.primary} />
              <T w="bold" size={13} color={colors.primary} style={{ flex: 1 }}>
                Sổ Nghe Lời đã ghi được
              </T>
              <T size={12} color={colors.faint}>
                {items.length} món ·{' '}
              </T>
              <Pressable onPress={() => setEdit((e) => !e)} hitSlop={8} style={styles.editAction}>
                <Row gap={3}>
                  <Feather name={edit ? 'check' : 'edit-2'} size={12} color={colors.primary} />
                  <T w="bold" size={12} color={colors.primary}>
                    {edit ? 'Xong' : 'Sửa'}
                  </T>
                </Row>
              </Pressable>
            </Row>
            {items.map((it, idx) => (
              <Row key={`${it.productId ?? it.name}-${idx}`} style={styles.line}>
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={14}>
                    {it.name}
                  </T>
                  <T size={12} color={colors.faint}>
                    {vnd(it.price)} × {it.qty}
                  </T>
                </View>
                {edit ? (
                  <Stepper
                    value={it.qty}
                    onChange={(q) =>
                      setItems((cur) =>
                        q <= 0 ? cur.filter((_, i) => i !== idx) : cur.map((x, i) => (i === idx ? { ...x, qty: q } : x)),
                      )
                    }
                  />
                ) : (
                  <T w="bold" size={15} color={colors.primary}>
                    {vnd(it.price * it.qty)}
                  </T>
                )}
              </Row>
            ))}
            {edit ? (
              <Button
                title="Thêm món"
                icon="plus"
                variant="soft"
                small
                onPress={() => setAddOpen(true)}
                style={{ marginTop: 10 }}
              />
            ) : null}
            <Row style={{ marginTop: 12 }}>
              <T w="semibold" size={14} color={colors.muted} style={{ flex: 1 }}>
                Tổng cộng · {count} món
              </T>
              <T w="extrabold" size={22} color={colors.primary}>
                {vnd(total)}
              </T>
            </Row>
            <Button title={`Tạo đơn · ${vnd(total)}`} icon="check" onPress={checkout} style={{ marginTop: 12 }} />
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {recording ? <Waveform active /> : null}
        <Button
          title={recording ? 'Đang nghe… Thả tay để chốt đơn' : 'Nhấn & Giữ để nói'}
          icon="mic"
          variant={recording ? 'voice' : 'gold'}
          onPressIn={startRecording}
          onPressOut={() => finishRecording()}
        />
        <Button
          title="Chọn hàng"
          icon="grid"
          variant="green"
          small
          onPress={() => router.push('/pos')}
          style={{ marginTop: 8, height: 44 }}
        />
        <Row style={styles.inputRow}>
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={sendText}
            placeholder="Nhập tên hàng + giá (hoặc nhấn giữ mic)"
            placeholderTextColor={colors.faint}
            style={styles.input}
            returnKeyType="send"
          />
          <IconBtn
            name="send"
            bg={text.trim() ? colors.primary : colors.primarySoft}
            color={text.trim() ? colors.white : colors.primaryLight}
            size={44}
            onPress={sendText}
            label="Gửi"
          />
        </Row>
      </View>

      {/* Dialog thêm món mới chưa có trong thực đơn */}
      <Dialog
        visible={pending.length > 0}
        icon="star"
        title={`Thêm "${pending[0]?.name ?? ''}" vào danh mục?`}
        message="Sản phẩm này chưa có trong danh mục. Core cần món có trong danh mục thật mới bán được."
        confirm="Thêm vào danh mục"
        cancel="Bỏ qua"
        onCancel={() => resolvePending('skip')}
        onConfirm={() => resolvePending('catalog')}
      >
        <View style={{ marginTop: 12 }}>
          <Field
            label="Giá bán (đ)"
            keyboardType="number-pad"
            placeholder="VD: 12000"
            value={newPrice}
            error={priceErr || undefined}
            onChangeText={(t) => {
              setNewPrice(t);
              setPriceErr('');
            }}
          />
          <Field label="Đơn vị" placeholder="VD: cái, ly, phần" value={newUnit} onChangeText={setNewUnit} />
        </View>
      </Dialog>

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        products={products}
        onPick={(li) => {
          mergeItems([li]);
          toast(`Đã thêm ${li.name}`);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 24,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sample: {
    backgroundColor: colors.white,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
    justifyContent: 'center',
  },
  bubble: { maxWidth: '84%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.ink, borderBottomRightRadius: 5 },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.white, borderColor: colors.border, borderWidth: 1, borderBottomLeftRadius: 5 },
  order: { backgroundColor: colors.white, borderRadius: 18, borderColor: colors.border, borderWidth: 1, padding: 16, marginTop: 4, ...shadow(1) },
  expenseDraft: {
    backgroundColor: colors.goldSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.gold,
    padding: 14,
    marginTop: 4,
    marginBottom: 8,
  },
  line: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  bottom: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputRow: { marginTop: 10, backgroundColor: colors.bg, borderRadius: 14, paddingLeft: 14, paddingRight: 6, height: 48 },
  headerAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  editAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  input: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.ink, height: '100%', outlineStyle: 'none' } as never,
});
