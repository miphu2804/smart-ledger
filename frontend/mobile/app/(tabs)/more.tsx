import { router } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';
import { useToast } from '../../src/components/brand';
import { Badge, Button, Card, Dialog, IconBtn, ListRow, Row, Screen, T, Tile } from '../../src/components/ui';
import { vnd } from '../../src/lib/format';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

export default function More() {
  const app = useApp();
  const toast = useToast();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const debtLeft = app.debts.reduce((a, d) => a + d.total - d.paid, 0);

  return (
    <Screen>
      <T w="extrabold" size={26} style={{ paddingTop: 10, paddingBottom: 14 }}>
        Khác
      </T>

      <Card>
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
          <IconBtn
            name="edit-2"
            bg={colors.primarySoft}
            color={colors.primary}
          size={44}
            onPress={() => router.push('/profile')}
            label="Sửa"
          />
        </Row>
        <Button
          title="Chỉnh sửa thông tin"
          icon="edit-3"
          variant="soft"
          small
          onPress={() => router.push('/profile')}
          style={{ marginTop: 12 }}
        />
      </Card>

      <Card style={{ marginTop: 12, paddingVertical: 2 }}>
        <ListRow
          icon="package"
          title="Hàng hoá & Kho hàng"
          subtitle={`${app.products.length} sản phẩm`}
          onPress={() => router.push('/products')}
        />
        <ListRow icon="mic" title="Nói để lên đơn" subtitle="Thử giọng nói trong bản demo" onPress={() => router.push('/voice')} />
        <ListRow icon="credit-card" title="Chi phí" subtitle="Các khoản chi đã ghi" onPress={() => router.push('/expenses')} />
        <ListRow
          icon="book-open"
          iconColor={colors.gold}
          iconBg={colors.goldSoft}
          title="Quản lý nợ"
          onPress={() => router.push('/debts')}
          right={debtLeft ? <Badge text={vnd(debtLeft)} color={colors.gold} bg={colors.goldSoft} /> : null}
        />
        <ListRow
          icon="star"
          iconColor={colors.primary}
          iconBg={colors.primarySoft}
          title="Trợ lý AI"
          subtitle="Hỏi về doanh thu, nhập hàng…"
          onPress={() => router.push('/ai')}
          last
        />
      </Card>

      <Card style={{ marginTop: 12, paddingVertical: 2 }}>
        <ListRow
          icon="refresh-ccw"
          iconColor={colors.purple}
          iconBg={colors.purpleSoft}
          title="Khôi phục dữ liệu mẫu"
          subtitle="Dùng khi test xong muốn làm lại"
          onPress={() => setConfirmReset(true)}
        />
        {__DEV__ ? (
          <ListRow
            icon="activity"
            title="Chẩn đoán kết nối (dev)"
            subtitle="Kiểm tra Core, token Firebase, nhật ký"
            onPress={() => router.push('/debug')}
          />
        ) : null}
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
        Sổ Nghe Lời · bản mockup 0.1 · dữ liệu giả lập
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
      <Dialog
        visible={confirmReset}
        icon="refresh-ccw"
        title="Khôi phục dữ liệu mẫu?"
        message="Mọi hoá đơn, hàng hoá, chi phí bạn vừa tạo khi test sẽ được đặt lại."
        confirm="Khôi phục"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          app.resetMock();
          toast('Đã khôi phục dữ liệu mẫu');
        }}
      />
    </Screen>
  );
}
