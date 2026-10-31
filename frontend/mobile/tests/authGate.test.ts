/// <reference types="node" />
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { describe, it } from 'node:test';
import { canOpenProtectedScreens, PROTECTED_SCREENS } from '../src/lib/authGate.ts';

// Màn mở được khi chưa đăng nhập: splash, 404, và màn chẩn đoán (tự khoá khi không phải bản dev)
const PUBLIC_SCREENS = ['+native-intent', '+not-found', '_layout', 'debug', 'index'];

describe('chặn màn khi chưa đăng nhập', () => {
  it('mọi màn trong app/ đều được chặn, trừ các màn công khai', () => {
    const files = readdirSync('app', { recursive: true, encoding: 'utf8' })
      .map((file) => file.replace(/\\/g, '/'))
      .filter((file) => file.endsWith('.tsx') && !file.startsWith('(tabs)/') && !file.startsWith('(auth)/'))
      .map((file) => file.replace(/\.tsx$/, ''))
      .filter((screen) => !PUBLIC_SCREENS.includes(screen));
    assert.deepEqual(files.sort(), [...PROTECTED_SCREENS].sort());
  });

  it('chỉ mở khi đã khôi phục phiên, đã đăng nhập và có tiệm', () => {
    assert.equal(canOpenProtectedScreens({ authReady: true, loggedIn: true, onboarded: true }), true);
    assert.equal(canOpenProtectedScreens({ authReady: false, loggedIn: true, onboarded: true }), false);
    assert.equal(canOpenProtectedScreens({ authReady: true, loggedIn: false, onboarded: true }), false);
    assert.equal(canOpenProtectedScreens({ authReady: true, loggedIn: true, onboarded: false }), false);
  });
});
