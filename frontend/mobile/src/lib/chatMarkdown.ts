/**
 * Đọc câu trả lời của Trợ lý AI thành các khối hiển thị, dùng chung cho chữ đang stream và câu đã lưu.
 *
 * Chỉ nhận tập markdown mà prompt của AI cho phép (backend/ai/src/prompt_templates/shop_agent.py):
 * `**đậm**`, `` `mã` ``, tiêu đề `#`, danh sách `-`/`1.`, bảng `|`, khối ``` và khối ```chart (JSON).
 * Khối ```actions do AI service tự gắn cuối câu trả lời (backend/ai/src/agent/service.py), không phải model.
 * Ký hiệu khác giữ nguyên chữ. Khi `streaming` là true, phần đuôi chưa trọn được tự đóng hoặc giữ lại
 * để bong bóng không nháy ký hiệu thô rồi đổi dạng khi chữ tới đủ.
 */

export type Inline = { text: string; bold?: boolean; code?: boolean };

export type ChartPoint = { label: string; value: number };

export type ChartSpec = {
  type: 'bar' | 'line';
  title?: string;
  unit: 'vnd' | 'count';
  data: ChartPoint[];
};

/** Màn hình mà nút dưới câu trả lời mở được; khoá trùng `Screen` trong backend/ai/src/agent/tools.py. */
export const SCREEN_LINKS = {
  sales: { label: 'Mở Bán hàng', route: '/(tabs)/sales' },
  voice_order: { label: 'Mở Đọc đơn', route: '/voice' },
  orders: { label: 'Mở Đơn hàng', route: '/(tabs)/invoices' },
  products: { label: 'Mở Hàng hoá', route: '/products' },
  debts: { label: 'Mở Công nợ', route: '/debts' },
  expenses: { label: 'Mở Chi phí', route: '/expenses' },
  reports: { label: 'Mở Báo cáo', route: '/analytics' },
} as const;

export type AppScreen = keyof typeof SCREEN_LINKS;

export type ChatBlock =
  | { kind: 'paragraph' | 'heading' | 'bullet'; inlines: Inline[] }
  | { kind: 'ordered'; marker: string; inlines: Inline[] }
  | { kind: 'gap' }
  | { kind: 'code'; text: string }
  | { kind: 'table'; header: Inline[][]; rows: Inline[][][] }
  | { kind: 'chart'; spec: ChartSpec }
  | { kind: 'actions'; screens: AppScreen[] }
  // Khối ```chart chưa đóng khi đang stream, hoặc JSON không hợp lệ ở câu đã xong.
  | { kind: 'chartPending' | 'chartInvalid' };

// Bảng cột/vùng trong bong bóng chat chỉ đọc được tới khoảng một tháng theo ngày.
const MAX_CHART_POINTS = 31;
const MAX_CHART_LABEL = 12;
const MAX_CHART_TITLE = 80;

const FENCE_OPEN = /^\s*```\s*([\w-]*)\s*$/;
const FENCE_CLOSE = /^\s*```\s*$/;
const HEADING = /^\s*#{1,6}\s+(\S.*)$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const ORDERED = /^\s*(\d{1,3})[.)]\s+(\S.*)$/;
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const TABLE_ROW = /^\s*\|/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)*\|?\s*$/;
// Cặp `**` không dính `*` khác nên `****` và `***x***` giữ nguyên chữ thay vì ghép sai cặp.
const BOLD = /(?<!\*)\*\*(?!\*)([^*]+)(?<!\*)\*\*(?!\*)/g;
const BOLD_MARK = /(?<!\*)\*\*(?!\*)/g;
const CODE_SPAN = /`([^`]+)`/g;
// Dòng cuối đang gõ dở mà chưa biết sẽ thành khối gì: "#", "-", "1.", "|" hay "`".
const PENDING_TAIL = /^\s*(?:#{1,6}|[-*+_]{1,2}|\d{1,3}[.)]?|`{1,3}[\w-]*)\s*$/;

export function parseChatMarkdown(text: string, streaming = false): ChatBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: ChatBlock[] = [];
  const isTail = (i: number) => streaming && i === lines.length - 1;
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isTail(i) && PENDING_TAIL.test(line)) break;

    const fence = FENCE_OPEN.exec(line);
    if (fence) {
      i = readFence(lines, i, fence[1].toLowerCase(), streaming, blocks);
      continue;
    }

    if (TABLE_ROW.test(line)) {
      i = readTable(lines, i, streaming, blocks);
      continue;
    }

    const content = isTail(i) ? closeDangling(line) : line;
    pushLine(blocks, content);
    i++;
  }

  return trimGaps(blocks);
}

/** Khối ``` hoặc ```chart; trả chỉ số dòng ngay sau khối. */
function readFence(lines: string[], start: number, lang: string, streaming: boolean, blocks: ChatBlock[]) {
  let end = start + 1;
  while (end < lines.length && !FENCE_CLOSE.test(lines[end])) end++;
  const closed = end < lines.length;
  const body = lines.slice(start + 1, end);
  // Dấu đóng đang gõ dở ("`", "``") không thuộc nội dung.
  if (!closed && streaming && /^\s*`{1,2}\s*$/.test(body.at(-1) ?? '')) body.pop();

  if (lang === 'actions') {
    // Nút chỉ hiện khi khối đã trọn; màn lạ bị bỏ, nên chữ trong khối không bao giờ thành route.
    const screens = closed ? readScreens(body.join('\n')) : [];
    if (screens.length) blocks.push({ kind: 'actions', screens });
  } else if (lang === 'chart') {
    if (!closed && streaming) blocks.push({ kind: 'chartPending' });
    else {
      const spec = readChart(body.join('\n'));
      blocks.push(spec ? { kind: 'chart', spec } : { kind: 'chartInvalid' });
    }
  } else {
    const code = body.join('\n').replace(/\n+$/, '');
    if (code) blocks.push({ kind: 'code', text: code });
  }
  return closed ? end + 1 : lines.length;
}

/** Các dòng liền nhau bắt đầu bằng `|`; chỉ thành bảng khi dòng thứ hai là dòng gạch `|---|`. */
function readTable(lines: string[], start: number, streaming: boolean, blocks: ChatBlock[]) {
  let end = start;
  while (end < lines.length && TABLE_ROW.test(lines[end])) end++;
  const rowsText = lines.slice(start, end);
  // Hàng cuối đang gõ dở; còn bảng chưa xong khi sau nó chỉ có dòng trống vừa xuống dòng.
  const rowIsTail = streaming && end === lines.length;
  const reachesTail = rowIsTail || (streaming && end === lines.length - 1 && !lines[end]);

  if (rowsText.length >= 2 && TABLE_SEPARATOR.test(rowsText[1])) {
    const header = splitCells(rowsText[0], false);
    const rows = rowsText
      .slice(2)
      .map((row, k) => splitCells(row, rowIsTail && k === rowsText.length - 3).slice(0, header.length))
      .filter((cells) => cells.some((cell) => cell.length));
    blocks.push({ kind: 'table', header, rows });
    return end;
  }

  // Tiêu đề bảng hoặc dòng gạch đang tới: chờ thay vì hiện chữ có `|` rồi đổi thành bảng.
  const separatorPending = rowsText.length === 1 || (rowsText.length === 2 && /^[\s|:-]*$/.test(rowsText[1]));
  if (reachesTail && separatorPending) return end;

  rowsText.forEach((row, k) => pushLine(blocks, rowIsTail && k === rowsText.length - 1 ? closeDangling(row) : row));
  return end;
}

/** `streamingRow`: hàng cuối đang tới, nên đóng tạm ký hiệu còn mở trong từng ô. */
function splitCells(row: string, streamingRow: boolean): Inline[][] {
  const cells = row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  return cells.map((cell) => parseInline(streamingRow ? closeDangling(cell.trim()) : cell.trim()));
}

function pushLine(blocks: ChatBlock[], line: string) {
  if (!line.trim() || RULE.test(line)) {
    if (blocks.length && blocks.at(-1)?.kind !== 'gap') blocks.push({ kind: 'gap' });
    return;
  }
  const heading = HEADING.exec(line);
  if (heading) return void blocks.push({ kind: 'heading', inlines: parseInline(heading[1].trim()) });
  const bullet = BULLET.exec(line);
  // Bullet không có nội dung bị bỏ để bong bóng không thừa dòng trống.
  if (bullet) {
    if (bullet[1].trim()) blocks.push({ kind: 'bullet', inlines: parseInline(bullet[1]) });
    return;
  }
  const ordered = ORDERED.exec(line);
  if (ordered) return void blocks.push({ kind: 'ordered', marker: `${ordered[1]}.`, inlines: parseInline(ordered[2]) });
  blocks.push({ kind: 'paragraph', inlines: parseInline(line) });
}

function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  text.split(CODE_SPAN).forEach((part, i) => {
    if (i % 2) return void out.push({ text: part, code: true });
    part.split(BOLD).forEach((piece, j) => {
      if (piece) out.push(j % 2 ? { text: piece, bold: true } : { text: piece });
    });
  });
  return out;
}

/** Đóng tạm `` ` `` và `**` còn mở ở dòng đang stream; dấu mở nằm cuối dòng thì bỏ vì chưa có chữ để tô. */
function closeDangling(line: string) {
  let out = line;
  if ((out.match(/`/g)?.length ?? 0) % 2) out = out.endsWith('`') ? out.slice(0, -1) : `${out}\``;
  const outsideCode = out.replace(/`[^`]*`/g, '');
  // Một `*` cuối dòng có thể là nửa đầu của `**`, và dính vào `**` đóng tạm thì cặp không còn khớp.
  out = out.replace(/(?<!\*)\*$/, '');
  if ((outsideCode.match(BOLD_MARK)?.length ?? 0) % 2) out = out.endsWith('**') ? out.slice(0, -2) : `${out}**`;
  return out;
}

function trimGaps(blocks: ChatBlock[]) {
  while (blocks.at(-1)?.kind === 'gap') blocks.pop();
  return blocks;
}

/** Danh sách màn trong khối ```actions; JSON hỏng hoặc màn lạ thì bỏ qua. */
export function readScreens(body: string): AppScreen[] {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return [];
  }
  if (!Array.isArray(raw)) return [];
  return raw.filter((screen): screen is AppScreen => typeof screen === 'string' && Object.hasOwn(SCREEN_LINKS, screen));
}

/**
 * Kiểm JSON của khối ```chart. Số do model chép từ kết quả công cụ nên chỉ nhận dạng an toàn để vẽ:
 * nhãn là chữ, giá trị là số hữu hạn không âm, 1–31 điểm; sai một điểm thì bỏ cả biểu đồ.
 */
export function readChart(body: string): ChartSpec | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== 'object') return null;
  const { type, title, unit, data } = raw as Record<string, unknown>;
  if (type !== 'bar' && type !== 'line') return null;
  if (!Array.isArray(data) || !data.length || data.length > MAX_CHART_POINTS) return null;
  const points: ChartPoint[] = [];
  for (const point of data) {
    const { label, value } = (point ?? {}) as Record<string, unknown>;
    if (typeof label !== 'string' || typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
    points.push({ label: label.slice(0, MAX_CHART_LABEL), value });
  }
  return {
    // Một điểm không vẽ được đường nên luôn là cột.
    type: type === 'line' && points.length > 1 ? 'line' : 'bar',
    title: typeof title === 'string' && title.trim() ? title.trim().slice(0, MAX_CHART_TITLE) : undefined,
    unit: unit === 'count' ? 'count' : 'vnd',
    data: points,
  };
}
