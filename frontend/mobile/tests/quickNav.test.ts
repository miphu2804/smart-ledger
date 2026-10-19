/// <reference types="node" />
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { describe, it } from 'node:test';
import { activeQuickNavKey, opensAfterDrag, QUICK_NAV_SECTIONS } from '../src/lib/quickNav.ts';

const items = QUICK_NAV_SECTIONS.flatMap((section) => section.items);

describe('menu chuyển nhanh', () => {
  it('có đủ các màn chính, mỗi mục một khoá', () => {
    assert.deepEqual(
      items.map((item) => item.label),
      ['Tổng quan', 'Bán hàng', 'Đơn hàng', 'Công nợ', 'Hàng hoá', 'Báo cáo', 'Chi phí', 'Trợ lý AI', 'Cài đặt'],
    );
    assert.equal(new Set(items.map((item) => item.key)).size, items.length);
  });

  it('mỗi mục trỏ tới một màn có thật trong app/', () => {
    for (const item of items) {
      const file = item.tab
        ? `app/(tabs)/${item.href === '/' ? 'index' : item.href.slice(1)}.tsx`
        : `app${item.href}.tsx`;
      assert.ok(existsSync(file), `${item.label}: thiếu ${file}`);
    }
  });

  it('đánh dấu đúng mục đang mở theo đường dẫn', () => {
    assert.equal(activeQuickNavKey('/'), 'overview');
    assert.equal(activeQuickNavKey('/(tabs)'), 'overview');
    assert.equal(activeQuickNavKey('/sales'), 'sales');
    assert.equal(activeQuickNavKey('/invoices/'), 'invoices');
    assert.equal(activeQuickNavKey('/(tabs)/invoices?from=chat'), 'invoices');
    assert.equal(activeQuickNavKey('/debts'), 'debts');
  });

  it('màn không có trong menu (tab Quản lý, màn khác) thì không đánh dấu mục nào', () => {
    assert.equal(activeQuickNavKey('/more'), null);
    assert.equal(activeQuickNavKey('/salesman'), null);
    assert.equal(activeQuickNavKey('/profile'), null);
  });

  it('thả tay sau khi kéo: vuốt nhanh quyết định hướng', () => {
    assert.equal(opensAfterDrag(0.15, 0.8, false), true, 'vuốt nhanh từ mép thì mở dù mới kéo ra ít');
    assert.equal(opensAfterDrag(0.9, -0.8, true), false, 'vuốt nhanh sang trái thì đóng dù bảng còn hiện nhiều');
    assert.equal(opensAfterDrag(0.9, -0.8, false), false);
  });

  it('kéo chậm: quá 35% theo hướng đang kéo là đổi trạng thái, chưa tới thì trả về như cũ', () => {
    assert.equal(opensAfterDrag(0.4, 0.05, false), true, 'từ đóng kéo ra 40% thì mở');
    assert.equal(opensAfterDrag(0.3, 0.05, false), false, 'từ đóng kéo ra 30% thì đóng lại');
    assert.equal(opensAfterDrag(0.6, -0.05, true), false, 'từ mở kéo vào 40% thì đóng');
    assert.equal(opensAfterDrag(0.7, -0.05, true), true, 'từ mở kéo vào 30% thì mở lại');
  });
});
