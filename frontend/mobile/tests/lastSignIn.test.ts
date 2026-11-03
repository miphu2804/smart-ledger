/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseSignInMethod } from '../src/lib/lastSignIn.ts';

describe('cách đăng nhập gần nhất', () => {
  it('nhận email, Google, Zalo', () => {
    assert.equal(parseSignInMethod('email'), 'email');
    assert.equal(parseSignInMethod('google'), 'google');
    assert.equal(parseSignInMethod('zalo'), 'zalo');
  });

  it('Facebook đã bỏ, giá trị lạ hay trống thì không gắn nhãn', () => {
    assert.equal(parseSignInMethod('facebook'), null);
    assert.equal(parseSignInMethod(''), null);
    assert.equal(parseSignInMethod(null), null);
    assert.equal(parseSignInMethod(42), null);
  });
});
