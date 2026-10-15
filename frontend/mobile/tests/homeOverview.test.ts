/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatQuantity, restockRows, revenueChange, topSellerRows } from '../src/lib/homeOverview.ts';

describe('revenueChange', () => {
  it('tính tỉ lệ so với hôm qua', () => {
    assert.equal(revenueChange(150_000, 100_000), 0.5);
    assert.equal(revenueChange(50_000, 100_000), -0.5);
  });
  it('không so khi hôm qua không có doanh thu dương', () => {
    assert.equal(revenueChange(100_000, 0), null);
    assert.equal(revenueChange(100_000, -20_000), null);
    assert.equal(revenueChange(100_000, null), null);
    assert.equal(revenueChange(100_000, undefined), null);
  });
});

describe('topSellerRows', () => {
  const row = (name: string, netQuantity: number) => ({ name, netQuantity });
  it('bỏ dòng có số lượng thuần ≤ 0 và giữ tối đa 4 dòng theo thứ tự Core', () => {
    const rows = topSellerRows([row('a', 9), row('b', 0), row('c', 5), row('d', -2), row('e', 4), row('f', 3), row('g', 1)]);
    assert.deepEqual(rows.map((r) => r.name), ['a', 'c', 'e', 'f']);
  });
  it('rỗng khi không có dòng nào bán được', () => {
    assert.deepEqual(topSellerRows([row('a', 0)]), []);
  });
});

describe('restockRows', () => {
  it('món hết hàng trước, rồi tồn ít trước, tối đa 2 món', () => {
    const rows = restockRows([
      { name: 'x', stockQuantity: 4 },
      { name: 'y', stockQuantity: 0 },
      { name: 'z', stockQuantity: 2 },
    ]);
    assert.deepEqual(rows.map((r) => r.name), ['y', 'z']);
  });
  it('không đổi mảng đầu vào', () => {
    const input = [{ stockQuantity: 3 }, { stockQuantity: 1 }];
    restockRows(input);
    assert.deepEqual(input, [{ stockQuantity: 3 }, { stockQuantity: 1 }]);
  });
});

describe('formatQuantity', () => {
  it('bỏ phần lẻ thừa của số thập phân Core trả', () => {
    assert.equal(formatQuantity(2), '2');
    assert.equal(formatQuantity(1.5), '1.5');
    assert.equal(formatQuantity(0.1 + 0.2), '0.3');
  });
});
