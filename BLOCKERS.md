### [2026-10-14 01:10 UTC+07:00] — [Mobile] Chưa kiểm chứng được hotword L0 của voice parse PoC

**Status:** Open

**Blocked by:** (1) Môi trường chạy PoC không có máy Android hay emulator (không có `adb`/Android SDK, không có `/dev/kvm`), nên không đo được WER tên hàng và độ trễ trên máy. (2) `react-native-sherpa-onnx@0.4.4` chưa bật được hotword cho STT streaming: phần online (Android `SherpaOnnxOnlineSttHelper.kt`, iOS `online_stt/sherpa-onnx-online-stt-wrapper.mm`) không truyền `modelingUnit`/`bpeVocab`. Theo mã sherpa-onnx v1.12.35, `modelingUnit` rỗng làm `EncodeHotwords` gọi `exit(-1)` khi `createStream(hotwords)`; hotwords đi cùng `greedy_search` (app đang dùng) cũng `exit(-1)` lúc decode. App hiện không truyền hotwords nên lỗi chưa xảy ra.

**Impact:** Lớp L0 (hotword sinh từ danh mục) chưa kiểm chứng; L1–L4 của PoC không phụ thuộc L0 và đã đo trên Node. Không được bật hotwords trong app khi chưa patch, vì app sẽ thoát.

**Next action:** Patch wrapper bằng `patch-package`: đặt `modelingUnit = "bpe"` và đường dẫn `bpeVocab` cho `OnlineModelConfig` (Android và iOS), thêm `bpe.vocab` (sinh từ `bpe.model` của model đang dùng) vào `STT_MODEL_FILES`, dùng `modified_beam_search` khi có hotwords; sau đó đo WER tên hàng và độ trễ trên một máy Android thật. Ranh giới đã kiểm chứng: mã wrapper trong `node_modules` và mã upstream v1.12.35; AAR dựng sẵn `com.xdcobra.sherpa:sherpa-onnx` không tải được qua proxy (403) nên giả định giống upstream.

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
