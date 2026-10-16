/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseChatMarkdown, readChart, type ChatBlock, type Inline } from '../src/lib/chatMarkdown.ts';

const parse = (text: string) => parseChatMarkdown(text);
const stream = (text: string) => parseChatMarkdown(text, true);
const kinds = (blocks: ChatBlock[]) => blocks.map((b) => b.kind);
const plain = (inlines: Inline[]) => inlines.map((p) => p.text).join('');
const firstInlines = (blocks: ChatBlock[]) => (blocks[0] as { inlines: Inline[] }).inlines;

const CHART = '{"type":"bar","title":"Doanh thu 3 ngày","unit":"vnd","data":[{"label":"T2","value":120000},{"label":"T3","value":0},{"label":"T4","value":98000}]}';

// Câu trả lời dùng mọi dạng được hỗ trợ; mỗi prefix của nó là một thời điểm của stream.
const FULL_ANSWER = [
  '# Doanh thu tuần này',
  '',
  'Tổng **1.250.000đ** từ `12` đơn đã xác nhận.',
  '',
  '- Bán chạy: **Mì gói**',
  '1. Nhập thêm *nước suối*',
  '',
  '| Ngày | Doanh thu |',
  '|---|---:|',
  '| T2 | **120.000đ** |',
  '| T3 | 98.000đ |',
  '',
  '```chart',
  CHART,
  '```',
  '',
  'Nguồn: đơn đã xác nhận 7 ngày qua.',
].join('\n');

function allText(blocks: ChatBlock[]): string[] {
  return blocks.flatMap((b) => {
    if ('inlines' in b) return b.inlines.map((p) => p.text);
    if (b.kind === 'table') return [...b.header, ...b.rows.flat()].flat().map((p) => p.text);
    return [];
  });
}

describe('câu đã lưu', () => {
  it('đọc đậm, mã, tiêu đề và danh sách', () => {
    const blocks = parse('# Tổng kết\n**Doanh thu** là `120k`\n- Mì gói\n2. Nước');
    assert.deepEqual(kinds(blocks), ['heading', 'paragraph', 'bullet', 'ordered']);
    assert.deepEqual((blocks[1] as { inlines: Inline[] }).inlines, [
      { text: 'Doanh thu', bold: true },
      { text: ' là ' },
      { text: '120k', code: true },
    ]);
    assert.equal((blocks[3] as { marker: string }).marker, '2.');
  });

  it('giữ nguyên chữ khi ký hiệu không ghép đúng cặp', () => {
    for (const text of ['**', '***x***', 'giá **chưa đóng', '~50.000đ', 'a | b']) {
      assert.deepEqual(allText(parse(text)), [text], text);
    }
  });

  it('gộp dòng trống, bỏ bullet rỗng và dòng kẻ ngang', () => {
    const blocks = parse('\n\nA\n\n\n- \n---\nB\n\n');
    assert.deepEqual(kinds(blocks), ['paragraph', 'gap', 'paragraph']);
  });

  it('đọc CRLF như LF', () => {
    assert.deepEqual(kinds(parse('A\r\n- B\r\nC')), ['paragraph', 'bullet', 'paragraph']);
  });

  it('đọc bảng có dòng gạch, bỏ hàng rỗng và ô thừa', () => {
    const [table] = parse('| Ngày | Tiền |\n|:--|--:|\n| T2 | **5k** | thừa |\n|  |  |\n| T3 |');
    assert.equal(table.kind, 'table');
    if (table.kind !== 'table') return;
    assert.deepEqual(table.header.map(plain), ['Ngày', 'Tiền']);
    assert.deepEqual(table.rows.map((r) => r.map(plain)), [['T2', '5k'], ['T3']]);
    assert.deepEqual(table.rows[0][1], [{ text: '5k', bold: true }]);
  });

  it('dòng có `|` mà không có dòng gạch là chữ thường', () => {
    assert.deepEqual(kinds(parse('| A | B |\n| C | D |')), ['paragraph', 'paragraph']);
  });

  it('khối mã giữ nguyên ký hiệu bên trong', () => {
    const [code] = parse('```\n**không đậm**\n| a |\n```');
    assert.deepEqual(code, { kind: 'code', text: '**không đậm**\n| a |' });
  });

  it('khối chart hợp lệ thành biểu đồ, sai JSON thành chartInvalid', () => {
    const [chart] = parse('```chart\n' + CHART + '\n```');
    assert.equal(chart.kind, 'chart');
    assert.deepEqual(kinds(parse('```chart\n{"type":"bar",\n```')), ['chartInvalid']);
  });

  it('khối chart chưa đóng ở câu đã lưu vẫn được đọc', () => {
    assert.deepEqual(kinds(parse('```chart\n' + CHART)), ['chart']);
  });
});

describe('chữ đang stream', () => {
  it('tự đóng đậm và mã còn mở ở dòng cuối', () => {
    assert.deepEqual(firstInlines(stream('Tổng **1.250')), [
      { text: 'Tổng ' },
      { text: '1.250', bold: true },
    ]);
    assert.deepEqual(firstInlines(stream('mã `12')), [
      { text: 'mã ' },
      { text: '12', code: true },
    ]);
  });

  it('bỏ dấu mở còn treo ở cuối dòng', () => {
    for (const [text, expected] of [
      ['Tổng **', 'Tổng '],
      ['Tổng *', 'Tổng '],
      ['mã `', 'mã '],
    ]) {
      assert.deepEqual(allText(stream(text)), [expected], text);
    }
  });

  it('chỉ dòng cuối được tự đóng', () => {
    assert.deepEqual(allText(stream('giá **chưa đóng\nđang **gõ')), ['giá **chưa đóng', 'đang ', 'gõ']);
  });

  it('giữ lại dòng cuối khi chưa biết sẽ thành khối gì', () => {
    for (const tail of ['#', '## ', '-', '- ', '*', '**', '1', '1.', '`', '``', '```', '```cha', '|', '| Ngày | Doanh']) {
      assert.deepEqual(kinds(stream(`Chào\n${tail}`)), ['paragraph'], tail);
    }
  });

  it('chờ dòng gạch của bảng rồi mới hiện bảng', () => {
    assert.deepEqual(kinds(stream('| Ngày | Tiền |\n|')), []);
    assert.deepEqual(kinds(stream('| Ngày | Tiền |\n|--')), ['table']);
  });

  it('hiện hàng bảng đang tới và đóng tạm đậm trong ô', () => {
    const [table] = stream('| Ngày | Tiền |\n|---|---|\n| T2 | **120');
    assert.equal(table.kind, 'table');
    if (table.kind !== 'table') return;
    assert.deepEqual(table.rows[0][1], [{ text: '120', bold: true }]);
  });

  it('bảng xong thì dòng sau không còn bị giữ', () => {
    assert.deepEqual(kinds(stream('| A | B |\n| C | D |\nXong')), ['paragraph', 'paragraph', 'paragraph']);
  });

  it('khối mã đang mở hiện phần đã tới, bỏ dấu đóng gõ dở', () => {
    assert.deepEqual(stream('```\nconst a = 1\n``'), [{ kind: 'code', text: 'const a = 1' }]);
  });

  it('khối chart đang mở là chartPending, đóng rồi thì vẽ', () => {
    assert.deepEqual(kinds(stream('Xem:\n```chart\n{"type":"ba')), ['paragraph', 'chartPending']);
    assert.deepEqual(kinds(stream('```chart\n' + CHART + '\n``')), ['chartPending']);
    assert.deepEqual(kinds(stream('```chart\n' + CHART + '\n```')), ['chart']);
  });

  it('reset về chuỗi rỗng không còn khối nào', () => {
    assert.deepEqual(stream(''), []);
  });

  it('không prefix nào làm lộ ký hiệu thô hay ném lỗi', () => {
    for (let n = 0; n <= FULL_ANSWER.length; n++) {
      const prefix = FULL_ANSWER.slice(0, n);
      const blocks = stream(prefix);
      for (const text of allText(blocks)) {
        assert.ok(!/\*\*|`|^\s*\|/.test(text), `prefix ${n}: ${JSON.stringify(text)}`);
      }
      assert.ok(!blocks.some((b) => b.kind === 'chartInvalid'), `prefix ${n} vẽ chartInvalid`);
    }
  });

  it('delta mới chỉ đổi khối cuối, các khối trước giữ nguyên để ChatText khỏi render lại', () => {
    let previous = stream('');
    for (let n = 1; n <= FULL_ANSWER.length; n++) {
      const current = stream(FULL_ANSWER.slice(0, n));
      const settled = previous.slice(0, -1);
      assert.deepEqual(current.slice(0, settled.length), settled, `prefix ${n}`);
      previous = current;
    }
  });

  it('prefix trọn câu khớp câu đã lưu', () => {
    assert.deepEqual(stream(FULL_ANSWER), parse(FULL_ANSWER));
  });
});

describe('readChart', () => {
  const chart = (patch: Record<string, unknown>) => readChart(JSON.stringify({ ...JSON.parse(CHART), ...patch }));

  it('nhận spec hợp lệ, cắt nhãn và tiêu đề dài', () => {
    const spec = chart({ title: '  ' + 'x'.repeat(100), data: [{ label: 'Thứ hai tuần trước', value: 5 }] });
    assert.equal(spec?.title?.length, 80);
    assert.equal(spec?.data[0].label, 'Thứ hai tuần');
  });

  it('đường một điểm thành cột, unit lạ thành vnd', () => {
    const spec = chart({ type: 'line', unit: 'usd', data: [{ label: 'T2', value: 1 }] });
    assert.equal(spec?.type, 'bar');
    assert.equal(spec?.unit, 'vnd');
  });

  it('từ chối spec không vẽ an toàn được', () => {
    const many = Array.from({ length: 32 }, (_, i) => ({ label: `${i}`, value: i }));
    for (const patch of [
      { type: 'pie' },
      { data: [] },
      { data: many },
      { data: [{ label: 'T2', value: -1 }] },
      { data: [{ label: 'T2', value: '5' }] },
      { data: [{ label: 2, value: 5 }] },
      { data: [null] },
    ]) {
      assert.equal(chart(patch), null, JSON.stringify(patch));
    }
    assert.equal(readChart('[1,2]'), null);
    assert.equal(readChart('null'), null);
  });
});

describe('actions block', () => {
  const ACTIONS = '```actions\n["debts", "sales"]\n```';

  it('turns listed screens into buttons after the answer', () => {
    const blocks = parse('Còn 2 khoản nợ.\n\n' + ACTIONS);
    assert.deepEqual(kinds(blocks), ['paragraph', 'gap', 'actions']);
    assert.deepEqual((blocks.at(-1) as { screens: string[] }).screens, ['debts', 'sales']);
  });

  it('drops unknown screens and broken JSON instead of showing them', () => {
    assert.deepEqual((parse('```actions\n["debts", "/admin", 3]\n```')[0] as { screens: string[] }).screens, ['debts']);
    assert.deepEqual(parse('```actions\n["/admin"]\n```'), []);
    assert.deepEqual(parse('```actions\n["debts"\n```'), []);
  });

  it('shows nothing while the block is still streaming', () => {
    assert.deepEqual(kinds(stream('Còn nợ.\n```actions\n["deb')), ['paragraph']);
    assert.deepEqual(kinds(stream('Còn nợ.\n' + ACTIONS)), ['paragraph', 'actions']);
  });
});
