/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyToolEvent, preambleBefore } from '../src/lib/toolSteps.ts';

describe('applyToolEvent', () => {
  it('adds a running step with the app-side label when a tool starts', () => {
    const steps = applyToolEvent([], { phase: 'start', callId: 'c1', name: 'query_shop_data' });
    assert.deepEqual(steps, [{ id: 'c1', label: 'Tra cứu dữ liệu tiệm', done: false }]);
  });

  it('marks only the step with that call id as done when a tool ends', () => {
    let steps = applyToolEvent([], { phase: 'start', callId: 'c1', name: 'query_shop_data' });
    steps = applyToolEvent(steps, { phase: 'start', callId: 'c2', name: 'suggest_restock' });
    steps = applyToolEvent(steps, { phase: 'end', callId: 'c1' });
    assert.deepEqual(
      steps.map((s) => s.done),
      [true, false],
    );
  });

  it('keeps one step per retry of the same tool', () => {
    let steps = applyToolEvent([], { phase: 'start', callId: 'c1', name: 'query_shop_data' });
    steps = applyToolEvent(steps, { phase: 'end', callId: 'c1' });
    steps = applyToolEvent(steps, { phase: 'start', callId: 'c2', name: 'query_shop_data' });
    assert.equal(steps.length, 2);
  });

  it('labels the agent arithmetic and sandbox tools so they do not show the generic label', () => {
    const [calc] = applyToolEvent([], { phase: 'start', callId: 'c1', name: 'calculate' });
    assert.equal(calc.label, 'Tính toán');
    const [code] = applyToolEvent([], { phase: 'start', callId: 'c2', name: 'run_code' });
    assert.equal(code.label, 'Chạy mã trong sandbox');
  });

  it('falls back to a generic label for a tool the app does not know', () => {
    const [step] = applyToolEvent([], { phase: 'start', callId: 'c1', name: 'new_tool' });
    assert.equal(step.label, 'Xử lý yêu cầu');
  });

  it('ignores an end for a call it never saw', () => {
    const steps = applyToolEvent([], { phase: 'end', callId: 'missing' });
    assert.deepEqual(steps, []);
  });
});

describe('preambleBefore', () => {
  it('takes the text streamed before a data tool as the lead-in, without markdown', () => {
    assert.equal(preambleBefore('Để tôi **kiểm tra** lại\nsố liệu. '), 'Để tôi kiểm tra lại số liệu.');
  });

  it('finds no lead-in when nothing was streamed', () => {
    assert.equal(preambleBefore('  '), undefined);
  });

  it('shortens a long lead-in to fit the thinking line', () => {
    const lead = preambleBefore('a'.repeat(300));
    assert.equal(lead?.length, 140);
    assert.ok(lead?.endsWith('…'));
  });

  it('labels the new step with the lead-in instead of the tool label', () => {
    const [step] = applyToolEvent([], { phase: 'start', callId: 'c1', name: 'query_shop_data', preamble: 'Để tôi xem.' });
    assert.equal(step.label, 'Để tôi xem.');
  });
});
