import type {
  AgentChatMessageView,
  AgentChatRequest,
  AgentConversationSummary,
  AgentConversationView,
  AgentMemoryItem,
  AgentMemorySettings,
  AgentMemoryUsed,
  AgentToolEvent,
} from '../data/types';
import { USE_MOCK } from '../config';
import { ApiError, apiRequest, apiStream } from './api';

/**
 * Trợ lý AI qua Core (`/api/v1/agent/*`, docs/contracts/api-contracts.md §5) — cần header X-Shop-Id.
 * Core lấy user từ token và chuyển tiếp sang AI; FE không gửi user_id hay shop_id trong body.
 * Chat chờ tới 45 giây vì model có thể gọi công cụ đọc dữ liệu tiệm trước khi trả lời.
 */
const CHAT_TIMEOUT_MS = 45000;
const MOCK_THINK_MS = 1200;
const MOCK_TOOL_MS = 1500;
const MOCK_CHUNK = 12;
const MOCK_CHUNK_MS = 60;

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
   * Sự kiện `memory` (trước chữ đầu tiên, chỉ khi trợ lý dùng ghi nhớ) đưa các ghi nhớ đó cho `onMemories`.
   * Sự kiện `tool_start` / `tool_end` (mỗi lần AI gọi tool) đi vào `onTool`; AI chỉ gửi tên tool, không gửi tham số.
   * Khi bật mock thì hỏi `chat` rồi giả lập độ trễ, một bước tool và chữ đến từng đoạn.
   */
  chatStream: async (
    input: AgentChatRequest,
    onText: (text: string) => void,
    onMemories?: (used: AgentMemoryUsed[]) => void,
    onTool?: (event: AgentToolEvent) => void,
  ): Promise<AgentChatMessageView> => {
    if (USE_MOCK) {
      const reply = await agentApi.chat(input);
      // Giả lập một lượt thật để thấy dòng suy nghĩ: chờ model, một bước tool, rồi chữ đến từng đoạn.
      const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      await pause(MOCK_THINK_MS);
      onTool?.({ phase: 'start', callId: 'mock', name: 'query_shop_data' });
      await pause(MOCK_TOOL_MS);
      onTool?.({ phase: 'end', callId: 'mock' });
      for (let end = MOCK_CHUNK; end < reply.answer.length; end += MOCK_CHUNK) {
        onText(reply.answer.slice(0, end));
        await pause(MOCK_CHUNK_MS);
      }
      onText(reply.answer);
      return reply;
    }
    let text = '';
    let reply: AgentChatMessageView | null = null;
    await apiStream('/agent/chat/stream', { body: input, withShop: true, timeoutMs: CHAT_TIMEOUT_MS }, (event, data) => {
      if (event === 'delta') onText((text += (data as { text: string }).text));
      else if (event === 'reset') onText((text = ''));
      else if (event === 'memory') onMemories?.((data as { used: AgentMemoryUsed[] }).used);
      else if (event === 'tool_start') {
        const { call_id, name } = data as { call_id: string; name: string };
        onTool?.({ phase: 'start', callId: call_id, name });
      } else if (event === 'tool_end') onTool?.({ phase: 'end', callId: (data as { call_id: string }).call_id });
      else if (event === 'done') reply = data as AgentChatMessageView;
      else if (event === 'error') {
        const code = (data as { detail?: string }).detail ?? 'ai_unavailable';
        throw new ApiError(0, code, 'Trợ lý AI đang tạm lỗi hoặc quá tải.');
      }
    });
    if (!reply) throw new ApiError(0, 'ai_unavailable', 'Trợ lý AI đang tạm lỗi hoặc quá tải.');
    return reply;
  },
  /** GET /agent/memory/settings — `available` false thì ẩn công tắc */
  getMemorySettings: (): Promise<AgentMemorySettings> =>
    apiRequest<AgentMemorySettings>('/agent/memory/settings', { withShop: true }),
  /** PUT /agent/memory/settings — tắt chỉ dừng nhớ và dùng ghi nhớ, không xoá cái đã có */
  setMemorySettings: (enabled: boolean): Promise<AgentMemorySettings> =>
    apiRequest<AgentMemorySettings>('/agent/memory/settings', {
      method: 'PUT',
      body: { memory_enabled: enabled },
      withShop: true,
    }),
  /** GET /agent/memory/items — ghi nhớ còn hiệu lực, dùng gần nhất trước */
  listMemories: (): Promise<AgentMemoryItem[]> =>
    apiRequest<AgentMemoryItem[]>('/agent/memory/items', { withShop: true }),
  /** DELETE — xoá ghi nhớ cùng các bản cũ nó đã thay */
  deleteMemory: (memoryId: number): Promise<void> =>
    apiRequest<void>(`/agent/memory/items/${memoryId}`, { method: 'DELETE', withShop: true }),
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
