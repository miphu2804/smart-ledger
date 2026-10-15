import React, { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { APP_UPDATE_URL } from '../config';
import { findNewerBuild, type UpdateManifest } from '../lib/appUpdate';
import { downloadAndInstall, installedVersionCode } from '../lib/appUpdateInstall';
import { colors } from '../theme';
import { Dialog, Progress, T } from './ui';

/** Hỏi cập nhật khi R2 có APK mới hơn bản đang chạy. "Để sau" chỉ ẩn tới lần mở app kế tiếp. */
export function UpdatePrompt() {
  const [build, setBuild] = useState<UpdateManifest | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');
  const download = useRef<AbortController | null>(null);

  useEffect(() => {
    findNewerBuild(APP_UPDATE_URL, installedVersionCode).then(setBuild);
  }, []);

  if (!build) return null;

  const install = async () => {
    setError('');
    setProgress(0);
    download.current = new AbortController();
    try {
      await downloadAndInstall(build, setProgress, download.current.signal);
    } catch {
      setError('Không tải được bản cập nhật. Kiểm tra mạng rồi thử lại.');
    } finally {
      setProgress(null);
    }
  };

  // Huỷ khi đang tải để mạng chậm không giữ hộp thoại che cả app.
  const dismiss = () => {
    download.current?.abort();
    setBuild(null);
  };

  return (
    <Dialog
      visible
      icon="download"
      title="Có bản cập nhật mới"
      message={`Sổ Nghe Lời ${build.versionName} (bản ${build.versionCode}) đã sẵn sàng. Cập nhật để dùng các tính năng và bản sửa lỗi mới nhất.`}
      confirm={progress === null ? 'Cập nhật' : 'Đang tải…'}
      cancel={progress === null ? 'Để sau' : 'Huỷ'}
      onConfirm={() => progress === null && install()}
      onCancel={dismiss}
    >
      {progress !== null ? (
        <View style={{ marginTop: 14 }}>
          <Progress value={progress} />
        </View>
      ) : null}
      {error ? (
        <T size={12} color={colors.red} style={{ marginTop: 10 }}>
          {error}
        </T>
      ) : null}
    </Dialog>
  );
}
