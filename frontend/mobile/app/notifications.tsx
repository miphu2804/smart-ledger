import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '../src/components/brand';
import { SwipeRow } from '../src/components/SwipeRow';
import { Badge, Button, Card, Dialog, EmptyState, Header, Row, Screen, T } from '../src/components/ui';
import { isCategoryEnabled } from '../src/lib/appSettings';
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
 * Thông báo giữ chưa đọc tới khi người dùng mở nó, vuốt dòng đó sang trái ("Đã đọc") hoặc bấm nút đọc hết (✓✓) ở đầu màn.
 * Nút bánh răng mở menu: "Xoá toàn bộ thông báo" (Core chưa có API xoá nên chỉ ẩn trên máy này: đánh dấu đọc hết rồi ẩn mọi
 * thông báo tới trước lúc xoá, xem `clearNotifications` của AppStore) và "Cài đặt thông báo" (chọn nhóm muốn nhận).
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
  const unread = all.filter((n) => isNotifUnread(n, read));

  const shown = filter === 'all' ? all : filter === 'unread' ? unread : all.filter((n) => n.category === filter);

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

  const count = (c: NotifCategory) => unread.filter((n) => n.category === c).length;

  const markRead = (n: Notif) => {
    if (!isNotifUnread(n, read)) return;
    if (n.coreId != null) core.markRead([n.coreId]).catch((e) => toast(errorMessage(e), 'err'));
    else app.markNotifsRead([n.id]);
  };

  const open = (n: Notif) => {
    markRead(n);
    triggerFeedback('selection');
    if (n.href) router.push(n.href);
  };

  // Đọc hết: thông báo trên máy đánh dấu ngay; Core đánh dấu mọi trang (kể cả trang chưa tải) theo từng lô. Trả về false khi Core lỗi.
  const markAllRead = async () => {
    const localIds = local.filter((n) => !read.has(n.id)).map((n) => n.id);
    if (localIds.length) app.markNotifsRead(localIds);
    if (core.unreadCount === 0) return true;
    try {
      await core.markAllRead();
      return true;
    } catch (e) {
      toast(errorMessage(e), 'err');
      return false;
    }
  };

  const readAll = async () => {
    triggerFeedback('selection');
    if (await markAllRead()) toast('Đã đánh dấu đọc hết');
  };

  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Xoá toàn bộ: đọc hết trước (để số trên chuông khớp), rồi ẩn mọi thông báo đang có trên máy này
  const clearAll = async () => {
    setConfirmClear(false);
    if (!(await markAllRead())) return;
    // Mốc xoá không sớm hơn thông báo mới nhất đang có: giờ trên máy lệch với Core thì vẫn ẩn hết những gì đang thấy
    const newest = [...local, ...coreNotifs].reduce((max, n) => Math.max(max, Date.parse(n.at) || 0), Date.now());
    app.clearNotifications(new Date(newest).toISOString());
    setFilter('all');
    toast('Đã xoá toàn bộ thông báo');
  };

  return (
    <Screen onEndReached={core.hasMore && !core.moreError ? core.loadMore : undefined}>
      <Header
        title="Thông báo"
        subtitle={!ready ? undefined : unreadTotal ? `${unreadTotal} thông báo chưa đọc` : 'Không có thông báo mới'}
        right={
          <Row gap={8}>
            <Pressable
              onPress={readAll}
              disabled={!ready || unreadTotal === 0}
              accessibilityRole="button"
              accessibilityLabel="Đánh dấu đọc hết"
              aria-disabled={!ready || unreadTotal === 0}
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.75 }]}
            >
              <MaterialCommunityIcons
                name="check-all"
                size={22}
                color={ready && unreadTotal ? colors.brand : colors.disabled}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                triggerFeedback('selection');
                setMenuOpen(true);
              }}
              accessibilityRole="button"
              accessibilityLabel="Tuỳ chọn thông báo"
              style={({ pressed }) => [styles.headerBtn, pressed && { opacity: 0.75 }]}
            >
              <Feather name="settings" size={19} color={colors.ink} />
            </Pressable>
          </Row>
        }
      />

      <NotifMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onClear={() => {
          setMenuOpen(false);
          setConfirmClear(true);
        }}
        onSettings={() => {
          setMenuOpen(false);
          router.push('/notification-settings');
        }}
      />
      <Dialog
        visible={confirmClear}
        icon="trash-2"
        danger
        title="Xoá toàn bộ thông báo?"
        message="Các thông báo hiện có sẽ được đánh dấu đã đọc và ẩn khỏi máy này. Thông báo mới về sau vẫn hiện bình thường."
        confirm="Xoá"
        cancel="Huỷ"
        onConfirm={clearAll}
        onCancel={() => setConfirmClear(false)}
      />

      <FilterPills
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'all', label: 'Tất cả', icon: 'grid' },
          { key: 'unread', label: 'Chưa đọc', icon: 'bell', count: unreadTotal },
          // Nhóm đã tắt ở Cài đặt thông báo không có nút lọc (không còn thông báo nào để lọc)
          ...NOTIF_CATEGORIES.filter((c) => isCategoryEnabled(app.settings, c)).map((c) => ({
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
                        unread={isNotifUnread(n, read)}
                        showCategory={filter === 'all' || filter === 'unread'}
                        last={i === g.items.length - 1}
                        onPress={() => open(n)}
                        onMarkRead={() => {
                          triggerFeedback('selection');
                          markRead(n);
                        }}
                      />
                    ))}
                  </View>
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
              accessibilityLabel={o.count ? `${o.label}, ${o.count} chưa đọc` : o.label}
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

/** Menu của nút bánh răng: xoá toàn bộ thông báo (chữ đỏ) và mở Cài đặt thông báo; chạm ra ngoài để đóng. */
function NotifMenu({
  visible,
  onClose,
  onClear,
  onSettings,
}: {
  visible: boolean;
  onClose: () => void;
  onClear: () => void;
  onSettings: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Đóng menu" />
      <View style={[styles.menu, { top: insets.top + 64 }]} accessibilityViewIsModal>
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          style={({ pressed }) => [styles.menuItem, styles.menuItemBorder, pressed && { backgroundColor: colors.redSoft }]}
        >
          <Feather name="trash-2" size={18} color={colors.red} />
          <T w="semibold" size={15} color={colors.red}>
            Xoá toàn bộ thông báo
          </T>
        </Pressable>
        <Pressable
          onPress={onSettings}
          accessibilityRole="button"
          style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.primaryTint }]}
        >
          <Feather name="settings" size={18} color={colors.inkSecondary} />
          <T w="semibold" size={15} color={colors.ink}>
            Cài đặt thông báo
          </T>
        </Pressable>
      </View>
    </Modal>
  );
}

/** Thông báo chưa đọc: chữ đậm, chấm màu và vuốt sang trái để đánh dấu "Đã đọc". */
function NotifRow({
  n,
  unread,
  showCategory,
  last,
  onPress,
  onMarkRead,
}: {
  n: Notif;
  unread: boolean;
  showCategory: boolean;
  last: boolean;
  onPress: () => void;
  onMarkRead: () => void;
}) {
  const meta = notifCategoryMeta[n.category];
  const tint = n.urgent ? colors.red : meta.color;
  const body = (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={unread ? `Chưa đọc: ${n.title}` : n.title}
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
      {unread ? <View style={styles.dot} /> : null}
    </Pressable>
  );
  // Chỉ thông báo chưa đọc mới có nút "Đã đọc" khi vuốt; thông báo đã đọc không có gì để vuốt.
  return unread ? (
    <SwipeRow actionLabel="Đã đọc" actionIcon="check" onCommit={onMarkRead}>
      {body}
    </SwipeRow>
  ) : (
    body
  );
}

const styles = StyleSheet.create({
  clip: { borderRadius: radius.md - 1, overflow: 'hidden' },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menu: {
    position: 'absolute',
    right: 16,
    minWidth: 240,
    borderRadius: 18,
    backgroundColor: colors.card,
    overflow: 'hidden',
    ...shadow(3),
  },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 15 },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: colors.borderLight },
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
