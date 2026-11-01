/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ShopView } from '../src/data/types.ts';
import { isShopUsable, pickActiveShop } from '../src/lib/shopSwitch.ts';

const active = (id: number): ShopView => ({ id, name: `Tiệm ${id}`, status: 'ACTIVE' });
const inactive = (id: number): ShopView => ({ id, name: `Tiệm ${id}`, status: 'INACTIVE' });

describe('chọn tiệm khi vào app', () => {
  it('giữ tiệm đã chọn lần trước', () => {
    assert.equal(pickActiveShop([active(1), active(2)], '2')?.id, 2);
  });

  it('chưa chọn bao giờ thì lấy tiệm đầu', () => {
    assert.equal(pickActiveShop([active(1), active(2)])?.id, 1);
  });

  it('tiệm đã chọn không còn trong danh sách thì lấy tiệm đầu', () => {
    assert.equal(pickActiveShop([active(1), active(2)], '9')?.id, 1);
  });

  it('bỏ qua tiệm bị tạm ngưng', () => {
    assert.equal(pickActiveShop([inactive(1), active(2)], '1')?.id, 2);
  });

  it('mọi tiệm đều bị tạm ngưng thì vẫn có tiệm để báo đúng lỗi', () => {
    assert.equal(pickActiveShop([inactive(1), inactive(2)])?.id, 1);
  });

  it('chưa có tiệm nào thì không chọn', () => {
    assert.equal(pickActiveShop([]), undefined);
  });

  it('tiệm thiếu trạng thái coi như dùng được', () => {
    assert.equal(isShopUsable({ id: 1, name: 'Tiệm' }), true);
    assert.equal(isShopUsable(inactive(1)), false);
  });
});
