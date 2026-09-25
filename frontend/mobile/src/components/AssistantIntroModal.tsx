import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow } from '../theme';
import { MascotBadge } from './MascotBadge';
import { Button, T } from './ui';

const steps: readonly {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'] | null;
  tone: string;
  gradient: readonly [string, string, string];
  description: string;
  tips: readonly { title: string; body: string }[];
}[] = [
  {
    title: 'Trợ lý',
    icon: null,
    tone: colors.primary,
    gradient: ['#8FDB6E', '#CDEFB8', '#F3FAEF'],
    description:
      'Mascot nhỏ ở góc màn hình là lối tắt đến trợ lý của tiệm. Bạn có thể nói hoặc gõ như đang nhắn tin, trợ lý sẽ giúp lên đơn và trả lời về số liệu bán hàng.',
    tips: [
      { title: 'Chạm để chọn', body: 'Chạm mascot để mở menu Chatbot, Giọng nói hoặc Gợi ý.' },
      { title: 'Nhấn giữ để nói ngay', body: 'Giữ mascot để vào thẳng màn hình Giọng nói, không cần qua menu.' },
      { title: 'Kéo đến chỗ thuận tay', body: 'Nếu mascot che nội dung, kéo nó sang vị trí khác trên màn hình.' },
    ],
  },
  {
    title: 'Bán hàng',
    icon: 'shopping-cart',
    tone: colors.gold,
    gradient: ['#F2C77A', '#F8E9C8', '#FFF8EA'],
    description:
      'Có hai cách lên đơn: chọn món ở tab Bán hàng, hoặc đọc đơn cho trợ lý, ví dụ “bán 3 bánh mì, 2 coca”. Trợ lý sẽ tách tên món và số lượng để bạn kiểm tra trước khi chốt.',
    tips: [
      { title: 'Chọn món, kiểm tra giỏ', body: 'Thêm món vào giỏ, xem lại số lượng rồi bấm chốt đơn.' },
      { title: 'Chọn cách thanh toán', body: 'Tiền mặt, Chuyển khoản, hoặc Ghi nợ kèm tên khách quen.' },
      { title: 'Xem lại ở Đơn hàng', body: 'Tìm lại đơn theo mã, tên khách hoặc tên món bất cứ lúc nào.' },
    ],
  },
  {
    title: 'Tổng quan',
    icon: 'bar-chart-2',
    tone: colors.purple,
    gradient: ['#8DB8F2', '#E4F0FF', '#F5F9FF'],
    description:
      'Tab Tổng quan là trang đầu tiên mỗi khi mở app. Nhìn một lần là biết tiệm đã bán được bao nhiêu và việc nào cần xử lý trước.',
    tips: [
      { title: 'Doanh thu theo kỳ', body: 'Đổi kỳ xem và so sánh với ngày trước để thấy tiệm đang tăng hay giảm.' },
      { title: 'Việc cần xử lý', body: 'App nhắc khi còn công nợ chưa thu hoặc có món sắp hết hàng.' },
      { title: 'Món bán chạy', body: 'Danh sách món bán nhiều nhất giúp bạn biết nên nhập thêm gì.' },
    ],
  },
  {
    title: 'Quản lý',
    icon: 'grid',
    tone: colors.red,
    gradient: ['#E9B8A8', '#F8E2DE', '#FFF5F2'],
    description:
      'Tab Khác gom các công cụ quản lý tiệm vào một chỗ, để bạn cập nhật hàng hoá, chi phí và công nợ mà không phải tìm ở nhiều nơi.',
    tips: [
      { title: 'Hàng hoá & Kho hàng', body: 'Thêm món, sửa giá và theo dõi tồn kho ở cùng một màn hình.' },
      { title: 'Chi phí và Quản lý nợ', body: 'Ghi các khoản chi hằng ngày; đánh dấu khách trả một phần hoặc trả hết.' },
      { title: 'Phân tích bán hàng', body: 'Xem diễn biến doanh thu, thu chi trong kỳ và tình hình công nợ.' },
    ],
  },
];

// Native serif gives the editorial title without bundling another font.
const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, "Times New Roman", serif' });

export function AssistantIntroModal({
  visible,
  onDismiss,
  onVoice,
  onChat,
}: {
  visible: boolean;
  onDismiss: () => void;
  onVoice: () => void;
  onChat: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 700;
  const [step, setStep] = useState(0);
  const pager = useRef<ScrollView>(null);
  const cardWidth = Math.min(width - 32, 420);
  // Measured pager width (card minus its border) keeps every page aligned to the snap points.
  const [pageWidth, setPageWidth] = useState(cardWidth - 2);
  const isLast = step === steps.length - 1;

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const goToStep = (next: number) => {
    setStep(next);
    pager.current?.scrollTo({ x: next * pageWidth, animated: true });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={[styles.backdrop, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Đóng hướng dẫn" />
        <View
          style={[styles.card, { width: cardWidth, height: Math.min(height - insets.top - insets.bottom - 32, 760) }]}
          accessibilityViewIsModal
        >
          <View style={[styles.topRow, compact && styles.padCompact]}>
            <T w="bold" size={12} color={colors.muted} style={styles.eyebrow}>
              HƯỚNG DẪN NHANH
            </T>
            <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Đóng hướng dẫn" style={styles.close}>
              <Feather name="x" size={22} color={colors.ink} />
            </Pressable>
          </View>

          <ScrollView
            ref={pager}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onLayout={(e) => setPageWidth(e.nativeEvent.layout.width)}
            // Sync only when a swipe settles; updating mid-scroll makes the dots flicker during button-driven slides.
            onMomentumScrollEnd={(e) => setStep(Math.round(e.nativeEvent.contentOffset.x / pageWidth))}
            style={styles.pager}
          >
            {steps.map((page, index) => (
              <ScrollView
                key={page.title}
                style={{ width: pageWidth }}
                contentContainerStyle={[styles.page, compact && styles.padCompact]}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                <View accessible accessibilityRole="header" accessibilityLabel={`Bước ${index + 1} trên ${steps.length}: ${page.title}`}>
                  <T style={[styles.title, compact && styles.titleCompact]}>{page.title}</T>
                  <T style={[styles.title, styles.number, compact && styles.titleCompact, { color: page.tone }]}>{String(index + 1).padStart(2, '0')}</T>
                </View>

                <LinearGradient
                  colors={page.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.visual, compact && styles.visualCompact]}
                >
                  <LinearGradient
                    colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.6)', 'rgba(255,255,255,0)']}
                    start={{ x: 0, y: 1 }}
                    end={{ x: 1, y: 0.2 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {page.icon ? (
                    <View style={styles.visualIcon}>
                      <Feather name={page.icon} size={30} color={page.tone} />
                    </View>
                  ) : <MascotBadge size={compact ? 76 : 96} />}
                </LinearGradient>

                <T size={15} color={colors.muted} style={styles.description}>{page.description}</T>

                <View style={styles.tips}>
                  {page.tips.map((tip, tipIndex) => (
                    <View key={tip.title} style={styles.tip}>
                      <View style={[styles.tipIndex, { backgroundColor: page.gradient[2] }]}>
                        <T w="bold" size={12} color={page.tone}>{tipIndex + 1}</T>
                      </View>
                      <View style={styles.tipText}>
                        <T w="bold" size={15}>{tip.title}</T>
                        <T size={14} color={colors.muted} style={styles.tipBody}>{tip.body}</T>
                      </View>
                    </View>
                  ))}
                </View>

                {index === 0 ? (
                  <View style={styles.tryRow}>
                    <Button title="Thử Chatbot" icon="message-circle" variant="ghost" small onPress={onChat} style={styles.tryButton} />
                    <Button title="Thử Giọng nói" icon="mic" variant="ghost" small onPress={onVoice} style={styles.tryButton} />
                  </View>
                ) : null}
              </ScrollView>
            ))}
          </ScrollView>

          {/* Footer stays outside the pages so the next action is always visible. */}
          <View style={[styles.footer, compact && styles.padCompact]}>
            <View style={styles.dots}>
              {steps.map((s, i) => (
                <Pressable
                  key={s.title}
                  onPress={() => goToStep(i)}
                  accessibilityRole="button"
                  accessibilityLabel={`Đến bước ${i + 1}: ${s.title}`}
                  hitSlop={10}
                >
                  <View style={[styles.dot, i === step && styles.dotOn]} />
                </Pressable>
              ))}
            </View>
            <View style={styles.actions}>
              {step > 0 ? (
                <Pressable
                  onPress={() => goToStep(step - 1)}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.6 }]}
                >
                  <T w="semibold" size={14} color={colors.muted}>Quay lại</T>
                </Pressable>
              ) : null}
              <Button
                title={isLast ? 'Bắt đầu dùng' : 'Tiếp tục'}
                onPress={() => (isLast ? onDismiss() : goToStep(step + 1))}
                style={styles.primary}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(26,25,22,0.46)' },
  card: {
    borderRadius: 28, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', ...shadow(3),
  },
  topRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 18,
  },
  padCompact: { paddingHorizontal: 18 },
  eyebrow: { letterSpacing: 1.2, lineHeight: 20 },
  close: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  pager: { flex: 1 },
  page: { paddingHorizontal: 24, paddingTop: 4, paddingBottom: 20 },
  title: { fontFamily: serif, fontSize: 42, lineHeight: 48, color: colors.ink, letterSpacing: -0.5 },
  titleCompact: { fontSize: 34, lineHeight: 40 },
  number: { opacity: 0.55 },
  visual: { height: 150, marginTop: 18, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  visualCompact: { height: 110, marginTop: 12 },
  visualIcon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: colors.white,
  },
  description: { marginTop: 18, lineHeight: 23 },
  tips: { marginTop: 18, gap: 14 },
  tip: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tipIndex: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  tipText: { flex: 1 },
  tipBody: { marginTop: 2, lineHeight: 21 },
  tryRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  tryButton: { flex: 1 },
  footer: {
    paddingHorizontal: 24, paddingTop: 14, paddingBottom: 18,
    borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.white,
  },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotOn: { width: 22, backgroundColor: colors.primary },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  secondary: { minHeight: 50, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  primary: { flex: 1 },
});
