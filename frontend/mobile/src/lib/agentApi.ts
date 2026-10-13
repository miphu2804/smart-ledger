import type {
  AgentChatMessageView,
  AgentChatRequest,
  AgentConversationSummary,
  AgentConversationView,
} from '../data/types';
import { USE_MOCK } from '../config';
import { ApiError, apiRequest, apiStream } from './api';

/**
 * Trợ lý AI qua Core (`/api/v1/agent/*`, docs/contracts/api-contracts.md §5) — cần header X-Shop-Id.
 * Core lấy user từ token và chuyển tiếp sang AI; FE không gửi user_id hay shop_id trong body.
 * Chat chờ tới 45 giây vì model có thể gọi công cụ đọc dữ liệu tiệm trước khi trả lời.
 */
const CHAT_TIMEOUT_MS = 45000;

export const agentApi = {
  /** POST /agent/chat — bỏ `conversation_id` để mở hội thoại mới */
  chat: (input: AgentChatRequest): Promise<AgentChatMessageView> =>
    apiRequest<AgentChatMessageView>('/agent/chat', {
      method: 'POST',
      body: input,
      withShop: true,
      timeoutMs: CHAT_TIMEOUT_MS,
    }),
  /**
   * POST /agent/chat/stream — cùng lượt hỏi như `chat` nhưng trả lời dần: `onText` nhận toàn bộ chữ đã tới
   * (rỗng khi AI báo `reset`), Promise trả câu cuối từ sự kiện `done`. Sự kiện `error` mang mã lỗi như `chat`.
   * Khi bật mock thì hỏi `chat` rồi hiện cả câu một lần.
   */
  chatStream: async (input: AgentChatRequest, onText: (text: string) => void): Promise<AgentChatMessageView> => {
    if (USE_MOCK) {
      const reply = await agentApi.chat(input);
      onText(reply.answer);
      return reply;
    }
    let text = '';
    let reply: AgentChatMessageView | null = null;
    await apiStream('/agent/chat/stream', { body: input, withShop: true, timeoutMs: CHAT_TIMEOUT_MS }, (event, data) => {
      if (event === 'delta') onText((text += (data as { text: string }).text));
      else if (event === 'reset') onText((text = ''));
      else if (event === 'done') reply = data as AgentChatMessageView;
      else if (event === 'error') {
        const code = (data as { detail?: string }).detail ?? 'ai_unavailable';
        throw new ApiError(0, code, 'Trợ lý AI đang tạm lỗi hoặc quá tải.');
      }
    });
    if (!reply) throw new ApiError(0, 'ai_unavailable', 'Trợ lý AI đang tạm lỗi hoặc quá tải.');
    return reply;
  },
  /** GET /agent/conversations — hội thoại của user/tiệm hiện tại */
  listConversations: (): Promise<AgentConversationSummary[]> =>
    apiRequest<AgentConversationSummary[]>('/agent/conversations', { withShop: true }),
  getConversation: (conversationId: number): Promise<AgentConversationView> =>
    apiRequest<AgentConversationView>(`/agent/conversations/${conversationId}`, { withShop: true }),
  /** PATCH — tiêu đề 1–255 ký tự, không rỗng */
  rename: (conversationId: number, title: string): Promise<AgentConversationSummary> =>
    apiRequest<AgentConversationSummary>(`/agent/conversations/${conversationId}`, {
      method: 'PATCH',
      body: { title },
      withShop: true,
    }),
  /** DELETE — xoá hội thoại khỏi lịch sử và ngữ cảnh trợ lý (204) */
  remove: (conversationId: number): Promise<void> =>
    apiRequest<void>(`/agent/conversations/${conversationId}`, { method: 'DELETE', withShop: true }),
};
