import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Badge, Button, Card, Chips, EmptyState, Header, Row, Screen, T } from '../src/components/ui';
import { errorMessage } from '../src/lib/errors';
import { hhmm, relDay } from '../src/lib/format';
import {
  buildNotifications,
  fromCoreNotification,
  isNotifUnread,
  mergeNotifications,
  NOTIF_CATEGORIES,
  Notif,
  NotifCategory,
  notifCategoryMeta,
  totalUnread,
} from '../src/lib/notifications';
import { useCoreData } from '../src/lib/useCoreData';
import { useCoreNotifications } from '../src/lib/useCoreNotifications';
import { useApp } from '../src/store/AppStore';
import { triggerFeedback } from '../src/lib/feedback';
import { colors } from '../src/theme';

type Filter = 'all' | 'unread' | NotifCategory;

/**
 * Thông báo gồm hai nguồn: inbox Core (kho hàng, đơn bị huỷ, tình trạng tiệm; phân trang thật, bấm "Tải thêm" để lấy trang kế)
 * và các thông báo tính trên máy (đơn mới, công nợ, thu chi). Bộ lọc áp lên những thông báo đã tải.
 */
export default function Notifications() {
  const app = useApp();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('all');
  const { invoices, products, debts, expenses, loading, error, reload } = useCoreData({
    invoices: true,
    products: true,
    debts: true,
    expenses: true,
  });
  const core = useCoreNotifications();

  // `loading` chỉ true ở lần tải đầu (xem useCoreData) nên các lần tải lại khi focus giữ danh sách cũ, không nháy.
  const dataReady = !loading && !error;
  const ready = dataReady && !core.loading;

  // Chưa tải xong thì không dựng thông báo (tránh hiện "Chưa có thông báo" sai khi dữ liệu còn rỗng).
  const local = useMemo(
    () => (dataReady ? buildNotifications({ invoices, products, expenses, debts }) : []),
    [dataReady, invoices, products, expenses, debts],
  );
  const coreNotifs = useMemo(() => core.items.map(fromCoreNotification), [core.items]);
  const all = useMemo(() => mergeNotifications(local, coreNotifs, core.hasMore), [local, coreNotifs, core.hasMore]);
  const read = useMemo(() => new Set(app.readNotifs), [app.readNotifs]);
  const unread = all.filter((n) => isNotifUnread(n, read));
  // Đếm thông báo trên máy từ danh sách đầy đủ `local`, không phải `all` đã bị ẩn bớt khi Core còn trang chưa tải.
  const unreadTotal = totalUnread(local, read, core.unreadCount);

  const shown = filter === 'all' ? all : filter === 'unread' ? unread : all.filter((n) => n.category === filter);

  // Gom theo ngày: Hôm nay / Hôm qua / 3 ngày trước…
  const groups = useMemo(() => {
    const out: { day: string; items: Notif[] }[] = [];
    for (const n of shown) {
      const day = relDay(new Date(n.at));
      const last = out[out.length - 1];
      if (last?.day === day) last.items.push(n);
      else out.push({ day, items: [n] });
    }
    return out;
  }, [shown]);

  const count = (c: NotifCategory) => unread.filter((n) => n.category === c).length;
  const withCount = (label: string, n: number) => (n ? `${label} · ${n}` : label);

  const open = (n: Notif) => {
    if (n.coreId != null) core.markRead([n.coreId]).catch((e) => toast(errorMessage(e), 'err'));
    else app.markNotifsRead([n.id]);
    triggerFeedback('selection');
    if (n.href) router.push(n.href);
  };

  const readAll = () => {
    app.markNotifsRead(local.filter((n) => !read.has(n.id)).map((n) => n.id));
    triggerFeedback('selection');
    if (core.unreadCount > 0) core.markAllRead().catch((e) => toast(errorMessage(e), 'err'));
  };

  return (
    <Screen>
      <Header
        title="Thông báo"
        subtitle={!ready ? undefined : unreadTotal ? `${unreadTotal} thông báo chưa đọc` : 'Không có thông báo mới'}
        right={
          ready && unreadTotal ? (
            <Pressable
              onPress={readAll}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Đọc hết thông báo"
              style={({ pressed }) => [styles.readAll, pressed && { opacity: 0.75 }]}
            >
              <Feather name="check-circle" size={14} color={colors.primary} />
              <T w="bold" size={12.5} color={colors.primary}>
                Đọc hết
              </T>
            </Pressable>
          ) : null
        }
      />

      <Chips<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'all', label: 'Tất cả' },
          { key: 'unread', label: withCount('Chưa đọc', unreadTotal) },
          ...NOTIF_CATEGORIES.map((c) => ({ key: c, label: withCount(notifCategoryMeta[c].label, count(c)) })),
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
                </T>
                <Card style={{ paddingVertical: 4, paddingHorizontal: 0 }}>
                  {g.items.map((n, i) => (
                    <NotifRow
                      key={n.id}
                      n={n}
                      unread={isNotifUnread(n, read)}
                      showCategory={filter === 'all' || filter === 'unread'}
                      last={i === g.items.length - 1}
                      onPress={() => open(n)}
                    />
                  ))}
                </Card>
              </View>
            ))
          ) : (
            <EmptyState
              icon="bell-off"
              title={filter === 'unread' ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo'}
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
                <T size={12.5} color={colors.red} style={{ textAlign: 'center', marginBottom: 8 }}>
                  {core.moreError}
                </T>
              ) : null}
              <Button
                title={core.moreError ? 'Thử lại' : 'Tải thêm'}
                icon="chevron-down"
                variant="outline"
                loading={core.loadingMore}
                onPress={core.loadMore}
              />
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

function NotifRow({
  n,
  unread,
  showCategory,
  last,
  onPress,
}: {
  n: Notif;
  unread: boolean;
  showCategory: boolean;
  last: boolean;
  onPress: () => void;
}) {
  const meta = notifCategoryMeta[n.category];
  const tint = n.urgent ? colors.red : meta.color;
  return (
    <Pressable
      onPress={onPress}
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
          <T w={unread ? 'bold' : 'semibold'} size={14} style={{ flex: 1 }} numberOfLines={1}>
            {n.title}
          </T>
          <T size={12} color={colors.faint}>
            {hhmm(new Date(n.at))}
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
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  readAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primarySoft,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
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
