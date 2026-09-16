import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Logo, useToast } from '../../src/components/brand';
import { AreaChart, BarChart } from '../../src/components/charts';
import { Button, Card, Chips, IconBtn, IconName, Row, Screen, SectionTitle, T } from '../../src/components/ui';
import { aiSuggestions } from '../../src/data/mock';
import { vnd } from '../../src/lib/format';
import { bestSellers, daily, hourly, inPeriod, Period, summary } from '../../src/lib/stats';
import { useApp } from '../../src/store/AppStore';
import { colors, shadow } from '../../src/theme';

type P = Extract<Period, 'today' | 'yesterday' | 'month'>;

export default function Home() {
  const app = useApp();
  const toast = useToast();
  const [period, setPeriod] = useState<P>('today');
  const [showProfit, setShowProfit] = useState(false);

  const s = useMemo(() => summary(app.invoices, app.products, period), [app.invoices, app.products, period]);
  const prev = useMemo(
    () => (period === 'today' ? summary(app.invoices, app.products, 'yesterday') : null),
    [app.invoices, app.products, period],
  );
  const chart = useMemo(
    () => (period === 'month' ? daily(app.invoices, 7) : hourly(app.invoices, period)),
    [app.invoices, period],
  );
  const top = useMemo(() => bestSellers(app.invoices, period).slice(0, 4), [app.invoices, period]);
  const spend = app.expenses.filter((e) => inPeriod(e.createdAt, period)).reduce((a, e) => a + e.amount, 0);
  const debtLeft = app.debts.reduce((a, d) => a + d.total - d.paid, 0);
  const lowStock = app.products.filter((p) => p.tracked && p.stock <= 6);
  const delta = prev && prev.revenue ? (s.revenue - prev.revenue) / prev.revenue : null;
  const firstName = app.user.name.split(' ').slice(-1)[0];

  return (
    <Screen>
      <Row style={{ paddingTop: 10, paddingBottom: 6 }}>
        <View style={{ flex: 1 }}>
          <Logo size={30} subtitle={false} />
        </View>
        <IconBtn
          name="bell"
          dot
          onPress={() => toast(`${lowStock.length} mặt hàng sắp hết · ${app.debts.length} khách đang nợ`)}
          label="Thông báo"
        />
      </Row>

      <T w="extrabold" size={21} style={{ marginTop: 14, lineHeight: 28 }}>
        Xin chào {firstName},{'\n'}hôm nay bạn muốn làm gì?
      </T>

      {!app.guideDismissed ? (
        <Card style={{ marginTop: 16 }}>
          <Row>
            <View style={{ flex: 1 }}>
              <T w="bold" size={16}>
                3 cách bán hàng cực dễ 👋
              </T>
              <T size={12} color={colors.faint}>
                Chọn cách bạn thấy quen tay nhất
              </T>
            </View>
            <IconBtn name="x" size={28} bg={colors.bg} onPress={app.dismissGuide} label="Ẩn hướng dẫn" />
          </Row>
          <GuideRow
            icon="mic"
            title="Nói để lên đơn"
            desc="Bạn nói, AI tự ghi đơn"
            cta="Nói"
            onPress={() => router.push('/voice')}
          />
          <GuideRow
            icon="grid"
            title="Chọn hàng nhanh"
            desc="Bấm chọn từ danh sách"
            cta="Chọn"
            onPress={() => router.push('/pos')}
          />
          <GuideRow
            icon="package"
            title="Thêm hàng vào kho"
            desc="Quản lý sản phẩm của bạn"
            cta="Mở"
            onPress={() => router.push('/products')}
          />
        </Card>
      ) : null}

      <Chips<P>
        style={{ marginTop: 18 }}
        value={period}
        onChange={setPeriod}
        options={[
          { key: 'today', label: 'Hôm nay' },
          { key: 'yesterday', label: 'Hôm qua' },
          { key: 'month', label: 'Tháng này' },
        ]}
      />

      <Card style={{ marginTop: 12 }} onPress={() => router.push('/(tabs)/invoices')}>
        <Row>
          <View style={{ flex: 1 }}>
            <T w="bold" size={13} color={colors.primary}>
              {s.count} đơn · {Math.round(s.voiceRatio * 100)}% bằng giọng nói
            </T>
            <T w="extrabold" size={30} style={{ marginTop: 2 }}>
              {vnd(s.revenue)}
            </T>
            {delta !== null ? (
              <Row gap={4}>
                <Feather
                  name={delta >= 0 ? 'trending-up' : 'trending-down'}
                  size={13}
                  color={delta >= 0 ? colors.green : colors.red}
                />
                <T w="semibold" size={12} color={delta >= 0 ? colors.green : colors.red}>
                  {delta >= 0 ? '+' : ''}
                  {Math.round(delta * 100)}% so với hôm qua
                </T>
              </Row>
            ) : null}
          </View>
          <View style={styles.roundIcon}>
            <Feather name="file-text" size={18} color={colors.white} />
          </View>
        </Row>
      </Card>

      <Card style={{ marginTop: 12 }}>
        <Row style={{ marginBottom: 12 }}>
          <T w="bold" size={17} style={{ flex: 1 }}>
            Doanh thu
          </T>
          <T size={11} color={colors.faint}>
            {period === 'month' ? '7 ngày gần nhất' : 'theo khung giờ'}
          </T>
        </Row>
        {period === 'month' ? <BarChart data={chart} /> : <AreaChart data={chart} />}
      </Card>

      <Row style={{ marginTop: 12, alignItems: 'stretch' }}>
        <Card style={{ flex: 1 }} onPress={() => router.push('/(tabs)/expenses')}>
          <Row gap={4}>
            <T size={12} color={colors.muted}>
              Chi {period === 'month' ? 'tháng này' : period === 'today' ? 'hôm nay' : 'hôm qua'}
            </T>
            <Feather name="chevron-right" size={13} color={colors.faint} />
          </Row>
          <T w="extrabold" size={20} color={colors.gold} style={{ marginTop: 6 }}>
            {vnd(spend)}
          </T>
        </Card>
        <Card style={{ flex: 1 }} onPress={() => setShowProfit((v) => !v)}>
          <Row gap={4}>
            <T size={12} color={colors.muted} style={{ flex: 1 }}>
              Lãi gộp ước tính
            </T>
            <Feather name={showProfit ? 'eye' : 'eye-off'} size={14} color={colors.faint} />
          </Row>
          <T w="extrabold" size={20} color={colors.green} style={{ marginTop: 6 }}>
            {showProfit ? vnd(s.profit) : '••••••'}
          </T>
        </Card>
      </Row>

      <SectionTitle title="AI gợi ý cho tiệm" action="Hỏi AI" onAction={() => router.push('/ai')} />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
        style={{ marginHorizontal: -16, paddingHorizontal: 16 }}
      >
        {aiSuggestions.map((a, i) => (
          <LinearGradient
            key={a.id}
            colors={i === 0 ? ['#2858D8', '#5B8DEF'] : i === 1 ? ['#C8860A', '#E0A21F'] : ['#7A5AF0', '#9C84F5']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.aiCard, i === aiSuggestions.length - 1 && { marginRight: 32 }]}
          >
            <Row gap={8}>
              <View style={styles.aiIcon}>
                <Feather name={a.icon as IconName} size={14} color={colors.white} />
              </View>
              <T w="bold" size={13} color={colors.white} style={{ flex: 1 }} numberOfLines={1}>
                {a.title}
              </T>
            </Row>
            <T size={12} color="rgba(255,255,255,0.9)" style={{ marginTop: 8, lineHeight: 17 }}>
              {a.body}
            </T>
          </LinearGradient>
        ))}
      </ScrollView>

      <SectionTitle title="Quản lý tiệm" />
      <View style={styles.grid}>
        <MgmtTile
          icon="package"
          title="Hàng hoá"
          sub={`${app.products.length} sản phẩm`}
          onPress={() => router.push('/products')}
        />
        <MgmtTile icon="users" title="Nhân viên" sub={`${app.staff.length} người`} onPress={() => router.push('/staff')} />
        <MgmtTile icon="book-open" title="Sổ nợ" sub={vnd(debtLeft)} dot={debtLeft > 0} onPress={() => router.push('/debts')} />
        <MgmtTile icon="bar-chart-2" title="Bán chạy" sub="Xếp hạng món" onPress={() => router.push('/bestsellers')} />
      </View>

      {debtLeft > 0 ? (
        <Pressable onPress={() => router.push('/debts')} style={styles.debtBanner}>
          <Feather name="alert-circle" size={15} color={colors.gold} />
          <T w="semibold" size={12.5} color={colors.gold} style={{ flex: 1 }}>
            Còn {vnd(debtLeft)} khách chưa trả
          </T>
          <T w="bold" size={12} color={colors.gold}>
            Xem →
          </T>
        </Pressable>
      ) : null}

      {lowStock.length ? (
        <Card style={{ marginTop: 12, backgroundColor: colors.redSoft }}>
          <Row gap={8}>
            <Feather name="alert-triangle" size={15} color={colors.red} />
            <T w="bold" size={13} color={colors.red}>
              {lowStock.length} mặt hàng sắp hết
            </T>
          </Row>
          <T size={12} color={colors.muted} style={{ marginTop: 4 }}>
            {lowStock.map((p) => `${p.name} (còn ${p.stock})`).join(' · ')}
          </T>
        </Card>
      ) : null}

      <SectionTitle title="Hàng hoá bán chạy" action="Xem tất cả" onAction={() => router.push('/bestsellers')} />
      <Card style={{ paddingVertical: 6 }}>
        {top.length ? (
          top.map((t, i) => (
            <Row
              key={t.name}
              style={[{ paddingVertical: 11 }, i < top.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.border }]}
            >
              <T w="bold" size={13} color={colors.faint} style={{ width: 18 }}>
                {i + 1}
              </T>
              <T w="semibold" size={14} style={{ flex: 1 }}>
                {t.name}
              </T>
              <T w="bold" size={14} color={colors.primary}>
                x{t.qty}
              </T>
            </Row>
          ))
        ) : (
          <T size={13} color={colors.faint} style={{ paddingVertical: 14, textAlign: 'center' }}>
            Chưa có đơn trong khoảng này
          </T>
        )}
      </Card>

      <Button
        title="Nói để lên đơn"
        icon="mic"
        variant="gold"
        onPress={() => router.push('/voice')}
        style={{ marginTop: 20, marginBottom: 56 }}
      />
    </Screen>
  );
}

function GuideRow({
  icon,
  title,
  desc,
  cta,
  onPress,
}: {
  icon: IconName;
  title: string;
  desc: string;
  cta: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.guide, pressed && { opacity: 0.8 }]}>
      <View style={styles.guideIcon}>
        <Feather name={icon} size={18} color={colors.white} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={14}>
          {title}
        </T>
        <T size={11.5} color={colors.faint}>
          {desc}
        </T>
      </View>
      <View style={styles.guideCta}>
        <T w="bold" size={12} color={colors.white}>
          {cta}
        </T>
      </View>
    </Pressable>
  );
}

function MgmtTile({
  icon,
  title,
  sub,
  onPress,
  dot,
}: {
  icon: IconName;
  title: string;
  sub: string;
  onPress: () => void;
  dot?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8 }]}>
      <View style={styles.tileIcon}>
        <Feather name={icon} size={20} color={colors.white} />
      </View>
      <T w="bold" size={13.5} style={{ marginTop: 10 }}>
        {title}
      </T>
      <T size={11} color={colors.faint} numberOfLines={1}>
        {sub}
      </T>
      {dot ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  roundIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.primaryTint,
    borderRadius: 14,
    padding: 10,
    marginTop: 10,
  },
  guideIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideCta: { backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  aiCard: { width: 250, borderRadius: 18, padding: 14 },
  aiIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    alignItems: 'center',
    ...shadow(1),
  },
  tileIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: { position: 'absolute', top: 12, right: 12, width: 8, height: 8, borderRadius: 4, backgroundColor: colors.red },
  debtBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    backgroundColor: colors.goldSoft,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
});
