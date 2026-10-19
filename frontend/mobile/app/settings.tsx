import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Badge, Button, Card, Header, Screen, T } from '../src/components/ui';
import { colors } from '../src/theme';

/**
 * Trạng thái của từng mục cài đặt. Chưa mục nào có công tắc thật (chưa lưu tuỳ chọn ở đâu và chưa nơi nào đọc), nên không
 * hiện công tắc bấm được:
 * - `soon`: app chưa có tính năng này (âm thanh, đọc lại đơn, in hoá đơn, sao lưu); làm mờ và ghi "Sắp có".
 * - `always`: tính năng đang chạy và luôn bật (rung, cảnh báo sắp hết hàng), chưa cho tắt; ghi "Luôn bật".
 * Khi một mục có công tắc thật thì thay trạng thái ở đây bằng `Toggle` nối với tuỳ chọn đã lưu.
 */
type SettingStatus = 'soon' | 'always';

function SettingRow({
  icon,
  title,
  subtitle,
  status,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  status: SettingStatus;
}) {
  const soon = status === 'soon';
  return (
    <View
      style={[styles.row, soon && styles.rowSoon]}
      accessible
      accessibilityLabel={`${title}, ${soon ? 'sắp có' : 'luôn bật'}`}
      accessibilityState={{ disabled: soon }}
    >
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
      {/* Badge tự canh lên đầu (alignSelf flex-start): bọc lại để nằm giữa dòng như công tắc trước đây */}
      <View style={styles.badgeSlot}>
        {soon ? <Badge text="Sắp có" /> : <Badge text="Luôn bật" color={colors.green} bg={colors.greenSoft} />}
      </View>
    </View>
  );
}

export default function Settings() {
  return (
    <Screen>
      <Header title="Cài đặt" subtitle="Tuỳ chỉnh cách app phản hồi khi bán hàng" />

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Trải nghiệm bán hàng
      </T>
      <Card style={styles.card}>
        <SettingRow icon="volume-2" title="Âm thanh thao tác" subtitle="Phát tiếng khi thêm món, quét mã, lưu đơn" status="soon" />
        <SettingRow icon="smartphone" title="Rung phản hồi" subtitle="Rung nhẹ khi chọn sản phẩm hoặc hoàn tất đơn" status="always" />
        <SettingRow icon="mic" title="Đọc lại đơn bằng giọng nói" subtitle="Nhắc lại món đã nghe trước khi thanh toán" status="soon" />
      </Card>

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Vận hành cửa hàng
      </T>
      <Card style={styles.card}>
        <SettingRow icon="printer" title="Tự mở in hoá đơn" subtitle="Hiện màn in sau khi lưu đơn thành công" status="soon" />
        <SettingRow icon="bell" title="Cảnh báo sắp hết hàng" subtitle="Nhắc khi sản phẩm theo dõi kho còn thấp" status="always" />
        <SettingRow icon="cloud" title="Sao lưu tự động" subtitle="Đồng bộ dữ liệu khi có kết nối mạng" status="soon" />
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
