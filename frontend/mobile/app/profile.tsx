import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Button, Card, Field, Header, Screen, Sheet, T } from '../src/components/ui';
import { industryList } from '../src/data/mock';
import { useApp } from '../src/store/AppStore';
import { colors } from '../src/theme';

export default function Profile() {
  const app = useApp();
  const toast = useToast();
  const [name, setName] = useState(app.user.name);
  const [email, setEmail] = useState(app.user.email);
  const [fb, setFb] = useState(app.user.facebook);
  const [store, setStore] = useState(app.store.name);
  const [address, setAddress] = useState(app.store.address);
  const [industries, setIndustries] = useState<string[]>(app.store.industries);
  const [pick, setPick] = useState(false);

  const emailErr = email && !/^\S+@\S+\.\S+$/.test(email) ? 'Email chưa đúng định dạng' : '';
  const chosen = industryList.filter((i) => industries.includes(i.id));

  return (
    <Screen
      footer={
        <Button
          title="Lưu thay đổi"
          disabled={!name.trim() || !store.trim() || !!emailErr}
          onPress={() => {
            app.updateProfile({ name: name.trim(), email, facebook: fb }, { name: store.trim(), address, industries });
            toast('Đã lưu thông tin');
            router.back();
          }}
        />
      }
    >
      <Header title="Chỉnh sửa thông tin" subtitle="Tài khoản & thông tin tiệm" />
      <Card>
        <T w="bold" size={11} color={colors.faint} style={styles.section}>
          THÔNG TIN CÁ NHÂN
        </T>
        <Field label="Họ và tên" value={name} onChangeText={setName} />
        <Field label="Số điện thoại" value={app.user.phone} editable={false} inputStyle={{ color: colors.faint }} />
        <Field
          label="Email"
          placeholder="email@gmail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
          error={emailErr}
        />
        <Field label="Link Facebook" placeholder="facebook.com/tenban" autoCapitalize="none" value={fb} onChangeText={setFb} />
      </Card>
      <Card style={{ marginTop: 12 }}>
        <T w="bold" size={11} color={colors.faint} style={styles.section}>
          THÔNG TIN TIỆM
        </T>
        <Field label="Tên tiệm" value={store} onChangeText={setStore} />
        <Field label="Địa chỉ" value={address} onChangeText={setAddress} />
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          Ngành hàng
        </T>
        <Pressable onPress={() => setPick(true)} style={styles.picker}>
          <T w="semibold" size={14} color={chosen.length ? colors.ink : colors.primary} style={{ flex: 1 }} numberOfLines={1}>
            {chosen.length ? chosen.map((c) => `${c.emoji} ${c.name}`).join(', ') : 'Chưa chọn ngành'}
          </T>
          <T w="bold" color={colors.primary}>
            ›
          </T>
        </Pressable>
      </Card>

      <Sheet visible={pick} onClose={() => setPick(false)} title="Chọn ngành hàng">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {industryList.map((i) => {
            const on = industries.includes(i.id);
            return (
              <Pressable
                key={i.id}
                onPress={() => setIndustries((cur) => (on ? cur.filter((x) => x !== i.id) : [...cur, i.id]))}
                style={[styles.ind, on && { borderColor: colors.primary, backgroundColor: colors.primaryTint }]}
              >
                <T size={13} w={on ? 'bold' : 'semibold'} color={on ? colors.primary : colors.ink}>
                  {i.emoji} {i.name}
                </T>
              </Pressable>
            );
          })}
        </View>
        <Button title="Xong" onPress={() => setPick(false)} style={{ marginTop: 16 }} />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { letterSpacing: 0.6, marginBottom: 12 },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  ind: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border },
});
