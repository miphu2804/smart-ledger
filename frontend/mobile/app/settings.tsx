import { router } from 'expo-router';
import React from 'react';
import { StyleSheet } from 'react-native';
import { SettingRow } from '../src/components/SettingRow';
import { Button, Card, Header, Screen, T } from '../src/components/ui';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/**
 * Cài đặt của app. Rung phản hồi và cảnh báo sắp hết hàng là công tắc thật (lưu trên máy, `settings` của AppStore); cảnh báo
 * hàng cũng là nhóm Kho hàng ở Cài đặt thông báo. Các mục app chưa có (âm thanh, đọc lại đơn, in hoá đơn, sao lưu) ghi "Sắp có".
 */
export default function Settings() {
  const { settings, setSetting } = useApp();
  return (
    <Screen>
      <Header title="Cài đặt" subtitle="Tuỳ chỉnh cách app phản hồi khi bán hàng" />

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Trải nghiệm bán hàng
      </T>
      <Card style={styles.card}>
        <SettingRow icon="volume-2" title="Âm thanh thao tác" subtitle="Phát tiếng khi thêm món, quét mã, lưu đơn" soon />
        <SettingRow
          icon="smartphone"
          title="Rung phản hồi"
          subtitle="Rung nhẹ khi chọn sản phẩm hoặc hoàn tất đơn"
          value={settings.haptics}
          onChange={(on) => setSetting('haptics', on)}
        />
        <SettingRow icon="mic" title="Đọc lại đơn bằng giọng nói" subtitle="Nhắc lại món đã nghe trước khi thanh toán" soon />
      </Card>

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Vận hành cửa hàng
      </T>
      <Card style={styles.card}>
        <SettingRow
          icon="bell"
          title="Cài đặt thông báo"
          subtitle="Chọn nhận thông báo về đơn hàng, kho hàng, công nợ, thu chi"
          onPress={() => router.push('/notification-settings')}
        />
        <SettingRow icon="printer" title="Tự mở in hoá đơn" subtitle="Hiện màn in sau khi lưu đơn thành công" soon />
        <SettingRow
          icon="alert-triangle"
          title="Cảnh báo sắp hết hàng"
          subtitle="Nhắc ở Tổng quan và Thông báo khi hàng sắp hết hoặc đã hết"
          value={settings.stockAlerts}
          onChange={(on) => setSetting('stockAlerts', on)}
        />
        <SettingRow icon="cloud" title="Sao lưu tự động" subtitle="Đồng bộ dữ liệu khi có kết nối mạng" soon />
      </Card>

      {/* Màn kết nối máy in mới là bản mẫu (In thử luôn báo chưa kết nối); máy in nằm ngoài PRD MVP */}
      <Button title="Kết nối máy in · Sắp có" icon="printer" variant="soft" disabled onPress={() => undefined} style={{ marginTop: 16 }} />
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
});
