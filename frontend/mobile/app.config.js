/**
 * Mở rộng app.json. File cấu hình Firebase của client (`google-services.json`, `GoogleService-Info.plist`) bị .gitignore
 * (repo công khai), nên máy build trên EAS không có các file này. Mỗi EAS environment giữ file của đúng Firebase project:
 * `development`/`preview` dùng project staging, `production` dùng project production. Tạo biến kiểu file
 * `GOOGLE_SERVICES_JSON` và `GOOGLE_SERVICE_INFO_PLIST` (`eas env:set --type file`) trong từng environment: EAS đưa
 * file vào máy build và đặt đường dẫn của nó vào biến. Ở máy local không có biến nên dùng file trong thư mục như app.json.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
  ios: {
    ...config.ios,
    googleServicesFile: process.env.GOOGLE_SERVICE_INFO_PLIST ?? config.ios?.googleServicesFile,
  },
});
