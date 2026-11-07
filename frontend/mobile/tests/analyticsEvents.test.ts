/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ANALYTICS_EVENTS, screenNameFromSegments } from '../src/lib/analyticsEvents.ts';

describe('sự kiện Google Analytics', () => {
  it('tên sự kiện theo luật của GA4 và không dùng tiền tố dành riêng', () => {
    for (const name of Object.keys(ANALYTICS_EVENTS)) {
      assert.match(name, /^[a-z][a-z0-9_]{0,39}$/, name);
      assert.doesNotMatch(name, /^(firebase_|google_|ga_)/, name);
    }
  });

  it('tên màn bỏ nhóm của expo-router và giữ tham số động thay cho mã thật', () => {
    assert.equal(screenNameFromSegments(['(tabs)']), 'home');
    assert.equal(screenNameFromSegments([]), 'home');
    assert.equal(screenNameFromSegments(['(tabs)', 'sales']), 'sales');
    assert.equal(screenNameFromSegments(['(auth)', 'welcome']), 'welcome');
    assert.equal(screenNameFromSegments(['invoice', '[id]']), 'invoice/[id]');
    assert.equal(screenNameFromSegments(['checkout']), 'checkout');
  });
});
