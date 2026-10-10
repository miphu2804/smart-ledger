import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, SectionList, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, EmptyState, Row, T } from '../../src/components/ui';
import type { SaleView } from '../../src/data/types';
import { errorMessage } from '../../src/lib/errors';
import { triggerFeedback } from '../../src/lib/feedback';
import { hashIndex, hhmm, normalizeText, relDay, vnd } from '../../src/lib/format';
import { saleApi } from '../../src/lib/salesApi';
import { inPeriod, Period, periodLabel } from '../../src/lib/stats';
import { colors, font, shadow, tilePalette } from '../../src/theme';

/**
 * Cỡ chữ của số trên thẻ tổng theo độ dài chữ. `adjustsFontSizeToFit` co chữ nhưng không đủ tin cậy trên mọi nền tảng
 * (web bỏ qua) và thẻ này hẹp trên điện thoại nhỏ, nên số dài ("17.555.000đ") bắt đầu từ cỡ nhỏ hơn để luôn nằm một dòng.
 */
const figureSize = (text: string) => (text.length >= 12 ? 14 : text.length >= 10 ? 15.5 : 17.5);

function formatGroupDateTitle(date: Date): string {
  const now = new Date();
  const diffDays = Math.floor(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      (1000 * 60 * 60 * 24),
  );

  if (diffDays === 0) return 'HÔM NAY';
  if (diffDays === 1) return 'HÔM QUA';
  if (diffDays === 2) return '2 NGÀY TRƯỚC';
  if (diffDays === 3) return '3 NGÀY TRƯỚC';
  if (diffDays <= 7) return `${diffDays} NGÀY TRƯỚC`;

  const d = date.getDate().toString().padStart(2, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  return `${d}/${m}`;
}

export default function Invoices() {
  const insets = useSafeAreaInsets();
  const { period: queryPeriod } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: Period = queryPeriod === 'yesterday' || queryPeriod === 'month' ? queryPeriod : 'all';
  const [period, setPeriod] = useState<Period>(initialPeriod);
  const [q, setQ] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const [sales, setSales] = useState<SaleView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setSales(await saleApi.list());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (queryPeriod === 'today' || queryPeriod === 'yesterday' || queryPeriod === 'month') {
        setPeriod(queryPeriod);
      }
    }, [queryPeriod]),
  );

  const filteredSales = useMemo(() => {
    const nq = normalizeText(q);
    return sales
      .filter((s) => {
        if (!inPeriod(s.soldAt, period)) return false;
        if (nq) {
          const hay = normalizeText(`${s.id} ${s.customerName ?? ''} ${s.items.map((x) => x.productName).join(' ')}`);
          if (!hay.includes(nq)) return false;
        }
        return true;
      })
      // Core trả theo mã đơn; đơn có giờ bán cũ hơn mà mã lớn hơn (dữ liệu nhập tay/mẫu) làm nhóm ngày bị đảo. Mới nhất trước.
      .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
  }, [sales, period, q]);

  const total = filteredSales.filter((s) => s.saleStatus !== 'VOIDED').reduce((a, s) => a + s.totalVnd, 0);
  const count = filteredSales.length;
  // Số trên thẻ là của khoảng thời gian đang lọc; chỉ "Tất cả" mới là tổng, nên nhãn đổi theo bộ lọc
  const scopeName = period === 'all' ? null : periodLabel[period].toLowerCase();
  const countLabel = scopeName ? `Đơn ${scopeName}` : 'Tổng đơn hàng';
  const revenueLabel = scopeName ? `Doanh thu ${scopeName}` : 'Tổng doanh thu';

  // Group sales by date
  const groupedSections = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      date: Date;
      sales: SaleView[];
      totalVnd: number;
    }> = [];

    filteredSales.forEach((sale) => {
      const saleDate = new Date(sale.soldAt);
      const title = formatGroupDateTitle(saleDate);
      const groupKey = `${saleDate.getFullYear()}-${saleDate.getMonth()}-${saleDate.getDate()}-${title}`;

      let existing = groups.find((g) => g.key === groupKey);
      if (!existing) {
        existing = {
          key: groupKey,
          title,
          date: saleDate,
          sales: [],
          totalVnd: 0,
        };
        groups.push(existing);
      }

      existing.sales.push(sale);
      if (sale.saleStatus !== 'VOIDED') {
        existing.totalVnd += sale.totalVnd;
      }
    });

    return groups;
  }, [filteredSales]);

  // SectionList chỉ dựng các dòng đang nhìn thấy; nhóm đang thu gọn không có dòng nào nhưng vẫn giữ tiêu đề.
  const sections = useMemo(
    () =>
      groupedSections.map((g) => ({
        key: g.key,
        title: g.title,
        totalVnd: g.totalVnd,
        count: g.sales.length,
        data: collapsedGroups[g.key] ? ([] as SaleView[]) : g.sales,
      })),
    [groupedSections, collapsedGroups],
  );

  const toggleGroupCollapse = (key: string) => {
    triggerFeedback('selection');
    setCollapsedGroups((cur) => ({ ...cur, [key]: !cur[key] }));
  };

  const periodOptions: Array<{ key: Period; label: string }> = [
    { key: 'all', label: 'Tất cả' },
    { key: 'today', label: 'Hôm nay' },
    { key: 'yesterday', label: 'Hôm qua' },
    { key: 'week', label: '7 ngày' },
    { key: 'month', label: 'Tháng này' },
  ];

  // Thẻ tóm tắt nằm đầu danh sách (cuộn cùng danh sách)
  const listHeader = (
    <>
          {/* Top Summary Metric Card */}
          <View style={styles.summaryCard}>
            {/* Left Metric: Tổng đơn hàng */}
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                setPeriod('all');
                setQ('');
              }}
              style={({ pressed }) => [styles.summaryMetricBtn, styles.summaryMetricCount, pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
              accessibilityLabel={`${countLabel}: ${count} đơn. Bấm để xem tất cả`}
            >
              <View style={styles.summaryIconPurple}>
                <Feather name="shopping-bag" size={17} color={colors.brand} />
              </View>
              <View style={styles.summaryText}>
                <T w="extrabold" size={figureSize(`${count} đơn`)} color={colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {count} đơn
                </T>
                <T size={12} color={colors.muted} style={{ marginTop: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {countLabel}
                </T>
              </View>
            </Pressable>

            {/* Middle Divider */}
            <View style={styles.summaryDivider} />

            {/* Right Metric: Tổng doanh thu */}
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                router.push('/analytics');
              }}
              style={({ pressed }) => [styles.summaryMetricBtn, styles.summaryMetricRevenue, pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
              accessibilityLabel={`${revenueLabel}: ${vnd(total)}. Bấm để xem báo cáo chi tiết`}
            >
              <View style={styles.summaryIconYellow}>
                <Feather name="database" size={16} color={colors.data.debt} />
              </View>
              <View style={styles.summaryText}>
                <T w="extrabold" size={figureSize(vnd(total))} color={colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {vnd(total)}
                </T>
                <T size={12} color={colors.muted} style={{ marginTop: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {revenueLabel}
                </T>
              </View>
            </Pressable>
          </View>

    </>
  );

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* Header Container */}
      <View style={[styles.headerShell, { paddingTop: insets.top + 8 }]}>
        {/* Title and Search Button Row */}
        <Row style={styles.heroRow} gap={10}>
          <View style={{ flex: 1 }}>
            <T w="extrabold" size={28} color={colors.ink}>
              Đơn hàng
            </T>
            <T w="medium" size={13.5} color={colors.muted} style={{ marginTop: 1 }}>
              Quản lý và theo dõi đơn hàng
            </T>
          </View>
          <Pressable
            onPress={() => {
              triggerFeedback('selection');
              setSearchOpen((cur) => !cur);
              if (searchOpen) setQ('');
            }}
            style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.8 }]}
            accessibilityRole="button"
            accessibilityLabel={searchOpen ? 'Đóng tìm kiếm' : 'Tìm kiếm'}
          >
            <Feather name={searchOpen ? 'x' : 'search'} size={19} color={colors.brand} />
          </Pressable>
        </Row>

        {/* Expandable Search Input */}
        {searchOpen ? (
          <View style={styles.searchBox}>
            <Feather name="search" size={16} color={colors.faint} />
            <TextInput
              autoFocus
              value={q}
              onChangeText={setQ}
              placeholder="Tìm theo khách, tên món, mã đơn..."
              placeholderTextColor={colors.faint}
              style={styles.searchInput}
            />
            {q ? (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <Feather name="x-circle" size={15} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/* Period Chips Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodScroll}>
          {periodOptions.map((opt) => {
            const active = period === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => {
                  triggerFeedback('selection');
                  setPeriod(opt.key);
                }}
                style={({ pressed }) => [styles.periodPill, active && styles.periodPillActive, pressed && { opacity: 0.8 }]}
              >
                <Feather
                  name={opt.key === 'all' ? 'grid' : 'calendar'}
                  size={14}
                  color={active ? colors.brandInk : colors.inkSecondary}
                />
                <T
                  w={active ? 'bold' : 'medium'}
                  size={13}
                  color={active ? colors.brandInk : colors.inkSecondary}
                  numberOfLines={1}
                >
                  {opt.label}
                </T>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Main Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.brand} />
        </View>
      ) : error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <EmptyState icon="alert-triangle" title="Không tải được đơn hàng" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={load} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          extraData={collapsedGroups}
          keyExtractor={(sale) => String(sale.id)}
          renderItem={({ item }) => <OrderCard sale={item} />}
          renderSectionHeader={({ section }) => (
            <Pressable
              onPress={() => toggleGroupCollapse(section.key)}
              style={({ pressed }) => [styles.sectionHeaderRow, pressed && { opacity: 0.75 }]}
            >
              <T w="extrabold" size={13.5} color={colors.ink} style={styles.sectionTitle}>
                {section.title}
              </T>
              <Row gap={6} style={{ alignItems: 'center' }}>
                <T w="bold" size={12.5} color={colors.muted}>
                  {section.count} đơn · {vnd(section.totalVnd)}
                </T>
                <Feather name={collapsedGroups[section.key] ? 'chevron-down' : 'chevron-up'} size={15} color={colors.muted} />
              </Row>
            </Pressable>
          )}
          renderSectionFooter={() => <View style={{ height: 14 }} />}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <EmptyState
              icon={q ? 'search' : 'file-text'}
              title={q ? 'Không tìm thấy đơn' : 'Chưa có đơn hàng'}
              hint={q ? 'Thử tìm tên khách hoặc mã đơn khác' : 'Tạo đơn mới trong tab Bán hàng'}
            />
          }
          stickySectionHeadersEnabled={false}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom + 84, 108) }]}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={7}
          removeClippedSubviews={Platform.OS === 'android'}
        />
      )}
    </View>
  );
}

const OrderCard = React.memo(function OrderCard({ sale }: { sale: SaleView }) {
  const voided = sale.saleStatus === 'VOIDED';
  const tonePair = tilePalette[hashIndex(sale.customerName || `Customer-${sale.id}`, tilePalette.length)];

  const itemsSummary = sale.items
    .map((item) => `${item.productName}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
    .join(', ');

  const timeStr = hhmm(new Date(sale.soldAt));
  const dateStr = relDay(new Date(sale.soldAt));

  return (
    <Pressable
      onPress={() => router.push(`/invoice/${sale.id}`)}
      style={({ pressed }) => [styles.orderCard, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }, voided && { opacity: 0.55 }]}
      accessibilityRole="button"
      accessibilityLabel={`Đơn hàng #${sale.id}, ${sale.customerName || 'Khách lẻ'}, tổng tiền ${vnd(sale.totalVnd)}`}
    >
      <Row gap={12} style={{ alignItems: 'center' }}>
        {/* Customer / Order Bag Icon Badge */}
        <View style={[styles.orderIconBadge, { backgroundColor: tonePair[0] }]}>
          <Feather name="shopping-bag" size={18} color={tonePair[1]} />
        </View>

        {/* Center Details */}
        <View style={styles.orderMiddleInfo}>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <T w="bold" size={14.5} color={colors.ink} numberOfLines={1}>
              {sale.customerName || 'Khách lẻ'}
            </T>
            {voided ? (
              <View style={styles.voidedBadge}>
                <T w="bold" size={10} color={colors.red}>
                  Đã huỷ
                </T>
              </View>
            ) : null}
          </Row>

          <T size={12.5} color={colors.muted} numberOfLines={1} style={styles.itemSummaryText}>
            {itemsSummary || 'Đơn hàng'}
          </T>

          <T size={11.5} color={colors.faint} style={{ marginTop: 2 }}>
            #{sale.id} · {dateStr} · {timeStr}
          </T>
        </View>

        {/* Right Details: Price Pill and Arrow */}
        <Row gap={8} style={{ alignItems: 'center' }}>
          <View style={styles.pricePill}>
            <T
              w="extrabold"
              size={13.5}
              color={voided ? colors.muted : colors.brand}
              style={voided ? { textDecorationLine: 'line-through' } : undefined}
            >
              {vnd(sale.totalVnd)}
            </T>
          </View>
          <Feather name="chevron-right" size={16} color={colors.disabled} />
        </Row>
      </Row>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerShell: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  heroRow: {
    alignItems: 'center',
    marginBottom: 8,
  },
  searchBtn: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadow(0),
  },
  searchBox: {
    height: 42,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    height: 38,
    fontFamily: font.medium,
    fontSize: 14,
    color: colors.ink,
    outlineStyle: 'none',
  } as never,
  periodScroll: {
    gap: 6,
    paddingRight: 16,
  },
  periodPill: {
    height: 32,
    minWidth: 64,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 12,
  },
  periodPillActive: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 100,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    ...shadow(1),
  },
  summaryMetricBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  // Số tiền dài hơn số đơn nên ô doanh thu được chia nhiều chỗ hơn
  summaryMetricCount: { flex: 0.8 },
  summaryMetricRevenue: { flex: 1.2 },
  // minWidth 0 để chữ trong ô flex được phép co lại thay vì đẩy xuống dòng
  summaryText: { flex: 1, minWidth: 0 },
  summaryIconPurple: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryIconYellow: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.data.debtSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryDivider: {
    width: 1,
    height: 32,
    backgroundColor: colors.border,
    marginHorizontal: 12,
  },
  groupSection: {
    marginBottom: 14,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    marginBottom: 6,
  },
  sectionTitle: {
    letterSpacing: 0.4,
  },
  ordersList: {
    gap: 8,
  },
  orderCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    paddingVertical: 12,
    ...shadow(0),
  },
  orderIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderMiddleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  itemSummaryText: {
    marginTop: 2,
  },
  pricePill: {
    backgroundColor: colors.brandSoft,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
  },
  voidedBadge: {
    backgroundColor: colors.redSoft,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
});
