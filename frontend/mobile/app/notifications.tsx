import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Card, Chips, EmptyState, Header, Row, Screen, T } from '../src/components/ui';
import { hhmm, relDay } from '../src/lib/format';
import { buildNotifications, NOTIF_CATEGORIES, Notif, NotifCategory, notifCategoryMeta } from '../src/lib/notifications';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

type Filter = 'all' | 'unread' | NotifCategory;

export default function Notifications() {
  const app = useApp();
  const [filter, setFilter] = useState<Filter>('all');

  const all = useMemo(
    () => buildNotifications({ invoices: app.invoices, products: app.products, expenses: app.expenses, debts: app.debts }),
    [app.invoices, app.products, app.expenses, app.debts],
  );
  const read = useMemo(() => new Set(app.readNotifs), [app.readNotifs]);
  const unread = all.filter((n) => !read.has(n.id));

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

  const count = (c: NotifCategory) => all.filter((n) => n.category === c && !read.has(n.id)).length;
  const withCount = (label: string, n: number) => (n ? `${label} · ${n}` : label);

  const open = (n: Notif) => {
    app.markNotifsRead([n.id]);
    if (n.href) router.push(n.href);
  };

  return (
    <Screen>
      <Header
        title="Thông báo"
        subtitle={unread.length ? `${unread.length} thông báo chưa đọc` : 'Bạn đã đọc hết thông báo'}
        right={
          unread.length ? (
            <Pressable onPress={() => app.markNotifsRead(unread.map((n) => n.id))} hitSlop={8} style={styles.readAll}>
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
          { key: 'unread', label: withCount('Chưa đọc', unread.length) },
          ...NOTIF_CATEGORIES.map((c) => ({ key: c, label: withCount(notifCategoryMeta[c].label, count(c)) })),
        ]}
      />

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
                  unread={!read.has(n.id)}
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
          hint="Thông báo mới về đơn hàng, kho, công nợ… sẽ hiện ở đây"
        />
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
          <T size={11} color={colors.faint}>
            {hhmm(new Date(n.at))}
          </T>
        </Row>
        <T size={12.5} color={colors.muted} style={{ marginTop: 2, lineHeight: 18 }} numberOfLines={2}>
          {n.body}
        </T>
        {showCategory || n.urgent ? (
          <Row gap={6} style={{ marginTop: 6 }}>
            {showCategory ? <Badge text={meta.label} color={meta.color} bg={meta.bg} icon={meta.icon} /> : null}
            {n.urgent ? <Badge text="Cần xử lý" color={colors.red} bg={colors.redSoft} icon="alert-circle" /> : null}
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
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
