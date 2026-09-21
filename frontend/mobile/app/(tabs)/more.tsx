import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '../../src/components/brand';
import { Badge, Button, Card, Dialog, IconBtn, ListRow, Progress, Row, Screen, T, Tile } from '../../src/components/ui';
import { vnd } from '../../src/lib/format';
import { activeInvoices } from '../../src/lib/stats';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

export default function More() {
  const app = useApp();
  const toast = useToast();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const used = activeInvoices(app.invoices, 'month').length;
  const quota = app.store.quota;
  const debtLeft = app.debts.reduce((a, d) => a + d.total - d.paid, 0);
  const isPro = app.store.plan === 'pro';

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
            size={34}
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

      <LinearGradient colors={isPro ? ['#7A5AF0', '#9C84F5'] : ['#2858D8', '#4A6EE5']} style={styles.plan}>
        <Row>
          <View style={styles.planIcon}>
            <Feather name="star" size={15} color={colors.white} />
          </View>
          <T w="bold" size={15} color={colors.white} style={{ flex: 1 }}>
            {isPro ? 'Gói Pro' : 'Gói Cơ bản'}
          </T>
          {!isPro ? (
            <Button
              title="Nâng cấp"
              small
              variant="gold"
              style={{ height: 30 }}
              onPress={() => {
                app.updateProfile({}, { plan: 'pro', quota: 99999 });
                toast('Đã bật gói Pro (giả lập)');
              }}
            />
          ) : (
            <Badge text="Không giới hạn" color={colors.white} bg="rgba(255,255,255,0.2)" />
          )}
        </Row>
        {!isPro ? (
          <>
            <Row style={{ marginTop: 14, marginBottom: 6 }}>
              <T size={12} color="#D6E1FB" style={{ flex: 1 }}>
                Lượt tạo đơn tháng này
              </T>
              <T w="bold" size={13} color={colors.white}>
                {used}/{quota}
              </T>
            </Row>
            <Progress value={used / quota} color={colors.goldBright} track="rgba(255,255,255,0.25)" />
            {used >= quota ? (
              <T size={11} color="#FFE3A3" style={{ marginTop: 6 }}>
                Đã hết lượt miễn phí — nâng cấp để tiếp tục tạo đơn bằng AI
              </T>
            ) : null}
          </>
        ) : (
          <T size={12} color="#EAE4FF" style={{ marginTop: 10 }}>
            Tạo đơn không giới hạn · Báo cáo nâng cao · Nhiều nhân viên
          </T>
        )}
      </LinearGradient>

      <Card style={{ marginTop: 12, paddingVertical: 2 }}>
        <ListRow
          icon="package"
          title="Hàng hoá & Kho hàng"
          subtitle={`${app.products.length} sản phẩm`}
          onPress={() => router.push('/products')}
        />
        <ListRow icon="users" title="Nhân viên" subtitle={`${app.staff.length} người`} onPress={() => router.push('/staff')} />
        <ListRow
          icon="book-open"
          iconColor={colors.gold}
          iconBg={colors.goldSoft}
          title="Quản lý nợ"
          onPress={() => router.push('/debts')}
          right={debtLeft ? <Badge text={vnd(debtLeft)} color={colors.gold} bg={colors.goldSoft} /> : null}
        />
        <ListRow icon="bar-chart-2" title="Hàng bán chạy" onPress={() => router.push('/bestsellers')} />
        <ListRow
          icon="star"
          iconColor={colors.orange}
          iconBg="#FFF1E4"
          title="Trợ lý AI"
          subtitle="Hỏi về doanh thu, nhập hàng…"
          onPress={() => router.push('/ai')}
          last
        />
      </Card>

      <Card style={{ marginTop: 12, paddingVertical: 2 }}>
        <ListRow
          icon="printer"
          iconColor={colors.green}
          iconBg={colors.greenSoft}
          title="Kết nối máy in"
          subtitle="Khổ giấy K80 / K58"
          onPress={() => router.push('/printer')}
        />
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

      <T size={11} color={colors.faint} style={{ textAlign: 'center', marginTop: 16, marginBottom: 60 }}>
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

const styles = StyleSheet.create({
  plan: { marginTop: 12, borderRadius: 20, padding: 16 },
  planIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
