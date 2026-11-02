# ADR-0009: Trace mỗi lượt Agent chat lên HoneyHive, che dữ liệu nhạy cảm trước

- **Trạng thái:** Accepted cho phần AI, code đã merge vào `staging` qua PR #467. Phần tương quan với Core ở mục 4 vẫn Proposed và cần owner duyệt riêng theo [AGENTS.md](../../../AGENTS.md#scope).
- **Ngày:** 2026-11-01
- **Owner:** project owner quyết định gửi nội dung chat lên HoneyHive; owner AI service giữ code và test.
- **Liên quan:** [`NFR-007`, `NFR-008`](../../product/product-requirements.md), [ADR-0006](0006-deterministic-agent-guardrails.md), [ADR-0008](0008-bifrost-owns-routing-and-fallback.md), [AI README](../../../backend/ai/README.md#observability), [`src/observability.py`](../../../backend/ai/src/observability.py), [bộ eval](../../../backend/ai/evaluation/agent_chat/README.md).

## 1. Bối cảnh

Khi owner báo "chat chậm" hoặc "trả lời sai", đội cần xem lại đúng câu hỏi, SQL model viết, kết quả tool và câu trả lời của lượt đó, và cần so sánh hai phiên bản prompt trên cùng bộ câu hỏi. Trace chỉ có thời gian và token không trả lời được câu "vì sao sai".

Logfire trước đây chạy với `include_content=False`. HoneyHive thay Logfire vì nó gộp trace, session, experiment và evaluator trong một chỗ, và nhận span OpenTelemetry của Pydantic AI mà không cần code riêng cho từng span.

## 2. Quyết định

### 2.1. Nội dung lên trace

- Pydantic AI chạy với `include_content=True` và `include_binary_content=False`: span chứa system prompt, câu hỏi, lịch sử, SQL, kết quả tool và câu trả lời, nhưng không chứa ảnh hay audio.
- `NFR-008` cho phép tên và số điện thoại khách đi tới HoneyHive, và chỉ HoneyHive. Bifrost giữ `disable_content_logging: true`.
- Không có biến môi trường để tắt nội dung. Muốn tắt thì đổi tham số trong `Observability.start` và deploy, hoặc xóa `HH_API_KEY` để tắt hẳn trace.

### 2.2. Guardrail chạy trước trace

`InputRedaction` ([ADR-0006](0006-deterministic-agent-guardrails.md)) thay key, token, số thẻ, IBAN và email trong câu hỏi bằng `[redacted:<tên>]` trước khi session mở và trước khi model chạy. Bản đã che là bản model thấy, bản được lưu vào lịch sử và bản HoneyHive nhận, nên lịch sử và memory gửi lên ở lượt sau cũng đã che.

| Nguồn nội dung | Qua guardrail | Ghi chú |
|---|---|---|
| Câu hỏi của owner | Có, `InputRedaction` | Số điện thoại không bị che, vì model cần số thật để tra |
| Lịch sử và memory | Có, vì được lưu từ bản đã che | |
| SQL và tham số tool | Không cần | Model viết từ câu hỏi đã che |
| Kết quả tool | Không | Các view `ai_read` không có tên và số điện thoại khách; `v_shop_profile` có số của chính shop |
| Câu trả lời | Không | Câu trả lời bị `AnswerScreen` từ chối vẫn nằm trong span |

FastAPI không được instrument, vì span HTTP sẽ ghi body chưa che.

### 2.3. Một session cho mỗi lượt chat

`AgentService` mở session sau `InputRedaction` và đóng session khi có câu trả lời. Session id đặt cục bộ trong OTel baggage, nên lượt chat không chờ HoneyHive và các request đồng thời không lẫn session.

| Lúc | Gửi lên session |
|---|---|
| Mở | `inputs.question` đã che, `user_properties.user_id`, `metadata.shop_id`, `metadata.conversation_id`, `metadata.model`, `metadata.prompt_version`, `metadata.git_sha` |
| Đóng | `outputs.answer`, `metrics` gồm token vào, token đọc từ cache, token ra, số lần gọi model, số tool call, và `first_text_ms` với lượt stream: thời gian từ lúc lượt tới đến chữ đầu tiên owner thấy, gồm cả recall memory và câu dạo đầu bị `Reset` |
| Lỗi | `metadata.error`: mã guardrail như `answer_timeout`, tên loại exception, hoặc `cancelled` khi owner đóng stream |
| Sau khi lưu lượt đầu | `metadata.conversation_id` của cuộc trò chuyện mới |

`prompt_version` là 12 ký tự đầu SHA-256 của instructions và định nghĩa tool, nên lọc session hoặc so hai lần eval theo prompt mà không cần đặt tên phiên bản bằng tay. `git_sha` là commit mà `deploy-backend.yml` truyền vào image, nên một lỗi mới tách được theo bản phát hành. Memory chạy trong context của lượt chat nên span của nó vào cùng session và mang `shop_id` như span chat; span embedding cũng được trace. Draft không mở session, và SDK bỏ span không có session. `HH_SAMPLE_RATE` (mặc định 1) chọn tỉ lệ lượt được trace; lượt ngoài mẫu không mở session nên SDK bỏ mọi span của nó. Mỗi lần cập nhật session chờ session được tạo xong, tối đa 5 giây, vì HoneyHive bỏ bản cập nhật cho session chưa có; SDK trả `None` thay vì báo lỗi khi tạo session thất bại, nên app ghi `WARNING`. Cập nhật session là lời gọi HTTP chặn, nên chạy trên hai thread riêng thay vì thread pool mặc định mà các lời gọi DB dùng. SDK ghi một `WARNING` cho mỗi span bị bỏ vì không có session; lượt ngoài mẫu và draft cố ý như vậy, nên app lọc dòng đó. Khi app tắt, `lifespan` chờ memory ghi xong tối đa 10 giây rồi hủy phần còn chạy trước khi đóng pool DB, chờ các lần cập nhật session tối đa 10 giây, flush span còn trong hàng đợi tối đa 5 giây, rồi tắt tracer. `deploy/vps/compose.yaml` cho container AI 60 giây để dừng, vì stream đang mở có thể chạy tới giới hạn 35 giây trước các bước trên; mặc định 10 giây của Docker sẽ giết process trước khi flush. Tracing bắt đầu trong `lifespan` chứ không lúc import, và test xóa `HH_API_KEY`, nên chạy test không gửi gì lên HoneyHive.

### 2.4. Eval và evaluator

- [`evaluation/agent_chat`](../../../backend/ai/evaluation/agent_chat/README.md) chạy agent thật trên shop giả bằng `honeyhive.experiments.evaluate`, mỗi câu hỏi 3 lần, ghi model, `prompt_version` và `suite_version` (băm các case và seed) vào từng dòng để so hai lần chạy. Seed có đơn lúc 00:30 và 23:30 giờ shop, giảm giá, đơn hủy, nợ đã trả một phần hoặc trả hết và một sản phẩm ngừng bán, nên lỗi múi giờ hay thiếu bộ lọc làm sai đáp án. Case có số chấm bằng SQL trên bảng gốc; case chấm theo ý (tồn kho tối thiểu, ngoài phạm vi, mặt hàng bán chạy) do một model chấm theo tiêu chí viết sẵn.
- Evaluator online nằm trong code ở [`evaluation/honeyhive`](../../../backend/ai/evaluation/honeyhive/README.md): hai evaluator Python chấm mọi lời gọi `query_shop_data` bị từ chối, và chấm `outputs.answer` của session khi câu trả lời lộ tên view, SQL hay tên tool. Session chứ không phải span agent, vì lượt kết thúc sớm sau nút màn hình không có output trên span agent; HoneyHive chấm lại session khi câu trả lời tới sau (kiểm ngày 2026-11-01). Không dùng LLM judge online, vì nó gửi câu hỏi và câu trả lời của owner qua HoneyHive tới một nhà cung cấp model khác, ngoài luồng dữ liệu `NFR-008` cho phép. Ba alert theo ngày (p95 lượt chat trên 20 giây, tỉ lệ query lỗi trên 20%, hơn 5 lượt lỗi không tính lượt bị hủy), chỉ trên traffic có `source` là `production`, cũng nằm ở đó, gửi email cho thành viên project, và được tạo bằng control plane key mà AI service không đọc.
- Feedback từ người dùng chưa làm, vì cần API Core và UI mobile.

## 3. Phương án đã loại

- **Giữ Logfire với `include_content=False`:** không trả lời được vì sao một câu trả lời sai, và không có experiment để so prompt.
- **Che ở biên trace bằng cách bọc exporter của HoneyHive:** model vẫn thấy dữ liệu gốc, nhưng phụ thuộc code nội bộ của SDK. Pydantic AI không có hook biến đổi nội dung, và OTel `_on_ending` chạy khi thuộc tính span đã khóa.
- **Chạy `InputRedaction` trên kết quả tool:** chặn được email hay số thẻ lẫn trong dữ liệu shop, nhưng đổi điều model thấy; các view hiện không có cột nào như vậy.
- **Guardrail của Bifrost:** là tính năng enterprise và chạy sau khi span đã tạo.
- **Langfuse:** đã gỡ khỏi cấu hình; HoneyHive phủ cùng nhu cầu.

## 4. Tương quan với Core (Proposed)

Core chưa gửi `traceparent` sang AI và chưa ghi trace id vào log. Đề xuất: Core sinh `traceparent` cho mỗi lượt gọi AI và ghi trace id vào log, AI nhận context đó. Việc này chạm Core nên cần project owner duyệt; trước khi duyệt, AI giữ mặc định.

## 5. Hệ quả và rủi ro

- Tên và số điện thoại khách mà owner gõ nằm trên HoneyHive trong thời gian lưu của gói đang dùng. Chưa rà nghĩa vụ pháp lý về dữ liệu cá nhân; `AGENTS.md` yêu cầu nguồn chính thức, người chịu trách nhiệm và phê duyệt rõ ràng.
- Gói free giới hạn số event mỗi tháng; một lượt có memory và một tool call tạo khoảng 7 event, chưa tính các lần cập nhật session, và một lần chạy eval đủ bộ tạo vài trăm. Khi lưu lượng gần chạm giới hạn, hạ `HH_SAMPLE_RATE` trên production.
- Cost trên HoneyHive là 0: Pydantic AI tính giá bằng `genai-prices`, bản mới nhất (0.2.1) chưa có giá `claude-haiku-5-5`. Chi phí xem ở Bifrost hoặc hóa đơn provider cho tới khi có giá.
- Nếu HoneyHive chậm hoặc ngừng, lượt chat vẫn trả lời; chỉ mất trường session và span của lượt đó.
- Stdout log ở mức INFO và WARNING chỉ ghi tên tool, id lời gọi, độ dài, mã lỗi hoặc loại lỗi; SQL, kết quả tool, lý do lỗi và traceback của memory chỉ có ở DEBUG, nên đừng bật DEBUG trên staging hoặc production.
- Fixture `spans` trong `test_observability.py` tự dựng `InstrumentationSettings`; một test riêng khóa các tham số mà `Observability.start` truyền vào.

## 6. Kiểm chứng

- `tests/unit_tests/test_observability.py`: nội dung có trong span, media không có, email bị che trước khi vào span, session mở với câu hỏi đã che và đóng với câu trả lời và token, lượt stream ghi `first_text_ms`, lượt quá thời gian và stream bị đóng ghi `metadata.error`, lượt ngoài mẫu không gửi gì, session bị từ chối ghi `WARNING`, tin nhắn bị guardrail từ chối không mở session, HoneyHive treo không giữ lượt chat, flush gửi cập nhật session trước span rồi tắt tracer, mọi lời gọi khớp chữ ký SDK thật, hai lượt chạy đồng thời giữ đúng session của mình, log INFO không chứa nội dung lượt chat.
- Lượt thật trên `smartledger-local-db` (2026-11-01): session có `git_sha`, `first_text_ms` và điểm `internal-leak`; lượt quá thời gian có `metadata.error = answer_timeout`; span memory mang `shop_id`; span embedding có mặt. Một session nhận câu trả lời lộ SQL sau 3 giây được chấm `internal-leak = True`.
- Bắt byte OTLP local (2026-11-01): có câu hỏi, SQL, kết quả tool, câu trả lời; email và số thẻ đã che.
- Chưa kiểm: trace thật trên staging và production.

## Nguồn

Đọc ngày 2026-11-01: [HoneyHive docs](https://docs.honeyhive.ai/v2), mã nguồn SDK `honeyhive` 1.8.1 (`tracer/core/context.py`, `tracer/processing/span_processor.py`), [Pydantic AI instrumentation](https://ai.pydantic.dev/logfire/).
