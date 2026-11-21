import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';
import { FakeQR } from '../src/components/FakeQR';
import { PlanArt, planArtKind } from '../src/components/PlanArt';
import { Button, EmptyState, Header, LoadingState, Screen, T } from '../src/components/ui';
import { USE_MOCK } from '../src/config';
import {
  billingErrorMessage,
  countdown,
  keepStoredPayment,
  paymentView,
  planName,
  shouldPoll,
  subscriptionSummary,
  type PaymentRequest,
  type SubscriptionSummary,
} from '../src/lib/billing';
import { getPaymentRequest, getSubscription } from '../src/lib/billingApi';
import { clearStoredPayment } from '../src/lib/billingStorage';
import { ddmmyyyy, vnd } from '../src/lib/format';
import { billingOwnerKey } from '../src/lib/useBillingStatus';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

/** Hỏi lại trạng thái mỗi 4 giây; lỗi mạng thì giãn dần tới 30 giây. */
const POLL_MS = 4000;
const POLL_MAX_MS = 30000;

/**
 * Chuyển khoản cho một yêu cầu thanh toán (contract §9). QR, số tiền, tài khoản nhận và nội dung đều lấy từ yêu cầu Core
 * đã lưu, không tự dựng lại. Chỉ trạng thái của Core quyết định đã trả hay chưa; đóng màn không huỷ khoản đang chuyển.
 */
export default function PlanPayment() {
  const app = useApp();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const requestId = Number(id);
  const [req, setReq] = useState<PaymentRequest | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now());
  const [term, setTerm] = useState<SubscriptionSummary | null>(null);
  const delay = useRef(POLL_MS);

  const refresh = useCallback(async () => {
    try {
      const next = await getPaymentRequest(requestId);
      setReq(next);
      setError(null);
      delay.current = POLL_MS;
      const at = Date.now();
      const owner = billingOwnerKey(app.userId);
      if (!keepStoredPayment(next, at) && owner) await clearStoredPayment(owner);
      if (next.status === 'PAID' && next.fulfillmentStatus === 'APPLIED') {
        getSubscription().then((s) => setTerm(subscriptionSummary(s, Date.now())), () => setTerm(null));
      }
      return next;
    } catch (e) {
      setError(e);
      delay.current = Math.min(delay.current * 2, POLL_MAX_MS);
      return null;
    }
  }, [requestId, app.userId]);

  // Chỉ hỏi Core khi màn đang mở; dừng khi đã kích hoạt hoặc quá hạn hẳn
  useFocusEffect(
    useCallback(() => {
      if (!Number.isInteger(requestId) || requestId <= 0) return;
      let alive = true;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const tick = async () => {
        const latest = await refresh();
        if (!alive) return;
        if (latest && !shouldPoll(latest, Date.now())) return;
        timer = setTimeout(tick, delay.current);
      };
      void tick();
      return () => {
        alive = false;
        if (timer) clearTimeout(timer);
      };
    }, [refresh, requestId]),
  );

  // Đồng hồ đếm ngược theo expiresAt của Core
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!Number.isInteger(requestId) || requestId <= 0) {
    return (
      <Screen>
        <Header title="Thanh toán" />
        <EmptyState icon="alert-triangle" title="Không tìm thấy yêu cầu thanh toán" />
      </Screen>
    );
  }

  if (!req) {
    return (
      <Screen>
        <Header title="Thanh toán" />
        {error ? (
          <>
            <EmptyState icon="alert-triangle" title="Không tải được yêu cầu thanh toán" hint={billingErrorMessage(error as { status?: number; code?: string; message?: string })} />
            <Button title="Thử lại" variant="outline" onPress={() => void refresh()} />
          </>
        ) : (
          <LoadingState />
        )}
      </Screen>
    );
  }

  const view = paymentView(req, now);
  const done = view.stage === 'active';

  return (
    <Screen
      footer={
        done ? (
          <Button title="Xong" onPress={() => router.dismissTo('/(tabs)/more')} />
        ) : view.stage === 'expired' ? (
          <Button title="Chọn gói và tạo yêu cầu mới" onPress={() => router.dismissTo('/plans')} />
        ) : null
      }
    >
      <Header title="Thanh toán" subtitle={`Gói ${planName(req)} · ${vnd(req.amountVnd)}`} />

      <View style={[styles.status, statusTone[view.stage]]}>
        <View style={styles.statusIcon}>
          {view.stage === 'activating' ? (
            <ActivityIndicator color={colors.brand} />
          ) : (
            <Feather name={statusIcon[view.stage]} size={20} color={statusColor[view.stage]} />
          )}
        </View>
        <View style={{ flex: 1 }}>
          <T w="extrabold" size={15} color={colors.ink}>
            {view.title}
          </T>
          <T size={12.5} color={colors.muted} style={{ marginTop: 2 }}>
            {view.message}
          </T>
        </View>
        {view.stage === 'awaiting' ? (
          <View style={styles.timer} accessibilityLabel={`Còn ${countdown(view.secondsLeft)} để chuyển khoản`}>
            <T w="extrabold" size={15} color={colors.brand}>
              {countdown(view.secondsLeft)}
            </T>
          </View>
        ) : null}
      </View>

      {view.review ? (
        <View style={styles.review}>
          <Feather name="alert-circle" size={16} color={colors.gold} />
          <T size={12.5} color={colors.inkSecondary} style={{ flex: 1 }}>
            Có khoản chuyển cần đối soát. Người phụ trách sẽ kiểm tra; bạn không cần chuyển lại.
          </T>
        </View>
      ) : null}

      {view.stage === 'awaiting' ? (
        <View style={styles.card}>
          <View style={styles.qrBox}>
            {view.showQr && req.qrUrl ? (
              USE_MOCK && req.qrUrl.startsWith('mock:') ? (
                <FakeQR seed={req.paymentCode} size={210} />
              ) : (
                <Image source={{ uri: req.qrUrl }} style={styles.qr} resizeMode="contain" accessibilityLabel="Mã QR chuyển khoản" />
              )
            ) : (
              <T size={12.5} color={colors.muted}>
                Chưa có mã QR. Hãy chuyển khoản theo thông tin bên dưới.
              </T>
            )}
          </View>
          <T w="extrabold" size={26} color={colors.ink} style={styles.amount}>
            {vnd(req.amountVnd)}
          </T>
          <InfoRow label="Ngân hàng" value={req.recipient.bankCode} />
          <InfoRow label="Số tài khoản" value={req.recipient.accountNumber} />
          <InfoRow label="Chủ tài khoản" value={req.recipient.accountName} />
          <InfoRow label="Nội dung" value={req.paymentCode} strong last />
          <T size={11.5} color={colors.faint} style={styles.hint}>
            Nhập đúng nội dung và số tiền để hệ thống tự xác nhận. Màn này tự cập nhật khi nhận được tiền.
          </T>
        </View>
      ) : null}

      {done ? (
        <View style={[styles.card, styles.doneCard]}>
          <PlanArt kind={planArtKind(req.planCode, req.durationMonths)} size={72} />
          <T w="extrabold" size={17} color={colors.ink} style={{ marginTop: 10 }}>
            Gói {planName(req)} đã có hiệu lực
          </T>
          {term?.paid && term.expiresAt ? (
            <T size={13} color={colors.muted} style={{ marginTop: 4 }}>
              Gói trả phí dùng đến {ddmmyyyy(term.expiresAt)}
            </T>
          ) : null}
        </View>
      ) : null}

      {view.stage === 'activating' ? <LoadingState compact label="Đang kích hoạt gói…" /> : null}
    </Screen>
  );
}

function InfoRow({ label, value, strong, last }: { label: string; value: string; strong?: boolean; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoDivider]}>
      <T size={12.5} color={colors.muted}>
        {label}
      </T>
      <T w={strong ? 'extrabold' : 'bold'} size={strong ? 15 : 13.5} color={strong ? colors.brand : colors.ink} selectable style={styles.infoValue}>
        {value}
      </T>
    </View>
  );
}

const statusIcon = { awaiting: 'clock', expired: 'x-circle', activating: 'loader', active: 'check-circle' } as const;
const statusColor = { awaiting: colors.brand, expired: colors.red, activating: colors.brand, active: colors.green };
const statusTone = StyleSheet.create({
  awaiting: { backgroundColor: colors.brandTint, borderColor: colors.brandBorder },
  expired: { backgroundColor: colors.redSoft, borderColor: '#EDC2BB' },
  activating: { backgroundColor: colors.brandTint, borderColor: colors.brandBorder },
  active: { backgroundColor: colors.greenSoft, borderColor: '#C9E4B9' },
});

const styles = StyleSheet.create({
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 4,
  },
  statusIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timer: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.white,
  },
  review: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    padding: 12,
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: colors.goldSoft,
  },
  card: {
    marginTop: 14,
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...shadow(1),
  },
  qrBox: {
    alignSelf: 'center',
    width: 232,
    minHeight: 232,
    padding: 11,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qr: {
    width: 210,
    height: 210,
  },
  amount: {
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 44,
    paddingVertical: 8,
  },
  infoDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  hint: {
    marginTop: 10,
    textAlign: 'center',
  },
  doneCard: {
    alignItems: 'center',
    paddingVertical: 24,
  },
});
