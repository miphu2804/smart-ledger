/**
 * Config plugin: giảm dung lượng APK Android ở những chỗ expo-build-properties không có tuỳ chọn.
 *
 * - Tắt FFmpeg và libarchive trong react-native-sherpa-onnx (`sherpaOnnxDisableFfmpeg`, `sherpaOnnxDisableLibarchive`,
 *   đọc từ gradle.properties). App chỉ dùng nhận dạng streaming với PCM đọc từ mic (`src/lib/speech/sherpaEngine.ts`), tải model
 *   từng file .onnx; không đổi định dạng audio (`convertAudio*`) hay giải nén `.tar.bz2` (`extractTarBz2`), nên hai thư
 *   viện này chỉ làm APK nặng thêm ở mỗi ABI. Muốn dùng lại các hàm đó thì bỏ cờ tương ứng.
 * - Chỉ giữ chuỗi tiếng Việt và tiếng Anh của các thư viện (Firebase, Facebook SDK, AndroidX mang theo hàng chục ngôn ngữ).
 *
 * Nén thư viện native, R8 và thu gọn resource đặt qua expo-build-properties trong app.json.
 * Chạy khi `expo prebuild`; đổi file này phải prebuild lại thư mục android/.
 */
const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

const GRADLE_PROPERTIES = {
  sherpaOnnxDisableFfmpeg: 'true',
  sherpaOnnxDisableLibarchive: 'true',
};

const LOCALES = ['vi', 'en'];
const LOCALE_LINE = `        resourceConfigurations += [${LOCALES.map((l) => `"${l}"`).join(', ')}]`;

function withSherpaFlags(config) {
  return withGradleProperties(config, (cfg) => {
    for (const [key, value] of Object.entries(GRADLE_PROPERTIES)) {
      cfg.modResults = cfg.modResults.filter((item) => !(item.type === 'property' && item.key === key));
      cfg.modResults.push({ type: 'property', key, value });
    }
    return cfg;
  });
}

function withLocaleFilter(config) {
  return withAppBuildGradle(config, (cfg) => {
    const src = cfg.modResults.contents;
    if (src.includes('resourceConfigurations')) return cfg;
    if (!/defaultConfig\s*\{/.test(src)) {
      throw new Error('withAndroidApkSize: không tìm thấy khối defaultConfig trong android/app/build.gradle');
    }
    cfg.modResults.contents = src.replace(/defaultConfig\s*\{/, (m) => `${m}\n${LOCALE_LINE}`);
    return cfg;
  });
}

module.exports = function withAndroidApkSize(config) {
  return withLocaleFilter(withSherpaFlags(config));
};
