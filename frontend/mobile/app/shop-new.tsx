import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Button, Field, Header, Screen, T } from '../src/components/ui';
import { industryList } from '../src/data/mock';
import { errorMessage } from '../src/lib/errors';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

/** Tạo thêm một cửa hàng cho tài khoản đang đăng nhập; tạo xong app chuyển sang dùng cửa hàng mới. */
export default function ShopNew() {
  const { finishOnboarding } = useApp();
  const toast = useToast();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = async () => {
    setBusy(true);
    setErr('');
    try {
      await finishOnboarding(name, picked);
      toast(`Đã tạo ${name.trim()}`);
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {err ? (
            <T size={12} color={colors.red} style={{ marginBottom: 8, textAlign: 'center' }}>
              {err}
            </T>
          ) : null}
          <Button title="Tạo cửa hàng" loading={busy} disabled={busy || !name.trim() || !picked.length} onPress={submit} />
        </>
      }
    >
      <Header title="Tạo cửa hàng mới" subtitle="Mỗi cửa hàng có sổ riêng" />
      <Field label="Tên cửa hàng" placeholder="VD: Tiệm tạp hoá cô Thỏ" maxLength={200} value={name} onChangeText={setName} />
      <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 8 }}>
        Bán gì?
      </T>
      <View style={styles.list}>
        {industryList.map((industry) => {
          const on = picked.includes(industry.id);
          return (
            <Pressable
              key={industry.id}
              onPress={() => toggle(industry.id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              style={[styles.industry, on && styles.industryOn]}
            >
              <T size={13} w={on ? 'bold' : 'semibold'} color={colors.ink}>
                {industry.name}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  industry: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.border },
  industryOn: { borderColor: colors.ink, backgroundColor: 'rgba(26,25,22,0.035)' },
});
