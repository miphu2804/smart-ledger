/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { GUIDE_BODY_MAX, GUIDE_STEPS, guideCallName, personalizeStep } from '../src/lib/guideSteps.ts';

describe('các bước hướng dẫn', () => {
  it('mở đầu bằng thẻ chào mừng không khoanh nút nào', () => {
    assert.equal(GUIDE_STEPS[0].target, null);
  });

  it('mỗi bước sau khoanh một nút khác nhau và có tiêu đề, nội dung', () => {
    const rest = GUIDE_STEPS.slice(1);
    assert.ok(rest.every((s) => s.target !== null && s.title.trim() && s.body.trim()));
    assert.equal(new Set(rest.map((s) => s.target)).size, rest.length);
  });

  it('giới thiệu Tạo đơn và Bobi theo thanh điều hướng hiện tại', () => {
    const targets = GUIDE_STEPS.map((s) => s.target);
    for (const t of ['tabSales', 'tabBobi'] as const) assert.ok(targets.includes(t), t);
    const sales = GUIDE_STEPS.find((s) => s.target === 'tabSales')!.body;
    for (const action of ['Chọn hàng', 'Đọc đơn', 'Quét mã', 'Ghi nợ']) assert.ok(sales.includes(action), action);
    for (const removed of ['readOrder', 'selectGoods', 'scanCode', 'mascot']) assert.ok(!targets.some((t) => t === removed));
  });

  it('bước cuối chỉ chỗ xem lại hướng dẫn', () => {
    assert.match(GUIDE_STEPS[GUIDE_STEPS.length - 1].body, /Xem lại hướng dẫn/);
  });

  it('nội dung mỗi bước ngắn, đọc lướt được', () => {
    for (const s of GUIDE_STEPS) assert.ok(s.body.length <= GUIDE_BODY_MAX, `${s.title}: ${s.body.length} ký tự`);
  });
});

describe('gọi tên chủ tiệm trong hướng dẫn', () => {
  it('lấy tên gọi (chữ cuối) của họ tên', () => {
    assert.equal(guideCallName('Nguyễn Văn Tín'), 'Tín');
    assert.equal(guideCallName('  Lan  '), 'Lan');
  });

  it('không có tên hay tên gọi quá dài thì gọi "bạn"', () => {
    assert.equal(guideCallName(undefined), 'bạn');
    assert.equal(guideCallName('   '), 'bạn');
    assert.equal(guideCallName('TapHoaCoBaBenChoLon'), 'bạn');
    assert.equal(guideCallName('Bạn'), 'bạn');
  });

  it('điền tên vào lời chào và lời kết, không còn chỗ trống {name}', () => {
    assert.equal(personalizeStep(GUIDE_STEPS[0], 'Trần Thị Mai').title, 'Chào Mai, mình là Bobi!');
    assert.equal(personalizeStep(GUIDE_STEPS[0], null).title, 'Chào bạn, mình là Bobi!');
    for (const s of GUIDE_STEPS) {
      const p = personalizeStep(s, 'Tín');
      assert.ok(!p.title.includes('{name}') && !p.body.includes('{name}'), s.title);
    }
  });
});
