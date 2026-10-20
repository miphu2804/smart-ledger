/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  DEFAULT_APP_SETTINGS,
  isCategoryEnabled,
  isNotificationShown,
  isStockAlert,
  parseAppSettings,
} from '../src/lib/appSettings.ts';

describe('tuỳ chọn của app', () => {
  it('mặc định bật rung và mọi nhóm thông báo', () => {
    assert.deepEqual(DEFAULT_APP_SETTINGS, {
      haptics: true,
      stockAlerts: true,
      orderAlerts: true,
      debtAlerts: true,
      financeAlerts: true,
    });
  });

  it('đọc lại đúng lựa chọn đã lưu', () => {
    const saved = { haptics: false, stockAlerts: false, orderAlerts: true, debtAlerts: false, financeAlerts: true };
    assert.deepEqual(parseAppSettings(saved), saved);
  });

  it('thiếu khoá (file của bản cũ) hay sai kiểu thì lấy mặc định của khoá đó', () => {
    assert.deepEqual(parseAppSettings({ haptics: false, stockAlerts: false }), {
      ...DEFAULT_APP_SETTINGS,
      haptics: false,
      stockAlerts: false,
    });
    assert.deepEqual(parseAppSettings({ haptics: 'false', debtAlerts: 0 }), DEFAULT_APP_SETTINGS);
    assert.deepEqual(parseAppSettings(null), DEFAULT_APP_SETTINGS);
    assert.deepEqual(parseAppSettings('rác'), DEFAULT_APP_SETTINGS);
  });

  it('cảnh báo hàng gồm sắp hết và đã hết, không gồm loại khác', () => {
    assert.equal(isStockAlert('LOW_STOCK'), true);
    assert.equal(isStockAlert('OUT_OF_STOCK'), true);
    assert.equal(isStockAlert('SALE_VOIDED'), false);
  });
});

describe('nhóm thông báo và xoá toàn bộ', () => {
  const off = { ...DEFAULT_APP_SETTINGS, orderAlerts: false, stockAlerts: false };

  it('mỗi nhóm theo đúng công tắc của nó; Hệ thống và nhóm khác luôn bật', () => {
    assert.equal(isCategoryEnabled(off, 'order'), false);
    assert.equal(isCategoryEnabled(off, 'stock'), false);
    assert.equal(isCategoryEnabled(off, 'debt'), true);
    assert.equal(isCategoryEnabled(off, 'finance'), true);
    assert.equal(isCategoryEnabled(off, 'system'), true);
    assert.equal(isCategoryEnabled({ ...DEFAULT_APP_SETTINGS, debtAlerts: false, financeAlerts: false }, 'finance'), false);
  });

  it('nhóm đã tắt thì không hiện', () => {
    assert.equal(isNotificationShown({ category: 'order', at: '2026-10-20T08:00:00Z' }, off, null), false);
    assert.equal(isNotificationShown({ category: 'debt', at: '2026-10-20T08:00:00Z' }, off, null), true);
  });

  it('sau khi xoá toàn bộ: chỉ hiện thông báo tới sau mốc xoá', () => {
    const cleared = '2026-10-20T09:00:00.000Z';
    assert.equal(isNotificationShown({ category: 'debt', at: '2026-10-20T08:59:59Z' }, DEFAULT_APP_SETTINGS, cleared), false);
    assert.equal(isNotificationShown({ category: 'debt', at: '2026-10-20T09:00:00Z' }, DEFAULT_APP_SETTINGS, cleared), false);
    assert.equal(isNotificationShown({ category: 'debt', at: '2026-10-20T09:00:01Z' }, DEFAULT_APP_SETTINGS, cleared), true);
  });

  it('thời điểm không đọc được thì vẫn hiện, không lặng lẽ mất thông báo', () => {
    assert.equal(isNotificationShown({ category: 'debt', at: 'không phải ngày' }, DEFAULT_APP_SETTINGS, '2026-10-20T09:00:00Z'), true);
  });
});
