import type { AgentToolEvent, ThoughtStep } from '../data/types';

// AI chỉ gửi tên tool (docs/contracts/api-contracts.md, mục Stream); câu hiển thị nằm ở FE.
const STEP_LABELS: Record<string, string> = {
  query_shop_data: 'Tra cứu dữ liệu tiệm',
  suggest_restock: 'Tính gợi ý nhập hàng',
  suggest_screen: 'Thêm nút mở màn hình',
  calculate: 'Tính toán',
  run_code: 'Chạy mã trong sandbox',
};
const UNKNOWN_STEP = 'Xử lý yêu cầu';

// Nút mở màn hình đi kèm chính câu trả lời (AI kết thúc lượt ở lời gọi này), nên chữ trước nó vẫn là câu trả lời.
const ANSWER_TOOLS = new Set(['suggest_screen']);
// Câu dẫn hiện trên một dòng suy nghĩ, nên câu quá dài được cắt bớt.
const MAX_PREAMBLE = 140;

/**
 * Câu dẫn mà AI đã stream trước một lời gọi tool lấy dữ liệu, kiểu "Để tôi kiểm tra lại số liệu…": đó không
 * phải câu trả lời (AI sẽ `reset` rồi viết câu trả lời sau khi tool xong), nên màn chat đưa nó vào dòng suy nghĩ.
 * Trả `undefined` khi không có câu dẫn hoặc tool là nút mở màn hình.
 */
export function preambleBefore(tool: string, draft: string): string | undefined {
  if (ANSWER_TOOLS.has(tool)) return undefined;
  const text = draft.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  return text.length > MAX_PREAMBLE ? `${text.slice(0, MAX_PREAMBLE - 1).trimEnd()}…` : text;
}

/**
 * Áp một sự kiện tool lên danh sách bước: `start` thêm bước đang chạy, `end` đánh dấu bước đó xong.
 * Câu dẫn của AI, nếu có, thay nhãn mặc định của tool cho bước mới.
 */
export function applyToolEvent(steps: ThoughtStep[], event: AgentToolEvent): ThoughtStep[] {
  if (event.phase === 'start') {
    const label = event.preamble ?? STEP_LABELS[event.name] ?? UNKNOWN_STEP;
    return [...steps, { id: event.callId, label, done: false }];
  }
  return steps.map((step) => (step.id === event.callId ? { ...step, done: true } : step));
}
