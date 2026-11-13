/**
 * Đọc khối ```ui trong câu trả lời của Trợ lý AI thành cây thẻ hiển thị.
 *
 * Spec theo dạng phẳng của json-render (`{ root, elements: { id: { type, props, children } } }`) để model
 * chỉ ghép các component có trong danh mục dưới đây. Số do model chép từ kết quả công cụ, nên validator
 * chỉ nhận dạng an toàn để vẽ: sai một phần tử, vượt giới hạn, có vòng lặp hay id lạ thì bỏ cả khối.
 * Mọi thẻ chỉ hiển thị; không có phần tử nào ghi dữ liệu hay gọi API.
 */

export type Unit = 'vnd' | 'count' | 'percent';
export type Tone = 'neutral' | 'good' | 'bad' | 'warn';
export type Point = { label: string; value: number };
export type Series = { name: string; values: number[] };

export type UiNode =
  | { type: 'Card'; title?: string; children: UiNode[] }
  | { type: 'Row'; children: UiNode[] }
  | { type: 'Metric'; label: string; value: number; unit: Unit; change?: number; trend?: number[] }
  | { type: 'LineChart' | 'BarChart' | 'HBarChart' | 'Donut'; title?: string; unit: Unit; data: Point[] }
  | { type: 'GroupedBar' | 'StackedBar'; title?: string; unit: Unit; labels: string[]; series: Series[] }
  | { type: 'Progress'; label: string; value: number; max: number; unit: Unit }
  | { type: 'Table'; columns: string[]; rows: (string | number)[][] }
  | { type: 'List'; items: { label: string; value?: number; unit?: Unit; word?: string; note?: string }[] }
  | { type: 'OrderCard'; code: string; date?: string; customer?: string; status?: string; items: { name: string; qty: number; price: number }[]; total: number }
  | { type: 'Badge'; text: string; tone: Tone }
  | { type: 'Text'; text: string };

const MAX_ELEMENTS = 40;
const MAX_DEPTH = 4;
const MAX_POINTS = 31;
const MAX_SERIES = 4;
const MAX_ROWS = 20;
const MAX_COLUMNS = 5;
const MAX_LABEL = 24;
const MAX_TEXT = 200;
const MAX_WORD = 10;
// Lát Donut nhiều hơn mức này thì màu và chú thích không còn tách được bằng mắt.
const MAX_SLICES = 6;

type Raw = Record<string, unknown>;

/** Khối ```ui đã trọn; trả cây gốc hoặc null khi spec không vẽ an toàn được. */
export function readUi(body: string): UiNode | null {
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return null;
  }
  if (!isObject(raw) || typeof raw.root !== 'string' || !isObject(raw.elements)) return null;
  const elements = raw.elements;
  if (Object.keys(elements).length > MAX_ELEMENTS) return null;
  try {
    return buildNode(elements, raw.root, 0, new Set()) ?? null;
  } catch {
    return null;
  }
}

function buildNode(elements: Raw, id: string, depth: number, seen: Set<string>): UiNode | undefined {
  // Mỗi id chỉ được dùng một lần, nên spec có vòng lặp hay chia sẻ node đều bị từ chối.
  if (depth > MAX_DEPTH || seen.has(id) || !Object.hasOwn(elements, id)) throw new Error('bad node');
  seen.add(id);
  const element = elements[id];
  if (!isObject(element)) throw new Error('bad element');
  const props = isObject(element.props) ? element.props : {};
  const children = () => {
    const ids = element.children;
    if (!Array.isArray(ids) || !ids.length) throw new Error('no children');
    const nodes = ids.flatMap((child) => {
      if (typeof child !== 'string') throw new Error('bad child');
      return buildNode(elements, child, depth + 1, seen) ?? [];
    });
    if (!nodes.length) throw new Error('no children');
    return nodes;
  };

  switch (element.type) {
    case 'Card':
      return { type: 'Card', title: optText(props.title), children: children() };
    case 'Row':
      return { type: 'Row', children: children() };
    case 'Metric':
      return {
        type: 'Metric',
        label: text(props.label, MAX_LABEL),
        value: amount(props.value),
        unit: unit(props.unit),
        change: props.change === undefined ? undefined : finite(props.change),
        trend: props.trend === undefined ? undefined : list(props.trend, MAX_POINTS).map(amount),
      };
    case 'LineChart':
    case 'BarChart':
    case 'HBarChart':
    case 'Donut': {
      const data = list(props.data, element.type === 'Donut' ? MAX_SLICES : MAX_POINTS).map(point);
      // Một điểm không vẽ được đường; Donut toàn số 0 không có lát nào.
      if (element.type === 'LineChart' && data.length < 2) throw new Error('line needs 2 points');
      if (element.type === 'Donut' && !data.some((p) => p.value > 0)) throw new Error('empty donut');
      return { type: element.type, title: optText(props.title), unit: unit(props.unit), data };
    }
    case 'GroupedBar':
    case 'StackedBar': {
      const labels = list(props.labels, MAX_POINTS).map((l) => text(l, MAX_LABEL));
      const series = list(props.series, MAX_SERIES).map((s) => {
        if (!isObject(s)) throw new Error('bad series');
        const values = list(s.values, MAX_POINTS).map(amount);
        if (values.length !== labels.length) throw new Error('series length');
        return { name: text(s.name, MAX_LABEL), values };
      });
      return { type: element.type, title: optText(props.title), unit: unit(props.unit), labels, series };
    }
    case 'Progress': {
      const max = amount(props.max);
      if (max <= 0) throw new Error('bad max');
      return { type: 'Progress', label: text(props.label, MAX_LABEL), value: amount(props.value), max, unit: unit(props.unit) };
    }
    case 'Table': {
      const columns = list(props.columns, MAX_COLUMNS).map((c) => text(c, MAX_LABEL));
      const rows = list(props.rows, MAX_ROWS).map((row) => {
        const cells = list(row, MAX_COLUMNS);
        if (cells.length !== columns.length) throw new Error('row length');
        return cells.map((cell) => (typeof cell === 'number' ? finite(cell) : text(cell, MAX_LABEL * 2)));
      });
      return { type: 'Table', columns, rows };
    }
    case 'List':
      return {
        type: 'List',
        items: list(props.items, MAX_ROWS).map((item) => {
          if (!isObject(item)) throw new Error('bad item');
          // Hàng gợi ý nhập mang đơn vị của món ("túi", "hộp"): vẽ thành số đếm kèm chữ đó.
          const word = typeof item.unit === 'string' && !isUnit(item.unit) ? text(item.unit, MAX_WORD) : undefined;
          return {
            label: text(item.label, MAX_LABEL * 2),
            value: item.value === undefined ? undefined : amount(item.value),
            unit: word ? 'count' : item.unit === undefined ? undefined : unit(item.unit),
            word,
            note: optText(item.note),
          };
        }),
      };
    case 'OrderCard':
      return {
        type: 'OrderCard',
        code: text(props.code, MAX_LABEL),
        date: optText(props.date),
        customer: optText(props.customer),
        status: optText(props.status),
        items: list(props.items, MAX_ROWS).map((item) => {
          if (!isObject(item)) throw new Error('bad line');
          return { name: text(item.name, MAX_LABEL * 2), qty: amount(item.qty), price: amount(item.price) };
        }),
        total: amount(props.total),
      };
    case 'Badge': {
      const tone = props.tone;
      return { type: 'Badge', text: text(props.text, MAX_LABEL), tone: tone === 'good' || tone === 'bad' || tone === 'warn' ? tone : 'neutral' };
    }
    case 'Text':
      return { type: 'Text', text: text(props.text, MAX_TEXT) };
    case 'ScreenButton':
      // Nút mở màn hình đã bỏ ngày 2026-11-13; thẻ đã lưu kèm nút vẫn vẽ phần còn lại.
      return undefined;
    default:
      throw new Error('unknown type');
  }
}

function isObject(value: unknown): value is Raw {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error('bad list');
  return value;
}

function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('bad text');
  return value.trim().slice(0, max);
}

function optText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, MAX_TEXT) : undefined;
}

function finite(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('bad number');
  return value;
}

/** Tiền, số lượng và giá trị biểu đồ không âm; chỉ `change` (phần trăm so kỳ trước) được âm. */
function amount(value: unknown): number {
  const n = finite(value);
  if (n < 0) throw new Error('negative');
  return n;
}

/** Đơn vị lạ như "túi" bị từ chối: đoán thành `vnd` sẽ vẽ 6 túi thành 6đ. */
function unit(value: unknown): Unit {
  if (!isUnit(value)) throw new Error('bad unit');
  return value;
}

function isUnit(value: unknown): value is Unit {
  return value === 'vnd' || value === 'count' || value === 'percent';
}

function point(value: unknown): Point {
  if (!isObject(value)) throw new Error('bad point');
  return { label: text(value.label, MAX_LABEL), value: amount(value.value) };
}
