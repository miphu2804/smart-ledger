# Model nhận dạng giọng nói (sherpa-onnx)

Thư mục này chứa model nhận dạng giọng nói tiếng Việt chạy ngay trên máy (streaming Zipformer / transducer, dùng qua
`react-native-sherpa-onnx`). Các file model (khoảng 49 MB) **không nằm trong git** (xem `.gitignore`) để không làm nặng
lịch sử của repo công khai. Chỉ file README này được theo dõi.

## Cần những file nào

| File | Dùng để | Bắt buộc |
|---|---|---|
| `encoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` | encoder (46,2 MB) | có |
| `decoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` | decoder (2,6 MB) | có |
| `joiner-epoch-31-avg-11-chunk-32-left-128.fp16.onnx` | joiner (2,1 MB) | có |
| `tokens.txt` | bảng 2.000 token BPE | có |
| `bpe.model`, `bpe.vocab` | chỉ cần khi dùng hotword | không (app chưa dùng) |

Thư viện tìm file theo tiền tố tên (`encoder`, `decoder`, `joiner`) và tên `tokens.txt`, nên giữ nguyên tên như trên.
Danh sách file và kích thước mong đợi nằm ở `src/lib/speech/core.ts` (`STT_MODEL_FILES`).

## Lấy model

Từ thư mục gốc của repo, tải model về đúng thư mục này:

```bash
node .github/scripts/stt-model.mjs fetch frontend/mobile/assets/models
```

Script tải từ [`hynt/Zipformer-30M-RNNT-Streaming-6000h`](https://huggingface.co/hynt/Zipformer-30M-RNNT-Streaming-6000h)
(bản `chunk-32`, ghim theo commit trong `SOURCE_REVISION`) và so kích thước với `STT_MODEL_FILES`. Repo đó không có
`tokens.txt`, nên script tạo lại file này từ `bpe.model`: mỗi dòng `<piece> <id>`, xuống dòng CRLF như file gốc của nhóm.
License của model là `cc-by-nc-nd-4.0`: chỉ dùng phi thương mại và không phát hành bản đã sửa.

## App lấy model bằng cách nào

Mặc định app **không đóng gói** model vào APK. Lần đầu mở màn Đọc đơn, app tải 4 file bắt buộc về bộ nhớ của app rồi
dùng lại (kiểm tra bằng kích thước file). Muốn APK chạy offline (ví dụ bản prototype) thì nhúng model vào APK, xem mục
"Nhúng model vào APK" ở cuối. Địa chỉ tải đặt trong `.env`:

```
EXPO_PUBLIC_STT_MODEL_URL=http://<IP máy tính>:8090/
```

Khi phát triển, chạy máy chủ tĩnh nhỏ phục vụ thư mục này:

```
node scripts/serve-stt-model.js
```

Script in ra các địa chỉ để điền vào `EXPO_PUBLIC_STT_MODEL_URL` (emulator Android dùng `http://10.0.2.2:8090/`, điện thoại
thật dùng IP trong Wi-Fi). Script chỉ phục vụ các file trong thư mục này, chỉ đọc, và chỉ nên bật trong mạng tin cậy. Với
điện thoại thật, tường lửa Windows phải cho phép cổng 8090.

Không muốn chạy máy chủ thì trỏ thẳng tới R2: `EXPO_PUBLIC_STT_MODEL_URL=https://pub-<hash>.r2.dev/stt-model/v1/`. Bản
phát hành lấy địa chỉ này từ CI, xem mục dưới.

## Đưa model lên R2

Bản phát hành tải model từ bucket R2 công khai mà APK đang dùng (xem mục "Publish the APK for the landing page" trong
[`docs/development/ci-cd.md`](../../../../docs/development/ci-cd.md#publish-the-apk-for-the-landing-page)), dưới tiền tố
`stt-model/<STT_MODEL_VERSION>/`. Dùng chung bucket vì app tải model không cần đăng nhập, nên bucket phải công khai giống
APK. Model cũng không có gì cần giấu: model nhúng vào APK thì ai cũng giải nén ra được. Không cần DVC: repo không train
model, và DVC lưu file theo hash nên app không tải được theo tên.

Không cần upload tay. Bước "Resolve the speech model URL" của `mobile-release.yml` chạy `.github/scripts/stt-model.mjs`:

1. `check`: đọc `STT_MODEL_VERSION` và `STT_MODEL_FILES` từ `core.ts`, gửi `HEAD` tới từng file dưới
   `<STT_MODEL_BASE_URL>/stt-model/<version>/` và so kích thước.
2. Thiếu hay lệch, và đây là bản phát hành (`publish=true`): `fetch` tải model như mục trên, `aws s3 sync --size-only` đưa
   lên R2 bằng token của bucket APK (chỉ file thiếu hoặc lệch), rồi `check` lại.
3. Đủ file thì build nhận `EXPO_PUBLIC_STT_MODEL_URL=<STT_MODEL_BASE_URL>/stt-model/<version>/`.

Bản thử (dev, staging) không có token R2. Model chưa có trên R2 thì bản đó chỉ cảnh báo, vẫn build nhưng nói không được.
Biến GitHub `STT_MODEL_BASE_URL` là địa chỉ công khai của bucket, ví dụ `https://pub-<hash>.r2.dev`. Thiếu biến này thì bản
phát hành bị từ chối. Kiểm tra R2 từ máy mình:

```bash
STT_MODEL_BASE_URL=https://pub-<hash>.r2.dev node .github/scripts/stt-model.mjs check
```

Đổi model: tăng `STT_MODEL_VERSION`, cập nhật `STT_MODEL_FILES`, rồi đổi `SOURCE_REPO` và `SOURCE_REVISION` trong script. Lần
phát hành sau sẽ đưa model lên tiền tố mới. Không xoá phiên bản cũ, vì APK cũ vẫn tải từ đường dẫn của nó. Lifecycle rule
tuỳ chọn của bucket chỉ được xoá trong `android/production/builds/`, không được chạm vào `stt-model/`.

- Địa chỉ `r2.dev` bị giới hạn tốc độ và không có cache; mỗi người dùng mới tải khoảng 51 MB. Khi dự án có tên miền trên
  Cloudflare thì chỉ cần đổi `STT_MODEL_BASE_URL`.

## Nhúng model vào APK

Plugin `plugins/withBundledSttModel.js` (đăng ký trong `app.json`) chép 4 file bắt buộc ở thư mục này vào
`android/app/src/main/assets/models/stt-model-<STT_MODEL_VERSION>/` mỗi lần `expo prebuild`. Thư mục `android/` đã sinh sẵn
thì chạy `node plugins/withBundledSttModel.js` rồi build. App tự nhận model nhúng và bỏ qua bước tải; model nhúng làm APK
nặng thêm khoảng 49 MB. Máy build thiếu file model thì plugin chỉ cảnh báo, APK vẫn build được và quay về cách tải ở trên.
