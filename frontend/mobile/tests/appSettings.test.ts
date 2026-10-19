/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DEFAULT_APP_SETTINGS, isStockAlert, parseAppSettings } from '../src/lib/appSettings.ts';

describe('tuỳ chọn của app', () => {
  it('mặc định bật rung và cảnh báo hàng', () => {
    assert.deepEqual(DEFAULT_APP_SETTINGS, { haptics: true, stockAlerts: true });
  });

  it('đọc lại đúng lựa chọn đã lưu', () => {
    assert.deepEqual(parseAppSettings({ haptics: false, stockAlerts: false }), { haptics: false, stockAlerts: false });
    assert.deepEqual(parseAppSettings({ haptics: true, stockAlerts: false }), { haptics: true, stockAlerts: false });
  });

  it('thiếu khoá (file của bản cũ) hay sai kiểu thì lấy mặc định của khoá đó', () => {
    assert.deepEqual(parseAppSettings({ haptics: false }), { haptics: false, stockAlerts: true });
    assert.deepEqual(parseAppSettings({ haptics: 'false', stockAlerts: 0 }), DEFAULT_APP_SETTINGS);
    assert.deepEqual(parseAppSettings(null), DEFAULT_APP_SETTINGS);
    assert.deepEqual(parseAppSettings('rác'), DEFAULT_APP_SETTINGS);
  });

  it('cảnh báo hàng gồm sắp hết và đã hết, không gồm loại khác', () => {
    assert.equal(isStockAlert('LOW_STOCK'), true);
    assert.equal(isStockAlert('OUT_OF_STOCK'), true);
    assert.equal(isStockAlert('SALE_VOIDED'), false);
    assert.equal(isStockAlert('SHOP_INACTIVATED'), false);
  });
});
