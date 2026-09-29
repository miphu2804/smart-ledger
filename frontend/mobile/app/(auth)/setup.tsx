import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Field, Header, Progress, Screen, T } from '../../src/components/ui';
import { industryList } from '../../src/data/mock';
import { errorMessage } from '../../src/lib/errors';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

/** Tạo tiệm lần đầu: tên tiệm + ngành hàng */
export default function Setup() {
  const { finishOnboarding } = useApp();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen
      footer={
        <>
          {err ? (
            <T size={12} color={colors.red} style={{ marginBottom: 8, textAlign: 'center' }}>
              {err}
            </T>
          ) : null}
          <Button
            title="Bắt đầu bán hàng"
            icon="arrow-right"
            disabled={!name.trim() || !picked.length}
            loading={busy}
            onPress={async () => {
              setBusy(true);
              setErr('');
              try {
                await finishOnboarding(name, picked); // tạo tiệm (POST /shops)
                router.replace('/(tabs)');
              } catch (e) {
                setErr(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          />
        </>
      }
    >
      <Header title="" back={false} />
      <Progress value={0.8} height={4} />
      <T w="extrabold" size={26} style={{ marginTop: 24 }}>
        Tiệm của bạn tên gì?
      </T>
      <T size={14} color={colors.muted} style={{ marginTop: 6, marginBottom: 18 }}>
        Tên sẽ hiện trên hoá đơn và báo cáo
      </T>
      <Field placeholder="VD: Tiệm tạp hoá cô Thỏ" value={name} onChangeText={setName} />

      <T w="bold" size={16} style={{ marginTop: 10 }}>
        Bạn bán gì?
      </T>
      <T size={12} color={colors.faint} style={{ marginBottom: 12 }}>
        Chọn một hoặc nhiều ngành — AI sẽ gợi ý danh mục phù hợp
      </T>
      <View style={styles.grid}>
        {industryList.map((it) => {
          const on = picked.includes(it.id);
          return (
            <Pressable key={it.id} onPress={() => toggle(it.id)} style={[styles.item, on && styles.itemOn]}>
              <Feather name={it.icon} size={24} color={on ? colors.primary : colors.muted} />
              <T
                w={on ? 'bold' : 'semibold'}
                size={12}
                color={on ? colors.primary : colors.ink}
                style={{ textAlign: 'center', marginTop: 6 }}
              >
                {it.name}
              </T>
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  item: {
    width: '31%',
    minHeight: 86,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  itemOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
});
