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
 */
module.exports = ({ config }) => {
  const facebookAppId = process.env.FACEBOOK_APP_ID;
  const facebookClientToken = process.env.FACEBOOK_CLIENT_TOKEN;
  const facebookConfigured = Boolean(facebookAppId && facebookClientToken);

  return {
    ...config,
    android: {
      ...config.android,
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
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
    extra: { ...config.extra, facebookConfigured },
  };
};
