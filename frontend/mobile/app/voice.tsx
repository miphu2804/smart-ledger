import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddItemSheet } from '../src/components/AddItemSheet';
import { useToast } from '../src/components/brand';
import { Waveform } from '../src/components/charts';
import { Button, Dialog, Field, Header, IconBtn, Row, Stepper, T } from '../src/components/ui';
import { voiceSamples } from '../src/data/mock';
import type { LineItem } from '../src/data/types';
import { hhmm, vnd } from '../src/lib/format';
import { parseOrder, DisambiguationItem } from '../src/lib/parseOrder';
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

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState('');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const [pending, setPending] = useState<LineItem[]>([]);
  const [disambigItem, setDisambigItem] = useState<DisambiguationItem | null>(null);
  const [newPrice, setNewPrice] = useState('');
  const [priceErr, setPriceErr] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);

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

    // Chạy bộ bóc tách thông minh on-device
    const { items: found, unknown, disambiguations, expenses, normalizedText } = parseOrder(utter, app.products);

    setTimeout(() => {
      const responseParts: string[] = [];

      if (found.length) {
        mergeItems(found);
        responseParts.push(`Đã ghi ${found.map((f) => `${f.qty} ${f.name}`).join(', ')}.`);
      }

      if (disambiguations && disambiguations.length > 0) {
        setDisambigItem(disambiguations[0]);
        responseParts.push(`Món “${disambiguations[0].rawName}” có nhiều biến thể. Vui lòng chọn loại bạn muốn bán.`);
      }

      if (unknown.length) {
        setPending(unknown);
        setNewPrice(unknown[0].price ? String(unknown[0].price) : '');
        responseParts.push(`“${unknown[0].name}” chưa có trong danh mục. Bạn có muốn thêm vào không?`);
      }

      if (expenses && expenses.length > 0) {
        expenses.forEach((e) => {
          app.addExpense({
            title: e.title,
            amount: e.amount,
            category: 'khac',
            source: 'voice',
          });
        });
        responseParts.push(`Đã ghi nhận khoản chi: ${expenses.map((e) => `${e.title} (${vnd(e.amount)})`).join(', ')}.`);
      }

      if (!found.length && !unknown.length && (!disambiguations || !disambiguations.length) && (!expenses || !expenses.length)) {
        responseParts.push('Mình chưa nhận diện được món hàng. Bạn thử nói lại nhé, ví dụ: “2 ly cà phê sữa 50k” hoặc “1 bánh mì ốp la”.');
      }

      if (responseParts.length > 0) {
        push('ai', responseParts.join('\n'));
      }
    }, 250);
  };

  const fullTranscriptRef = useRef('');

  const startRecording = () => {
    if (recording) return;
    fullTranscriptRef.current = '';
    setPartial('');
    setRecording(true);

    // Khởi động Web Speech API trên trình duyệt nếu có
    const SpeechRecognition = typeof window !== 'undefined' ? ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) : null;

    if (SpeechRecognition) {
      try {
        const reco = new SpeechRecognition();
        reco.lang = 'vi-VN';
        reco.continuous = true; // Không ngắt câu khi đang giữ nút
        reco.interimResults = true;

        reco.onresult = (event: any) => {
          let accumulated = '';
          for (let i = 0; i < event.results.length; i++) {
            accumulated += event.results[i][0].transcript + ' ';
          }
          const text = accumulated.trim();
          if (text) {
            setPartial(text);
            fullTranscriptRef.current = text;
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

    // Fallback nếu không có Micro Web Speech API
    setPartial('Đang nghe… (Hãy nói rồi thả tay để chốt đơn)');
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

    const finalText = manualText || fullTranscriptRef.current || partial;
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

  const resolvePending = (action: 'catalog' | 'once' | 'skip') => {
    const [first, ...rest] = pending;
    if (!first) return;
    const price = parseInt(newPrice.replace(/\D/g, ''), 10) || 0;
    if (action !== 'skip' && !price) {
      setPriceErr(`Nhập giá bán cho “${first.name}” để thêm vào đơn`);
      return;
    }
    if (action === 'catalog') {
      const id = app.addProduct({
        name: first.name,
        price,
        cost: Math.round(price * 0.6),
        stock: 0,
        tracked: false,
        category: 'other',
        aliases: [first.name],
      });
      mergeItems([{ ...first, productId: id, price }]);
      push('ai', `Đã thêm “${first.name}” (${vnd(price)}) vào danh mục và vào đơn.`);
    } else if (action === 'once') {
      mergeItems([{ ...first, price }]);
      push('ai', `Đã ghi “${first.name}” vào đơn này (không lưu vào danh mục).`);
    } else {
      push('ai', `Đã bỏ qua “${first.name}”.`);
    }
    setPriceErr('');
    setPending(rest);
    setNewPrice(rest[0]?.price ? String(rest[0].price) : '');
  };

  const selectDisambiguation = (option: { product_id: string; name: string; unit_price_vnd: number }) => {
    if (!disambigItem) return;
    const itemToAdd: LineItem = {
      productId: option.product_id,
      name: option.name,
      price: option.unit_price_vnd,
      qty: disambigItem.qty,
    };
    mergeItems([itemToAdd]);
    push('ai', `Đã chọn “${option.name}” × ${disambigItem.qty} (${vnd(option.unit_price_vnd * disambigItem.qty)}).`);
    setDisambigItem(null);
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
            <Pressable onPress={checkout} disabled={!items.length} hitSlop={8}>
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
              <Feather name="mic" size={30} color={colors.gold} />
            </View>
            <T w="extrabold" size={20} style={{ marginTop: 16, textAlign: 'center' }}>
              Đơn này bạn bán hàng gì?
            </T>
            <T size={13} color={colors.faint} style={{ marginTop: 6, textAlign: 'center', lineHeight: 19 }}>
              Nói hoặc gõ như bình thường,{'\n'}Hệ thống nhận diện on-device siêu tốc và chính xác.
            </T>
            <T w="bold" size={12} color={colors.muted} style={{ marginTop: 22, marginBottom: 8 }}>
              CÂU NÓI MẪU THỬ NGHIỆM
            </T>
            {[
              '2 ly cà phê sữa 50 nghìn',
              'bán 1 bạc xỉu với 2 bánh mì',
              'cho 2 bánh mì ốp la và chi 20k mua đá',
            ].map((s) => (
              <Pressable key={s} onPress={() => handleUtterance(s)} style={styles.sample}>
                <T w="semibold" size={13} color={colors.primary}>
                  “{s}”
                </T>
              </Pressable>
            ))}
          </View>
        ) : null}

        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.from === 'user' ? styles.user : styles.ai]}>
            {m.from === 'ai' ? (
              <Row gap={5} style={{ marginBottom: 3 }}>
                <Feather name="star" size={11} color={colors.primary} />
                <T w="bold" size={10.5} color={colors.primary}>
                  Sổ Nghe Lời AI (On-Device)
                </T>
              </Row>
            ) : null}
            <T size={13.5} color={m.from === 'user' ? colors.white : colors.ink} style={{ lineHeight: 19 }}>
              {m.text}
            </T>
          </View>
        ))}

        {recording ? (
          <View style={[styles.bubble, styles.user, { opacity: 0.75 }]}>
            <T size={13.5} color={colors.white}>
              {partial || 'Đang lắng nghe…'}
            </T>
          </View>
        ) : null}

        {items.length ? (
          <View style={styles.order}>
            <Row style={{ marginBottom: 6 }}>
              <Feather name="star" size={13} color={colors.primary} />
              <T w="bold" size={13} color={colors.primary} style={{ flex: 1 }}>
                Đơn hàng đã ghi nhận
              </T>
              <T size={11} color={colors.faint}>
                {items.length} món ·{' '}
              </T>
              <Pressable onPress={() => setEdit((e) => !e)} hitSlop={8}>
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
                  <T size={11} color={colors.faint}>
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
          title="Chọn hàng từ POS"
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
            placeholder="Nói hoặc nhập tên món (VD: 2 bạc xỉu 1 bánh mì)"
            placeholderTextColor={colors.faint}
            style={styles.input}
            returnKeyType="send"
          />
          <IconBtn
            name="send"
            bg={text.trim() ? colors.primary : colors.primarySoft}
            color={text.trim() ? colors.white : colors.primaryLight}
            size={36}
            onPress={sendText}
            label="Gửi"
          />
        </Row>
      </View>

      {/* Dialog chọn biến thể món (Disambiguation) */}
      <Dialog
        visible={disambigItem !== null}
        icon="help-circle"
        title={`Chọn loại “${disambigItem?.rawName ?? ''}”`}
        message="Quán có nhiều biến thể cho món này. Vui lòng chọn loại tương ứng:"
        confirm="Đóng"
        cancel="Bỏ qua"
        onConfirm={() => setDisambigItem(null)}
        onCancel={() => setDisambigItem(null)}
      >
        <View style={{ marginTop: 8, gap: 8 }}>
          {disambigItem?.options.map((opt) => (
            <Pressable
              key={opt.product_id}
              onPress={() => selectDisambiguation(opt)}
              style={styles.disambigBtn}
            >
              <Row style={{ justifyContent: 'space-between' }}>
                <T w="bold" size={14} color={colors.primary}>
                  {opt.name}
                </T>
                <T w="semibold" size={13} color={colors.ink}>
                  {vnd(opt.unit_price_vnd)}
                </T>
              </Row>
            </Pressable>
          ))}
        </View>
      </Dialog>

      {/* Dialog thêm món mới chưa có trong thực đơn */}
      <Dialog
        visible={pending.length > 0}
        icon="star"
        title={`Thêm “${pending[0]?.name ?? ''}” vào danh mục?`}
        message="Sản phẩm này chưa có trong danh mục. Thêm vào để lần sau chọn nhanh hơn."
        confirm="Có, thêm"
        cancel="Chỉ đơn này"
        onCancel={() => resolvePending('once')}
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
        </View>
        <Pressable onPress={() => resolvePending('skip')}>
          <T size={12} color={colors.faint} style={{ textAlign: 'center' }}>
            Bỏ qua món này
          </T>
        </Pressable>
      </Dialog>

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
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
    backgroundColor: colors.goldSoft,
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
  },
  bubble: { maxWidth: '84%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 5 },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 5, ...shadow(1) },
  order: { backgroundColor: colors.white, borderRadius: 20, padding: 16, marginTop: 4, ...shadow(2) },
  line: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  disambigBtn: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bottom: {
    backgroundColor: colors.white,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    ...shadow(2),
  },
  inputRow: { marginTop: 10, backgroundColor: colors.bg, borderRadius: 14, paddingLeft: 14, paddingRight: 6, height: 48 },
  input: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.ink, height: '100%', outlineStyle: 'none' } as never,
});
