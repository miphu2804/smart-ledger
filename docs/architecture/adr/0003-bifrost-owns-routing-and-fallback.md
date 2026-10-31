# ADR-0003: Bifrost giữ routing và fallback upstream, AI chỉ chọn alias

- **Trạng thái:** Accepted — chủ dự án chốt hướng này ngày 2026-10-30
- **Ngày:** 2026-10-30
- **Owner:** chưa chỉ định

## Bối cảnh

- AI cần gọi cùng một model qua nhiều upstream (OpenCode Go, OpenAI) và chuyển upstream khi gặp lỗi tạm thời như 429, mà không đổi code ở `agent`, `memory` và `drafts`.
- Trước đây `build_chat_model` chọn API theo `MODEL_PROVIDER`, còn fallback nằm trong `MODEL_FALLBACKS` ở Python, nên mọi đổi upstream đều cần đổi cấu hình AI và deploy lại.
- Bifrost tự host đã chạy ở staging. Nó ghi log từng request gồm provider, model, độ trễ, token, chi phí, chuỗi fallback và rule đã khớp, nên là nơi tự nhiên để xem request lên upstream.
- `NFR-008` cấm nội dung tin nhắn trong trace và log. Logfire tiếp tục theo dõi tầng Agent với `include_content=False`.
- Production chưa có Bifrost và gọi thẳng OpenCode Go.

## Quyết định

- Ứng dụng xin model bằng `LLMFactory.create_model(alias)`. `MODEL_ALIASES` ánh xạ alias sang `protocol` và `model`, nên ứng dụng không biết upstream là ai.
- Mỗi protocol có một lớp provider riêng (`OpenAIChatProvider`, `OpenAIResponsesProvider`, `AnthropicMessagesProvider`), cùng phương thức `create_model(model_name)`, không có base class vì dự án chỉ có một caller.
- Routing và fallback upstream nằm trong routing rules của [`deploy/vps/bifrost.json`](../../../deploy/vps/bifrost.json). Rule `luna-fallback` chuyển `gpt-6-luna` từ OpenCode Go sang OpenAI; Claude Haiku không có fallback sang model khác vì đổi model là đổi hành vi.
- Bifrost lưu log 14 ngày với `disable_content_logging: true`. Ứng dụng gửi `x-bf-session-id` để gom log theo hội thoại và `x-bf-lh-shop-id` để gắn shop vào metadata; `x-bf-eh-*` chuyển phiên và User-Agent lên provider.
- `MODEL_FALLBACKS` ở Python được giữ, theo dạng `protocol:model`, cho tới khi production chạy Bifrost; khi đó xóa nó trong một thay đổi riêng.

## Hệ quả

- Đổi upstream hoặc fallback chỉ cần sửa `bifrost.json` và deploy Bifrost, không deploy lại AI.
- Bifrost UI chỉ hiện metadata, không hiện prompt và câu trả lời; muốn đọc nội dung phải đổi quyết định về `NFR-008`.
- Tạm thời có hai nơi định nghĩa fallback, tùy môi trường có Bifrost hay không.
- Bifrost là một điểm lỗi mới trên đường gọi model ở staging; giám sát uptime theo dõi ở [issue #435](https://github.com/miphu2804/smart-ledger/issues/435).
