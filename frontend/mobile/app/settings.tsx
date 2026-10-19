import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Header, Screen, T, Toggle } from '../src/components/ui';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/**
 * Mục cài đặt. Có hai loại:
 * - Có công tắc thật (`value`/`onChange`): rung phản hồi và cảnh báo sắp hết hàng, lưu trên máy (`settings` của AppStore).
 *   Chạm cả dòng hay chạm công tắc đều đổi.
 * - `soon`: app chưa có tính năng này (âm thanh, đọc lại đơn, in hoá đơn, sao lưu); làm mờ và ghi "Sắp có", không bấm được.
 */
function SettingRow({
  icon,
  title,
  subtitle,
  soon = false,
  value = false,
  onChange,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  soon?: boolean;
  value?: boolean;
  onChange?: (value: boolean) => void;
}) {
  const content = (
    <>
      <View style={[styles.iconBox, soon && styles.iconBoxSoon]}>
        <Feather name={icon} size={19} color={soon ? colors.disabled : colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={15} color={soon ? colors.muted : colors.ink}>
          {title}
        </T>
        <T size={12.5} color={colors.muted} style={{ marginTop: 3 }}>
          {subtitle}
        </T>
      </View>
    </>
  );
  if (soon || !onChange) {
    return (
      <View style={[styles.row, styles.rowSoon]} accessible accessibilityLabel={`${title}, sắp có`} aria-disabled>
        {content}
        {/* Badge tự canh lên đầu (alignSelf flex-start): bọc lại để nằm giữa dòng như công tắc */}
        <View style={styles.badgeSlot}>
          <Badge text="Sắp có" />
        </View>
      </View>
    );
  }
  return (
    <Pressable
      onPress={() => onChange(!value)}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
      accessibilityRole="switch"
      accessibilityLabel={title}
      accessibilityHint={subtitle}
      aria-checked={value}
    >
      {content}
      {/* Cả dòng đã là công tắc cho trình đọc màn hình: ẩn công tắc con để không đọc hai lần */}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Toggle value={value} onChange={onChange} />
      </View>
    </Pressable>
  );
}

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
        <SettingRow icon="printer" title="Tự mở in hoá đơn" subtitle="Hiện màn in sau khi lưu đơn thành công" soon />
        <SettingRow
          icon="bell"
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowSoon: {
    opacity: 0.6,
  },
  badgeSlot: {
    alignSelf: 'center',
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBoxSoon: {
    backgroundColor: colors.primarySoft,
  },
});
