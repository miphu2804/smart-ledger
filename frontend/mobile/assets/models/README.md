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

Xin file `models.zip` từ nhóm, giải nén các file trong thư mục `models/` vào đúng thư mục này.

## App lấy model bằng cách nào

App **không đóng gói** model vào APK. Lần đầu mở màn Đọc đơn, app tải 4 file bắt buộc về bộ nhớ của app rồi dùng lại
(kiểm tra bằng kích thước file). Địa chỉ tải đặt trong `.env`:

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

Khi phát hành, đưa 4 file lên một nơi tải được (ví dụ file đính kèm của một GitHub Release) và đặt
`EXPO_PUBLIC_STT_MODEL_URL` trỏ tới đó. Đổi model thì tăng `STT_MODEL_VERSION` trong `src/lib/speech/core.ts` để app tải lại.
