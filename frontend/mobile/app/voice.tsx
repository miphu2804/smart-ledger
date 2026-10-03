import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddItemSheet } from '../src/components/AddItemSheet';

import { useToast } from '../src/components/brand';
import { Button, Dialog, Field, Row, T } from '../src/components/ui';
import { voiceSamples } from '../src/data/mock';
import type { LineItem, ProductView } from '../src/data/types';
import { productApi } from '../src/lib/catalogApi';
import { errorMessage } from '../src/lib/errors';
import { triggerFeedback } from '../src/lib/feedback';
import { abbr, hashIndex, hhmm, vnd } from '../src/lib/format';
import { type ParsedExpenseItem, parseOrder } from '../src/lib/parseOrder';
import { itemsTotal } from '../src/lib/stats';
import { getProductImage } from '../src/lib/productImages';
import { useApp } from '../src/store/AppStore';
import { colors, font, shadow } from '../src/theme';

type Msg = {
  id: number;
  from: 'user' | 'ai';
  text: string;
  time: string;
  emotion?: 'happy' | 'holding_tablet' | 'excited' | 'wink' | 'question' | 'sorry' | 'thanks';
};

const voiceTheme = {
  primary: colors.brand,
  primaryDark: colors.brandPressed,
  primarySoft: colors.brandSoft,
  primaryBorder: colors.brandBorder,
  pageBg: colors.bg,
  cardBg: colors.card,
  border: colors.border,
  borderLight: colors.borderLight,
  muted: colors.muted,
  faint: colors.faint,
  ink: colors.ink,
  inkSecondary: colors.inkSecondary,
  green: colors.data.revenue,
  greenSoft: colors.data.revenueSoft,
  amber: colors.goldBright,
  amberSoft: colors.data.debtSoft,
  amberFg: colors.data.debt,
  red: colors.red,
  redSoft: colors.redSoft,
};

const productThumbTones = [
  { bg: '#EFEDE7', fg: '#4B463F', icon: 'coffee' as const },
  { bg: '#F8E9C8', fg: '#78510C', icon: 'zap' as const },
  { bg: '#E8E6DD', fg: '#4D5148', icon: 'droplet' as const },
  { bg: '#EFF2E7', fg: '#45513E', icon: 'shopping-bag' as const },
  { bg: '#EAF1E1', fg: '#355A25', icon: 'package' as const },
];

const voiceAssets = {
  agentDefault: require('../assets/voice/agent-default.png'),
  agentHappy: require('../assets/voice/agent-happy.png'),
  agentIdea: require('../assets/voice/agent-idea.png'),
  agentQuestion: require('../assets/voice/agent-question.png'),
  agentSorry: require('../assets/voice/agent-sorry.png'),
  agentThanks: require('../assets/voice/agent-thanks.png'),
  agentWink: require('../assets/voice/agent-wink.png'),
  readOrderLogo: require('../assets/voice/read-order-logo.png'),
  recordButton: require('../assets/voice/record-button.png'),
};


/** 3D Robot Mascot (Sổ Nghe Lời Assistant on Left) */
function BotAvatar({ emotion = 'holding_tablet', size = 68 }: { emotion?: Msg['emotion']; size?: number }) {
  const source =
    emotion === 'happy'
      ? voiceAssets.agentHappy
      : emotion === 'excited'
        ? voiceAssets.agentIdea
        : emotion === 'wink'
          ? voiceAssets.agentWink
          : emotion === 'question'
            ? voiceAssets.agentQuestion
            : emotion === 'sorry'
              ? voiceAssets.agentSorry
              : emotion === 'thanks'
                ? voiceAssets.agentThanks
                : voiceAssets.agentDefault;
  return (
    <View style={[styles.mascotWrap, { width: size, height: size }]}>
      <Image source={source} style={{ width: size, height: size }} resizeMode="contain" />
    </View>
  );
}

/** Acoustic Soundwave Emission System (Cung sóng âm cong Xanh bên trái & Vàng bên phải đúng ảnh mẫu) */
/** Clean, Elegant Voice Button with Calm Breathing & Soft Ambient Ripples */
function CentralVoiceOrb({
  recording,
  signalLevel,
  onPressIn,
  onPressOut,
}: {
  recording: boolean;
  signalLevel: number;
  onPressIn: () => void;
  onPressOut: () => void;
}) {
  // Smooth breathing & soft voice pulsation (êm dịu, không giật, không nhanh)
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ripple1Anim = useRef(new Animated.Value(0)).current;
  const ripple2Anim = useRef(new Animated.Value(0)).current;

  // Idle slow soothing breath (nhịp thở chậm 1.8s)
  useEffect(() => {
    let breatheLoop: Animated.CompositeAnimation;
    if (!recording) {
      breatheLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, {
            toValue: 1.025,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(breatheAnim, {
            toValue: 0.985,
            duration: 1800,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );
      breatheLoop.start();
    } else {
      breatheAnim.setValue(1);
    }
    return () => {
      if (breatheLoop) breatheLoop.stop();
    };
  }, [recording, breatheAnim]);

  // Active gentle pulse + soft ambient ripple loops
  useEffect(() => {
    let pulseLoop: Animated.CompositeAnimation;
    let r1Loop: Animated.CompositeAnimation;
    let r2Loop: Animated.CompositeAnimation;

    if (recording) {
      // Gentle, calm oscillation
      const targetScale = 1.035 + Math.min(0.04, signalLevel * 0.05);
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: targetScale,
            duration: 650,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.975,
            duration: 650,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      );

      const createRipple = (anim: Animated.Value, delay: number) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, {
              toValue: 1,
              duration: 1500,
              easing: Easing.out(Easing.quad),
              useNativeDriver: true,
            }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        );

      r1Loop = createRipple(ripple1Anim, 0);
      r2Loop = createRipple(ripple2Anim, 750);

      pulseLoop.start();
      r1Loop.start();
      r2Loop.start();
    } else {
      pulseAnim.setValue(1);
      ripple1Anim.setValue(0);
      ripple2Anim.setValue(0);
    }

    return () => {
      if (pulseLoop) pulseLoop.stop();
      if (r1Loop) r1Loop.stop();
      if (r2Loop) r2Loop.stop();
    };
  }, [recording, signalLevel, pulseAnim, ripple1Anim, ripple2Anim]);

  const combinedScale = recording ? pulseAnim : breatheAnim;

  // Soft Ripple Transforms
  const ripple1Scale = ripple1Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ripple1Opacity = ripple1Anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0.35, 0.25, 0.06, 0] });

  const ripple2Scale = ripple2Anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ripple2Opacity = ripple2Anim.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0.35, 0.25, 0.06, 0] });

  return (
    <View style={styles.centralOrbContainer}>
      {/* Soft Ambient Expanding Ripple Rings */}
      {recording ? (
        <>
          <Animated.View
            style={[
              styles.softRippleRing,
              {
                transform: [{ scale: ripple1Scale }],
                opacity: ripple1Opacity,
              },
            ]}
          />
          <Animated.View
            style={[
              styles.softRippleRing,
              {
                transform: [{ scale: ripple2Scale }],
                opacity: ripple2Opacity,
              },
            ]}
          />
        </>
      ) : null}

      {/* Main 3D Logo Button with Calm Breathing Animation */}
      <Pressable
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        style={({ pressed }) => [
          styles.orbHitArea,
          pressed && { transform: [{ scale: 0.94 }] },
        ]}
      >
        <Animated.View
          style={[
            styles.pulsingLogoWrap,
            {
              transform: [{ scale: combinedScale }],
            },
          ]}
        >
          {/* Subtle Ambient Glow */}
          <View
            style={[
              styles.logoAmbientGlow,
              recording && {
                backgroundColor: 'rgba(72, 42, 172, 0.16)',
                shadowColor: voiceTheme.primary,
                shadowOpacity: 0.35,
                shadowRadius: 16,
              },
            ]}
          />

          {/* 3D Brand Logo Icon */}
          <Image
            source={voiceAssets.recordButton}
            style={styles.logoRecordImage}
            resizeMode="contain"
          />
        </Animated.View>
      </Pressable>
    </View>
  );
}

let sampleCursor = 0;

function inferAgentEmotion(text: string): Msg['emotion'] {
  const s = text.toLowerCase();
  if (s.includes('?') || s.includes('chưa') || s.includes('muốn') || s.includes('thử nói lại')) return 'question';
  if (s.includes('không') || s.includes('lỗi') || s.includes('xin lỗi')) return 'sorry';
  if (s.includes('đã thêm') || s.includes('gợi ý') || s.includes('sáng kiến')) return 'excited';
  if (s.includes('đã ghi') || s.includes('xong')) return 'happy';
  if (s.includes('cảm ơn')) return 'thanks';
  return 'holding_tablet';
}



export default function Voice() {
  const app = useApp();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const scroll = useRef<ScrollView>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const recognitionRef = useRef<any>(null);
  const fullTranscriptRef = useRef('');

  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: 1,
      from: 'ai',
      text: 'Đã thêm “Cà phê sữa nghìn” (4.565đ)\nvào danh mục và vào đơn.',
      time: '05:31',
      emotion: 'holding_tablet',
    },
    {
      id: 2,
      from: 'user',
      text: '8 sting',
      time: '05:31',
    },
    {
      id: 3,
      from: 'ai',
      text: 'Đã ghi 8 Sting.',
      time: '05:31',
      emotion: 'happy',
    },
  ]);

  const [items, setItems] = useState<LineItem[]>([
    { productId: 101, name: 'Cà phê sữa nghìn', price: 4565, qty: 2 },
    { productId: 102, name: 'Sting', price: 12000, qty: 8 },
  ]);

  const [recording, setRecording] = useState(false);
  const [partial, setPartial] = useState('');
  const [manualText, setManualText] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pending, setPending] = useState<LineItem[]>([]);
  const [newPrice, setNewPrice] = useState('');
  const [newUnit, setNewUnit] = useState('cái');
  const [priceErr, setPriceErr] = useState('');
  const [catalogBusy, setCatalogBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [pendingExpenses, setPendingExpenses] = useState<ParsedExpenseItem[]>([]);
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

  const parseableProducts = useMemo(
    () => products.map((p) => ({ id: p.id, name: p.name, price: p.sellingPriceVnd })),
    [products],
  );
  const micSignalLevel = useMemo(() => {
    if (!recording) return 0.2;
    if (!partial.trim()) return 0.46;
    const recentWords = partial.trim().split(/\s+/).slice(-5).join('');
    const hash = recentWords.split('').reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
    return Math.min(1, 0.42 + (hash % 58) / 100);
  }, [partial, recording]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    const t = setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [msgs, items, partial]);

  useEffect(() => {
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const sub = Keyboard.addListener(hideEvent, () => {
      setShowManualInput(false);
    });
    return () => sub.remove();
  }, []);

  const push = (from: Msg['from'], t: string, emotion?: Msg['emotion']) => {
    setMsgs((m) => [
      ...m,
      {
        id: Date.now() + Math.random(),
        from,
        text: t,
        time: hhmm(new Date()),
        emotion: emotion || (from === 'ai' ? inferAgentEmotion(t) : undefined),
      },
    ]);
  };

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

      if (found.length) {
        mergeItems(found);
        responseParts.push(`Đã ghi ${found.map((f) => `${f.qty} ${f.name}`).join(', ')}.`);
      }

      if (missingQuantityItems && missingQuantityItems.length > 0) {
        responseParts.push(
          `Bạn đã gọi món "${missingQuantityItems.join(', ')}" nhưng chưa có số lượng. Mời bạn nói lại số lượng nhé (ví dụ: "1 ${missingQuantityItems[0]}").`,
        );
      }

      if (unknown.length) {
        setPending(unknown);
        setNewPrice(unknown[0].price ? String(unknown[0].price) : '');
        responseParts.push(`"${unknown[0].name}" chưa có trong danh mục. Bạn có muốn thêm vào không?`);
      }

      if (expenses && expenses.length > 0) {
        setPendingExpenses((cur) => [...cur, ...expenses]);
        responseParts.push(
          `Mình nghe thấy khoản chi: ${expenses.map((e) => `${e.title} (${vnd(e.amount)})`).join(', ')}. Bấm "Lưu chi phí" để xác nhận.`,
        );
      }

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
    triggerFeedback('selection');
    fullTranscriptRef.current = '';
    setPartial('');
    setRecording(true);

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

    const sample = voiceSamples[sampleCursor++ % voiceSamples.length];
    const words = sample.split(' ');
    fullTranscriptRef.current = sample;
    timers.current.forEach(clearTimeout);
    timers.current = words.map((_, i) =>
      setTimeout(() => setPartial(words.slice(0, i + 1).join(' ')), 200 * (i + 1)),
    );
  };

  const finishRecording = (manualTxt?: string) => {
    if (!recording && !manualTxt) return;
    triggerFeedback('selection');

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch { }
      recognitionRef.current = null;
    }

    timers.current.forEach(clearTimeout);
    setRecording(false);

    const finalText = manualTxt || (recognitionRef.current ? fullTranscriptRef.current : '') || partial;
    setPartial('');

    if (finalText && finalText.trim() && !finalText.includes('Đang nghe…')) {
      handleUtterance(finalText.trim());
    }
  };

  const sendManualText = () => {
    if (!manualText.trim()) return;
    triggerFeedback('selection');
    handleUtterance(manualText.trim());
    setManualText('');
    setShowManualInput(false);
  };

  const resolvePending = async (action: 'catalog' | 'skip') => {
    const [first, ...rest] = pending;
    if (!first || catalogBusy) return;
    const price = parseInt(newPrice.replace(/\D/g, ''), 10) || 0;
    if (action === 'catalog' && !price) {
      setPriceErr(`Nhập giá bán cho "${first.name}" để thêm vào đơn`);
      return;
    }
    if (action === 'catalog') {
      setCatalogBusy(true);
      try {
        const created = await productApi.create({
          name: first.name,
          unit: newUnit.trim() || 'cái',
          sellingPriceVnd: price,
          tracked: false,
          stockQuantity: null,
        });
        setProducts((cur) => [...cur, created]);
        mergeItems([{ productId: created.id, name: created.name, price: created.sellingPriceVnd, qty: first.qty }]);
        push('ai', `Đã thêm "${first.name}" (${vnd(price)}) vào danh mục và vào đơn.`, 'excited');
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

  const total = itemsTotal(items);
  const totalCount = items.reduce((a, i) => a + i.qty, 0);

  const checkout = () => {
    triggerFeedback('selection');
    app.setDraft({ items, source: 'voice', transcript: transcripts.join(' · ') });
    router.push('/checkout');
  };

  const removeItem = (idx: number) => {
    triggerFeedback('selection');
    setItems((cur) => cur.filter((_, i) => i !== idx));
  };

  const updateItemQty = (idx: number, delta: number) => {
    triggerFeedback('selection');
    setItems((cur) =>
      cur
        .map((x, i) => (i === idx ? { ...x, qty: x.qty + delta } : x))
        .filter((x) => x.qty > 0),
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />

      {/* Top Header Bar */}
      <View style={[styles.headerShell, { paddingTop: insets.top + 6 }]}>
        <Row gap={12} style={{ alignItems: 'center' }}>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
            style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
            accessibilityLabel="Quay lại"
          >
            <Feather name="chevron-left" size={20} color={voiceTheme.ink} />
          </Pressable>

          <Row gap={10} style={{ flex: 1, alignItems: 'center' }}>
            <Image
              source={voiceAssets.readOrderLogo}
              style={styles.headerLogoImage}
              resizeMode="contain"
            />
            <View style={{ flex: 1 }}>
              <T w="extrabold" size={18.5} color={voiceTheme.ink}>
                Đọc đơn
              </T>
              <T w="medium" size={12} color={voiceTheme.muted} style={{ marginTop: 1 }} numberOfLines={1}>
                Hôm nay, {hhmm(new Date())} · {app.store.name}
              </T>
            </View>
          </Row>

          <Pressable
            onPress={checkout}
            disabled={!items.length}
            style={({ pressed }) => [
              styles.saveOrderPill,
              !items.length && { opacity: 0.4 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <T w="bold" size={13} color={voiceTheme.primary}>
              Tiếp tục
            </T>
            <Feather name="arrow-right" size={14} color={voiceTheme.primary} />
          </Pressable>
        </Row>
      </View>

      {/* Scrollable Main Body */}
      <ScrollView
        ref={scroll}
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero Section: Mascot Robot on Left + Chat Conversation on Right */}
        <View style={styles.heroRow}>
          {/* Chat Stream Bubbles */}
          <View style={styles.chatCol}>
            {msgs.map((m) =>
              m.from === 'ai' ? (
                <Row key={m.id} gap={8} style={styles.aiMessageRow}>
                  <BotAvatar emotion={m.emotion} size={44} />
                  <View style={styles.aiBubbleCard}>
                    <Row style={styles.aiBubbleHeader}>
                      <Row gap={4} style={{ alignItems: 'center' }}>
                        <Row gap={1.5} style={{ alignItems: 'center' }}>
                          <View style={{ width: 2, height: 7, backgroundColor: voiceTheme.primary, borderRadius: 1 }} />
                          <View style={{ width: 2, height: 11, backgroundColor: voiceTheme.primary, borderRadius: 1 }} />
                          <View style={{ width: 2, height: 6, backgroundColor: voiceTheme.primary, borderRadius: 1 }} />
                        </Row>
                        <T w="bold" size={12.5} color={voiceTheme.primary}>
                          Sổ Nghe Lời
                        </T>
                      </Row>
                      <T size={11} color={voiceTheme.faint}>
                        {m.time}
                      </T>
                    </Row>
                    <T size={13} color={voiceTheme.ink} style={{ lineHeight: 18 }}>
                      {m.text}
                    </T>
                  </View>
                </Row>
              ) : (
                <Row key={m.id} gap={6} style={styles.userBubbleRow}>
                  <View style={styles.userBubbleCard}>
                    <T w="semibold" size={13} color={voiceTheme.inkSecondary}>
                      {m.text}
                    </T>
                    <T size={10.5} color={voiceTheme.faint} style={{ marginLeft: 6 }}>
                      {m.time}
                    </T>
                  </View>
                  <View style={styles.userAvatarDisc}>
                    <Feather name="user" size={14} color={voiceTheme.primary} />
                  </View>
                </Row>
              ),
            )}

            {/* Listening Indicator */}
            {recording ? (
              <Row gap={6} style={styles.userBubbleRow}>
                <View style={[styles.userBubbleCard, { backgroundColor: voiceTheme.primarySoft }]}>
                  <ActivityIndicator size="small" color={voiceTheme.primary} style={{ marginRight: 4 }} />
                  <T w="bold" size={13} color={voiceTheme.primary}>
                    {partial || 'Đang lắng nghe…'}
                  </T>
                </View>
                <View style={styles.userAvatarDisc}>
                  <Feather name="mic" size={14} color={voiceTheme.primary} />
                </View>
              </Row>
            ) : null}
          </View>
        </View>

        {/* Manual Inline Input (Toggled via "Nhập tay" button) */}
        {false ? (
          <View style={styles.inlineInputCard}>
            <View style={styles.inlineInputKeyboardIcon}>
              <Feather name="edit-3" size={15} color={voiceTheme.muted} />
            </View>
            <TextInput
              value={manualText}
              onChangeText={setManualText}
              onSubmitEditing={sendManualText}
              placeholder="Nhập món, số lượng hoặc giá..."
              placeholderTextColor="#9CA3AF"
              style={styles.inlineTextInput}
              returnKeyType="send"
              autoFocus
            />
            <Pressable
              onPress={sendManualText}
              style={({ pressed }) => [styles.inlineSendBtn, pressed && { opacity: 0.8 }]}
            >
              <Feather name="send" size={14} color={colors.white} />
            </Pressable>
          </View>
        ) : null}

        {/* Spiral Notebook Card (Sổ ghi đơn lò xo như trong ảnh mẫu) */}
        <View style={styles.notebookContainer}>
          {/* Decorative Behind Colored Layer (Green & Amber top-right peek) */}
          <View style={styles.notebookBehindLayerGreen} />
          <View style={styles.notebookBehindLayerAmber} />

          {/* Main White Sheet */}
          <View style={styles.notebookSheet}>
            {/* Left Spiral Rings Column */}
            <View style={styles.spiralRingsCol}>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <View key={i} style={styles.spiralRingWrap}>
                  <View style={styles.spiralHole} />
                  <View style={styles.spiralCoilLoop} />
                </View>
              ))}
            </View>

            {/* Inner Notebook Content */}
            <View style={styles.notebookInner}>
              {/* Notebook Header */}
              <Row style={styles.notebookHeaderRow}>
                <Row gap={8} style={{ alignItems: 'center' }}>
                  <View style={styles.cartIconBadge}>
                    <Feather name="shopping-cart" size={15} color={voiceTheme.primary} />
                  </View>
                  <View>
                    <T w="extrabold" size={15} color={voiceTheme.ink}>
                      Đơn đang đọc
                    </T>
                    <T size={12} color={voiceTheme.muted}>
                      {items.length} món · {totalCount} món
                    </T>
                  </View>
                </Row>

                <Pressable
                  onPress={() => setEditMode((e) => !e)}
                  style={({ pressed }) => [styles.editPillBtn, pressed && { opacity: 0.75 }]}
                >
                  <Feather name={editMode ? 'check' : 'edit-2'} size={12} color={voiceTheme.amberFg} />
                  <T w="bold" size={12} color={voiceTheme.amberFg}>
                    {editMode ? 'Xong' : 'Sửa'}
                  </T>
                </Pressable>
              </Row>

              {/* Items List inside Notebook */}
              {items.length === 0 ? (
                <View style={styles.emptyItemsNotice}>
                  <T size={13} color={voiceTheme.muted} style={{ textAlign: 'center' }}>
                    Chưa có món nào trong đơn.
                  </T>
                </View>
              ) : (
                items.map((it, idx) => {
                  const imageSrc = getProductImage(it.name);

                  return (
                    <Row key={`${it.productId ?? it.name}-${idx}`} style={styles.notebookItemRow}>
                      {/* Product Thumbnail Photo */}
                      <View style={styles.itemThumb}>
                        <Image
                          source={{ uri: imageSrc }}
                          style={styles.itemThumbImage}
                          resizeMode="cover"
                        />
                      </View>

                      {/* Product Name & Unit Price */}
                      <View style={styles.itemInfoCol}>
                        <T w="bold" size={14} color={voiceTheme.ink} numberOfLines={1}>
                          {it.name}
                        </T>
                        <T size={12} color={voiceTheme.muted} style={{ marginTop: 1 }}>
                          {vnd(it.price)}
                        </T>
                      </View>

                      {/* Stepper Capsule */}
                      <View style={styles.stepperWrap}>
                        <Pressable
                          hitSlop={6}
                          onPress={() => updateItemQty(idx, -1)}
                          style={styles.stepBtn}
                        >
                          <Feather name="minus" size={12} color={voiceTheme.inkSecondary} />
                        </Pressable>
                        <T w="bold" size={13} color={voiceTheme.ink} style={styles.stepQtyText}>
                          {it.qty}
                        </T>
                        <Pressable
                          hitSlop={6}
                          onPress={() => updateItemQty(idx, 1)}
                          style={styles.stepBtn}
                        >
                          <Feather name="plus" size={12} color={voiceTheme.inkSecondary} />
                        </Pressable>
                      </View>

                      {/* Line Subtotal */}
                      <T w="extrabold" size={14.5} color={voiceTheme.ink} style={styles.lineSubtotal}>
                        {vnd(it.price * it.qty)}
                      </T>

                      {/* Trash Delete Action */}
                      <Pressable
                        hitSlop={8}
                        onPress={() => removeItem(idx)}
                        style={styles.deleteItemBtn}
                      >
                        <Feather name="trash-2" size={14} color={voiceTheme.faint} />
                      </Pressable>
                    </Row>
                  );
                })
              )}

              {/* "+ Thêm món khác >" Card */}
              <Pressable
                onPress={() => {
                  triggerFeedback('selection');
                  setAddOpen(true);
                }}
                style={({ pressed }) => [styles.addMoreRowBtn, pressed && { opacity: 0.75 }]}
              >
                <View style={styles.addMoreIconWrap}>
                  <Feather name="plus" size={14} color={voiceTheme.primary} />
                </View>
                <T w="bold" size={13.5} color={voiceTheme.primary} style={{ flex: 1 }}>
                  Thêm món khác
                </T>
                <Feather name="chevron-right" size={16} color={voiceTheme.primary} />
              </Pressable>

              {/* Notebook Footer Grand Total */}
              <Row style={styles.notebookFooterTotal}>
                <Row gap={4} style={{ alignItems: 'baseline' }}>
                  <T w="extrabold" size={15} color={voiceTheme.ink}>
                    Tổng cộng
                  </T>
                  <T size={13} color={voiceTheme.muted}>
                    · {totalCount} món
                  </T>
                </Row>
                <T w="extrabold" size={26} color={voiceTheme.primary}>
                  {vnd(total)}
                </T>
              </Row>
            </View>
          </View>
        </View>

        {/* Nút Thanh toán to tách biệt ở ngoài cuốn sổ */}
        <Pressable
          onPress={checkout}
          disabled={!items.length}
          style={({ pressed }) => [
            styles.bigCheckoutBtn,
            !items.length && styles.bigCheckoutDisabled,
            pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] },
          ]}
        >
          <Row gap={8} style={{ alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="credit-card" size={18} color={items.length ? colors.white : voiceTheme.muted} />
            <T w="extrabold" size={16} color={items.length ? colors.white : voiceTheme.muted}>
              Thanh toán
            </T>
            <Feather name="arrow-right" size={18} color={items.length ? colors.white : voiceTheme.muted} />
          </Row>
        </Pressable>
      </ScrollView>

      {showManualInput ? (
        <View style={styles.manualDock}>
          <View style={styles.manualInputCard}>
            <TextInput
              value={manualText}
              onChangeText={setManualText}
              onSubmitEditing={sendManualText}
              onBlur={() => setShowManualInput(false)}
              placeholder="Nhập món và số lượng (VD: 2 cà phê sữa)..."
              placeholderTextColor="#9CA3AF"
              style={styles.manualTextInput}
              returnKeyType="send"
              autoFocus
            />
            <Pressable
              onPress={sendManualText}
              disabled={!manualText.trim()}
              style={({ pressed }) => [
                styles.manualSendBtn,
                !manualText.trim() && { opacity: 0.4 },
                pressed && { opacity: 0.8 },
              ]}
            >
              <Feather name="arrow-up" size={16} color={colors.white} />
            </Pressable>
          </View>
        </View>
      ) : (
        /* Bottom Voice Recording Dock (Khung ghi âm đáy màn hình đúng bố cục) */
        <View style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          {/* Top Sheet Notch */}
          <View style={styles.dockNotch} />

          {/* 3 Columns: [Nhập tay]  |  [Central Voice Orb + Waves]  |  [Xoá đơn] */}
          <Row style={styles.dockControlsRow}>
            {/* Left Button: Nhập tay */}
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                setShowManualInput(true);
              }}
              style={({ pressed }) => [styles.dockActionCard, pressed && { opacity: 0.75 }]}
            >
              <MaterialCommunityIcons name="keyboard-outline" size={20} color={voiceTheme.primary} />
              <T w="bold" size={11.5} color={voiceTheme.inkSecondary} style={{ marginTop: 4 }}>
                Nhập tay
              </T>
            </Pressable>

            {/* Center: Large Glowing Voice Orb with Waves */}
            <CentralVoiceOrb
              recording={recording}
              signalLevel={micSignalLevel}
              onPressIn={startRecording}
              onPressOut={() => finishRecording()}
            />

            {/* Right Button: Xoá đơn */}
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                if (items.length > 0) setConfirmClear(true);
              }}
              style={({ pressed }) => [styles.dockActionCard, pressed && { opacity: 0.75 }]}
            >
              <Feather name="trash-2" size={18} color={voiceTheme.primary} />
              <T w="bold" size={11.5} color={voiceTheme.inkSecondary} style={{ marginTop: 4 }}>
                Xoá đơn
              </T>
            </Pressable>
          </Row>

          {/* Subtitle text under Voice Orb */}
          <T w="medium" size={12.5} color={voiceTheme.muted} style={styles.dockSubtitleText}>
            {recording ? 'Đang lắng nghe… Thả tay để xử lý' : 'Nhấn để ghi âm đơn hàng'}
          </T>
        </View>
      )}

      {/* Dialog thêm món mới chưa có trong danh mục */}
      <Dialog
        visible={pending.length > 0}
        icon="package"
        title={`Thêm "${pending[0]?.name ?? ''}" vào danh mục?`}
        message="Mặt hàng này chưa có trong danh mục. Hãy thêm trước khi bán."
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

      {/* Dialog xác nhận xoá đơn */}
      <Dialog
        visible={confirmClear}
        danger
        icon="trash-2"
        title="Xoá các món trong đơn?"
        message="Các món đã ghi âm sẽ bị xoá khỏi đơn hiện tại."
        confirm="Xoá hết"
        cancel="Giữ lại"
        onConfirm={() => {
          setItems([]);
          setConfirmClear(false);
          toast('Đã xoá đơn');
        }}
        onCancel={() => setConfirmClear(false)}
      />

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        products={products}
        onPick={(li) => {
          mergeItems([li]);
          toast(`Đã thêm ${li.name}`);
        }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: voiceTheme.pageBg,
  },
  headerShell: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: voiceTheme.pageBg,
  },
  headerLogoImage: {
    width: 34,
    height: 34,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: voiceTheme.cardBg,
    borderWidth: 1,
    borderColor: voiceTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(0),
  },
  saveOrderPill: {
    height: 38,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: voiceTheme.primarySoft,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  scrollContent: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 160,
  },

  // Hero Section
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  chatCol: {
    flex: 1,
    gap: 8,
  },
  aiMessageRow: {
    alignItems: 'flex-start',
    width: '100%',
  },
  aiBubbleCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: voiceTheme.cardBg,
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: voiceTheme.border,
    ...shadow(1),
  },
  aiBubbleHeader: {
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  userBubbleRow: {
    justifyContent: 'flex-end',
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    maxWidth: '92%',
  },
  userBubbleCard: {
    flexShrink: 1,
    backgroundColor: voiceTheme.primarySoft,
    borderRadius: 16,
    borderTopRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
  },
  userAvatarDisc: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: voiceTheme.primaryBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Manual Input Dock (Thanh phụ kiện bàn phím đồng bộ)
  manualDock: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  manualInputCard: {
    height: 44,
    backgroundColor: '#F3F4F6',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
  },
  manualTextInput: {
    flex: 1,
    height: 38,
    fontSize: 14,
    fontFamily: font.medium,
    color: voiceTheme.ink,
    outlineStyle: 'none',
  } as never,
  manualSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: voiceTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Spiral Notebook Card
  notebookContainer: {
    position: 'relative',
    marginTop: 6,
    marginBottom: 12,
  },
  notebookBehindLayerGreen: {
    position: 'absolute',
    top: -4,
    left: 10,
    right: 4,
    height: 24,
    borderRadius: 22,
    backgroundColor: '#86EFAC',
    opacity: 0.8,
  },
  notebookBehindLayerAmber: {
    position: 'absolute',
    top: -2,
    left: 6,
    right: 2,
    height: 20,
    borderRadius: 22,
    backgroundColor: '#FDE047',
    opacity: 0.9,
  },
  notebookSheet: {
    backgroundColor: voiceTheme.cardBg,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: voiceTheme.border,
    flexDirection: 'row',
    overflow: 'hidden',
    ...shadow(2),
  },
  spiralRingsCol: {
    width: 24,
    backgroundColor: '#F8FAFC',
    borderRightWidth: 1,
    borderRightColor: '#EEF2F6',
    alignItems: 'center',
    paddingVertical: 18,
    justifyContent: 'space-between',
  },
  spiralRingWrap: {
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spiralHole: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#CBD5E1',
  },
  spiralCoilLoop: {
    position: 'absolute',
    left: 2,
    width: 16,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: 'transparent',
  },
  notebookInner: {
    flex: 1,
    padding: 14,
  },
  notebookHeaderRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  cartIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: voiceTheme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPillBtn: {
    backgroundColor: voiceTheme.amberSoft,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  emptyItemsNotice: {
    paddingVertical: 18,
  },
  notebookItemRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
    alignItems: 'center',
    gap: 8,
  },
  itemThumb: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemThumbImage: {
    width: '100%',
    height: '100%',
  },
  itemInfoCol: {
    flex: 1,
  },
  stepperWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  stepBtn: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(0),
  },
  stepQtyText: {
    minWidth: 20,
    textAlign: 'center',
  },
  lineSubtotal: {
    minWidth: 68,
    textAlign: 'right',
  },
  deleteItemBtn: {
    padding: 5,
  },
  addMoreRowBtn: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: voiceTheme.primaryBorder,
    backgroundColor: '#FAF7FF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addMoreIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: voiceTheme.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notebookFooterTotal: {
    marginTop: 14,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  bigCheckoutBtn: {
    marginTop: 6,
    marginBottom: 14,
    backgroundColor: voiceTheme.primary,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(2),
  },
  bigCheckoutDisabled: {
    backgroundColor: '#E2E8F0',
    opacity: 0.75,
  },

  // Bottom Voice Recording Dock
  bottomDock: {
    backgroundColor: '#EDEAF8',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    ...shadow(3),
  },
  dockNotch: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 6,
  },
  dockControlsRow: {
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
  },
  dockActionCard: {
    width: 62,
    height: 62,
    borderRadius: 16,
    backgroundColor: voiceTheme.cardBg,
    borderWidth: 1,
    borderColor: voiceTheme.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(1),
  },
  dockSubtitleText: {
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
  },

  // Central Orb Styles
  centralOrbContainer: {
    width: 140,
    height: 104,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  softRippleRing: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(72, 42, 172, 0.10)',
    borderWidth: 1.5,
    borderColor: 'rgba(72, 42, 172, 0.22)',
  },
  orbHitArea: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 10,
  },
  pulsingLogoWrap: {
    width: 86,
    height: 86,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  logoRecordImage: {
    width: 86,
    height: 86,
  },
  logoAmbientGlow: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: 'rgba(72, 42, 172, 0.08)',
    shadowColor: voiceTheme.primary,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },



  // Mascot Mini Details
  mascotWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  mascotHead: {
    width: 54,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: voiceTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    ...shadow(2),
  },
  mascotVisor: {
    width: 34,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mascotEyeCurved: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FFFFFF',
  },
  mascotEarLeft: {
    position: 'absolute',
    left: -6,
    top: 12,
    width: 6,
    height: 14,
    borderRadius: 3,
    backgroundColor: voiceTheme.primary,
  },
  mascotEarRight: {
    position: 'absolute',
    right: -6,
    top: 12,
    width: 6,
    height: 14,
    borderRadius: 3,
    backgroundColor: voiceTheme.primary,
  },
  mascotAntennaLeft: {
    position: 'absolute',
    top: -6,
    left: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: voiceTheme.amber,
  },
  mascotAntennaRight: {
    position: 'absolute',
    top: -6,
    right: 18,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: voiceTheme.amber,
  },
  mascotTabletMini: {
    position: 'absolute',
    bottom: -6,
    right: -4,
    width: 28,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: voiceTheme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(1),
  },
});
