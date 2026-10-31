import { Feather } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import { Button, Dialog, Field, Header, Progress, Screen, T } from '../../src/components/ui';
import { industryList } from '../../src/data/mock';
import { errorMessage } from '../../src/lib/errors';
import { PROFILE_MAX, shopNameError } from '../../src/lib/profileValidation';
import { useApp } from '../../src/store/AppStore';
import { colors } from '../../src/theme';

/** Tạo tiệm lần đầu: tên tiệm + ngành hàng */
export default function Setup() {
  const { finishOnboarding, logout } = useApp();
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [confirmLeave, setConfirmLeave] = useState(false);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const nameErr = shopNameError(name);

  // Chưa có tiệm thì chưa vào app được: nút back của Android hỏi đăng xuất thay vì lùi về màn trước (có khi là các tab).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        setConfirmLeave(true);
        return true;
      });
      return () => sub.remove();
    }, []),
  );

  const leave = async () => {
    setConfirmLeave(false);
    await logout();
    router.replace('/(auth)/welcome');
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
          <Button
            title="Bắt đầu bán hàng"
            icon="arrow-right"
            disabled={!!nameErr || !picked.length}
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
        Tên sẽ hiện trên đơn hàng và báo cáo
      </T>
      {/* Ô còn trống thì chỉ khoá nút, chưa báo lỗi */}
      <Field
        placeholder="VD: Tiệm tạp hoá cô Thỏ"
        maxLength={PROFILE_MAX.shopName}
        value={name}
        onChangeText={setName}
        error={name.trim() ? nameErr || undefined : undefined}
      />

      <T w="bold" size={16} style={{ marginTop: 10 }}>
        Bạn bán gì?
      </T>
      <T size={12} color={colors.faint} style={{ marginBottom: 12 }}>
        Chọn một hoặc nhiều ngành để gợi ý danh mục phù hợp
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
      <Pressable
        onPress={() => setConfirmLeave(true)}
        accessibilityRole="button"
        style={{ alignSelf: 'center', marginTop: 20, minHeight: 44, justifyContent: 'center' }}
      >
        <T size={13} color={colors.faint}>
          Dùng tài khoản khác
        </T>
      </Pressable>

      <Dialog
        visible={confirmLeave}
        icon="log-out"
        title="Dừng tạo tiệm?"
        message="Bạn sẽ được đăng xuất. Lần sau đăng nhập bằng tài khoản này, app sẽ hỏi tạo tiệm tiếp."
        confirm="Đăng xuất"
        cancel="Tạo tiệm tiếp"
        onCancel={() => setConfirmLeave(false)}
        onConfirm={() => void leave()}
      />
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
  itemOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
});
