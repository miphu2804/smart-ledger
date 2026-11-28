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
import { exhaustedMessage, untilSettled, type AiQuota } from './aiQuota';
import { createIdempotentSender } from './idempotency';
import { preambleBefore } from './toolSteps';

/**
 * Trợ lý AI qua Core (`/api/v1/agent/*`, docs/contracts/api-contracts.md §5) — cần header X-Shop-Id.
 * Core lấy user từ token và chuyển tiếp sang AI; FE không gửi user_id hay shop_id trong body.
 * Chat chờ tới 45 giây vì model có thể gọi công cụ đọc dữ liệu tiệm trước khi trả lời.
 */
const CHAT_TIMEOUT_MS = 45000;
const MOCK_THINK_MS = 1200;
// Câu dẫn giả của bước tool, để chế độ mock cũng thấy câu dẫn trong dòng suy nghĩ.
const MOCK_PREAMBLE = 'Để tôi kiểm tra số liệu của tiệm.';
const MOCK_TOOL_MS = 1500;
const MOCK_CHUNK = 12;
const MOCK_CHUNK_MS = 60;

/**
 * Lượt hỏi có trừ quota (contract §10, docs/contracts/billing-ai-client-handoff.md): khi Core bật trừ lượt, mỗi câu hỏi gửi
 * một `Idempotency-Key`, dùng chung cho JSON và stream. Bộ gửi giữ key theo hội thoại + câu hỏi: gửi lại đúng câu đó sau lỗi
 * mạng/timeout/5xx/202 dùng lại key cũ nên Core trả lại kết quả cũ, không trừ hai lượt; trả lời xong hoặc 4xx thì câu sau
 * dùng key mới. Đổi tiệm/đăng xuất xoá key (setActiveShop). Core chưa bật trừ lượt thì không gửi key: key mới lúc đó bị 503.
 * ponytail: key chỉ giữ trong bộ nhớ, tắt app giữa chừng thì lần gửi lại là lượt mới; lưu vào máy nếu cần nối lại sau khi mở app.
 */
const chatSender = createIdempotentSender();
/** `enforcementEnabled` của lần đọc quota gần nhất; null là chưa đọc. */
let enforcement: boolean | null = null;

async function turn<T>(input: AgentChatRequest, request: (key?: string) => Promise<T>): Promise<T> {
  if (enforcement === null) await agentApi.quota().catch(() => undefined);
  if (!enforcement) {
    try {
      return await request();
    } catch (err) {
      // Core vừa bật trừ lượt sau lần đọc quota: gửi lại cùng câu có key.
      if (!(err instanceof ApiError && err.code === 'ai_turn_key_invalid')) throw err;
      enforcement = true;
    }
  }
  const operation = { conversation_id: input.conversation_id ?? null, message: input.message.trim() };
  return chatSender.send(operation, (key) => untilSettled(() => request(key)));
}

/** Lỗi gửi tin → câu báo tiếng Việt, dùng chung cho màn Trợ lý và bảng hỏi nhanh. Câu đã gõ được trả lại ô nhập để gửi lại (FR-021, AC-011). */
export function agentErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'timeout') return 'Trợ lý trả lời quá lâu nên đã dừng chờ.';
    if (err.code === 'network') return 'Không kết nối được máy chủ. Vui lòng kiểm tra mạng.';
    // Mã guardrail của AI (docs/contracts/api-contracts.md §6): BE chỉ trả mã, câu hiển thị nằm ở FE.
    if (err.code === 'input_too_long') return 'Tin nhắn dài quá nên trợ lý chưa đọc được. Bạn rút gọn câu hỏi rồi gửi lại nhé.';
    if (err.code === 'answer_unavailable') return 'Trợ lý chưa trả lời được câu này, bạn thử hỏi lại cụ thể hơn nhé.';
    if (err.code === 'answer_timeout') return 'Trợ lý trả lời quá lâu nên đã dừng chờ.';
    // Mã của lượt hỏi có trừ quota (contract §10)
    if (err.code === 'ai_turn_pending')
      return 'Bobi vẫn đang xử lý câu này. Gửi lại sau ít giây để nhận câu trả lời, không bị trừ thêm lượt.';
    if (err.code === 'ai_quota_unavailable')
      return 'Chưa xác nhận được kết quả câu này. Gửi lại để nhận đúng kết quả, không bị trừ thêm lượt.';
    if (err.code === 'ai_turn_cancelled') return 'Câu hỏi này đã bị huỷ. Gửi lại để hỏi lại.';
    if (err.code === 'ai_turn_result_removed') return 'Câu trả lời của câu hỏi này đã bị xoá nên không hiện lại được.';
    if (err.code === 'ai_unavailable' || err.status === 503) return 'Trợ lý AI đang tạm lỗi hoặc quá tải.';
    if (err.code === 'conversation_not_found') return 'Cuộc trò chuyện cũ không còn. Gửi lại để bắt đầu cuộc mới.';
    if (err.code === 'ai_quota_exhausted') return exhaustedMessage(err.details);
  }
  return 'Chưa gửi được tin nhắn cho trợ lý.';
}

/** Một lần gọi POST /agent/chat/stream; gửi lại (202, lỗi mạng) đọc lại từ đầu nên chữ tích luỹ nằm trong từng lần gọi. */
async function streamOnce(
  input: AgentChatRequest,
  idempotencyKey: string | undefined,
  onText: (text: string) => void,
  onMemories?: (used: AgentMemoryUsed[]) => void,
  onTool?: (event: AgentToolEvent) => void,
): Promise<AgentChatMessageView> {
  let text = '';
  let reply: AgentChatMessageView | null = null;
  await apiStream(
    '/agent/chat/stream',
    { body: input, withShop: true, timeoutMs: CHAT_TIMEOUT_MS, idempotencyKey },
    (event, data) => {
      if (event === 'delta') onText((text += (data as { text: string }).text));
      else if (event === 'reset') onText((text = ''));
      else if (event === 'memory') onMemories?.((data as { used: AgentMemoryUsed[] }).used);
      else if (event === 'tool_start') {
        const { call_id, name } = data as { call_id: string; name: string };
        // Chữ đã tới trước tool lấy dữ liệu là câu dẫn: rời bong bóng trả lời, vào dòng suy nghĩ.
        const preamble = preambleBefore(text);
        if (preamble) onText((text = ''));
        onTool?.({ phase: 'start', callId: call_id, name, preamble });
      } else if (event === 'tool_end') onTool?.({ phase: 'end', callId: (data as { call_id: string }).call_id });
      else if (event === 'done') reply = data as AgentChatMessageView;
      else if (event === 'error') {
        const code = (data as { detail?: string }).detail ?? 'ai_unavailable';
        throw new ApiError(0, code, 'Trợ lý AI đang tạm lỗi hoặc quá tải.');
      }
    },
  );
  if (!reply) throw new ApiError(0, 'ai_unavailable', 'Trợ lý AI đang tạm lỗi hoặc quá tải.');
  return reply;
}

export const agentApi = {
  /** POST /agent/chat — bỏ `conversation_id` để mở hội thoại mới */
  chat: (input: AgentChatRequest): Promise<AgentChatMessageView> =>
    turn(input, (idempotencyKey) =>
      apiRequest<AgentChatMessageView>('/agent/chat', {
        method: 'POST',
        body: input,
        withShop: true,
        timeoutMs: CHAT_TIMEOUT_MS,
        idempotencyKey,
      }),
    ),
  /** GET /agent/quota — lượt hỏi Bobi tính theo tài khoản, không cần X-Shop-Id. Lỗi thì coi như Core chưa bật trừ lượt. */
  quota: async (): Promise<AiQuota> => {
    try {
      const q = await apiRequest<AiQuota>('/agent/quota');
      enforcement = q.enforcementEnabled;
      return q;
    } catch (err) {
      enforcement ??= false;
      throw err;
    }
  },
  /**
   * POST /agent/chat/stream — cùng lượt hỏi như `chat` nhưng trả lời dần: `onText` nhận toàn bộ chữ đã tới
   * (rỗng khi AI báo `reset`), Promise trả câu cuối từ sự kiện `done`. Sự kiện `error` mang mã lỗi như `chat`.
   * Sự kiện `memory` (trước chữ đầu tiên, chỉ khi trợ lý dùng ghi nhớ) đưa các ghi nhớ đó cho `onMemories`.
   * Sự kiện `tool_start` / `tool_end` (mỗi lần AI gọi tool) đi vào `onTool`; AI chỉ gửi tên tool, không gửi tham số.
   * Chữ đã tới trước `tool_start` của tool lấy dữ liệu là câu dẫn: `onText('')` gỡ nó khỏi câu trả lời và
   * `onTool` mang nó theo bước tool để hiện ở dòng suy nghĩ.
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
      onTool?.({ phase: 'start', callId: 'mock', name: 'query_shop_data', preamble: MOCK_PREAMBLE });
      await pause(MOCK_TOOL_MS);
      onTool?.({ phase: 'end', callId: 'mock' });
      for (let end = MOCK_CHUNK; end < reply.answer.length; end += MOCK_CHUNK) {
        onText(reply.answer.slice(0, end));
        await pause(MOCK_CHUNK_MS);
      }
      onText(reply.answer);
      return reply;
    }
    return turn(input, (idempotencyKey) => streamOnce(input, idempotencyKey, onText, onMemories, onTool));
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
