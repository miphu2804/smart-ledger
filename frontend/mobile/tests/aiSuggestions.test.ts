/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { followUpSuggestions, revenueSuggestions } from '../src/lib/aiSuggestions.ts';

describe('gợi ý hỏi trợ lý ở Đơn hàng', () => {
  it('gợi ý phân tích tháng trước, như MoMo', () => {
    assert.equal(revenueSuggestions(new Date(2026, 10, 2))[0], 'Phân tích doanh thu tháng 10/2026');
  });

  it('tháng một thì tháng trước là tháng 12 năm trước', () => {
    assert.equal(revenueSuggestions(new Date(2027, 0, 15))[0], 'Phân tích doanh thu tháng 12/2026');
  });

  it('hỏi tiếp bỏ câu đã hỏi, thêm hai tháng trước nữa, tối đa bốn câu', () => {
    const now = new Date(2026, 10, 2);
    const next = followUpSuggestions(['Phân tích doanh thu tháng 10/2026'], now);
    assert.deepEqual(next, [
      'Doanh thu tháng này so với tháng trước?',
      'Món nào bán chạy nhất 7 ngày qua?',
      'Phân tích doanh thu tháng 9/2026',
      'Phân tích doanh thu tháng 8/2026',
    ]);
  });
});
