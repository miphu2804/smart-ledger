import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  type ImageSourcePropType,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow } from '../theme';
import { Button, T } from './ui';

/** Lề ngang của nội dung trang (và bản hẹp cho màn thấp); hình minh hoạ tràn lề dùng lại hai số này. */
const PAD = 24;
const PAD_COMPACT = 18;

const steps: readonly {
  title: string;
  icon: React.ComponentProps<typeof Feather>['name'] | null;
  /**
   * Hình minh hoạ thay cho ô màu có icon; hiện tràn hết bề ngang thẻ. `ratio` là rộng/cao của chính hình:
   * chiều cao tính theo từng hình để không bị cắt hay méo.
   */
  image?: { source: ImageSourcePropType; label: string; ratio: number };
  tone: string;
  gradient: readonly [string, string, string];
  description: string;
  tips: readonly { title: string; body: string }[];
}[] = [
  {
    // Bước 1: Trợ lý Bobi
    title: 'Trợ lý Bobi',
    icon: null,
    image: {
      source: require('../../assets/guide/guide-bobi.png'),
      label: 'Hình minh hoạ: Bobi ở góc màn hình; chạm vào Bobi mở ra Hỏi đáp, Đọc đơn và Báo cáo',
      ratio: 1672 / 941,
    },
    tone: colors.brand,
    gradient: ['#CFC4F7', '#E9E3FC', '#F8F5FF'],
    description: 'Bobi luôn nằm ở góc màn hình, giúp bạn thao tác nhanh mọi việc chỉ với một chạm.',
    tips: [
      { title: 'Chạm vào Bobi', body: 'Mở nhanh menu Hỏi đáp AI, Đọc đơn giọng nói và Báo cáo.' },
      { title: 'Giữ Bobi để đọc đơn', body: 'Nhấn giữ biểu tượng để mở thẳng màn hình lên đơn bằng giọng nói.' },
      { title: 'Kéo thả linh hoạt', body: 'Kéo Bobi sang vị trí khác nếu bị che mất nội dung bên dưới.' },
    ],
  },
  {
    // Bước 2: Tổng quan
    title: 'Tổng quan',
    icon: 'bar-chart-2',
    image: {
      source: require('../../assets/guide/guide-overview.png'),
      label:
        'Hình minh hoạ màn Tổng quan: doanh thu hôm nay, bốn phím tắt lên đơn và trợ lý AI, cùng mục Ưu tiên hôm nay',
      ratio: 1672 / 941,
    },
    tone: colors.purple,
    gradient: ['#8DB8F2', '#E4F0FF', '#F5F9FF'],
    description: 'Màn hình chính khi mở app: nắm bắt tình hình kinh doanh trong ngày và vào nhanh các tính năng.',
    tips: [
      { title: 'Theo dõi doanh thu & công nợ', body: 'Xem nhanh tiền bán trong ngày, số đơn đã chốt và tổng nợ toàn tiệm.' },
      { title: 'Bốn cách lên đơn & hỏi đáp', body: 'Bấm nhanh Đọc đơn, Chọn hàng, Quét mã hoặc Trợ lý AI ngay tại trang chủ.' },
      { title: 'Ưu tiên hôm nay', body: 'Nhắc nhở các việc gấp cần xử lý như thu khoản nợ đến hạn và kiểm tra hàng sắp hết.' },
    ],
  },
  {
    // Bước 3: Bán hàng
    title: 'Bán hàng',
    icon: 'shopping-cart',
    image: {
      source: require('../../assets/guide/guide-sales.png'),
      label:
        'Hình minh hoạ màn Bán hàng: quét mã, đọc đơn, tìm kiếm & lọc, nhấn để thêm món và nhấn giữ để giảm số lượng',
      ratio: 1672 / 941,
    },
    tone: colors.gold,
    gradient: ['#F2C77A', '#F8E9C8', '#FFF8EA'],
    description: 'Lên đơn nhanh chóng bằng nhiều cách, kiểm tra giỏ hàng và thanh toán tức thì.',
    tips: [
      { title: 'Tìm kiếm & quét mã', body: 'Gõ tên món, lọc theo danh mục hoặc bấm Quét mã / Đọc đơn ở phía trên.' },
      { title: 'Thao tác chạm đơn giản', body: 'Nhấn vào sản phẩm để thêm vào đơn, nhấn giữ để giảm nhanh số lượng món.' },
      { title: 'Thanh toán & chọn cách thu', body: 'Bấm nút Thanh toán ở thanh dưới để chốt đơn bằng tiền mặt, chuyển khoản hoặc ghi nợ.' },
    ],
  },
  {
    // Bước 4: Quản lý
    title: 'Quản lý',
    icon: 'grid',
    image: {
      source: require('../../assets/guide/guide-manage.png'),
      label:
        'Hình minh hoạ tab Quản lý với các mục Báo cáo, Hàng hoá, Chi phí, Công nợ, Cài đặt và Đăng xuất',
      ratio: 1672 / 941,
    },
    tone: colors.red,
    gradient: ['#E9B8A8', '#F8E2DE', '#FFF5F2'],
    description: 'Trung tâm quản lý sổ sách, hàng hoá, chi phí và cài đặt của toàn bộ cửa hàng.',
    tips: [
      { title: 'Hàng hoá & Chi phí', body: 'Thêm/sửa danh mục sản phẩm, nhập hàng và ghi nhận các khoản chi tiêu hàng ngày.' },
      { title: 'Công nợ khách hàng', body: 'Theo dõi chi tiết từng khoản khách nợ, bấm vào để thu tiền hoặc gửi tin nhắn nhắc nợ.' },
      { title: 'Báo cáo & Cài đặt', body: 'Tra cứu doanh thu lãi/lỗ theo thời gian và tùy chỉnh âm thanh, thông báo, in hóa đơn.' },
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

                {page.image ? (
                  // Hình có nền trắng: cho tràn hết bề ngang thẻ (bỏ lề của trang) để hình liền với thẻ và các chi tiết to
                  // nhất có thể. Chiều cao theo tỉ lệ của từng hình nên không bị cắt.
                  <Image
                    source={page.image.source}
                    resizeMode="cover"
                    accessibilityLabel={page.image.label}
                    // Chiều cao tính từ bề rộng: trên web Image không theo aspectRatio mà lấy chiều cao gốc của ảnh
                    style={[
                      styles.hero,
                      { width: pageWidth, height: Math.round(pageWidth / page.image.ratio), marginLeft: -(compact ? PAD_COMPACT : PAD) },
                    ]}
                  />
                ) : (
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
                    ) : null}
                  </LinearGradient>
                )}

                <T size={15} color={colors.muted} style={[styles.description, page.image && styles.descriptionAfterHero]}>
                  {page.description}
                </T>

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
                    <Button title="Hỏi đáp" icon="message-circle" variant="ghost" small onPress={onChat} style={styles.tryButton} />
                    <Button title="Đọc đơn" icon="mic" variant="ghost" small onPress={onVoice} style={styles.tryButton} />
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
                title={isLast ? 'Bắt đầu' : 'Tiếp tục'}
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
  padCompact: { paddingHorizontal: PAD_COMPACT },
  eyebrow: { letterSpacing: 1.2, lineHeight: 20 },
  close: { width: 44, height: 44, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  pager: { flex: 1 },
  page: { paddingHorizontal: PAD, paddingTop: 4, paddingBottom: 20 },
  title: { fontFamily: serif, fontSize: 42, lineHeight: 48, color: colors.ink, letterSpacing: -0.5 },
  titleCompact: { fontSize: 34, lineHeight: 40 },
  number: { opacity: 0.55 },
  visual: { height: 150, marginTop: 18, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  visualCompact: { height: 110, marginTop: 12 },
  visualIcon: {
    width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.75)', borderWidth: 1, borderColor: colors.white,
  },
  hero: { marginTop: 10 },
  description: { marginTop: 18, lineHeight: 23 },
  // Hình minh hoạ đã có khoảng trắng ở đáy nên chữ mô tả đứng sát hơn
  descriptionAfterHero: { marginTop: 8 },
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
