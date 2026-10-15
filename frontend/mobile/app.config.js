/**
 * Mở rộng app.json. `google-services.json` chứa cấu hình Firebase của client và bị .gitignore (repo công khai), nên máy
 * build trên EAS không có file này. Khi build trên EAS, tạo biến môi trường kiểu file `GOOGLE_SERVICES_JSON`
 * (`eas env:create --type file`): EAS đưa file đó vào máy build và đặt đường dẫn của nó vào biến này.
 * Ở máy local biến không có nên vẫn dùng ./google-services.json như app.json.
 *
 * Đăng nhập Facebook: App ID và Client Token của app Facebook cũng không đưa vào repo công khai. Có đủ hai biến
 * `FACEBOOK_APP_ID` và `FACEBOOK_CLIENT_TOKEN` (trong .env khi chạy prebuild ở máy, hoặc biến môi trường EAS) thì thêm
 * plugin `react-native-fbsdk-next` và đặt `extra.facebookConfigured` để app biết nút Facebook dùng được; thiếu thì bỏ plugin,
 * các bản build khác (web, CI, prototype) vẫn chạy bình thường. Đổi các giá trị này phải prebuild lại thư mục android/.
 *
 * Đăng nhập Google: thư viện cần Web client ID để Google trả về ID token cho Firebase. Giá trị này nằm sẵn trong
 * `google-services.json` (mục `oauth_client` có `client_type` 3, chỉ có sau khi bật Google trong Firebase) nên đọc từ
 * chính file đó vào `extra.googleWebClientId`: mỗi môi trường tự lấy đúng client của Firebase project của nó.
 *
 * Tự cập nhật APK: `ANDROID_VERSION_CODE` (CD đặt bằng số lần chạy workflow) là versionCode của APK; phải tăng sau mỗi lần
 * phát hành để Android cho cài đè và để app so với version.json. Thiếu thì là 1. Có `EXPO_PUBLIC_UPDATE_URL` thì khai
 * quyền cài APK; bản không có biến này (dev, Play Store) không xin quyền đó vì Play không cho phép.
 */
const fs = require('fs');
const path = require('path');

/** Web client ID trong google-services.json; không có file hoặc chưa bật Google thì trả undefined (nút Google báo lỗi rõ). */
function readGoogleWebClientId(file, packageName) {
  if (!file) return undefined;
  try {
    const json = JSON.parse(fs.readFileSync(path.resolve(__dirname, file), 'utf8'));
    const clients = (json.client ?? []).filter((c) => !packageName || c.client_info?.android_client_info?.package_name === packageName);
    for (const c of clients) {
      const web = [...(c.oauth_client ?? []), ...(c.services?.appinvite_service?.other_platform_oauth_client ?? [])].find(
        (o) => o.client_type === 3,
      );
      if (web?.client_id) return web.client_id;
    }
  } catch {
    // Bản web, bản CI kiểm tra và máy chưa có file: không cần Google trên điện thoại
  }
  return undefined;
}

module.exports = ({ config }) => {
  const facebookAppId = process.env.FACEBOOK_APP_ID;
  const facebookClientToken = process.env.FACEBOOK_CLIENT_TOKEN;
  const facebookConfigured = Boolean(facebookAppId && facebookClientToken);
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile;
  const googleWebClientId = readGoogleWebClientId(googleServicesFile, config.android?.package);
  const selfUpdate = Boolean(process.env.EXPO_PUBLIC_UPDATE_URL?.trim());

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile,
      versionCode: Number(process.env.ANDROID_VERSION_CODE) || 1,
      permissions: [...(config.android?.permissions ?? []), ...(selfUpdate ? ['android.permission.REQUEST_INSTALL_PACKAGES'] : [])],
    },
    plugins: [
      ...(config.plugins ?? []),
      ...(facebookConfigured
        ? [
            [
              'react-native-fbsdk-next',
              {
                appID: facebookAppId,
                clientToken: facebookClientToken,
                displayName: config.name,
                // Facebook trả về app qua scheme dạng fb<App ID>
                scheme: `fb${facebookAppId}`,
                // Chỉ dùng để đăng nhập: không thu thập mã quảng cáo hay ghi sự kiện tự động
                advertiserIDCollectionEnabled: false,
                autoLogAppEventsEnabled: false,
                isAutoInitEnabled: true,
              },
            ],
          ]
        : []),
    ],
    extra: { ...config.extra, facebookConfigured, googleWebClientId },
  };
};
