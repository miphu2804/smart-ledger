# ADR-0008: Bifrost giữ routing và fallback upstream, AI chỉ chọn alias

- **Trạng thái:** Accepted — chủ dự án chốt hướng này ngày 2026-10-30
- **Ngày:** 2026-10-30
- **Owner:** chưa chỉ định

## Bối cảnh

- AI cần gọi cùng một model qua nhiều upstream (trước đây OpenCode Go và OpenAI) và chuyển upstream khi gặp lỗi tạm thời như 429, mà không đổi code ở `agent`, `memory` và `drafts`.
- Trước đây `build_chat_model` chọn API theo `MODEL_PROVIDER`, còn fallback nằm trong `MODEL_FALLBACKS` ở Python, nên mọi đổi upstream đều cần đổi cấu hình AI và deploy lại.
- Bifrost tự host đã chạy ở staging. Nó ghi log từng request gồm provider, model, độ trễ, token, chi phí, chuỗi fallback và rule đã khớp, nên là nơi tự nhiên để xem request lên upstream.
- Nội dung tin nhắn chỉ đi tới HoneyHive ở tầng Agent (`NFR-008`), nên log của Bifrost không cần giữ nội dung.
- Production chưa có Bifrost, chạy image cũ trước khi có alias (#436) và gọi thẳng OpenCode Go; thay đổi ở mục Cập nhật không áp dụng cho production.

## Quyết định

- Ứng dụng xin model bằng `LLMFactory.create_model(alias)`. `MODEL_ALIASES` ánh xạ alias sang `protocol` và `model`, nên ứng dụng không biết upstream là ai.
- Mỗi protocol có một lớp provider riêng (`OpenAIChatProvider`, `OpenAIResponsesProvider`), cùng phương thức `create_model(model_name)`, không có base class vì dự án chỉ có một caller.
- Routing và fallback upstream nằm trong routing rules của [`deploy/vps/bifrost.json`](../../../deploy/vps/bifrost.json). Hiện chưa có rule nào, vì mỗi model chỉ có một upstream; thêm fallback sang model khác chỉ khi chủ dự án chấp nhận đổi hành vi.
- Bifrost lưu log 14 ngày với `disable_content_logging: true`. Ứng dụng gửi `x-bf-session-id` để gom log theo hội thoại và `x-bf-lh-shop-id` để gắn shop vào metadata.
- `MODEL_FALLBACKS` ở Python được giữ, theo dạng `protocol:model`, cho tới khi production chạy Bifrost; khi đó xóa nó trong một thay đổi riêng.

## Hệ quả

- Đổi upstream hoặc fallback chỉ cần sửa `bifrost.json` và deploy Bifrost, không deploy lại AI.
- Bifrost UI chỉ hiện metadata, không hiện prompt và câu trả lời; muốn đọc nội dung thì xem trên HoneyHive.
- Tạm thời có hai nơi định nghĩa fallback, tùy môi trường có Bifrost hay không.
- Bifrost là một điểm lỗi mới trên đường gọi model ở staging; giám sát uptime theo dõi ở [issue #435](https://github.com/miphu2804/smart-ledger/issues/435).

## Cập nhật 2026-11-01: OpenAI native, Inception, bỏ Anthropic và OpenCode Go

- **Vì sao:** trên staging mọi lượt chat bị Bifrost trả `401 virtual key is required`. Alias `chat` dùng `anthropic_messages`, SDK Anthropic gửi khóa trong `x-api-key`, mà Bifrost chỉ nhận `x-api-key` và `Authorization: Bearer` cho khóa có tiền tố `sk-bf-`; virtual key cũ chỉ qua `x-bf-vk`. Chủ dự án cũng đã bỏ OpenCode Go.
- **Model:** alias `chat` chạy `gpt-6-luna` trên provider `openai` gốc của Bifrost qua `openai_responses`, effort `high`. `effort` nằm trong từng alias của `MODEL_ALIASES`; `MODEL_REASONING_EFFORT` chỉ là mặc định khi alias không khai báo.
- **Header:** `OpenAIChatProvider` và `OpenAIResponsesProvider` dựng `AsyncOpenAI` với `default_headers={"x-bf-vk": api_key}`. Header nằm trên client vì `extra_headers` của mỗi lượt chạy thay cả bộ header của model.
- **Xóa:** đường `anthropic_messages` (`AnthropicMessagesProvider`, `ANTHROPIC_BASE_URL`, extra `anthropic` của pydantic-ai), hai provider và hai routing rule OpenCode Go, các header `x-opencode-session` và `x-bf-eh-*`. `openai_chat` được giữ vì Mercury chỉ có `/chat/completions`.
- **Inception:** `bifrost.json` có provider tùy chỉnh `inception` (`base_provider_type: openai`, `https://api.inceptionlabs.ai`) cho `mercury-3`, khóa lấy từ biến môi trường `INCEPTIONLABS_API_KEY`. `vk-ai` cho phép đúng `gpt-6-luna` và `mercury-3`. Mercury 3 chưa được test thực tế nên chưa có alias hay fallback nào trỏ tới; muốn dùng thì thêm alias `openai_chat` sau khi chạy [bộ đánh giá chat](../../../backend/ai/evaluation/agent_chat/README.md) với effort `medium` và `high` so với `gpt-6-luna`.
- **Thử lại:** cả hai provider đặt `max_retries: 1` và `retry_backoff_initial: 500` ms.
- **Việc của chủ dự án:** đặt `MODEL_ALIASES` trong Dopbase `ai/staging`, thêm `INCEPTIONLABS_API_KEY` vào secrets của Bifrost, xóa `OPENCODE_GO_API_KEY`, chạy lại playbook để Bifrost nạp `bifrost.json` mới.

## Cập nhật 2026-11-04: AI chọn alias theo độ phức tạp của từng lượt chat

- **Vì sao:** câu hỏi dễ cần trả lời nhanh trên `mercury-3`, câu khó cần `gpt-6-luna`. Complexity Router của Bifrost phân tier được, nhưng target của routing rule chỉ ghi đè provider, model, `key_id` và fallbacks, không đổi được reasoning effort. Inception chỉ có `/chat/completions` trong khi `gpt-6-luna` chạy qua `openai_responses`, và tài liệu Bifrost không hứa chuyển Responses sang Chat cho custom provider. Vì vậy AI chọn alias cho từng lượt, còn Bifrost vẫn giữ upstream và fallback như quyết định gốc.
- **Quyết định:** khi `MODEL_TIERING_ENABLED=true`, `ModelTierSelector` (`backend/ai/src/agent/model_tier_selector.py`) gửi tin nhắn mới nhất của chủ shop, kèm một tin nhắn trước đó của họ, tới `typesafe/jev-latest` qua `/v1/decisions` của Bifrost. Câu trả lời của trợ lý không bao giờ được gửi. SIMPLE chạy `chat-simple`, MEDIUM chạy `chat-medium`, COMPLEX chạy `chat-complex`; model và effort của từng alias nằm trong `MODEL_ALIASES` (xem [README của AI](../../../backend/ai/README.md#model-tiers)).
- **Theo hội thoại:** giống session-aware routing của Bifrost, hội thoại giữ tier cao nhất đã đạt và chỉ đi lên; đã COMPLEX thì không gọi Jev nữa. Tier nằm trong bộ nhớ tiến trình 24 giờ, khởi động lại chỉ làm lượt sau phải phân loại lại, nên không cần migration.
- **Khi lỗi:** Jev lỗi, quá `TIER_CLASSIFIER_TIMEOUT_SECONDS` (mặc định 1,5 giây) hoặc từ chối trả lời thì lượt đó chạy `chat-complex`, và tier này không được giữ cho hội thoại. Mỗi lượt chọn model một lần, mọi bước gọi tool trong lượt dùng cùng model. Việc phân loại chạy song song với memory recall.
- **Bifrost:** `bifrost.json` thêm provider `typesafe` (khóa `TYPESAFE_API_KEY`, `max_retries: 0` để thử lại không vượt quá thời gian chờ), cho `vk-ai` dùng `jev-latest`, và giới hạn `inception` ở `chat_completion` và `chat_completion_stream`.
- **Công tắc:** mặc định tắt, mọi lượt chạy `chat` như trước. Chỉ bật ở staging sau khi chạy [bộ đánh giá chat](../../../backend/ai/evaluation/agent_chat/README.md) hai lần trên cùng `suite_version`, chỉ `chat` và có tier, và thử trực tiếp `gpt-6-luna` với effort `xhigh`; bật ở production cần chủ dự án duyệt.
- **Việc của chủ dự án:** thêm `TYPESAFE_API_KEY` vào secrets của Bifrost và chạy lại playbook; đặt `MODEL_ALIASES` có ba alias tier, `TIER_CLASSIFIER_URL` và `MODEL_TIERING_ENABLED` trong Dopbase `ai/staging`.
