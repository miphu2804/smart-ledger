import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { PlanArt, planArtKind, PlanHeroDecor } from '../src/components/PlanArt';
import { useToast } from '../src/components/brand';
import { Button, EmptyState, IconBtn, LoadingState, Screen, T } from '../src/components/ui';
import { IN_APP_PURCHASE } from '../src/config';
import {
  billingErrorMessage,
  defaultPlanCode,
  isPaidPlan,
  monthlyPrice,
  paymentView,
  planName,
  POPULAR_PLAN_CODE,
  quotaText,
  sortPlans,
  subscriptionSummary,
  type BillingPlan,
} from '../src/lib/billing';
import { createPaymentRequest, getPlans } from '../src/lib/billingApi';
import { saveStoredPayment } from '../src/lib/billingStorage';
import { ddmmyyyy, vnd } from '../src/lib/format';
import { billingOwnerKey, useBillingStatus } from '../src/lib/useBillingStatus';
import { useApp } from '../src/store/AppStore';
import { colors, shadow } from '../src/theme';

const bobi = require('../assets/voice/agent-happy.png');
const HERO_HEIGHT = 228;

/**
 * Màn mua gói (FR-041–043): danh sách gói lấy từ Core, bảng quyền lợi và nút thanh toán bằng chuyển khoản SePay.
 * Chỉ mở được ở bản có IN_APP_PURCHASE (web và APK ngoài Google Play).
 */
export default function Plans() {
  const app = useApp();
  const toast = useToast();
  const status = useBillingStatus(app.userId);
  const [plans, setPlans] = useState<BillingPlan[] | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [heroWidth, setHeroWidth] = useState(0);

  const loadPlans = useCallback(() => {
    setLoadError(null);
    getPlans().then(
      (list) => {
        const sorted = sortPlans(list);
        setPlans(sorted);
        setSelected((cur) => (cur && sorted.some((p) => p.planCode === cur) ? cur : defaultPlanCode(sorted)));
      },
      (e: unknown) => setLoadError(e),
    );
  }, []);

  useEffect(loadPlans, [loadPlans]);

  const now = Date.now();
  const current = status.subscription ? subscriptionSummary(status.subscription, now) : null;
  const plan = plans?.find((p) => p.planCode === selected) ?? null;
  const freePlan = plans?.find((p) => !isPaidPlan(p)) ?? null;
  const paidQuota = (plan && isPaidPlan(plan) ? plan : plans?.find(isPaidPlan))?.aiQuota ?? null;
  const pending = status.pending;
  const pendingView = pending ? paymentView(pending, now) : null;

  const buy = async () => {
    if (!plan || !isPaidPlan(plan) || buying) return;
    setBuying(true);
    try {
      const req = await createPaymentRequest({ planCode: plan.planCode, planVersion: plan.version });
      const owner = billingOwnerKey(app.userId);
      if (owner) await saveStoredPayment(owner, { id: req.id, planCode: req.planCode, expiresAt: req.expiresAt });
      router.push({ pathname: '/plan-payment', params: { id: String(req.id) } });
    } catch (e) {
      toast(billingErrorMessage(e as { status?: number; code?: string; message?: string }), 'err');
      // Giá hoặc phiên bản gói vừa đổi: tải lại để chọn đúng gói đang bán
      if ((e as { code?: string }).code === 'billing_offer_unavailable') loadPlans();
    } finally {
      setBuying(false);
    }
  };

  const cta = useMemo(() => {
    if (!plan) return { title: 'Chọn một gói', disabled: true };
    if (!isPaidPlan(plan)) {
      return { title: current?.paid ? 'Gói Miễn phí không cần mua' : 'Bạn đang dùng gói Miễn phí', disabled: true };
    }
    return { title: `${current?.paid ? 'Gia hạn' : 'Thanh toán'} ${vnd(plan.amountVnd)}`, disabled: false };
  }, [plan, current?.paid]);

  if (!IN_APP_PURCHASE) {
    return (
      <Screen>
        <Back />
        <EmptyState icon="info" title="Bản cài đặt này chưa hỗ trợ mua gói" hint="Gói bạn đã mua vẫn được áp dụng trên mọi thiết bị." />
      </Screen>
    );
  }

  return (
    <Screen
      padded={false}
      bg={colors.bg}
      footer={
        plans ? (
          <View>
            <Button title={cta.title} onPress={buy} disabled={cta.disabled} loading={buying} />
            <T size={11.5} color={colors.faint} style={styles.footerNote}>
              Thanh toán bằng chuyển khoản ngân hàng qua mã QR. Gói không tự gia hạn.
            </T>
          </View>
        ) : null
      }
    >
      <LinearGradient
        colors={['#EEE7FF', '#F8F5FF', '#FFF8DC']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
        onLayout={(e) => setHeroWidth(e.nativeEvent.layout.width)}
      >
        {heroWidth ? <PlanHeroDecor width={heroWidth} height={HERO_HEIGHT} /> : null}
        <Back />
        <View style={styles.heroBody}>
          <View style={{ flex: 1 }}>
            <T w="extrabold" size={26} color={colors.brand}>
              Nâng cấp gói
            </T>
            <T w="medium" size={14} color={colors.inkSecondary} style={styles.heroSub}>
              Hỏi Trợ lý Bobi thoải mái hơn. Mọi chức năng bán hàng vẫn giữ nguyên.
            </T>
          </View>
          <Image source={bobi} style={styles.bobi} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
        {current ? (
          <View style={styles.currentPill}>
            <Feather name={current.paid ? 'award' : 'user'} size={13} color={colors.brand} />
            <T w="bold" size={12} color={colors.brand}>
              {current.paid && current.expiresAt ? `Đang dùng gói trả phí đến ${ddmmyyyy(current.expiresAt)}` : 'Bạn đang dùng gói Miễn phí'}
            </T>
          </View>
        ) : null}
      </LinearGradient>

      <View style={styles.body}>
        {pending && pendingView && pendingView.stage !== 'expired' ? (
          <Pressable
            onPress={() => router.push({ pathname: '/plan-payment', params: { id: String(pending.id) } })}
            style={({ pressed }) => [styles.pendingBanner, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel="Mở yêu cầu thanh toán đang chờ"
          >
            <Feather name={pendingView.stage === 'awaiting' ? 'clock' : 'check-circle'} size={18} color={colors.gold} />
            <View style={{ flex: 1 }}>
              <T w="bold" size={13.5} color={colors.ink}>
                {pendingView.title}
              </T>
              <T size={12} color={colors.muted}>
                Gói {planName(pending)} · {vnd(pending.amountVnd)}
              </T>
            </View>
            <Feather name="chevron-right" size={16} color={colors.disabled} />
          </Pressable>
        ) : null}

        {!plans && !loadError ? <LoadingState label="Đang tải các gói…" /> : null}
        {loadError ? (
          <View>
            <EmptyState icon="alert-triangle" title="Không tải được các gói" hint={billingErrorMessage(loadError as { status?: number; code?: string; message?: string })} />
            <Button title="Thử lại" variant="outline" onPress={loadPlans} />
          </View>
        ) : null}

        {plans ? (
          <>
            <T w="extrabold" size={16} color={colors.ink} style={styles.sectionTitle}>
              Chọn gói
            </T>
            {plans.map((p) => (
              <PlanOption
                key={p.planCode}
                plan={p}
                selected={p.planCode === selected}
                current={!isPaidPlan(p) && current !== null && !current.paid}
                onPress={() => setSelected(p.planCode)}
              />
            ))}

            <T w="extrabold" size={16} color={colors.ink} style={styles.sectionTitle}>
              Quyền lợi trong gói
            </T>
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHead]}>
                <View style={styles.tableLabel} />
                <T w="bold" size={13} color={colors.ink} style={styles.tableCell}>
                  Miễn phí
                </T>
                <T w="bold" size={13} color={colors.brand} style={styles.tableCell}>
                  Trả phí
                </T>
              </View>
              <BenefitRow label="Bán hàng, sổ sách, báo cáo" free paid />
              <BenefitRow label="Lượt hỏi Trợ lý Bobi" free={freePlan ? quotaText(freePlan.aiQuota) : '—'} paid={paidQuota ? quotaText(paidQuota) : '—'} />
              <BenefitRow label="Dùng chung cho mọi tiệm của bạn" free paid last />
            </View>

            <View style={styles.notes}>
              <Note text="Gói trả phí 1 tháng và 3 tháng có cùng quyền lợi, chỉ khác thời hạn." />
              <Note text="Mua thêm khi gói còn hạn thì thời hạn được cộng nối tiếp, lượt hỏi trong tuần không bị đặt lại." />
              <Note text="Hết hạn sẽ về gói Miễn phí, dữ liệu bán hàng giữ nguyên." />
            </View>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

function Back() {
  return (
    <View style={styles.backRow}>
      <IconBtn name="chevron-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/more'))} label="Quay lại" />
    </View>
  );
}

function PlanOption({ plan, selected, current, onPress }: { plan: BillingPlan; selected: boolean; current: boolean; onPress: () => void }) {
  const popular = plan.planCode === POPULAR_PLAN_CODE;
  const perMonth = monthlyPrice(plan);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`Gói ${planName(plan)}, ${vnd(plan.amountVnd)}`}
      style={({ pressed }) => [styles.option, selected && styles.optionSelected, popular && styles.optionPopular, pressed && { opacity: 0.92 }]}
    >
      {popular ? (
        <LinearGradient colors={['#8B6CFF', '#F4B740']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.popularTag}>
          <T w="bold" size={11.5} color={colors.white}>
            Phổ biến nhất
          </T>
        </LinearGradient>
      ) : null}
      <View style={styles.optionRow}>
        <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <View style={styles.radioDot} /> : null}</View>
        <PlanArt kind={planArtKind(plan.planCode, plan.durationMonths)} size={44} />
        <View style={{ flex: 1 }}>
          <T w="extrabold" size={16.5} color={colors.ink}>
            {planName(plan)}
          </T>
          <T size={12} color={colors.muted} style={{ marginTop: 2 }}>
            {quotaText(plan.aiQuota)} hỏi Bobi
          </T>
          {current ? (
            <T w="bold" size={11.5} color={colors.green} style={{ marginTop: 2 }}>
              Đang dùng
            </T>
          ) : null}
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <T w="extrabold" size={16.5} color={colors.ink}>
            {vnd(plan.amountVnd)}
          </T>
          {perMonth !== null && plan.durationMonths && plan.durationMonths > 1 ? (
            <T size={11.5} color={colors.muted}>
              {vnd(perMonth)}/tháng
            </T>
          ) : perMonth !== null ? (
            <T size={11.5} color={colors.muted}>
              mỗi tháng
            </T>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function BenefitRow({ label, free, paid, last }: { label: string; free: boolean | string; paid: boolean | string; last?: boolean }) {
  const cell = (v: boolean | string, tone: string) =>
    v === true ? (
      <Feather name="check" size={18} color={tone} />
    ) : v === false ? (
      <T color={colors.disabled}>—</T>
    ) : (
      <T w="bold" size={12.5} color={tone} style={{ textAlign: 'center' }}>
        {v}
      </T>
    );
  return (
    <View style={[styles.tableRow, !last && styles.tableDivider]}>
      <T size={13} color={colors.inkSecondary} style={styles.tableLabel}>
        {label}
      </T>
      <View style={styles.tableCell}>{cell(free, colors.muted)}</View>
      <View style={styles.tableCell}>{cell(paid, colors.brand)}</View>
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={styles.noteRow}>
      <Feather name="check-circle" size={14} color={colors.brand} style={{ marginTop: 2 }} />
      <T size={12.5} color={colors.muted} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    minHeight: HERO_HEIGHT,
    paddingHorizontal: 16,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  backRow: {
    paddingTop: 8,
    paddingBottom: 4,
    alignItems: 'flex-start',
  },
  heroBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroSub: {
    marginTop: 6,
    lineHeight: 20,
  },
  bobi: {
    width: 112,
    height: 120,
  },
  currentPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: colors.brandBorder,
  },
  body: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: colors.goldSoft,
    borderWidth: 1,
    borderColor: '#F0D79E',
    marginBottom: 4,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 10,
    textAlign: 'center',
  },
  option: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 16,
    marginBottom: 12,
    overflow: 'hidden',
    ...shadow(1),
  },
  optionPopular: {
    paddingTop: 30,
  },
  optionSelected: {
    borderColor: colors.brand,
    backgroundColor: colors.brandTint,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  popularTag: {
    position: 'absolute',
    left: 0,
    top: 0,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderBottomRightRadius: 14,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: {
    borderColor: colors.brand,
  },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.brand,
  },
  table: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    ...shadow(1),
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 52,
    paddingVertical: 10,
  },
  tableHead: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tableDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  tableLabel: {
    flex: 1.6,
    paddingRight: 8,
  },
  tableCell: {
    flex: 1,
    alignItems: 'center',
    textAlign: 'center',
  },
  notes: {
    marginTop: 14,
    gap: 8,
    paddingHorizontal: 2,
  },
  noteRow: {
    flexDirection: 'row',
    gap: 8,
  },
  footerNote: {
    marginTop: 8,
    textAlign: 'center',
  },
});
