### [2026-10-21 07:58 UTC+07:00] — [Eval] Không gửi được báo cáo cho opus 5.5 qua `claude -p`

**Status:** Open

**Blocked by:** Mọi model ngoài haiku đều trả `API Error: 400 Upstream request failed: Model is unavailable` khi gọi `claude -p`. Đã thử `claude-opus-5-5`, alias `opus`, `claude-opus-5`, `claude-sonnet-5-5`, `claude-fable-5-1` — tất cả cùng lỗi. `claude-haiku-5-5 --effort high` chạy được, nên CLI và xác thực vẫn bình thường; chỉ upstream không phục vụ các model còn lại.

**Impact:** Bước cuối của yêu cầu — gửi thay đổi và báo cáo cho opus 5.5 medium — chưa thực hiện được. Báo cáo đã sẵn sàng tại `eval/reports/bakeoff_v1.md` và `eval/reports/bakeoff_v1.json`.

**Next action:** Thử lại `claude -p --model claude-opus-5-5 --effort medium` khi model khả dụng trở lại; nội dung cần gửi nằm trong hai tệp báo cáo trên.

---

### [2026-10-21 07:58 UTC+07:00] — [Voice STT] Không có bản ghi âm để chạy trục STT (P5)

**Status:** Open

**Blocked by:** Trong repository không có tệp âm thanh nào, và không có thiết bị Android kết nối. Hotwords còn cần vá native cho `react-native-sherpa-onnx@0.4.4`.

**Impact:** Toàn bộ trục STT của plan §8.1 (S0 greedy · S1 beam · S2 beam + hotwords), cùng các thử nghiệm silence pad và overlapped processing, chưa đo được. Bằng chứng STT duy nhất vẫn là PoC v2 (TTS, 512 câu): WER 22,2% → 20,6% và product-hit 50,0% → 57,4% khi bật hotwords, tức cải thiện 7,2% tương đối — dưới ngưỡng ≥20% mà plan đặt ra để chấp nhận S2, và false-auto tăng từ 1,4% lên 3,7%.

**Next action:** Cần bộ ghi âm thật (tối thiểu vài trăm câu, nhiều vùng giọng) và một máy Android thật; sau đó chạy lại P5 và dùng chính D1 audio đó để fit lại trọng số nhiễu D2 trong `eval/lib/synth_rules.vi.ts`.

---

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
