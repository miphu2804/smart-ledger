import { Feather } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, shadow } from '../theme';
import { MascotBadge } from './MascotBadge';
import { Button, T } from './ui';

const steps = [
  {
    label: 'TRỢ LÝ',
    title: 'Bắt đầu với trợ lý',
    description: 'Chạm mascot để chọn Chatbot, Giọng nói hoặc Gợi ý. Nhấn giữ để mở Giọng nói, hoặc kéo mascot đến chỗ thuận tay.',
    icon: null,
    features: [],
  },
  {
    label: 'BÁN HÀNG',
    title: 'Bán hàng, xem lại đơn',
    description: 'Chọn hàng, kiểm tra giỏ rồi chốt đơn. Mở Đơn hàng để xem lại giao dịch.',
    icon: 'shopping-cart',
    features: [
      { icon: 'shopping-cart', title: 'Bán hàng' },
      { icon: 'file-text', title: 'Đơn hàng' },
    ],
  },
  {
    label: 'QUẢN LÝ TIỆM',
    title: 'Nắm tình hình mỗi ngày',
    description: 'Xem doanh thu và việc cần xử lý ở Tổng quan. Mở Khác để quản lý hàng hoá, chi phí và công nợ.',
    icon: 'bar-chart-2',
    features: [
      { icon: 'bar-chart-2', title: 'Tổng quan' },
      { icon: 'grid', title: 'Khác' },
    ],
  },
] as const;

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
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = height < 640;
  const [step, setStep] = useState(0);
  const scroll = useRef<ScrollView>(null);
  const current = steps[step];

  useEffect(() => {
    if (visible) setStep(0);
  }, [visible]);

  const goToStep = (next: number) => {
    setStep(next);
    scroll.current?.scrollTo({ y: 0, animated: false });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Đóng giới thiệu trợ lý" />
        <View style={[styles.panel, { maxHeight: height - insets.top - insets.bottom - 32 }]} accessibilityViewIsModal>
          <ScrollView ref={scroll} showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, compact && styles.contentCompact]}>
            <View style={styles.topRow}>
              <View style={styles.label}>
                <T w="bold" size={11} color={colors.primary}>{current.label} · {step + 1}/{steps.length}</T>
              </View>
              <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Đóng giới thiệu" style={styles.close}>
                <Feather name="x" size={19} color={colors.ink} />
              </Pressable>
            </View>

            <View style={[styles.hero, compact && styles.heroCompact]}>
              {current.icon ? (
                <View style={[styles.heroIcon, compact && styles.heroIconCompact]}>
                  <Feather name={current.icon} size={compact ? 34 : 42} color={colors.accentInk} />
                </View>
              ) : <MascotBadge size={compact ? 84 : 112} />}
            </View>

            <T w="extrabold" size={compact ? 22 : 25} accessibilityRole="header" style={[styles.title, compact && styles.titleCompact]}>
              {current.title}
            </T>
            <T size={compact ? 13 : 14} color={colors.muted} style={[styles.description, compact && styles.descriptionCompact]}>
              {current.description}
            </T>

            {step === 0 ? (
              <View style={[styles.quickActions, compact && styles.actionsCompact]}>
                <Pressable onPress={onChat} accessibilityRole="button" style={styles.quickAction}>
                  <Feather name="message-circle" size={17} color={colors.accentInk} />
                  <T w="bold" size={13}>Chatbot</T>
                </Pressable>
                <Pressable onPress={onVoice} accessibilityRole="button" style={styles.quickAction}>
                  <Feather name="mic" size={17} color={colors.accentInk} />
                  <T w="bold" size={13}>Giọng nói</T>
                </Pressable>
              </View>
            ) : (
              <View style={[styles.featureList, compact && styles.actionsCompact]}>
                {current.features.map((feature) => (
                  <View key={feature.title} style={styles.featureRow}>
                    <View style={styles.featureIcon}><Feather name={feature.icon} size={17} color={colors.accentInk} /></View>
                    <T w="bold" size={13}>{feature.title}</T>
                  </View>
                ))}
              </View>
            )}

            <Button title={step === steps.length - 1 ? 'Bắt đầu' : 'Tiếp'} onPress={() => step === steps.length - 1 ? onDismiss() : goToStep(step + 1)} style={[styles.primaryAction, compact && styles.primaryActionCompact]} />
            <View style={styles.footerActions}>
              {step > 0 ? (
                <Pressable onPress={() => goToStep(step - 1)} accessibilityRole="button" style={styles.footerAction}>
                  <T w="semibold" size={14} color={colors.muted}>Quay lại</T>
                </Pressable>
              ) : null}
              <Pressable onPress={onDismiss} accessibilityRole="button" style={styles.footerAction}>
                <T w="semibold" size={14} color={colors.muted}>Để sau</T>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16,
    backgroundColor: 'rgba(26,25,22,0.46)',
  },
  panel: {
    width: '100%', maxWidth: 400, flexShrink: 1, borderRadius: 22,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden', ...shadow(3),
  },
  content: { padding: 20 },
  contentCompact: { padding: 16 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { backgroundColor: colors.primarySoft, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  close: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  hero: {
    height: 128, marginTop: 14, borderRadius: 16,
    backgroundColor: colors.primaryTint, borderWidth: 1, borderColor: '#E1EEDB',
    alignItems: 'center', justifyContent: 'center',
  },
  heroCompact: { height: 96, marginTop: 10 },
  heroIcon: {
    width: 88, height: 88, borderRadius: 24,
    backgroundColor: colors.white, borderWidth: 1, borderColor: '#E1EEDB',
    alignItems: 'center', justifyContent: 'center', ...shadow(1),
  },
  heroIconCompact: { width: 70, height: 70, borderRadius: 20 },
  title: { marginTop: 16, lineHeight: 32, letterSpacing: -0.6 },
  titleCompact: { marginTop: 12, lineHeight: 28 },
  description: { marginTop: 8, lineHeight: 21 },
  descriptionCompact: { marginTop: 6, lineHeight: 19 },
  quickActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  actionsCompact: { marginTop: 10 },
  quickAction: {
    flex: 1, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...shadow(0),
  },
  featureList: { flexDirection: 'row', gap: 10, marginTop: 18 },
  featureRow: {
    minHeight: 46, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, ...shadow(0),
  },
  featureIcon: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: colors.primarySoft,
    alignItems: 'center', justifyContent: 'center',
  },
  primaryAction: { marginTop: 18 },
  primaryActionCompact: { marginTop: 12 },
  footerActions: { flexDirection: 'row', justifyContent: 'center', marginTop: 8 },
  footerAction: { minHeight: 44, flex: 1, alignItems: 'center', justifyContent: 'center' },
});
