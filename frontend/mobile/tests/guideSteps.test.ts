/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GUIDE_STEPS } from '../src/lib/guideSteps.ts';

describe('các bước hướng dẫn', () => {
  it('mở đầu bằng thẻ chào mừng không khoanh nút nào', () => {
    assert.equal(GUIDE_STEPS[0].target, null);
  });

  it('mỗi bước sau khoanh một nút khác nhau và có tiêu đề, nội dung', () => {
    const rest = GUIDE_STEPS.slice(1);
    assert.ok(rest.every((s) => s.target !== null && s.title.trim() && s.body.trim()));
    assert.equal(new Set(rest.map((s) => s.target)).size, rest.length);
  });

  it('có các bước người dùng cần: gọi món bằng giọng nói, chọn hàng (ghi nợ), quét mã, trợ lý', () => {
    const targets = GUIDE_STEPS.map((s) => s.target);
    for (const t of ['readOrder', 'selectGoods', 'scanCode', 'assistant'] as const) assert.ok(targets.includes(t), t);
    assert.match(GUIDE_STEPS.find((s) => s.target === 'selectGoods')!.body, /Ghi nợ/);
  });

  it('bước cuối chỉ chỗ xem lại hướng dẫn', () => {
    assert.match(GUIDE_STEPS[GUIDE_STEPS.length - 1].body, /Xem lại hướng dẫn/);
  });
});
