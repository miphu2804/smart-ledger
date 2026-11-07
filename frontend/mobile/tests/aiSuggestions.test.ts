/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { followUpSuggestions, revenueSuggestions } from '../src/lib/aiSuggestions.ts';

describe('gợi ý hỏi trợ lý ở Đơn hàng', () => {
  it('gợi ý phân tích tháng trước, như MoMo', () => {
    assert.equal(revenueSuggestions(new Date(2026, 10, 2))[0], 'Phân tích doanh thu tháng 10/2026 theo từng tuần');
  });

  it('tháng một thì tháng trước là tháng 12 năm trước', () => {
    assert.equal(revenueSuggestions(new Date(2027, 0, 15))[0], 'Phân tích doanh thu tháng 12/2026 theo từng tuần');
  });

  it('hỏi tiếp bỏ câu đã hỏi, thêm thứ bán chạy và thu nợ, tối đa bốn câu', () => {
    const now = new Date(2026, 10, 2);
    const next = followUpSuggestions(['Phân tích doanh thu tháng 10/2026 theo từng tuần'], now);
    assert.deepEqual(next, [
      'Doanh thu từng tuần tháng này so với tháng trước',
      '5 món mang về nhiều doanh thu nhất 7 ngày qua',
      'Thứ mấy trong tuần bán chạy nhất 30 ngày qua?',
      'Tiền đã thu và còn nợ theo từng tuần tháng này',
    ]);
  });
});
