import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { Invoice } from '../data/types';
import { hhmm, relDay, vnd } from '../lib/format';
import { invoiceTotal, sourceLabel } from '../lib/stats';
import { colors, shadow } from '../theme';
import { Badge, Row, T } from './ui';

export function InvoiceCard({ inv }: { inv: Invoice }) {
  const icon = inv.source === 'voice' ? 'mic' : inv.source === 'pos' ? 'shopping-cart' : 'edit-3';
  const cancelled = inv.status === 'cancelled';
  return (
    <Pressable
      onPress={() => router.push(`/invoice/${inv.id}`)}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }, cancelled && { opacity: 0.55 }]}
    >
      <Row>
        <View style={[styles.icon, inv.source === 'pos' && { backgroundColor: colors.goldSoft }]}>
          <Feather name={icon} size={17} color={inv.source === 'pos' ? colors.gold : colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Row gap={6}>
            <T w="bold" size={14} numberOfLines={1} style={{ flexShrink: 1 }}>
              {inv.customer}
            </T>
            <Badge
              text={sourceLabel[inv.source]}
              color={inv.source === 'pos' ? colors.gold : colors.primary}
              bg={inv.source === 'pos' ? colors.goldSoft : colors.primarySoft}
            />
            {inv.status === 'debt' ? <Badge text="Ghi nợ" color={colors.red} bg={colors.redSoft} /> : null}
            {cancelled ? <Badge text="Đã huỷ" color={colors.muted} bg="#EEF1F5" /> : null}
          </Row>
          <T size={11.5} color={colors.faint} numberOfLines={1} style={{ marginTop: 2 }}>
            {inv.items.map((i) => `${i.name} x${i.qty}`).join(', ')}
          </T>
        </View>
        <Feather name="chevron-right" size={18} color={colors.disabled} />
      </Row>
      <View style={styles.sep} />
      <Row>
        <T size={11.5} color={colors.faint} style={{ flex: 1 }}>
          {inv.code} · {relDay(new Date(inv.createdAt))} · {hhmm(new Date(inv.createdAt))}
        </T>
        <T
          w="extrabold"
          size={16}
          color={cancelled ? colors.faint : colors.primary}
          style={cancelled && { textDecorationLine: 'line-through' }}
        >
          {vnd(invoiceTotal(inv))}
        </T>
      </Row>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14, marginBottom: 10, ...shadow(1) },
  icon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sep: { height: 1, backgroundColor: colors.border, marginVertical: 10, borderStyle: 'dashed' },
});
