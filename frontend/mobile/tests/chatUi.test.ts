/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseChatMarkdown } from '../src/lib/chatMarkdown.ts';
import { readUi } from '../src/lib/chatUi.ts';

const spec = (elements: Record<string, unknown>, root = 'a') => JSON.stringify({ root, elements });
const donut = { type: 'Donut', props: { unit: 'vnd', data: [{ label: 'Cà phê', value: 10 }, { label: 'Trà', value: 5 }] } };

describe('readUi', () => {
  it('builds a card tree from the flat spec', () => {
    const node = readUi(spec({ a: { type: 'Card', props: { title: 'Tuần này' }, children: ['b'] }, b: donut }));
    assert.equal(node?.type, 'Card');
    assert.equal(node?.type === 'Card' && node.children[0].type, 'Donut');
  });

  it('rejects unknown types, cycles, shared nodes and missing ids', () => {
    assert.equal(readUi(spec({ a: { type: 'Script', props: {} } })), null);
    assert.equal(readUi(spec({ a: { type: 'Card', children: ['a'] } })), null);
    assert.equal(readUi(spec({ a: { type: 'Row', children: ['b', 'b'] }, b: donut })), null);
    assert.equal(readUi(spec({ a: { type: 'Card', children: ['x'] } })), null);
  });

  it('rejects negative amounts and series that do not match labels', () => {
    assert.equal(readUi(spec({ a: { type: 'Metric', props: { label: 'Doanh thu', value: -1, unit: 'vnd' } } })), null);
    const grouped = { type: 'GroupedBar', props: { unit: 'vnd', labels: ['T2', 'T3'], series: [{ name: 'Tuần này', values: [1] }] } };
    assert.equal(readUi(spec({ a: grouped })), null);
  });

  it('accepts a negative change', () => {
    assert.ok(readUi(spec({ a: { type: 'Metric', props: { label: 'Số đơn', value: 10, unit: 'count', change: -3.5 } } })));
  });

  it('drops the screen button of a stored card and still draws the rest', () => {
    const note = { type: 'Text', props: { text: 'Còn 3 khoản nợ.' } };
    const button = { type: 'ScreenButton', props: { screen: 'debts' } };
    assert.deepEqual(readUi(spec({ a: { type: 'Card', children: ['b', 'c'] }, b: note, c: button })), {
      type: 'Card',
      title: undefined,
      children: [{ type: 'Text', text: 'Còn 3 khoản nợ.' }],
    });
    assert.equal(readUi(spec({ a: button })), null);
    assert.equal(readUi(spec({ a: { type: 'Card', children: ['c'] }, c: button })), null);
  });

  it('rejects a chart unit outside vnd, count and percent instead of drawing it as money', () => {
    assert.equal(readUi(spec({ a: { ...donut, props: { ...donut.props, unit: 'túi' } } })), null);
    assert.equal(readUi(spec({ a: { ...donut, props: { ...donut.props, unit: undefined } } })), null);
  });

  it('keeps a product unit word on a List row as a count', () => {
    const node = readUi(spec({ a: { type: 'List', props: { items: [{ label: 'Gạo ST25', value: 6, unit: 'túi' }] } } }));
    assert.deepEqual(node?.type === 'List' && node.items[0], { label: 'Gạo ST25', value: 6, unit: 'count', word: 'túi', note: undefined });
  });
});

describe('parseChatMarkdown with ui blocks', () => {
  const block = ['```ui', spec({ a: donut }), '```'].join('\n');

  it('shows a pending note while the block streams and the card once closed', () => {
    assert.deepEqual(parseChatMarkdown('Cơ cấu:\n```ui\n{"root"', true).map((b) => b.kind), ['paragraph', 'uiPending']);
    assert.deepEqual(parseChatMarkdown(`Cơ cấu:\n${block}`).map((b) => b.kind), ['paragraph', 'ui']);
  });

  it('marks invalid json as uiInvalid', () => {
    assert.deepEqual(parseChatMarkdown('```ui\n{nope}\n```').map((b) => b.kind), ['uiInvalid']);
  });
});
