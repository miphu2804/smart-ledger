import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { Badge, Card, Dialog, ListRow, Row, Screen, T, Tile } from '../../src/components/ui';
import { vnd } from '../../src/lib/format';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

export default function More() {
  const app = useApp();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const debtLeft = app.debts.reduce((a, d) => a + d.total - d.paid, 0);

  return (
    <Screen>
      <T w="extrabold" size={26} style={{ paddingTop: 10, paddingBottom: 14 }}>
        Khác
      </T>

      <Card onPress={() => router.push('/profile')} accessibilityLabel="Xem thông tin tiệm">
        <Row>
          <Tile
            name={app.store.name}
            text={app.store.name.split(' ').slice(-1)[0][0]}
            size={46}
            palette={[colors.primary, colors.white]}
          />
          <View style={{ flex: 1 }}>
            <T w="bold" size={16} numberOfLines={1}>
              {app.store.name}
            </T>
            <T size={12} color={colors.faint}>
              {app.user.name} · {app.user.phone || app.user.email}
            </T>
          </View>
          <Feather name="chevron-right" size={19} color={colors.faint} />
        </Row>
      </Card>

      <Card style={{ marginTop: 12, paddingVertical: 2 }}>
        <ListRow
          icon="bar-chart-2"
          title="Phân tích bán hàng"
          subtitle="Doanh thu, chi phí và bán chạy"
          onPress={() => router.push('/analytics')}
        />
        <ListRow
          icon="package"
          title="Hàng hoá & Kho hàng"
          subtitle={`${app.products.length} sản phẩm`}
          onPress={() => router.push('/products')}
        />
        <ListRow icon="credit-card" title="Chi phí" subtitle="Các khoản chi đã ghi" onPress={() => router.push('/expenses')} />
        <ListRow
          icon="book-open"
          iconColor={colors.gold}
          iconBg={colors.goldSoft}
          title="Quản lý nợ"
          onPress={() => router.push('/debts')}
          right={debtLeft ? <Badge text={vnd(debtLeft)} color={colors.gold} bg={colors.goldSoft} /> : null}
          last
        />
      </Card>

      <Card style={{ marginTop: 12, paddingVertical: 2 }}>
        <ListRow
          icon="log-out"
          iconColor={colors.red}
          iconBg={colors.redSoft}
          title="Đăng xuất"
          onPress={() => setConfirmLogout(true)}
          last
        />
      </Card>

      <T size={12} color={colors.faint} style={{ textAlign: 'center', marginTop: 16, marginBottom: 60 }}>
        Sổ Nghe Lời
      </T>

      <Dialog
        visible={confirmLogout}
        icon="log-out"
        danger
        title="Đăng xuất?"
        message="Bạn sẽ cần nhập số điện thoại và mã OTP để đăng nhập lại."
        confirm="Đăng xuất"
        onCancel={() => setConfirmLogout(false)}
        onConfirm={() => {
          setConfirmLogout(false);
          void app.logout(); // đăng xuất Firebase + xoá phiên
          router.replace('/(auth)/welcome');
        }}
      />
    </Screen>
  );
}
