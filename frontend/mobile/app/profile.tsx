import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useToast } from '../src/components/brand';
import { Button, Card, Field, Header, Screen, Sheet, T } from '../src/components/ui';
import { industryList } from '../src/data/mock';
import { errorMessage } from '../src/lib/errors';
import { triggerFeedback } from '../src/lib/feedback';
import {
  addressError,
  bankAccountError,
  bankNameError,
  emailError,
  facebookError,
  nameError,
  normalizeBankAccount,
  PROFILE_MAX,
  shopNameError,
  shopPhoneError,
} from '../src/lib/profileValidation';
import { sessionApi } from '../src/lib/sessionApi';
import { industriesFromCore, shopChanges } from '../src/lib/shopProfile';
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
  const [shopPhone, setShopPhone] = useState(app.store.phone);
  const [industries, setIndustries] = useState<string[]>(app.store.industries);
  const [bankName, setBankName] = useState(app.store.bankName);
  const [bankAccount, setBankAccount] = useState(app.store.bankAccount);
  const [pick, setPick] = useState(false);
  const [busy, setBusy] = useState(false);

  const errors = {
    name: nameError(name),
    email: emailError(email),
    fb: facebookError(fb),
    store: shopNameError(store),
    phone: shopPhoneError(shopPhone),
    address: addressError(address),
    bankName: bankNameError(bankName, bankAccount),
    bankAccount: bankAccountError(bankAccount, bankName),
  };
  const chosen = industryList.filter((i) => industries.includes(i.id));
  // Core bắt buộc có ngành; xoá hết ngành sẽ bị từ chối nên chặn ngay ở màn này.
  const noIndustry = industries.length === 0;
  const invalid = noIndustry || Object.values(errors).some(Boolean);

  const save = async () => {
    if (busy || invalid) return;
    const next = { name: store.trim(), address: address.trim(), phone: shopPhone.trim(), industries };
    const changes = shopChanges(
      { name: app.store.name, address: app.store.address, phone: app.store.phone, industries: app.store.industries },
      next,
    );
    setBusy(true);
    try {
      let shop = next;
      // Tên, địa chỉ, ngành lưu lên Core trước; lỗi thì ở lại màn này, không báo đã lưu khi Core chưa nhận.
      if (changes && app.shopId) {
        const saved = await sessionApi.updateShop(app.shopId, changes);
        shop = {
          name: saved.name,
          address: saved.address ?? '',
          phone: saved.phone ?? '',
          industries: saved.industries ?? industriesFromCore(saved.industry),
        };
      }
      // Phần còn lại (họ tên, email, Facebook, ngân hàng) Core chưa có chỗ lưu nên lưu trên máy (đăng xuất không mất).
      app.updateProfile(
        { name: name.trim(), email: email.trim(), facebook: fb.trim() },
        { ...shop, bankName: bankName.trim(), bankAccount: normalizeBankAccount(bankAccount) },
      );
      triggerFeedback('success');
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)/more');
    } catch (e) {
      triggerFeedback('error');
      toast(errorMessage(e), 'err');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <Button
          title="Lưu thay đổi"
          loading={busy}
          disabled={busy || invalid}
          onPress={save}
        />
      }
    >
      <Header title="Chỉnh sửa thông tin" subtitle="Tài khoản & thông tin tiệm" />
      <Card>
        <T w="bold" size={12} color={colors.faint} style={styles.section}>
          THÔNG TIN CÁ NHÂN
        </T>
        <Field label="Họ và tên" maxLength={PROFILE_MAX.name} value={name} onChangeText={setName} error={errors.name || undefined} />
        <Field
          label="Email"
          placeholder="email@gmail.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={PROFILE_MAX.email}
          value={email}
          onChangeText={setEmail}
          error={errors.email || undefined}
        />
        <Field
          label="Link Facebook"
          placeholder="facebook.com/tenban"
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={PROFILE_MAX.facebook}
          value={fb}
          onChangeText={setFb}
          error={errors.fb || undefined}
        />
        <T size={12} color={colors.faint}>
          Họ tên, email và Facebook lưu trên máy này (đăng xuất không mất), chưa đồng bộ sang máy khác
        </T>
      </Card>
      <Card style={{ marginTop: 12 }}>
        <T w="bold" size={12} color={colors.faint} style={styles.section}>
          THÔNG TIN TIỆM
        </T>
        <Field label="Tên tiệm" maxLength={PROFILE_MAX.shopName} value={store} onChangeText={setStore} error={errors.store || undefined} />
        <Field
          label="Số điện thoại tiệm"
          placeholder="VD: 0901 234 567"
          keyboardType="phone-pad"
          maxLength={PROFILE_MAX.shopPhone}
          value={shopPhone}
          onChangeText={setShopPhone}
          error={errors.phone || undefined}
        />
        <Field
          label="Địa chỉ"
          maxLength={PROFILE_MAX.address}
          value={address}
          onChangeText={setAddress}
          error={errors.address || undefined}
        />
        <T w="semibold" size={12} color={colors.muted} style={{ marginBottom: 6 }}>
          Ngành hàng
        </T>
        <Pressable onPress={() => setPick(true)} style={styles.picker}>
          <T w="semibold" size={14} color={chosen.length ? colors.ink : colors.primary} style={{ flex: 1 }} numberOfLines={1}>
            {chosen.length ? chosen.map((c) => c.name).join(', ') : 'Chưa chọn ngành'}
          </T>
          <Feather name="chevron-right" size={18} color={colors.disabled} />
        </Pressable>
        {noIndustry ? (
          <T size={12} color={colors.red} style={{ marginTop: 6 }}>
            Chọn ít nhất một ngành hàng
          </T>
        ) : null}
      </Card>
      <Card style={{ marginTop: 12 }}>
        <T w="bold" size={12} color={colors.faint} style={styles.section}>
          NHẬN CHUYỂN KHOẢN
        </T>
        <Field
          label="Ngân hàng"
          placeholder="VD: Vietcombank"
          maxLength={PROFILE_MAX.bankName}
          value={bankName}
          onChangeText={setBankName}
          error={errors.bankName || undefined}
        />
        <Field
          label="Số tài khoản"
          placeholder="VD: 0123456789"
          keyboardType="number-pad"
          maxLength={PROFILE_MAX.bankAccount}
          value={bankAccount}
          onChangeText={setBankAccount}
          error={errors.bankAccount || undefined}
        />
        <T size={12} color={colors.faint}>
          Hiện khi khách chọn chuyển khoản lúc thanh toán. Lưu trên máy này (đăng xuất không mất), chưa đồng bộ sang máy khác
        </T>
      </Card>

      <Sheet visible={pick} onClose={() => setPick(false)} title="Chọn ngành hàng">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {industryList.map((i) => {
            const on = industries.includes(i.id);
            return (
              <Pressable
                key={i.id}
                onPress={() => setIndustries((cur) => (on ? cur.filter((x) => x !== i.id) : [...cur, i.id]))}
                style={[styles.ind, on && styles.indOn]}
              >
                <T size={13} w={on ? 'bold' : 'semibold'} color={colors.ink}>
                  {i.name}
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
  ind: { paddingHorizontal: 12, minHeight: 44, justifyContent: 'center', borderRadius: 22, borderWidth: 1, borderColor: colors.border },
  indOn: { borderColor: colors.ink, backgroundColor: 'rgba(26,25,22,0.035)' },
});
