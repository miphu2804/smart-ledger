import type {
  AgentChatMessageView,
  AgentChatRequest,
  AgentConversationSummary,
  AgentConversationView,
} from '../data/types';
import { apiRequest } from './api';

/**
 * Trợ lý AI qua Core (`/api/v1/agent/*`, docs/contracts/api-contracts.md §5) — cần header X-Shop-Id.
 * Core lấy user từ token và chuyển tiếp sang AI; FE không gửi user_id hay shop_id trong body.
 * Lưu ý: Core chưa có proxy `/api/v1/agent/*` — khi tắt mock, các hàm này nhận lỗi từ Core cho tới khi có.
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
