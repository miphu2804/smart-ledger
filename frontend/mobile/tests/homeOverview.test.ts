/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatQuantity, periodRevenue, restockRows, revenueChange, topSellerRows } from '../src/lib/homeOverview.ts';

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

describe('periodRevenue', () => {
  const sales = (confirmedSalesVnd: number, confirmedOrderCount: number, matchedOrderCount = confirmedOrderCount) => ({
    confirmedSalesVnd,
    confirmedOrderCount,
    matchedOrderCount,
  });
  it('huỷ đơn bán kỳ trước: doanh thu không âm, giá trị đơn sang bên chi', () => {
    // Hôm nay chưa bán gì, huỷ một đơn 150.000đ bán hôm qua (Core: net = −150.000)
    assert.deepEqual(periodRevenue({ grossRevenueVnd: 0, voidedRevenueVnd: 150_000 }, sales(0, 0)), {
      orderCount: 0,
      revenueVnd: 0,
      cancelledEarlierVnd: 150_000,
      hasOrders: false,
    });
  });
  it('bán rồi huỷ cùng kỳ: chỉ mất khỏi doanh thu, không sang bên chi', () => {
    // Bán 300.000đ (2 đơn), huỷ đơn 100.000đ cũng bán hôm nay
    assert.deepEqual(periodRevenue({ grossRevenueVnd: 300_000, voidedRevenueVnd: 100_000 }, sales(200_000, 1, 2)), {
      orderCount: 1,
      revenueVnd: 200_000,
      cancelledEarlierVnd: 0,
      hasOrders: true,
    });
  });
  it('vừa huỷ đơn cùng kỳ vừa huỷ đơn kỳ trước', () => {
    // Bán 300.000đ, huỷ 100.000đ bán hôm nay và 50.000đ bán hôm qua
    const r = periodRevenue({ grossRevenueVnd: 300_000, voidedRevenueVnd: 150_000 }, sales(200_000, 1, 2));
    assert.equal(r.revenueVnd, 200_000);
    assert.equal(r.cancelledEarlierVnd, 50_000);
  });
  it('đơn bán trong kỳ huỷ sau kỳ (hôm qua): bên chi không âm', () => {
    assert.equal(periodRevenue({ grossRevenueVnd: 300_000, voidedRevenueVnd: 0 }, sales(200_000, 1, 2)).cancelledEarlierVnd, 0);
  });
});
