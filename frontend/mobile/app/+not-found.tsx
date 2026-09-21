import { router } from 'expo-router';
import React from 'react';
import { Button, EmptyState, Screen } from '../src/components/ui';

export default function NotFound() {
  return (
    <Screen>
      <EmptyState icon="compass" title="Không tìm thấy trang" hint="Trang này không tồn tại trong bản mockup" />
      <Button title="Về trang chủ" onPress={() => router.replace('/')} />
    </Screen>
  );
}
