import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Badge, Dialog, Row, Screen, T } from '../../src/components/ui';
import { vnd } from '../../src/lib/format';
import { useApp } from '../../src/store/AppStore';
import { colors, shadow } from '../../src/theme';

const managementIcons = {
  reports: require('../../assets/tab4-management/reports.png'),
  products: require('../../assets/tab4-management/products.png'),
  expenses: require('../../assets/tab4-management/expenses.png'),
  debts: require('../../assets/tab4-management/debts.png'),
  storeInfo: require('../../assets/tab4-management/store-info.png'),
  logout: require('../../assets/tab4-management/logout.png'),
};

type ManagementRowProps = {
  image?: ImageSourcePropType;
  icon?: React.ComponentProps<typeof Feather>['name'];
  iconTone?: 'brand' | 'danger';
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  last?: boolean;
  onPress: () => void;
};

function ManagementRow({ image, icon, iconTone = 'brand', title, subtitle, right, last, onPress }: ManagementRowProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, !last && styles.rowBorder, pressed && styles.rowPressed]}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={[styles.rowIcon, icon ? (iconTone === 'danger' ? styles.rowIconDanger : styles.rowIconBrand) : null]}>
        {image ? <Image source={image} style={styles.rowIconImage} resizeMode="contain" /> : null}
        {icon ? <Feather name={icon} size={18} color={iconTone === 'danger' ? colors.red : colors.brand} /> : null}
      </View>
      <View style={styles.rowText}>
        <T w="bold" size={14.5} color={colors.ink} numberOfLines={1}>
          {title}
        </T>
        {subtitle ? (
          <T size={12} color={colors.muted} numberOfLines={1} style={styles.rowSubtitle}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
      <Feather name="chevron-right" size={16} color={colors.disabled} />
    </Pressable>
  );
}

export default function More() {
  const app = useApp();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const debtLeft = app.debts.reduce((a, d) => a + d.total - d.paid, 0);
  const contact = app.user.phone || app.user.email;

  return (
    <Screen bg={colors.bg} padded={false} contentStyle={styles.content}>
      <View style={styles.header}>
        <T w="extrabold" size={24} color={colors.ink}>
          Quản lý
        </T>
        <T w="medium" size={13} color={colors.muted} style={styles.headerSubtitle}>
          Quản lý cửa hàng của bạn
        </T>
      </View>

      <Pressable
        onPress={() => router.push('/profile')}
        style={({ pressed }) => [styles.storeCard, pressed && styles.cardPressed]}
        accessibilityRole="button"
        accessibilityLabel="Xem thông tin cửa hàng"
      >
        <Row gap={12} style={{ alignItems: 'center' }}>
          <View style={styles.avatar}>
            <T w="extrabold" size={18} color={colors.white}>
              {app.store.name.trim().charAt(0).toUpperCase() || 'S'}
            </T>
          </View>
          <View style={{ flex: 1 }}>
            <T w="extrabold" size={15.5} color={colors.ink} numberOfLines={1}>
              {app.store.name}
            </T>
            <T size={12.5} color={colors.muted} numberOfLines={1} style={{ marginTop: 2 }}>
              {app.user.name} · {contact}
            </T>
          </View>
          <Feather name="chevron-right" size={18} color={colors.disabled} />
        </Row>
      </Pressable>

      <T w="bold" size={12.5} color={colors.muted} style={styles.sectionTitle}>
        QUẢN LÝ KINH DOANH
      </T>
      <View style={styles.groupCard}>
        <ManagementRow
          image={managementIcons.reports}
          title="Báo cáo"
          subtitle="Doanh thu, chi phí, bán chạy"
          onPress={() => router.push('/analytics')}
        />
        <ManagementRow
          image={managementIcons.products}
          title="Hàng hoá"
          subtitle={`${app.products.length} mặt hàng`}
          onPress={() => router.push('/products')}
        />
        <ManagementRow
          image={managementIcons.expenses}
          title="Chi phí"
          subtitle="Các khoản chi đã ghi"
          onPress={() => router.push('/expenses')}
        />
        <ManagementRow
          image={managementIcons.debts}
          title="Công nợ"
          right={debtLeft ? <Badge text={vnd(debtLeft)} color={colors.data.debt} bg={colors.data.debtSoft} /> : null}
          onPress={() => router.push('/debts')}
          last
        />
      </View>

      <T w="bold" size={12.5} color={colors.muted} style={styles.sectionTitle}>
        TÀI KHOẢN & ỨNG DỤNG
      </T>
      <View style={styles.groupCard}>
        <ManagementRow
          icon="settings"
          title="Cài đặt"
          subtitle="Âm thanh, thông báo, in hoá đơn"
          onPress={() => router.push('/settings')}
        />
        <ManagementRow
          image={managementIcons.logout}
          iconTone="danger"
          title="Đăng xuất"
          subtitle="Thoát khỏi tài khoản hiện tại"
          onPress={() => setConfirmLogout(true)}
          last
        />
      </View>

      <View style={styles.footerMark}>
        <T w="bold" size={12.5} color={colors.muted}>
          Sổ Nghe Lời
        </T>
        <T size={11.5} color={colors.faint} style={{ marginTop: 2 }}>
          Phiên bản 1.0.0
        </T>
      </View>

      <Dialog
        visible={confirmLogout}
        icon="log-out"
        danger
        title="Đăng xuất?"
        message="Bạn sẽ cần đăng nhập lại để tiếp tục quản lý sổ."
        confirm="Đăng xuất"
        cancel="Huỷ"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void app.logout();
          router.replace('/(auth)/welcome');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    position: 'relative',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  headerSubtitle: {
    marginTop: 4,
  },
  storeCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    ...shadow(1),
  },
  cardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.99 }],
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.brandSoft,
  },
  sectionTitle: {
    marginTop: 18,
    marginBottom: 8,
    paddingLeft: 4,
    letterSpacing: 0.4,
  },
  groupCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    ...shadow(1),
  },
  row: {
    minHeight: 58,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
  },
  rowPressed: {
    opacity: 0.72,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconBrand: {
    backgroundColor: colors.brandSoft,
  },
  rowIconDanger: {
    backgroundColor: colors.redSoft,
  },
  rowIconImage: {
    width: 38,
    height: 38,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  rowSubtitle: {
    marginTop: 2,
  },
  footerMark: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 8,
  },
});
