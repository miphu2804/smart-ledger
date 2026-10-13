# Agent prompt: Voice Parse PoC

Dán nguyên khối dưới đây vào session agent (Opus, effort xhigh).

```text
/goal Hoàn thành PoC parse giọng nói tiếng Việt thành dòng nháp đơn bán trên máy (hotword + ITN + n-gram linker + CRF + gate), từ research đến khi train xong CRF và đạt mục tiêu chỉ số, theo đúng brief.

Bối cảnh: repo SmartLedger, nhánh `feat/voice-parse-poc` (đã push, tạo từ `staging`). Bước đầu tiên: `git fetch && git switch feat/voice-parse-poc`, rồi đọc toàn bộ `docs/development/voice-parse-poc-brief.md` và các file kèm theo trong `docs/development/voice-parse-poc/`. Brief là nguồn sự thật cho goal, các phương án đã loại (không research lại), kiến trúc L0–L4, dữ liệu, chỉ số §7 và plan §8.

Cách làm:
- Làm tuần tự theo plan §8. Mỗi bước phải chạy verify và ghi lại kết quả. Dừng sớm khi đã đạt chỉ số §7, không làm thêm cho đủ plan.
- Dùng skill `long-horizon-state` (nếu có) để lưu tiến độ, để resume được sau khi compact hoặc crash.
- Tự quyết các chi tiết kỹ thuật theo convention của repo; chỉ hỏi khi mọi lựa chọn đều không an toàn.
- Brief đánh dấu phần nào [đã kiểm chứng] và [suy luận]. Phần [suy luận] (đặc biệt là wrapper `react-native-sherpa-onnx` có hỗ trợ hotwords không) phải tự kiểm chứng lại. Nhánh tạo từ staging mới nhất, nên đọc lại code trước khi tin số liệu trong brief.
- Tuân thủ `AGENTS.md` và `CONTRIBUTING.md`: không sửa `backend/core`; commit Conventional Commits tiếng Anh, chữ thường, ≤ 72 ký tự, mỗi commit một thay đổi logic; `PROGRESS.md` chỉ được thêm; blocker thì ghi vào `BLOCKERS.md`.
- Được commit và push lên `feat/voice-parse-poc`. KHÔNG mở PR, không merge, không push vào `staging`/`main`, không sửa `backend/ai` hay API contract nếu chưa hỏi owner.
- Không có máy Android hoặc emulator thì ghi L0 vào BLOCKERS là chưa kiểm chứng và làm tiếp L1–L4.

Điều kiện hoàn thành, phải chứng minh bằng output thật:
1. Một lệnh chạy được eval, in bảng chỉ số §7 cho cả baseline lẫn PoC trên tập test.
2. CRF đã train, trọng số xuất ra JSON, decoder Viterbi bằng TS khớp 100% với Python trên bộ eval.
3. PoC giữ nguyên interface `parseOrder(text, products)`; `npm run typecheck` trong `frontend/mobile` pass; không có câu nào từ đúng thành sai so với baseline.
4. Báo cáo cuối bằng tiếng Việt: bảng baseline so với PoC, độ trễ P95, những gì đã kiểm chứng và chưa kiểm chứng, rủi ro, bước tiếp theo. Chưa đạt mục tiêu thì báo trung thực ranh giới cuối cùng đã kiểm chứng cùng blocker.
```
