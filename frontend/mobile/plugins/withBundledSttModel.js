/**
 * Config plugin: nhúng model nhận dạng giọng nói vào APK để app chạy offline, không cần máy chủ tải model.
 *
 * Chép encoder/decoder/joiner (.onnx) và tokens.txt từ `assets/models/` (thư mục git-ignore, xem assets/models/README.md)
 * vào `android/app/src/main/assets/models/stt-model-<phiên bản>/`. Tên thư mục phải trùng `STT_MODEL_VERSION` trong
 * src/lib/speech/core.ts để `sherpaEngine.ts` tự nhận ra model nhúng (xem BUNDLED_MODEL_DIR).
 *
 * Không có model trên máy build thì bỏ qua và cảnh báo: app vẫn build được và rơi về cách tải model qua EXPO_PUBLIC_STT_MODEL_URL.
 * Chạy khi `expo prebuild`; thư mục `android/` đã sinh sẵn thì chạy `node plugins/withBundledSttModel.js` (hoặc prebuild lại).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MODEL_PREFIXES = ['encoder', 'decoder', 'joiner'];

/** Đọc STT_MODEL_VERSION từ core.ts để plugin và app luôn đồng bộ tên thư mục. */
function modelVersion(projectRoot) {
  const src = fs.readFileSync(path.join(projectRoot, 'src', 'lib', 'speech', 'core.ts'), 'utf8');
  const m = src.match(/STT_MODEL_VERSION\s*=\s*'([^']+)'/);
  if (!m) throw new Error('withBundledSttModel: không đọc được STT_MODEL_VERSION trong src/lib/speech/core.ts');
  return m[1];
}

/** Trả về danh sách file model tìm thấy trong assets/models, hoặc null nếu thiếu. */
function findModelFiles(modelsDir) {
  if (!fs.existsSync(modelsDir)) return null;
  const names = fs.readdirSync(modelsDir);
  const files = [];
  for (const prefix of MODEL_PREFIXES) {
    const hit = names.find((n) => n.startsWith(prefix) && n.endsWith('.onnx'));
    if (!hit) return null;
    files.push(hit);
  }
  if (!names.includes('tokens.txt')) return null;
  files.push('tokens.txt');
  return files;
}

/** Chép model vào assets của dự án Android. Trả về true nếu đã nhúng. */
function copyModel(projectRoot) {
  const modelsDir = path.join(projectRoot, 'assets', 'models');
  const files = findModelFiles(modelsDir);
  if (!files) {
    console.warn(
      '[withBundledSttModel] Không thấy đủ file model trong assets/models (encoder, decoder, joiner .onnx và tokens.txt): ' +
        'APK sẽ KHÔNG nhúng model, app sẽ tải model qua EXPO_PUBLIC_STT_MODEL_URL.',
    );
    return false;
  }
  const target = path.join(projectRoot, 'android', 'app', 'src', 'main', 'assets', 'models', `stt-model-${modelVersion(projectRoot)}`);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });
  for (const f of files) fs.copyFileSync(path.join(modelsDir, f), path.join(target, f));
  console.log(`[withBundledSttModel] Đã nhúng ${files.length} file model vào ${path.relative(projectRoot, target)}`);
  return true;
}

module.exports = function withBundledSttModel(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      copyModel(cfg.modRequest.projectRoot);
      return cfg;
    },
  ]);
};
module.exports.copyModel = copyModel;

if (require.main === module) {
  process.exit(copyModel(path.resolve(__dirname, '..')) ? 0 : 1);
}
