# Hướng dẫn nạp mô hình Zipformer-30M Streaming ONNX

Mô hình nhận diện giọng nói tiếng Việt on-device sử dụng kiến trúc **Zipformer-30M RNN-T Streaming (6000h)**.

### 1. Vị trí đặt file Model:
Đặt các file sau vào thư mục `assets/models/`:
- `encoder.onnx` (hoặc `encoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx`)
- `decoder.onnx` (hoặc `decoder-epoch-31-avg-11-chunk-32-left-128.fp16.onnx`)
- `joiner.onnx` (hoặc `joiner-epoch-31-avg-11-chunk-32-left-128.fp16.onnx`)
- `tokens.txt`
- `bpe.model`

### 2. Tải mô hình mẫu:
Bạn có thể tải bộ file model Zipformer-30M đã lượng tử hóa FP16/INT8 từ kho mã nguồn mở:
👉 [k2-fsa/sherpa-onnx Vietnamese Zipformer Models](https://github.com/k2-fsa/sherpa-onnx/releases)

### 3. Hoạt động trên App Mobile / Web:
Khi chạy ứng dụng trên thiết bị di động hoặc trình duyệt:
- Ứng dụng tự động kết nối Micro và sử dụng bộ xử lý bóc tách on-device trong `src/sst/` để khử từ đệm, sửa lỗi cà lăm, khớp menu quán và tạo đơn hàng trong 2ms!
