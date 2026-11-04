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

/** Áp một sự kiện tool lên danh sách bước: `start` thêm bước đang chạy, `end` đánh dấu bước đó xong. */
export function applyToolEvent(steps: ThoughtStep[], event: AgentToolEvent): ThoughtStep[] {
  if (event.phase === 'start') {
    return [...steps, { id: event.callId, label: STEP_LABELS[event.name] ?? UNKNOWN_STEP, done: false }];
  }
  return steps.map((step) => (step.id === event.callId ? { ...step, done: true } : step));
}
