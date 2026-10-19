import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Badge, Button, Card, EmptyState, Header, Row, Screen, T } from '../src/components/ui';
import { errorMessage } from '../src/lib/errors';
import { ddmm, ddmmyyyy, hhmm, relDay } from '../src/lib/format';
import {
  fromCoreNotification,
  isNotifUnread,
  mergeNotifications,
  NOTIF_CATEGORIES,
  Notif,
  NotifCategory,
  notifCategoryMeta,
  totalUnread,
} from '../src/lib/notifications';
import { useLocalNotifications } from '../src/lib/useLocalNotifications';
import { useCoreNotifications } from '../src/lib/useCoreNotifications';
import { useApp } from '../src/store/AppStore';
import { triggerFeedback } from '../src/lib/feedback';
import { colors, radius, shadow } from '../src/theme';

type Filter = 'all' | 'unread' | NotifCategory;

/**
 * Thông báo gồm hai nguồn: inbox Core (kho hàng, đơn bị huỷ, tình trạng tiệm; phân trang thật, bấm "Tải thêm" để lấy trang kế)
 * và các thông báo tính trên máy (đơn mới, công nợ, thu chi). Bộ lọc áp lên những thông báo đã tải.
 *
 * Mở màn là coi như đã xem: tải xong thì đánh dấu đọc hết (cả trên máy lẫn mọi trang ở Core) nên chuông ở Tổng quan hết số,
 * không cần bấm "Đọc hết". Những thông báo chưa đọc lúc vào vẫn được tô là "mới" suốt lượt xem này để biết cái nào mới tới.
 */
export default function Notifications() {
  const app = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  // Thông báo trên máy (đơn mới, công nợ, thu chi) dựng từ vài lần gọi nhỏ, dùng chung với Tổng quan để chuông và màn này đếm như nhau
  const localData = useLocalNotifications();
  const { loading, error, reload } = localData;
  const core = useCoreNotifications();

  // `loading` chỉ true ở lần tải đầu nên các lần tải lại khi focus giữ danh sách cũ, không nháy.
  const dataReady = !loading && !error;
  const ready = dataReady && !core.loading;

  // Chưa tải xong thì không dựng thông báo (tránh hiện "Chưa có thông báo" sai khi dữ liệu còn rỗng).
  const local = dataReady ? localData.notifications : [];
  const coreNotifs = useMemo(() => core.items.map(fromCoreNotification), [core.items]);
  const all = useMemo(() => mergeNotifications(local, coreNotifs, core.hasMore), [local, coreNotifs, core.hasMore]);
  const read = useMemo(() => new Set(app.readNotifs), [app.readNotifs]);
  // Đếm thông báo trên máy từ danh sách đầy đủ `local`, không phải `all` đã bị ẩn bớt khi Core còn trang chưa tải.
  const unreadTotal = totalUnread(local, read, core.unreadCount);

  // Những thông báo chưa đọc lúc thấy ở lượt xem này: vẫn tô là "mới" sau khi đã tự đánh dấu đọc.
  const [fresh, setFresh] = useState<ReadonlySet<string>>(() => new Set());
  const isNew = (n: Notif) => fresh.has(n.id) || isNotifUnread(n, read);
  const newOnes = all.filter(isNew);

  // Tự đánh dấu đọc hết khi đã tải xong, và mỗi khi có thông báo chưa đọc mới tới trong lúc đang xem. Core đánh dấu từng lô rồi
  // tải lại, nên không gọi chồng khi lượt trước chưa xong; lỗi thì báo một lần, lần sau vào màn sẽ thử lại.
  const markingCore = useRef(false);
  const unreadKey = all.filter((n) => isNotifUnread(n, read)).map((n) => n.id).join('|');
  useEffect(() => {
    if (!ready || unreadTotal === 0) return;
    const localIds = local.filter((n) => !read.has(n.id)).map((n) => n.id);
    const seen = all.filter((n) => isNotifUnread(n, read)).map((n) => n.id);
    setFresh((prev) => {
      const next = new Set(prev);
      for (const id of [...localIds, ...seen]) next.add(id);
      return next;
    });
    if (localIds.length) app.markNotifsRead(localIds);
    if (core.unreadCount > 0 && !markingCore.current) {
      markingCore.current = true;
      core
        .markAllRead()
        .catch((e) => toast(errorMessage(e), 'err'))
        .finally(() => {
          markingCore.current = false;
        });
    }
    // Chỉ chạy lại khi tải xong hoặc có thông báo chưa đọc khác đi; `local`, `all`, `app`, `core` đổi theo mỗi lần vẽ.
  }, [ready, unreadKey, unreadTotal]);

  const shown = filter === 'all' ? all : filter === 'unread' ? newOnes : all.filter((n) => n.category === filter);

  // Gom theo ngày: Hôm nay / Hôm qua / 3 ngày trước…
  const groups = useMemo(() => {
    const out: { day: string; date: string | null; items: Notif[] }[] = [];
    for (const n of shown) {
      const d = new Date(n.at);
      const day = relDay(d);
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(n);
      // relDay đã là ngày (dd/mm) khi quá 7 ngày, khi đó không ghi lặp lại.
      else out.push({ day, date: day === ddmm(d) ? null : ddmmyyyy(d), items: [n] });
    }
    return out;
  }, [shown]);

  const count = (c: NotifCategory) => newOnes.filter((n) => n.category === c).length;

  const open = (n: Notif) => {
    // Thường đã được đánh dấu đọc lúc vào màn; còn chưa đọc (lượt tự đánh dấu lỗi, thông báo vừa tới) thì đánh dấu khi mở
    if (isNotifUnread(n, read)) {
      if (n.coreId != null) core.markRead([n.coreId]).catch((e) => toast(errorMessage(e), 'err'));
      else app.markNotifsRead([n.id]);
    }
    triggerFeedback('selection');
    if (n.href) router.push(n.href);
  };

  return (
    <Screen onEndReached={core.hasMore && !core.moreError ? core.loadMore : undefined}>
      <Header
        title="Thông báo"
        subtitle={!ready ? undefined : newOnes.length ? `${newOnes.length} thông báo mới` : 'Không có thông báo mới'}
      />

      <FilterPills
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'all', label: 'Tất cả', icon: 'grid' },
          { key: 'unread', label: 'Mới', icon: 'bell', count: newOnes.length },
          ...NOTIF_CATEGORIES.filter((c) => app.settings.stockAlerts || c !== 'stock').map((c) => ({
            key: c,
            label: notifCategoryMeta[c].label,
            icon: notifCategoryMeta[c].icon,
            count: count(c),
          })),
        ]}
      />

      {error ? (
        <View>
          <EmptyState icon="alert-triangle" title="Không tải được thông báo" hint={error} />
          <Button title="Thử lại" variant="outline" onPress={reload} />
        </View>
      ) : !ready ? (
        <View style={{ paddingTop: 60, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
          {core.error ? (
            <Pressable onPress={core.refresh} accessibilityRole="button" style={styles.coreError}>
              <Feather name="alert-triangle" size={15} color={colors.red} />
              <T size={12.5} color={colors.red} style={{ flex: 1 }}>
                Không tải được thông báo từ máy chủ: {core.error} Chạm để thử lại.
              </T>
            </Pressable>
          ) : null}

          {groups.length ? (
            groups.map((g) => (
              <View key={g.day}>
                <T w="bold" size={13} color={colors.muted} style={{ marginTop: 18, marginBottom: 8 }}>
                  {g.day}
                  {g.date ? ` · ${g.date}` : ''}
                </T>
                {/* Card giữ bóng (doc: thẻ chính có bóng mềm + viền); lớp trong cắt nút vuốt theo góc bo. */}
                <Card style={{ padding: 0, ...shadow(2) }}>
                  <View style={styles.clip}>
                    {g.items.map((n, i) => (
                      <NotifRow
                        key={n.id}
                        n={n}
                        fresh={isNew(n)}
                        showCategory={filter === 'all' || filter === 'unread'}
                        last={i === g.items.length - 1}
                        onPress={() => open(n)}
                      />
                    ))}
                  </View>
                </Card>
              </View>
            ))
          ) : (
            <EmptyState
              icon="bell-off"
              title={filter === 'unread' ? 'Không có thông báo mới' : 'Chưa có thông báo'}
              hint={
                core.hasMore
                  ? 'Chưa thấy thông báo nào ở các trang đã tải. Bấm "Tải thêm" để xem tiếp.'
                  : 'Thông báo mới về đơn hàng, kho, công nợ… sẽ hiện ở đây'
              }
            />
          )}

          {core.hasMore ? (
            <View style={{ marginTop: 18, marginBottom: 8 }}>
              {core.moreError ? (
                <>
                  <T size={12.5} color={colors.red} style={{ textAlign: 'center', marginBottom: 8 }}>
                    {core.moreError}
                  </T>
                  <Button title="Thử lại" icon="refresh-cw" variant="outline" onPress={core.loadMore} />
                </>
              ) : (
                <ActivityIndicator color={colors.primary} />
              )}
            </View>
          ) : coreNotifs.length ? (
            <T size={12} color={colors.faint} style={{ textAlign: 'center', marginTop: 18, marginBottom: 8 }}>
              Đã hiện hết thông báo
            </T>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** Giờ cho thông báo hôm nay, ngày + giờ cho thông báo cũ hơn để biết chính xác xảy ra hôm nào. */
function timeLabel(at: number | string | Date) {
  const d = new Date(at);
  return relDay(d) === 'Hôm nay' ? hhmm(d) : `${ddmm(d)} · ${hhmm(d)}`;
}

/** Pill bộ lọc cùng khuôn với bộ lọc kỳ ở màn Đơn hàng (cao 32, nền tím khi chọn). */
function FilterPills<K extends string>({
  options,
  value,
  onChange,
}: {
  options: { key: K; label: string; icon: React.ComponentProps<typeof Feather>['name']; count?: number }[];
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.pills}>
      {options.map((o) => {
        const active = o.key === value;
        const ink = active ? colors.brandInk : colors.inkSecondary;
        return (
          <View key={o.key}>
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                onChange(o.key);
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={o.count ? `${o.label}, ${o.count} mới` : o.label}
              style={({ pressed }) => [styles.pill, active && styles.pillActive, pressed && { opacity: 0.8 }]}
            >
              <Feather name={o.icon} size={14} color={ink} />
              <T w={active ? 'bold' : 'medium'} size={13} color={ink} numberOfLines={1}>
                {o.label}
              </T>
            </Pressable>
            {o.count ? (
              // Số chưa đọc nằm đè góc pill (như mail) nên pill không phình rộng khi có số.
              <View pointerEvents="none" style={styles.badge}>
                <T w="bold" size={10.5} color={colors.white}>
                  {o.count > 99 ? '99+' : o.count}
                </T>
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

/** `fresh`: thông báo mới tới (chưa đọc lúc vào màn) — chữ đậm và chấm màu, dù đã được tự đánh dấu đọc. */
function NotifRow({
  n,
  fresh,
  showCategory,
  last,
  onPress,
}: {
  n: Notif;
  fresh: boolean;
  showCategory: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const meta = notifCategoryMeta[n.category];
  const tint = n.urgent ? colors.red : meta.color;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={fresh ? `Mới: ${n.title}` : n.title}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowBorder,
        pressed && { opacity: 0.75 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: n.urgent ? colors.redSoft : meta.bg }]}>
        <Feather name={n.icon ?? meta.icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Row gap={6}>
          <T w={fresh ? 'bold' : 'semibold'} size={14} style={{ flex: 1 }} numberOfLines={1}>
            {n.title}
          </T>
          <T size={12} color={colors.faint}>
            {timeLabel(n.at)}
          </T>
        </Row>
        <T size={12.5} color={colors.muted} style={{ marginTop: 2, lineHeight: 18 }} numberOfLines={2}>
          {n.body}
        </T>
        {showCategory || n.urgent || n.resolved ? (
          <Row gap={6} style={{ marginTop: 6 }}>
            {showCategory ? <Badge text={meta.label} color={meta.color} bg={meta.bg} icon={meta.icon} /> : null}
            {n.urgent ? <Badge text="Cần xử lý" color={colors.red} bg={colors.redSoft} icon="alert-circle" /> : null}
            {n.resolved ? <Badge text="Đã xử lý" color={colors.green} bg={colors.greenSoft} icon="check-circle" /> : null}
          </Row>
        ) : null}
      </View>
      {fresh ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  clip: { borderRadius: radius.md - 1, overflow: 'hidden' },
  // paddingTop chừa chỗ cho badge nhô lên khỏi pill, vì ScrollView ngang cắt nội dung tràn ra ngoài.
  pills: { gap: 6, paddingRight: 16, paddingTop: 7 },
  badge: {
    position: 'absolute',
    top: -7,
    right: -4,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.data.expense,
  },
  pill: {
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
  pillActive: { backgroundColor: colors.brand, borderColor: colors.brand },

  coreError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.redSoft,
  },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
