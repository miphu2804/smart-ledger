/**
 * Câu hiện lần lượt trong lúc chờ Trợ lý AI trả lời chữ đầu tiên. Mỗi câu đúng với mọi lượt chat, kể cả lời
 * chào: chỉ nói về việc đọc câu hỏi, suy nghĩ và soạn câu trả lời, không nhận việc xử lý số liệu hay hứa
 * trước kết quả (bảng, biểu đồ…) vì lượt đó có thể không làm.
 */
export const THINKING_PHRASES = [
  'Đang đọc câu hỏi…',
  'Đang hiểu ý bạn…',
  'Đang suy nghĩ…',
  'Đang cân nhắc câu trả lời…',
  'Đang nghĩ cách trả lời…',
  'Đang sắp xếp ý…',
  'Đang soạn câu trả lời…',
  'Đang chọn cách diễn đạt…',
  'Đang xem lại câu trả lời…',
  'Đang hoàn thiện câu trả lời…',
];

/** Một câu ngẫu nhiên khác `current`, để lần đổi nào chữ cũng thay. */
export function nextThinkingPhrase(current?: string, random = Math.random) {
  const pool = THINKING_PHRASES.filter((phrase) => phrase !== current);
  return pool[Math.floor(random() * pool.length)];
}
