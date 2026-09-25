import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddItemSheet } from '../src/components/AddItemSheet';
import { useToast } from '../src/components/brand';
import { Button, Dialog, Field, Row, Stepper, T } from '../src/components/ui';
import { voiceSamples } from '../src/data/mock';
import type { LineItem } from '../src/data/types';
import { useMicLevel } from '../src/hooks/useMicLevel';
import { vnd } from '../src/lib/format';
import { parseOrder } from '../src/lib/parseOrder';
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

  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [items, setItems] = useState<LineItem[]>([]);
  const [recording, setRecording] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(true);
  const [partial, setPartial] = useState('');
  const [text, setText] = useState('');
  const [edit, setEdit] = useState(false);
  const [pending, setPending] = useState<LineItem[]>([]);
  const [newPrice, setNewPrice] = useState('');
  const [priceErr, setPriceErr] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [hasVoiceInput, setHasVoiceInput] = useState(false);
  const { status: micStatus, levels } = useMicLevel(voiceOpen);

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

  const handleUtterance = (utter: string, source: 'voice' | 'manual') => {
    push('user', utter);
    if (source === 'voice') {
      setTranscripts((t) => [...t, utter]);
      setHasVoiceInput(true);
    }
    const { items: found, unknown } = parseOrder(utter, app.products);
    if (found.length) mergeItems(found);
    if (unknown.length) {
      setPending(unknown);
      setNewPrice(unknown[0].price ? String(unknown[0].price) : '');
      push('ai', `“${unknown[0].name}” chưa có trong danh mục. Bạn có muốn thêm vào không?`);
    }
    if (!found.length && !unknown.length)
      push('ai', 'Mình chưa nhận ra tên hàng. Bạn thử lại nhé, ví dụ “2 ly cà phê sữa”.');
  };

  const startRecording = () => {
    const sample = voiceSamples[sampleCursor++ % voiceSamples.length];
    const words = sample.split(' ');
    setRecording(true);
    setPartial('');
    timers.current.forEach(clearTimeout);
    timers.current = words.map((_, i) => setTimeout(() => setPartial(words.slice(0, i + 1).join(' ')), 220 * (i + 1)));
    timers.current.push(setTimeout(() => finishRecording(sample), 220 * words.length + 600));
  };

  const finishRecording = (full: string) => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRecording(false);
    setPartial('');
    handleUtterance(full, 'voice');
  };

  const stopRecording = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRecording(false);
    setPartial('');
  };

  const sendText = () => {
    if (!text.trim()) return;
    stopRecording();
    handleUtterance(text.trim(), 'manual');
    setText('');
  };

  const resolvePending = (action: 'catalog' | 'once' | 'skip') => {
    const [first, ...rest] = pending;
    if (!first) return;
    const price = parseInt(newPrice.replace(/\D/g, ''), 10) || 0;
    // Thiếu giá bán thì giữ nguyên hộp thoại, không để mất món; chỉ "Bỏ qua" mới được bỏ món.
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

  const total = itemsTotal(items);
  const count = items.reduce((a, i) => a + i.qty, 0);

  const checkout = () => {
    app.setDraft({ items, source: hasVoiceInput ? 'voice' : 'manual', transcript: hasVoiceInput ? transcripts.join(' · ') : undefined });
    router.push('/checkout');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Quay lại" style={styles.backButton}>
          <Feather name="chevron-left" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.headerTitle}>
          <View style={styles.voiceBadge}>
            <Feather name="mic" size={17} color={colors.primary} />
            <T w="bold" size={14} color={colors.primary}>Chế độ Voice</T>
          </View>
          <T size={12} color={colors.muted} style={{ marginTop: 5 }}>Nói hoặc nhập để tạo đơn</T>
        </View>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.chatContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {!msgs.length && !recording ? (
          <View style={styles.empty}>
            <Feather name="mic" size={24} color={colors.primary} />
            <T w="bold" size={18} style={{ marginTop: 12 }}>Bắt đầu đơn hàng</T>
            <T size={13} color={colors.muted} style={styles.emptyHint}>Chọn câu gợi ý hoặc nhập tên hàng bên dưới.</T>
          </View>
        ) : null}

        {msgs.map((m) => (
          <View key={m.id} style={[styles.bubble, m.from === 'user' ? styles.user : styles.ai]}>
            <T size={14} color={colors.ink} style={{ lineHeight: 20 }}>
              {m.text}
            </T>
          </View>
        ))}

        {recording ? (
          <View style={[styles.bubble, styles.user]}>
            <T size={14} color={colors.ink}>
              {partial || '…'}
            </T>
          </View>
        ) : null}

        {items.length ? (
          <View style={styles.order}>
            <View style={styles.orderHeader}>
              <T w="bold" size={16} style={{ flex: 1 }}>Đơn hàng gồm {items.length} món</T>
              <Pressable onPress={() => setEdit((e) => !e)} accessibilityRole="button" accessibilityLabel={edit ? 'Xong chỉnh sửa đơn' : 'Sửa đơn hàng'} style={styles.editAction}>
                <Feather name={edit ? 'check' : 'edit-2'} size={15} color={colors.primary} />
                <T w="bold" size={12} color={colors.primary}>{edit ? 'Xong' : 'Sửa'}</T>
              </Pressable>
            </View>
            {items.map((it, idx) => (
              <Row key={`${it.productId ?? it.name}`} style={styles.line}>
                <View style={styles.productTile}>
                  <T w="bold" size={16} color={colors.primary}>{it.name.charAt(0).toUpperCase()}</T>
                </View>
                <View style={{ flex: 1 }}>
                  <T w="semibold" size={14}>
                    {it.name}
                  </T>
                  <T size={12} color={colors.muted}>{vnd(it.price)}</T>
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
                  <T w="bold" size={15}>{it.qty}</T>
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
            <Row style={styles.totalRow}>
              <T w="semibold" size={13} color={colors.muted} style={{ flex: 1 }}>Tạm tính · {count} món</T>
              <T w="bold" size={16} color={colors.primary}>{vnd(total)}</T>
            </Row>
          </View>
        ) : null}
        {items.length ? (
          <View style={styles.confirmation}>
            <T size={14} style={{ lineHeight: 20 }}>Bạn kiểm tra đơn nhé. Cần chỉnh sửa thì báo tôi.</T>
            <Button title="Tiếp tục thanh toán" icon="arrow-right" onPress={checkout} style={{ marginTop: 12 }} />
            <Pressable onPress={() => setCancelOpen(true)} accessibilityRole="button" style={styles.cancelDraft}>
              <T w="semibold" size={13} color={colors.muted}>Hủy bản nháp</T>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>

      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {voiceOpen ? (
          <View style={styles.voicePanel}>
            <T w="bold" size={18}>
              {recording ? 'Đang chạy câu gợi ý…' : micStatus === 'listening' ? 'Đang nghe…' : micStatus === 'starting' ? 'Đang bật micro…' : micStatus === 'denied' ? 'Chưa cấp quyền micro' : 'Micro không khả dụng'}
            </T>
            <T size={13} color={colors.muted} style={styles.voiceHint}>
              {recording ? partial || 'Đang chuẩn bị câu gợi ý…' : micStatus === 'listening' ? 'Sóng theo giọng nói; tạo đơn bằng chữ hoặc câu mẫu.' : micStatus === 'denied' ? 'Cấp quyền micro để xem sóng âm. Bạn vẫn có thể nhập chữ.' : micStatus === 'starting' ? 'Đang xin quyền và kết nối micro…' : 'Bạn vẫn có thể nhập chữ hoặc thử câu gợi ý.'}
            </T>
            <View style={styles.waveform} accessibilityLabel={micStatus === 'listening' ? 'Sóng phản ứng theo âm lượng micro' : 'Không có tín hiệu micro'}>
              {levels.map((level, i) => (
                <View key={i} style={[styles.waveBar, { height: 8 + level * 52, opacity: micStatus === 'listening' ? 0.4 + level * 0.6 : 0.3 }]} />
              ))}
            </View>
            <View style={styles.voiceActions}>
              <Pressable onPress={startRecording} disabled={recording} accessibilityRole="button" accessibilityLabel="Thử câu bán hàng mẫu" style={styles.demoButton}>
                <Feather name="play" size={15} color={colors.primary} />
                <T w="bold" size={13} color={colors.primary}>{recording ? 'Đang chạy…' : 'Thử câu gợi ý'}</T>
              </Pressable>
              <Pressable onPress={() => router.push('/pos')} accessibilityRole="button" style={styles.posButton}>
                <T w="bold" size={13} color={colors.muted}>Chọn hàng</T>
              </Pressable>
            </View>
          </View>
        ) : null}
        <View style={styles.composerRow}>
          <Pressable
            onPress={() => {
              if (voiceOpen) {
                stopRecording();
                setVoiceOpen(false);
              } else {
                Keyboard.dismiss();
                setVoiceOpen(true);
              }
            }}
            accessibilityRole="button"
            accessibilityLabel={voiceOpen ? 'Đóng bảng Voice' : 'Mở bảng Voice'}
            style={styles.modeButton}
          >
            <Feather name={voiceOpen ? 'x' : 'mic'} size={22} color={colors.ink} />
          </Pressable>
          <View style={styles.composer}>
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => {
                stopRecording();
                setVoiceOpen(false);
              }}
              onSubmitEditing={sendText}
              placeholder="Nhập tên hàng hoặc yêu cầu…"
              placeholderTextColor={colors.faint}
              accessibilityLabel="Nhập nội dung đơn hàng"
              style={styles.input}
              returnKeyType="send"
            />
            <Pressable onPress={sendText} disabled={!text.trim()} accessibilityRole="button" accessibilityLabel="Gửi nội dung" style={[styles.sendButton, !text.trim() && styles.sendDisabled]}>
              <Feather name="arrow-up" size={20} color={text.trim() ? colors.white : colors.muted} />
            </Pressable>
          </View>
        </View>
      </View>

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

      <Dialog
        visible={cancelOpen}
        icon="alert-circle"
        title="Hủy bản nháp này?"
        message="Các món đã nhập trên màn này sẽ bị xóa. Chưa có đơn nào được tạo."
        confirm="Hủy bản nháp"
        cancel="Giữ đơn"
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          setItems([]);
          setMsgs([]);
          setTranscripts([]);
          setHasVoiceInput(false);
          setEdit(false);
          setCancelOpen(false);
        }}
      />

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPick={(li) => {
          mergeItems([li]);
          toast(`Đã thêm ${li.name}`);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { minHeight: 80, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center' },
  backButton: { width: 44, height: 44, borderRadius: 14, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center', ...shadow(0) },
  headerTitle: { flex: 1, alignItems: 'center' },
  voiceBadge: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  chatContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 22 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  emptyHint: { marginTop: 6, textAlign: 'center', lineHeight: 19 },
  bubble: { maxWidth: '88%', borderRadius: 18, paddingHorizontal: 15, paddingVertical: 12, marginBottom: 12 },
  user: { alignSelf: 'flex-end', backgroundColor: colors.primarySoft, borderBottomRightRadius: 6 },
  ai: { alignSelf: 'flex-start', backgroundColor: colors.white, borderBottomLeftRadius: 6, ...shadow(0) },
  order: { alignSelf: 'flex-start', width: '100%', backgroundColor: colors.white, borderRadius: 20, padding: 16, marginBottom: 12, ...shadow(1) },
  orderHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  editAction: { minWidth: 44, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  line: { gap: 10, paddingVertical: 5, marginBottom: 6, minHeight: 54, backgroundColor: colors.bg, borderRadius: 14, paddingHorizontal: 10 },
  productTile: { width: 42, height: 42, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  totalRow: { paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border },
  confirmation: { alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 18, padding: 15, maxWidth: '100%', ...shadow(0) },
  cancelDraft: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  bottom: { backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 14, borderTopLeftRadius: 22, borderTopRightRadius: 22, ...shadow(1) },
  voicePanel: { alignItems: 'center', paddingBottom: 12 },
  voiceHint: { marginTop: 5, textAlign: 'center', lineHeight: 19, minHeight: 38 },
  waveform: { height: 68, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  waveBar: { width: 7, borderRadius: 9, backgroundColor: colors.primary },
  voiceActions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 4 },
  demoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: colors.primarySoft },
  posButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 2 },
  modeButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  composer: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', paddingLeft: 12, paddingRight: 4, backgroundColor: colors.bg, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontFamily: font.medium, fontSize: 14, color: colors.ink, height: 46, outlineStyle: 'none' } as never,
  sendButton: { width: 44, height: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  sendDisabled: { backgroundColor: colors.border },
});
