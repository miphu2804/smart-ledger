import React from 'react';
import { StyleSheet } from 'react-native';
import { SettingRow } from '../src/components/SettingRow';
import { Card, Header, Screen, T } from '../src/components/ui';
import { notifCategoryMeta } from '../src/lib/notifications';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/**
 * Cài đặt thông báo: chọn nhóm thông báo muốn nhận (mở từ nút bánh răng ở màn Thông báo hoặc từ Cài đặt). Tắt một nhóm thì
 * thông báo của nhóm đó không hiện ở màn Thông báo, ở phần xem trước của Tổng quan và không tính vào số trên chuông. Lưu trên
 * máy (`settings` của AppStore). Nhóm Hệ thống (tiệm bị tạm ngưng / mở lại) luôn bật vì ảnh hưởng tới việc bán hàng.
 */
export default function NotificationSettings() {
  const { settings, setSetting } = useApp();
  const meta = notifCategoryMeta;
  return (
    <Screen>
      <Header title="Cài đặt thông báo" subtitle="Chọn những gì bạn muốn được nhắc" />

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Nhận thông báo về
      </T>
      <Card style={styles.card}>
        <SettingRow
          icon={meta.order.icon}
          tint={meta.order.color}
          tintBg={meta.order.bg}
          title="Đơn hàng"
          subtitle="Đơn mới vừa bán và đơn bị huỷ"
          value={settings.orderAlerts}
          onChange={(on) => setSetting('orderAlerts', on)}
        />
        <SettingRow
          icon={meta.stock.icon}
          tint={meta.stock.color}
          tintBg={meta.stock.bg}
          title="Kho hàng"
          subtitle="Hàng sắp hết, đã hết; cũng là mục nhắc nhập hàng ở Tổng quan"
          value={settings.stockAlerts}
          onChange={(on) => setSetting('stockAlerts', on)}
        />
        <SettingRow
          icon={meta.debt.icon}
          tint={meta.debt.color}
          tintBg={meta.debt.bg}
          title="Công nợ"
          subtitle="Các khoản khách còn nợ chưa thu"
          value={settings.debtAlerts}
          onChange={(on) => setSetting('debtAlerts', on)}
        />
        <SettingRow
          icon={meta.finance.icon}
          tint={meta.finance.color}
          tintBg={meta.finance.bg}
          title="Thu chi"
          subtitle="Tổng kết thu chi hôm qua và khoản chi vừa ghi"
          value={settings.financeAlerts}
          onChange={(on) => setSetting('financeAlerts', on)}
        />
        <SettingRow
          icon={meta.system.icon}
          tint={meta.system.color}
          tintBg={meta.system.bg}
          title="Hệ thống"
          subtitle="Tiệm bị tạm ngưng hoặc mở lại; luôn báo vì ảnh hưởng tới bán hàng"
          always
          last
        />
      </Card>

      <T size={12.5} color={colors.muted} style={styles.note}>
        Các lựa chọn này lưu trên máy này. Tắt một nhóm chỉ ẩn thông báo, không xoá dữ liệu: bật lại là thấy lại.
      </T>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: {
    marginTop: 12,
    marginBottom: 8,
    paddingLeft: 2,
  },
  card: {
    paddingVertical: 4,
  },
  note: {
    marginTop: 12,
    paddingHorizontal: 4,
    lineHeight: 18,
  },
});
