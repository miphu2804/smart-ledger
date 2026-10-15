import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { Platform } from 'react-native';
import type { UpdateManifest } from './appUpdate';

/** versionCode của bản đang chạy. Chỉ Android tự cài APK; nơi khác là NaN nên không kiểm tra bản mới. */
export const installedVersionCode = Platform.OS === 'android' ? Number(Application.nativeBuildVersion) : NaN;

const APK_MIME = 'application/vnd.android.package-archive';
const FLAG_GRANT_READ_URI_PERMISSION = 1;

/**
 * Tải APK về bộ nhớ đệm rồi mở trình cài đặt của Android. Android tự hỏi người dùng xác nhận, và chỉ cho cài đè khi APK
 * ký cùng keystore với bản đang chạy. Lần đầu máy còn hỏi cho phép "cài app từ nguồn này".
 */
export async function downloadAndInstall(
  manifest: UpdateManifest,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error('Thiếu thư mục bộ nhớ đệm');
  // Bản đã tải ở lần cập nhật trước nằm lại trong cache; xoá để không giữ nhiều APK vài chục MB.
  for (const name of await FileSystem.readDirectoryAsync(cacheDir)) {
    if (name.endsWith('.apk')) await FileSystem.deleteAsync(cacheDir + name, { idempotent: true });
  }
  const target = `${cacheDir}so-nghe-loi-${manifest.versionCode}.apk`;
  const download = FileSystem.createDownloadResumable(manifest.apk, target, {}, ({ totalBytesWritten, totalBytesExpectedToWrite }) => {
    if (totalBytesExpectedToWrite > 0) onProgress(totalBytesWritten / totalBytesExpectedToWrite);
  });
  signal.addEventListener('abort', () => void download.cancelAsync());
  const result = await download.downloadAsync();
  if (signal.aborted) return;
  if (!result || result.status !== 200) throw new Error(`Tải APK thất bại (HTTP ${result?.status ?? 'không rõ'})`);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: await FileSystem.getContentUriAsync(result.uri),
    flags: FLAG_GRANT_READ_URI_PERMISSION,
    type: APK_MIME,
  });
}
