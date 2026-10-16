import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Card, Header, Row, Screen, T, Toggle } from '../src/components/ui';
import { colors } from '../src/theme';

function SettingRow({
  icon,
  title,
  subtitle,
  value,
  onChange,
}: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <Row style={styles.row} gap={12}>
      <View style={styles.iconBox}>
        <Feather name={icon} size={19} color={colors.brand} />
      </View>
      <View style={{ flex: 1 }}>
        <T w="bold" size={15} color={colors.ink}>
          {title}
        </T>
        <T size={12.5} color={colors.muted} style={{ marginTop: 3 }}>
          {subtitle}
        </T>
      </View>
      <Toggle value={value} onChange={onChange} />
    </Row>
  );
}

export default function Settings() {
  const [sound, setSound] = useState(true);
  const [haptic, setHaptic] = useState(true);
  const [voiceReadback, setVoiceReadback] = useState(false);
  const [receipt, setReceipt] = useState(true);
  const [lowStock, setLowStock] = useState(true);
  const [backup, setBackup] = useState(false);

  return (
    <Screen>
      <Header title="Cài đặt" subtitle="Tuỳ chỉnh cách app phản hồi khi bán hàng" />

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Trải nghiệm bán hàng
      </T>
      <Card style={styles.card}>
        <SettingRow icon="volume-2" title="Âm thanh thao tác" subtitle="Phát tiếng khi thêm món, quét mã, lưu đơn" value={sound} onChange={setSound} />
        <SettingRow icon="smartphone" title="Rung phản hồi" subtitle="Rung nhẹ khi chọn sản phẩm hoặc hoàn tất đơn" value={haptic} onChange={setHaptic} />
        <SettingRow icon="mic" title="Đọc lại đơn bằng giọng nói" subtitle="Nhắc lại món đã nghe trước khi thanh toán" value={voiceReadback} onChange={setVoiceReadback} />
      </Card>

      <T w="bold" size={14} color={colors.muted} style={styles.sectionTitle}>
        Vận hành cửa hàng
      </T>
      <Card style={styles.card}>
        <SettingRow icon="printer" title="Tự mở in hoá đơn" subtitle="Hiện màn in sau khi lưu đơn thành công" value={receipt} onChange={setReceipt} />
        <SettingRow icon="bell" title="Cảnh báo sắp hết hàng" subtitle="Nhắc khi sản phẩm theo dõi kho còn thấp" value={lowStock} onChange={setLowStock} />
        <SettingRow icon="cloud" title="Sao lưu tự động" subtitle="Đồng bộ dữ liệu khi có kết nối mạng" value={backup} onChange={setBackup} />
      </Card>

      <Button title="Kết nối máy in" icon="printer" variant="soft" onPress={() => router.push('/printer')} style={{ marginTop: 16 }} />
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
    minHeight: 72,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
