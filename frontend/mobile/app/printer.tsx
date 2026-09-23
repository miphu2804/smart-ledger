import { Feather } from '@expo/vector-icons';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Button, Card, Chips, Field, Header, Row, Screen, T } from '../src/components/ui';
import { colors } from '../src/theme';

export default function Printer() {
  const toast = useToast();
  const [ip, setIp] = useState('192.168.1.100');
  const [paper, setPaper] = useState<'k80' | 'k58'>('k80');
  const [state, setState] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle');
  const validIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);

  const test = () => {
    setState('testing');
    setTimeout(() => {
      const ok = ip.startsWith('192.168.');
      setState(ok ? 'ok' : 'fail');
      toast(ok ? 'Đã in trang thử (giả lập)' : 'Không kết nối được máy in', ok ? 'ok' : 'err');
    }, 1200);
  };

  return (
    <Screen>
      <Header title="Kết nối máy in" subtitle="Máy in nhiệt qua Wi-Fi / LAN" />
      <Card>
        <Field
          label="Địa chỉ IP máy in"
          value={ip}
          onChangeText={(t) => {
            setIp(t);
            setState('idle');
          }}
          keyboardType="numbers-and-punctuation"
          error={ip && !validIp ? 'IP chưa đúng định dạng' : ''}
        />
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          Khổ giấy
        </T>
        <Chips<'k80' | 'k58'>
          scroll={false}
          value={paper}
          onChange={setPaper}
          options={[
            { key: 'k80', label: 'K80 (80mm)' },
            { key: 'k58', label: 'K58 (58mm)' },
          ]}
        />
        <Button
          title={state === 'testing' ? 'Đang kết nối…' : 'In thử'}
          icon="printer"
          loading={state === 'testing'}
          disabled={!validIp}
          onPress={test}
          style={{ marginTop: 16 }}
        />
      </Card>

      {state === 'ok' || state === 'fail' ? (
        <Row style={[styles.status, state === 'fail' && { backgroundColor: colors.redSoft }]}>
          <Feather
            name={state === 'ok' ? 'check-circle' : 'wifi-off'}
            size={18}
            color={state === 'ok' ? colors.green : colors.red}
          />
          <T w="semibold" size={13} color={state === 'ok' ? colors.green : colors.red} style={{ flex: 1 }}>
            {state === 'ok' ? `Đã kết nối ${ip} · ${paper.toUpperCase()}` : 'Kiểm tra máy in và điện thoại có cùng mạng Wi-Fi'}
          </T>
        </Row>
      ) : null}

      <T w="bold" size={14} style={{ marginTop: 20, marginBottom: 8 }}>
        Mẫu hoá đơn
      </T>
      <View style={[styles.paper, paper === 'k58' && { width: 210 }]}>
        <T w="extrabold" size={13} style={{ textAlign: 'center' }}>
          TIỆM TẠP HOÁ CÔ THỎ
        </T>
        <T size={10} color={colors.muted} style={{ textAlign: 'center' }}>
          12 Hoà Hưng, Q.10
        </T>
        <View style={styles.dash} />
        {[
          ['Bánh mì thịt x2', '30.000'],
          ['Cà phê sữa đá x1', '25.000'],
          ['Nước suối x3', '15.000'],
        ].map(([a, b]) => (
          <Row key={a}>
            <T size={11} style={{ flex: 1 }}>
              {a}
            </T>
            <T size={11}>{b}</T>
          </Row>
        ))}
        <View style={styles.dash} />
        <Row>
          <T w="bold" size={12} style={{ flex: 1 }}>
            TỔNG
          </T>
          <T w="bold" size={12}>
            70.000đ
          </T>
        </Row>
        <T size={9.5} color={colors.faint} style={{ textAlign: 'center', marginTop: 8 }}>
          Cảm ơn quý khách · Sổ Nghe Lời
        </T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: 12, backgroundColor: colors.greenSoft, borderRadius: 14, padding: 12 },
  paper: { alignSelf: 'center', width: 280, backgroundColor: colors.white, padding: 14, borderRadius: 6, gap: 4 },
  dash: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: colors.disabled, marginVertical: 6 },
});
