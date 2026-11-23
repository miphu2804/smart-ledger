import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useSegments } from 'expo-router';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { IN_APP_PURCHASE } from '../config';
import { isPaidPlan, keepStoredPayment, planName, quotaText, sortPlans, subscriptionSummary, type BillingPlan } from '../lib/billing';
import { getPaymentRequest, getPlans, getSubscription } from '../lib/billingApi';
import { loadStoredPayment } from '../lib/billingStorage';
import { dayKey, vnd } from '../lib/format';
import {
  aiPromoAllowed,
  freeDailyLimit,
  launchPromoAllowed,
  markPromoShown,
  quotaPromoAllowed,
  recordAiAnswer,
  snoozeToday,
  startSession,
  type PromoKind,
  type PromoState,
} from '../lib/promo';
import { loadPromoState, savePromoState } from '../lib/promoStorage';
import { billingOwnerKey } from '../lib/useBillingStatus';
import { useApp } from '../store/AppStore';
import { colors, shadow } from '../theme';
import { PlanHeroDecor } from './PlanArt';
import { Button, T } from './ui';

const bobi = require('../../assets/voice/agent-happy.png');

/** Chờ sau khi vào các tab rồi mới hiện, để Tổng quan kịp tải và không chen ngang lúc vừa mở app. */
const LAUNCH_DELAY_MS = 2500;
/** Chờ sau câu trả lời của Bobi để người dùng đọc được câu trả lời trước. */
const AI_DELAY_MS = 1500;
/** Dùng lại gói/catalog đã đọc trong 10 phút để không gọi Core sau mỗi câu trả lời. */
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

interface PlanPromoApi {
  /** Gọi khi Bobi trả lời xong một câu. `canShow` false (bảng hỏi nhanh) thì chỉ đếm, không mở popup đè lên bảng. */
  aiAnswered: (canShow?: boolean) => void;
  /** Gọi khi Core báo hết lượt (429 `ai_quota_exhausted`). */
  aiQuotaExhausted: (canShow?: boolean) => void;
}

const PromoCtx = createContext<PlanPromoApi>({ aiAnswered: () => {}, aiQuotaExhausted: () => {} });

export const usePlanPromo = () => useContext(PromoCtx);

interface BillingSnapshot {
  free: boolean;
  pendingPayment: boolean;
  plans: BillingPlan[];
}

/** Gói đang dùng, catalog và yêu cầu đang chờ. Đọc lỗi (ví dụ Core chưa bật billing) thì null: không quảng cáo. */
async function billingSnapshot(owner: string): Promise<BillingSnapshot | null> {
  try {
    const [sub, plans] = await Promise.all([getSubscription(), getPlans()]);
    const now = Date.now();
    let pendingPayment = false;
    const stored = await loadStoredPayment(owner);
    if (stored) {
      try {
        pendingPayment = keepStoredPayment(await getPaymentRequest(stored.id), now);
      } catch {
        pendingPayment = false;
      }
    }
    return { free: !subscriptionSummary(sub, now).paid, pendingPayment, plans: sortPlans(plans) };
  } catch {
    return null;
  }
}

/**
 * Quảng cáo mua gói: lúc mở app và khi dùng Bobi. Luật tần suất ở `src/lib/promo.ts`. Chỉ chạy ở bản có IN_APP_PURCHASE:
 * bản Google Play không được quảng cáo cách trả tiền ngoài Google Play Billing.
 */
export function PlanPromoProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const segments = useSegments();
  const owner = IN_APP_PURCHASE && app.loggedIn ? billingOwnerKey(app.userId) : null;
  const [shown, setShown] = useState<{ kind: PromoKind; plans: BillingPlan[]; answers: number } | null>(null);
  const state = useRef<{ owner: string; value: PromoState } | null>(null);
  const counted = useRef(new Set<string>());
  const launchChecked = useRef<string | null>(null);
  const busy = useRef(false);
  const snapshot = useRef<{ owner: string; at: number; value: BillingSnapshot } | null>(null);
  const appRef = useRef(app);
  appRef.current = app;

  // Mỗi lần mở app ghi thêm một phiên cho tài khoản này (lần đầu trên máy thì không quảng cáo)
  useEffect(() => {
    if (!owner || counted.current.has(owner)) return;
    counted.current.add(owner);
    let alive = true;
    loadPromoState(owner).then((saved) => {
      if (!alive) return;
      const value = startSession(saved);
      state.current = { owner, value };
      void savePromoState(owner, value);
    });
    return () => {
      alive = false;
    };
  }, [owner]);

  const update = useCallback((fn: (s: PromoState) => PromoState) => {
    const cur = state.current;
    if (!cur) return null;
    const value = fn(cur.value);
    state.current = { owner: cur.owner, value };
    void savePromoState(cur.owner, value);
    return value;
  }, []);

  const show = useCallback(
    (kind: PromoKind, plans: BillingPlan[]) => {
      const now = Date.now();
      const s = update((v) => markPromoShown(v, kind, now, dayKey(new Date(now))));
      setShown({ kind, plans, answers: s?.aiAnswers ?? 0 });
    },
    [update],
  );

  const readSnapshot = useCallback(async (who: string, fresh: boolean) => {
    const cached = snapshot.current;
    if (!fresh && cached && cached.owner === who && Date.now() - cached.at < SNAPSHOT_TTL_MS) return cached.value;
    const value = await billingSnapshot(who);
    if (value) snapshot.current = { owner: who, at: Date.now(), value };
    return value;
  }, []);

  const inTabs = segments[0] === '(tabs)';
  // Phiên đang hỏi xin phép thống kê (Android/iOS) thì không thêm quảng cáo
  const consentPending = Platform.OS !== 'web' && app.settingsReady && !app.settings.analyticsAsked;

  useEffect(() => {
    if (!owner || !app.onboarded || !inTabs || launchChecked.current === owner || shown) return;
    if (consentPending) {
      launchChecked.current = owner;
      return;
    }
    const timer = setTimeout(async () => {
      if (launchChecked.current === owner || busy.current) return;
      launchChecked.current = owner;
      // Hướng dẫn ở Tổng quan đang mở (tài khoản mới trên máy này) thì để lần sau
      if (!appRef.current.guideDismissed || state.current?.owner !== owner) return;
      busy.current = true;
      try {
        const snap = await readSnapshot(owner, true);
        const now = Date.now();
        const cur = state.current;
        if (!snap || !cur || cur.owner !== owner) return;
        if (launchPromoAllowed(cur.value, { now, today: dayKey(new Date(now)), free: snap.free, pendingPayment: snap.pendingPayment })) {
          show('launch', snap.plans);
        }
      } finally {
        busy.current = false;
      }
    }, LAUNCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [owner, app.onboarded, inTabs, consentPending, shown, show, readSnapshot]);

  const aiAnswered = useCallback(
    (canShow = true) => {
      if (!owner || state.current?.owner !== owner) return;
      const now = Date.now();
      const today = dayKey(new Date(now));
      const s = update((v) => recordAiAnswer(v, today));
      // Kiểm tra trước bằng luật trên máy (lượt Miễn phí theo catalog đã đọc, mặc định 2) rồi mới hỏi Core
      const limit = freeDailyLimit(snapshot.current?.owner === owner ? snapshot.current.value.plans : null);
      if (!s || !canShow || shown || busy.current || !aiPromoAllowed(s, { now, today, free: true, pendingPayment: false }, limit)) return;
      busy.current = true;
      void readSnapshot(owner, false)
        .then((snap) => {
          const cur = state.current;
          if (!snap || !cur || cur.owner !== owner) return;
          const at = Date.now();
          if (!aiPromoAllowed(cur.value, { now: at, today: dayKey(new Date(at)), free: snap.free, pendingPayment: snap.pendingPayment }, freeDailyLimit(snap.plans))) return;
          setTimeout(() => show('ai', snap.plans), AI_DELAY_MS);
        })
        .finally(() => {
          busy.current = false;
        });
    },
    [owner, shown, show, update, readSnapshot],
  );

  const aiQuotaExhausted = useCallback(
    (canShow = true) => {
      if (!owner || !canShow || shown || busy.current) return;
      busy.current = true;
      void readSnapshot(owner, false)
        .then((snap) => {
          const cur = state.current;
          if (!snap || !cur || cur.owner !== owner) return;
          if (quotaPromoAllowed(cur.value, { today: dayKey(new Date()), free: snap.free })) show('quota', snap.plans);
        })
        .finally(() => {
          busy.current = false;
        });
    },
    [owner, shown, show, readSnapshot],
  );

  const api = useMemo(() => ({ aiAnswered, aiQuotaExhausted }), [aiAnswered, aiQuotaExhausted]);

  const close = (snooze: boolean) => {
    if (snooze) update((v) => snoozeToday(v, dayKey(new Date())));
    setShown(null);
  };

  return (
    <PromoCtx.Provider value={api}>
      {children}
      {shown ? (
        <PlanPromoModal
          kind={shown.kind}
          plans={shown.plans}
          answers={shown.answers}
          onClose={close}
          onOpenPlans={(snooze) => {
            close(snooze);
            router.push('/plans');
          }}
        />
      ) : null}
    </PromoCtx.Provider>
  );
}

const COPY: Record<PromoKind, { title: string; sub: (free: string, paid: string, answers: number) => string }> = {
  launch: {
    title: 'Hỏi Bobi thoải mái hơn',
    sub: (free, paid) => `Gói Miễn phí có ${free} hỏi Trợ lý Bobi. Nâng cấp để có ${paid}.`,
  },
  ai: {
    title: 'Cần hỏi Bobi nhiều hơn?',
    sub: (free, paid, answers) => `Hôm nay bạn đã hỏi Bobi ${answers} câu. Gói Miễn phí có ${free}, gói trả phí có ${paid}.`,
  },
  quota: {
    title: 'Hết lượt hỏi Bobi hôm nay',
    sub: (free, paid) => `Bạn đã dùng hết ${free} của gói Miễn phí. Nâng cấp để có ${paid}, hỏi tiếp ngay khi gói được kích hoạt.`,
  },
};

export function PlanPromoModal({
  kind,
  plans,
  answers,
  onClose,
  onOpenPlans,
}: {
  kind: PromoKind;
  plans: BillingPlan[];
  answers: number;
  onClose: (snooze: boolean) => void;
  onOpenPlans: (snooze: boolean) => void;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = Math.min(width - 40, 360);
  const [snooze, setSnooze] = useState(false);
  const free = plans.find((p) => !isPaidPlan(p));
  const paid = plans.filter(isPaidPlan);
  const freeQuota = free ? quotaText(free.aiQuota) : '2 lượt/ngày';
  const paidQuota = paid[0] ? quotaText(paid[0].aiQuota) : 'nhiều lượt hơn';
  const copy = COPY[kind];
  const canSnooze = kind === 'launch';

  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => onClose(false)} statusBarTranslucent>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => onClose(false)} accessibilityLabel="Đóng quảng cáo gói" />
        <View style={[styles.card, { width: cardWidth }]} accessibilityViewIsModal>
          <LinearGradient colors={['#EEE7FF', '#F8F5FF', '#FFF8DC']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
            <PlanHeroDecor width={cardWidth} height={HERO_H} />
            <Image source={bobi} style={styles.bobi} resizeMode="contain" />
            <View style={styles.tag}>
              <Feather name="star" size={11} color={colors.white} />
              <T w="bold" size={11} color={colors.white}>
                Gói trả phí
              </T>
            </View>
            <Pressable onPress={() => onClose(snooze)} style={styles.close} accessibilityRole="button" accessibilityLabel="Đóng">
              <Feather name="x" size={18} color={colors.inkSecondary} />
            </Pressable>
          </LinearGradient>

          <View style={styles.body}>
            <T w="extrabold" size={19} color={colors.ink} style={styles.center}>
              {copy.title}
            </T>
            <T size={13.5} color={colors.muted} style={[styles.center, styles.sub]}>
              {copy.sub(freeQuota, paidQuota, answers)}
            </T>

            <View style={styles.benefits}>
              <Benefit icon="message-circle" text={`${paidQuota} hỏi Trợ lý Bobi, dùng chung mọi tiệm`} />
              <Benefit icon="check-circle" text="Đủ mọi chức năng bán hàng, sổ sách như hiện tại" />
              {paid.length ? (
                <Benefit icon="tag" text={`${paid.map((p) => `${planName(p)} ${vnd(p.amountVnd)}`).join(' · ')}, không tự gia hạn`} />
              ) : null}
            </View>

            <Button title="Xem các gói" onPress={() => onOpenPlans(snooze)} />
            <View style={styles.footer}>
              {canSnooze ? (
                <Pressable
                  onPress={() => setSnooze((v) => !v)}
                  style={styles.snooze}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: snooze }}
                  accessibilityLabel="Không hiện lại hôm nay"
                  hitSlop={8}
                >
                  <View style={[styles.box, snooze && styles.boxOn]}>{snooze ? <Feather name="check" size={13} color={colors.white} /> : null}</View>
                  <T size={12.5} color={colors.muted}>
                    Không hiện lại hôm nay
                  </T>
                </Pressable>
              ) : (
                <View />
              )}
              <Pressable onPress={() => onClose(snooze)} accessibilityRole="button" hitSlop={8}>
                <T w="bold" size={13} color={colors.muted}>
                  Để sau
                </T>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function Benefit({ icon, text }: { icon: React.ComponentProps<typeof Feather>['name']; text: string }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitIcon}>
        <Feather name={icon} size={14} color={colors.brand} />
      </View>
      <T size={13} color={colors.inkSecondary} style={{ flex: 1 }}>
        {text}
      </T>
    </View>
  );
}

const HERO_H = 132;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,25,22,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 24,
    overflow: 'hidden',
    ...shadow(3),
  },
  hero: {
    height: HERO_H,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  bobi: {
    width: 112,
    height: 120,
    marginBottom: -4,
  },
  tag: {
    position: 'absolute',
    left: 14,
    top: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.brand,
  },
  close: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 14,
  },
  center: {
    textAlign: 'center',
  },
  sub: {
    marginTop: 6,
    lineHeight: 19,
  },
  benefits: {
    marginTop: 14,
    marginBottom: 16,
    gap: 10,
  },
  benefit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  benefitIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  snooze: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  box: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.disabled,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
});
