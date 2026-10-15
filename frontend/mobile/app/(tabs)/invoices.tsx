import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DateRangeSheet } from '../../src/components/DateRangeSheet';
import { RowListSkeleton } from '../../src/components/ListSkeleton';
import { TAB_HEADER_SIDE, TAB_HEADER_TOP, TabSearchBar } from '../../src/components/TabSearchBar';
import { Button, EmptyState, Row, T } from '../../src/components/ui';
import type { SaleSummaryView, SaleView } from '../../src/data/types';
import { triggerFeedback } from '../../src/lib/feedback';
import { dayKey, ddmmyyyy, hashIndex, hhmm, vnd } from '../../src/lib/format';
import {
  DEFAULT_SALE_FILTER,
  isSaleFilterActive,
  matchingPreset,
  saleFilterTimeLabel,
  saleFilterTimeShort,
  saleFilterWindow,
  type SaleFilter,
} from '../../src/lib/saleFilter';
import { saleApi } from '../../src/lib/salesApi';
import { usePagedList } from '../../src/lib/usePagedList';
import type { Period } from '../../src/lib/stats';
import { colors, shadow, tilePalette } from '../../src/theme';

/**
 * Cỡ chữ của số trên thẻ tổng theo độ dài chữ. `adjustsFontSizeToFit` co chữ nhưng không đủ tin cậy trên mọi nền tảng
 * (web bỏ qua) và thẻ này hẹp trên điện thoại nhỏ, nên số dài ("17.555.000đ") bắt đầu từ cỡ nhỏ hơn để luôn nằm một dòng.
 */
const figureSize = (text: string) => (text.length >= 12 ? 14 : text.length >= 10 ? 15.5 : 17.5);

/** Chờ người dùng ngừng gõ chừng này rồi mới tìm ở Core, để không gọi một lần cho mỗi phím. */
const SEARCH_DEBOUNCE_MS = 350;
/** Tổng của một ngày ở tiêu đề nhóm, kèm vòng hỏi đã lấy số đó */
interface DayTotal {
  round: number;
  summary: SaleSummaryView;
}
/** Chưa có tổng ngày nào: một object cố định để không tính lại nhóm ngày ở mỗi lần vẽ */
const NO_DAY_TOTALS: Record<string, DayTotal> = {};

const WEEKDAY_NAMES = ['CHỦ NHẬT', 'THỨ HAI', 'THỨ BA', 'THỨ TƯ', 'THỨ NĂM', 'THỨ SÁU', 'THỨ BẢY'];

/** Tiêu đề nhóm ngày, luôn kèm ngày tháng năm: "HÔM NAY · 13/10/2026", "HÔM QUA · 12/10/2026", "THỨ BA · 06/10/2026". */
function formatGroupDateTitle(date: Date): string {
  const now = new Date();
  // Math.round: ngày đổi giờ mùa hè dài 23 hoặc 25 tiếng vẫn ra đúng số ngày
  const diffDays = Math.round(
    (new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() -
      new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) /
      (1000 * 60 * 60 * 24),
  );
  const word = diffDays === 0 ? 'HÔM NAY' : diffDays === 1 ? 'HÔM QUA' : WEEKDAY_NAMES[date.getDay()];
  return `${word} · ${ddmmyyyy(date)}`;
}

export default function Invoices() {
  const insets = useSafeAreaInsets();
  const { period: queryPeriod } = useLocalSearchParams<{ period?: string }>();
  const initialPeriod: Period = queryPeriod === 'yesterday' || queryPeriod === 'month' ? queryPeriod : 'all';
  // Một bộ lọc thời gian cho cả hai cách chọn: kỳ có sẵn (hàng nút dưới ô tìm) và khoảng ngày tự chọn (nút phễu)
  const [filter, setFilter] = useState<SaleFilter>({ ...DEFAULT_SALE_FILTER, time: initialPeriod });
  const [filterOpen, setFilterOpen] = useState(false);
  const period = filter.time;
  /** Chọn một kỳ có sẵn thì bỏ khoảng ngày tự chọn */
  const setPeriod = useCallback((time: Period) => setFilter({ time, from: null, to: null }), []);
  const [q, setQ] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Từ khoá gửi lên Core sau khi ngừng gõ; Core tìm trong tên khách, tên món, hoặc khớp đúng mã đơn
  const [searchQ, setSearchQ] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearchQ(q.trim()), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q]);

  // Core lọc và chia trang (mới bán trước); đổi khoảng thời gian hoặc từ khoá thì tải lại từ trang đầu
  const saleWindow = saleFilterWindow(filter);
  const queryKey = JSON.stringify([saleWindow.from, saleWindow.to, searchQ]);
  const {
    items: sales,
    total: count,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    moreError,
    loadMore,
    refreshTop,
    reload,
  } = usePagedList<SaleView>(queryKey, (page, size) =>
    saleApi.page(page, size, { ...saleWindow, q: searchQ || undefined }),
  );

  // Doanh thu trên thẻ: tiền các đơn còn hiệu lực khớp cùng bộ lọc với danh sách (`GET /sales/summary`), cho mọi kỳ, khoảng tự
  // chọn và kết quả tìm. Không dùng doanh thu thuần của báo cáo (bán trong kỳ trừ huỷ trong kỳ) vì huỷ một đơn bán kỳ trước làm
  // số đó âm; phần đó Tổng quan và thông báo tính vào chi phí. Các trang đã tải không đủ để tự cộng tổng.
  const [report, setReport] = useState<{ key: string; revenue: number } | null>(null);
  const reportSeq = useRef(0);
  const loadReport = useCallback(async () => {
    const mine = ++reportSeq.current;
    try {
      const summary = await saleApi.summary({ ...saleWindow, q: searchQ || undefined });
      if (mine !== reportSeq.current) return;
      setReport({ key: queryKey, revenue: summary.confirmedSalesVnd });
    } catch {
      // Không có số tổng thì thẻ hiện "—"; danh sách đơn vẫn dùng được
      if (mine === reportSeq.current) setReport(null);
    }
    // saleWindow và searchQ đổi thì queryKey đổi và hàm được tạo lại
  }, [queryKey]);
  const activeReport = report && report.key === queryKey ? report : null;

  // Số đơn và doanh thu của từng ngày ở tiêu đề nhóm: `/sales/summary` của đúng ngày đó (cùng từ khoá tìm), hỏi dần cho các
  // ngày đã có trong danh sách. Mỗi lần màn hình được focus hoặc kéo làm mới (`dayRound` tăng) thì hỏi lại, giữ số cũ trong lúc chờ.
  // Mỗi ngày nhớ số của vòng hỏi nào: kết quả của vòng cũ về muộn không ghi đè số của vòng mới hơn.
  const [dayTotals, setDayTotals] = useState<{ key: string; days: Record<string, DayTotal> }>({ key: queryKey, days: {} });
  const [dayRound, setDayRound] = useState(0);
  // Các ngày đã hỏi trong vòng hiện tại (cùng bộ lọc); sang vòng hoặc bộ lọc khác thì bắt đầu tập mới
  const askedDays = useRef<{ scope: string; days: Set<string> }>({ scope: '', days: new Set() });
  useEffect(() => {
    const scope = `${dayRound}|${queryKey}`;
    if (askedDays.current.scope !== scope) askedDays.current = { scope, days: new Set() };
    const asked = askedDays.current.days;
    const round = dayRound;
    new Set(sales.map((sale) => dayKey(new Date(sale.soldAt)))).forEach((day) => {
      if (asked.has(day)) return;
      asked.add(day);
      saleApi
        .summary({ ...saleFilterWindow({ time: 'custom', from: day, to: day }), q: searchQ || undefined })
        .then((summary) =>
          setDayTotals((cur) => {
            const days = cur.key === queryKey ? cur.days : {};
            if ((days[day]?.round ?? -1) > round) return cur;
            return { key: queryKey, days: { ...days, [day]: { round, summary } } };
          }),
        )
        .catch(() => {
          // Không có số của ngày thì tiêu đề chỉ có ngày; lần làm mới sau hỏi lại
        });
    });
    // searchQ đổi thì queryKey đổi
  }, [sales, queryKey, dayRound]);
  const dayTotalsNow = dayTotals.key === queryKey ? dayTotals.days : NO_DAY_TOTALS;

  // Quay lại màn hình (vừa bán hoặc huỷ đơn): làm mới trang đầu mà giữ chỗ đang cuộn, và làm mới số tổng
  useFocusEffect(
    useCallback(() => {
      void refreshTop();
      void loadReport();
      setDayRound((n) => n + 1);
    }, [refreshTop, loadReport]),
  );

  const pullToRefresh = () => {
    void reload();
    void loadReport();
    setDayRound((n) => n + 1);
  };

  useFocusEffect(
    useCallback(() => {
      if (queryPeriod === 'today' || queryPeriod === 'yesterday' || queryPeriod === 'month') {
        setPeriod(queryPeriod);
      }
    }, [queryPeriod, setPeriod]),
  );

  const clearFilters = () => {
    triggerFeedback('selection');
    setFilter(DEFAULT_SALE_FILTER);
    setQ('');
  };

  const revenue = activeReport ? activeReport.revenue : null;
  const revenueText = revenue === null ? '—' : vnd(revenue);
  // Số trên thẻ là của khoảng thời gian đang lọc; chỉ "Tất cả" mới là tổng, nên nhãn đổi theo bộ lọc
  const timeShort = saleFilterTimeShort(filter);
  // Nhãn nút của khoảng tự chọn: "30 ngày gần nhất" như trong bảng chọn, hoặc "07/10 – 13/10"
  const customChipLabel = matchingPreset(filter.from, filter.to) ? saleFilterTimeLabel(filter) : timeShort;
  const scopeName = period === 'all' ? null : timeShort.toLowerCase();
  const countLabel = scopeName ? `Đơn ${scopeName}` : 'Tổng đơn hàng';
  const revenueLabel = scopeName ? `Doanh thu ${scopeName}` : 'Tổng doanh thu';
  // Ô số đơn hẹp hơn ô doanh thu (flex 0.8 so với 1.2). Dòng chữ dưới số chỉ nêu khoảng thời gian, trùng tên nút lọc, nên luôn
  // vừa một dòng; "Tổng đơn hàng" và "Đơn tháng này" bị cắt trên web ≤ 390px vì RN web không thu chữ theo adjustsFontSizeToFit.
  // countLabel vẫn dùng làm nhãn đọc màn hình.
  const countCaption = timeShort;

  // Nhóm theo ngày bán. Danh sách tải dần nên một ngày có thể mới có một phần đơn: số đơn và doanh thu của ngày lấy từ
  // `/sales/summary` của ngày đó (`dayTotalsNow`), không đếm trên các trang đã tải; chưa có số thì tiêu đề chỉ có ngày.
  const groupedSections = useMemo(() => {
    const groups: Array<{
      key: string;
      title: string;
      date: Date;
      sales: SaleView[];
      day: SaleSummaryView | null;
    }> = [];

    sales.forEach((sale) => {
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
          day: dayTotalsNow[dayKey(saleDate)]?.summary ?? null,
        };
        groups.push(existing);
      }

      existing.sales.push(sale);
    });

    return groups;
  }, [sales, dayTotalsNow]);

  // SectionList chỉ dựng các dòng đang nhìn thấy; nhóm đang thu gọn không có dòng nào nhưng vẫn giữ tiêu đề.
  const sections = useMemo(
    () =>
      groupedSections.map((g) => ({
        key: g.key,
        title: g.title,
        day: g.day,
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
              onPress={clearFilters}
              style={({ pressed }) => [
                styles.summaryMetricBtn,
                styles.summaryMetricCount,
                pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${countLabel}: ${count} đơn. Bấm để xem tất cả`}
            >
              <View style={styles.summaryIconPurple}>
                <Feather name="shopping-bag" size={17} color={colors.brand} />
              </View>
              <View style={styles.summaryText}>
                <T w="extrabold" size={figureSize(`${count} đơn`)} color={colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {loading ? '…' : `${count} đơn`}
                </T>
                <T size={12} color={colors.muted} style={{ marginTop: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                  {countCaption}
                </T>
              </View>
            </Pressable>

            <View style={styles.summaryDivider} />

            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                router.push('/analytics');
              }}
              style={({ pressed }) => [styles.summaryMetricBtn, styles.summaryMetricRevenue, pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] }]}
              accessibilityRole="button"
              accessibilityLabel={`${revenueLabel}: ${revenueText}. Bấm để xem báo cáo chi tiết`}
            >
              <View style={styles.summaryIconYellow}>
                <Feather name="database" size={16} color={colors.data.debt} />
              </View>
              <View style={styles.summaryText}>
                <T w="extrabold" size={figureSize(revenueText)} color={colors.ink} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                  {revenueText}
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
      <View style={[styles.headerShell, { paddingTop: insets.top + TAB_HEADER_TOP }]}>
        {/* Title Row */}
        {/* Cùng cỡ chữ và lề với tiêu đề Bán hàng để chuyển tab qua lại ô tìm không xê dịch */}
        <Row style={styles.heroRow} gap={8}>
          <View style={{ flex: 1 }}>
            <T w="extrabold" size={26} color={colors.ink}>
              Đơn hàng
            </T>
            <T w="medium" size={13} color={colors.muted} style={{ marginTop: 1 }}>
              Quản lý và theo dõi đơn hàng
            </T>
          </View>
        </Row>

        {/* Ô tìm dùng chung với Bán hàng: phễu trong ô mở bảng chọn khoảng ngày */}
        <TabSearchBar
          value={q}
          onChangeText={setQ}
          placeholder="Tìm theo khách, tên món, mã đơn..."
          searchLabel="Tìm đơn hàng"
          onFilterPress={() => {
            triggerFeedback('selection');
            setFilterOpen(true);
          }}
          filterActive={period === 'custom'}
          filterLabel={period === 'custom' ? `Lọc theo ngày, đang chọn ${saleFilterTimeLabel(filter)}` : 'Lọc theo ngày'}
        />

        {/* Period Chips Filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodScroll}>
          {/* Khoảng ngày tự chọn hiện thành một nút đang bật ("30 ngày gần nhất", "07/10 – 13/10"); chạm để chọn lại */}
          {period === 'custom' ? (
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                setFilterOpen(true);
              }}
              style={({ pressed }) => [styles.periodPill, styles.periodPillActive, pressed && { opacity: 0.8 }]}
              accessibilityRole="button"
              accessibilityLabel={`Khoảng ngày đang lọc: ${saleFilterTimeLabel(filter)}. Bấm để đổi`}
            >
              <Feather name="calendar" size={14} color={colors.brandInk} />
              <T w="bold" size={13} color={colors.brandInk} numberOfLines={1}>
                {customChipLabel}
              </T>
            </Pressable>
          ) : null}
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
        // Khung chờ cùng lề với danh sách thật: thẻ tổng rồi các dòng đơn
        <RowListSkeleton header rows={5} style={styles.scrollContent} />
      ) : error && !sales.length ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
          <EmptyState icon="alert-triangle" title="Không tải được đơn hàng" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={pullToRefresh} />
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
                {section.day ? (
                  <T w="bold" size={12.5} color={colors.muted}>
                    {/* Số đơn còn hiệu lực khớp với doanh thu; đơn huỷ trong ngày (vẫn có dòng trong danh sách) ghi riêng */}
                    {section.day.confirmedOrderCount} đơn
                    {section.day.voidedOrderCount ? ` · ${section.day.voidedOrderCount} huỷ` : ''} · {vnd(section.day.confirmedSalesVnd)}
                  </T>
                ) : null}
                <Feather name={collapsedGroups[section.key] ? 'chevron-down' : 'chevron-up'} size={15} color={colors.muted} />
              </Row>
            </Pressable>
          )}
          renderSectionFooter={() => <View style={{ height: 14 }} />}
          onEndReached={() => void loadMore()}
          onEndReachedThreshold={0.5}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pullToRefresh} tintColor={colors.brand} colors={[colors.brand]} />}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator color={colors.brand} style={{ marginVertical: 12 }} />
            ) : error ? (
              // Làm mới thất bại khi đã có đơn: giữ danh sách và chỗ đang cuộn, báo lỗi ở cuối
              <T size={12.5} color={colors.muted} style={{ textAlign: 'center', marginVertical: 8 }}>
                Không làm mới được: {error}
              </T>
            ) : moreError ? (
              <View style={{ marginTop: 4 }}>
                <T size={12.5} color={colors.muted} style={{ textAlign: 'center', marginBottom: 8 }}>
                  Không tải thêm được đơn: {moreError}
                </T>
                <Button title="Tải thêm" variant="outline" onPress={() => void loadMore()} />
              </View>
            ) : !hasMore && sales.length > 0 ? (
              <T size={12} color={colors.faint} style={{ textAlign: 'center', marginVertical: 8 }}>
                Đã hiện hết {count} đơn
              </T>
            ) : null
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            isSaleFilterActive(filter) ? (
              // Có đơn nhưng bộ lọc (và từ khoá, nếu có) loại hết: cho gỡ lọc ngay tại chỗ
              <View>
                <EmptyState
                  icon="filter"
                  title="Không có đơn phù hợp"
                  hint={`Không có đơn nào trong khoảng đang lọc (${saleFilterTimeLabel(filter)}${q ? ', kèm từ khoá' : ''}).`}
                />
                <Button title="Xoá bộ lọc" variant="outline" onPress={clearFilters} />
              </View>
            ) : (
              <EmptyState
                icon={q ? 'search' : 'file-text'}
                title={q ? 'Không tìm thấy đơn' : 'Chưa có đơn hàng'}
                hint={q ? 'Thử tìm tên khách hoặc mã đơn khác' : 'Tạo đơn mới trong tab Bán hàng'}
              />
            )
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
      <DateRangeSheet
        visible={filterOpen}
        from={filter.from}
        to={filter.to}
        onClose={() => setFilterOpen(false)}
        onApply={(from, to) => {
          triggerFeedback('selection');
          setFilter({ time: 'custom', from, to });
          setFilterOpen(false);
        }}
      />
    </View>
  );
}

const OrderCard = React.memo(function OrderCard({ sale }: { sale: SaleView }) {
  const voided = sale.saleStatus === 'VOIDED';
  const tonePair = tilePalette[hashIndex(sale.customerName || `Customer-${sale.id}`, tilePalette.length)];

  const itemsSummary = sale.items
    .map((item) => `${item.productName}${item.quantity > 1 ? ` x${item.quantity}` : ''}`)
    .join(', ');

  // Ngày ghi đủ ngày tháng năm ngay trên từng đơn, không dùng "hôm qua", "3 ngày trước"
  const timeStr = hhmm(new Date(sale.soldAt));
  const dateStr = ddmmyyyy(new Date(sale.soldAt));

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
    paddingHorizontal: TAB_HEADER_SIDE,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  // Như `heroRow` của Bán hàng
  heroRow: {
    paddingTop: 2,
    paddingBottom: 4,
    alignItems: 'center',
  },
  periodScroll: {
    gap: 6,
    paddingRight: TAB_HEADER_SIDE,
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
