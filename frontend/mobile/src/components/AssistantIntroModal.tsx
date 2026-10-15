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
   * Hình minh hoạ thay cho ô màu có icon; hiện tràn hết bề ngang thẻ. `ratio` là rộng/cao của chính hình: các hình không
   * cùng tỉ lệ (Quản lý gần vuông, còn lại 3:2) nên chiều cao tính theo từng hình để không bị cắt hay méo.
   */
  image?: { source: ImageSourcePropType; label: string; ratio: number };
  tone: string;
  gradient: readonly [string, string, string];
  description: string;
  tips: readonly { title: string; body: string }[];
}[] = [
  {
    // Trang giới thiệu Bobi: hình minh hoạ cho thấy Bobi nằm ở đâu và chạm vào thì mở ra gì
    title: 'Trợ lý Bobi',
    icon: null,
    image: {
      source: require('../../assets/guide/bobi-menu.jpg'),
      label: 'Hình minh hoạ: Bobi ở góc màn hình Tổng quan; chạm vào Bobi mở ra Hỏi đáp, Đọc đơn và Báo cáo',
      ratio: 1080 / 720,
    },
    tone: colors.brand,
    gradient: ['#CFC4F7', '#E9E3FC', '#F8F5FF'],
    description: 'Bobi là linh vật và trợ lý của Sổ Nghe Lời, luôn nằm ở góc màn hình.',
    tips: [
      { title: 'Chạm vào Bobi', body: 'Mở Hỏi đáp, Đọc đơn hoặc Báo cáo.' },
      { title: 'Giữ Bobi để đọc đơn', body: 'Đi thẳng tới màn Đọc đơn.' },
      { title: 'Kéo Bobi đến chỗ thuận tay', body: 'Kéo sang cạnh khác nếu bị che.' },
    ],
  },
  {
    // Hình đã chỉ cách chọn món (quét mã, đọc đơn, tìm, thêm món ngoài danh mục); chữ nói phần sau đó và chỗ hình khác app:
    // sắp xếp và lọc tồn kho nằm trong nút phễu, đơn đã bán ở tab Đơn hàng (hình vẽ thanh tab cũ có "Cá nhân").
    title: 'Bán hàng',
    icon: 'shopping-cart',
    image: {
      source: require('../../assets/guide/guide-sales.jpg'),
      label:
        'Hình minh hoạ màn Bán hàng: nút Quét mã và Đọc đơn ở trên, ô tìm theo tên hoặc mã vạch, lưới món có nút cộng để thêm vào đơn, và nút Thêm món ngoài danh mục ở cuối',
      ratio: 1080 / 720,
    },
    tone: colors.gold,
    gradient: ['#F2C77A', '#F8E9C8', '#FFF8EA'],
    description: 'Chọn món như hình, rồi bấm Thanh toán ở cuối màn để chốt đơn.',
    tips: [
      { title: 'Sắp xếp và lọc', body: 'Bấm nút phễu trong ô tìm để sắp theo tên, giá, tồn kho hoặc chỉ xem món sắp hết.' },
      { title: 'Chọn cách thu', body: 'Tiền mặt, chuyển khoản hoặc ghi nợ. Ghi nợ cần tên khách.' },
      { title: 'Đơn đã bán', body: 'Xem lại, tìm hoặc huỷ đơn ở tab Đơn hàng.' },
    ],
  },
  {
    // Hình có năm chú thích (doanh thu, nút vào nhanh, đổi kỳ, việc ưu tiên, gợi ý); chữ chỉ thêm điều hình chưa nói. Chú
    // thích 1 của hình ghi "công nợ trong kỳ" nhưng số đó là nợ hiện tại của cả tiệm, nên nói rõ ở đây.
    title: 'Tổng quan',
    icon: 'bar-chart-2',
    image: {
      source: require('../../assets/guide/guide-overview.jpg'),
      label:
        'Hình minh hoạ màn Tổng quan: thẻ doanh thu với số đơn đã chốt và tiền còn nợ, bốn nút Đọc đơn, Chọn hàng, Quét mã, Trợ lý AI, nút đổi Hôm nay, Tuần này, Tháng này, mục Ưu tiên hôm nay và gợi ý từ dữ liệu đã chốt',
      ratio: 1080 / 720,
    },
    tone: colors.purple,
    gradient: ['#8DB8F2', '#E4F0FF', '#F5F9FF'],
    description: 'Màn đầu tiên khi mở app: xem tiệm đang thế nào và bắt đầu đơn mới.',
    tips: [
      { title: 'Bấm vào ô doanh thu', body: 'Mở Báo cáo: doanh thu theo ngày, thu chi và món bán chạy trong kỳ.' },
      { title: 'Tiền còn nợ là của cả tiệm', body: 'Số này không đổi theo Hôm nay, Tuần này hay Tháng này.' },
      { title: 'Chuông thông báo', body: 'Báo đơn bị huỷ, hàng sắp hết và tổng kết thu chi hôm qua.' },
    ],
  },
  {
    // Hình gần vuông, đã giới thiệu Báo cáo, Hàng hoá, Chi phí, Công nợ. Khung Công nợ trong hình có tab "Nhà cung cấp"
    // nhưng app chỉ theo dõi tiền khách nợ, nên chữ nói rõ để người dùng không đi tìm.
    title: 'Quản lý',
    icon: 'grid',
    image: {
      source: require('../../assets/guide/guide-manage.jpg'),
      label:
        'Hình minh hoạ tab Quản lý với các mục Báo cáo, Hàng hoá, Chi phí, Công nợ, Cài đặt và Đăng xuất, kèm ảnh nhỏ của từng màn',
      ratio: 1080 / 1151,
    },
    tone: colors.red,
    gradient: ['#E9B8A8', '#F8E2DE', '#FFF5F2'],
    description: 'Sổ sách và cài đặt của tiệm nằm ở tab Quản lý.',
    tips: [
      { title: 'Công nợ là tiền khách nợ', body: 'Bấm từng khoản để thu tiền hoặc nhắn tin nhắc. App chưa theo dõi tiền nợ nhà cung cấp.' },
      { title: 'Hàng về thì nhập hàng', body: 'Trong Hàng hoá, bấm Nhập hàng ở món đó để cộng tồn kho.' },
      { title: 'Xem lại hướng dẫn', body: 'Vào Cài đặt khi cần mở lại phần này.' },
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
