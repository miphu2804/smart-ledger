import React from 'react';
import { Platform } from 'react-native';
import { useApp } from '../store/AppStore';
import { Dialog } from './ui';

/**
 * Hỏi một lần trên máy, ngay sau khi đăng nhập (trước cả bước tạo tiệm, để đếm được cả lúc bắt đầu dùng app), có cho gửi số liệu sử dụng lên Google Analytics không.
 * Mặc định là không gửi; đóng hộp thoại cũng tính là "Không". Đổi ý ở Cài đặt, mục "Gửi số liệu sử dụng". Bản web không gửi
 * số liệu (`analytics.web.ts`) nên không hỏi.
 */
export function AnalyticsConsentPrompt() {
  const app = useApp();
  if (Platform.OS === 'web' || !app.settingsReady || app.settings.analyticsAsked || !app.authReady || !app.loggedIn) return null;

  const answer = (on: boolean) => {
    app.setSetting('analytics', on);
    app.setSetting('analyticsAsked', true);
  };

  return (
    <Dialog
      visible
      icon="bar-chart-2"
      title="Giúp app tốt hơn"
      message="Cho phép gửi số liệu sử dụng (màn đã mở, thao tác như lưu đơn hay thêm sản phẩm) lên Google Analytics để nhóm biết tính năng nào cần cải thiện. Không gửi tên, số điện thoại, tên món hay số tiền. Bạn đổi lại được trong Cài đặt."
      confirm="Cho phép"
      cancel="Không"
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
}
