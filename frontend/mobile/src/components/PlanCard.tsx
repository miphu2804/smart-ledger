import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { paymentView, subscriptionSummary } from '../lib/billing';
import { ddmmyyyy } from '../lib/format';
import { useBillingStatus } from '../lib/useBillingStatus';
import { colors, shadow } from '../theme';
import { PlanArt } from './PlanArt';
import { T } from './ui';

/**
 * Card "Mua gói" ở tab Quản lý: gói đang dùng và lối vào màn mua gói. Có yêu cầu thanh toán còn theo dõi thì mở thẳng yêu
 * cầu đó. Chỉ hiện ở bản có IN_APP_PURCHASE (bên gọi kiểm tra).
 */
export function PlanCard({ userId }: { userId: string | null }) {
  const { subscription, pending } = useBillingStatus(userId);
  const now = Date.now();
  const current = subscription ? subscriptionSummary(subscription, now) : null;
  const pendingView = pending ? paymentView(pending, now) : null;
  const openPending = pending && pendingView && pendingView.stage !== 'expired';

  const subtitle = openPending
    ? pendingView.title
    : current?.paid && current.expiresAt
      ? `Gói trả phí dùng đến ${ddmmyyyy(current.expiresAt)}`
      : current
        ? 'Bạn đang dùng gói Miễn phí'
        : 'Xem các gói và quyền lợi';
  const action = openPending ? 'Tiếp tục' : current?.paid ? 'Gia hạn' : 'Nâng cấp';

  return (
    <Pressable
      onPress={() =>
        openPending ? router.push({ pathname: '/plan-payment', params: { id: String(pending.id) } }) : router.push('/plans')
      }
      accessibilityRole="button"
      accessibilityLabel={`Mua gói. ${subtitle}`}
      style={({ pressed }) => [styles.wrap, pressed && styles.pressed]}
    >
      <LinearGradient colors={['#F1EBFF', '#FBF8FF', '#FFF7DC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
        <PlanArt kind="premium" size={46} />
        <View style={styles.text}>
          <T w="extrabold" size={15.5} color={colors.ink}>
            Mua gói
          </T>
          <T size={12.5} color={colors.muted} numberOfLines={2} style={{ marginTop: 2 }}>
            {subtitle}
          </T>
        </View>
        <View style={styles.action}>
          <T w="bold" size={12.5} color={colors.white}>
            {action}
          </T>
          <Feather name="chevron-right" size={14} color={colors.white} />
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 12,
    borderRadius: 18,
    ...shadow(1),
  },
  pressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  text: {
    flex: 1,
    minWidth: 0,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingLeft: 12,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
});
