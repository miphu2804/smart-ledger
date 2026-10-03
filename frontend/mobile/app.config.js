/**
 * Mở rộng app.json. `google-services.json` chứa cấu hình Firebase của client và bị .gitignore (repo công khai), nên máy
 * build trên EAS không có file này. Khi build trên EAS, tạo biến môi trường kiểu file `GOOGLE_SERVICES_JSON`
 * (`eas env:create --type file`): EAS đưa file đó vào máy build và đặt đường dẫn của nó vào biến này.
 * Ở máy local biến không có nên vẫn dùng ./google-services.json như app.json.
 */
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? config.android?.googleServicesFile,
  },
});
