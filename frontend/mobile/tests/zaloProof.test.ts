/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { describe, it } from 'node:test';
import { secureRandomBytes } from '../src/lib/auth/secureRandom.ts';
import { asciiBytes, sha256 } from '../src/lib/auth/sha256.ts';
import {
  base64url,
  challengeFor,
  isZaloReturnUrl,
  originOf,
  randomToken,
  readZaloMessage,
  readZaloReturn,
  ZALO_TOKEN,
} from '../src/lib/auth/zaloProof.ts';

describe('mã của luồng Zalo', () => {
  it('base64url không có "=", "+", "/" và khớp Buffer base64url', () => {
    const bytes = new Uint8Array([251, 255, 191, 0, 1, 2, 3]);
    assert.equal(base64url(bytes), Buffer.from(bytes).toString('base64url'));
  });

  it('clientVerifier là 43 ký tự base64url, mỗi lần một khác', () => {
    const a = randomToken();
    const b = randomToken();
    assert.match(a, ZALO_TOKEN);
    assert.notEqual(a, b);
  });

  it('requestId 24 byte dài 32 ký tự, trong khoảng 16–100 Core nhận', () => {
    assert.match(randomToken(24), /^[A-Za-z0-9_-]{32}$/);
  });

  it('clientChallenge là SHA-256 (ASCII) base64url như ZaloCrypto.hash ở Core', async () => {
    const verifier = randomToken();
    const expected = createHash('sha256').update(verifier, 'ascii').digest('base64url');
    const challenge = await challengeFor(verifier);
    assert.equal(challenge, expected);
    assert.match(challenge, ZALO_TOKEN);
  });
});

describe('đọc message từ popup Zalo', () => {
  const expected = { coreOrigin: 'https://core.example', requestId: 'req_0123456789abcdef', purpose: 'LOGIN' as const };
  const proof = 'A'.repeat(43);
  const ok = { type: 'smartledger:zalo', requestId: expected.requestId, purpose: 'LOGIN', proof, error: null };

  it('đúng origin, đúng popup, đúng lượt → lấy proof', () => {
    assert.deepEqual(readZaloMessage('https://core.example', true, ok, expected), { kind: 'proof', proof });
  });

  it('origin khác, cửa sổ khác, loại message khác → bỏ qua', () => {
    assert.equal(readZaloMessage('https://evil.example', true, ok, expected).kind, 'ignore');
    assert.equal(readZaloMessage('https://core.example', false, ok, expected).kind, 'ignore');
    assert.equal(readZaloMessage('https://core.example', true, { ...ok, type: 'other' }, expected).kind, 'ignore');
    assert.equal(readZaloMessage('https://core.example', true, 'chuỗi', expected).kind, 'ignore');
  });

  it('requestId hay purpose của lượt khác → bỏ qua', () => {
    assert.equal(readZaloMessage('https://core.example', true, { ...ok, requestId: 'req_khac_1234567890' }, expected).kind, 'ignore');
    assert.equal(readZaloMessage('https://core.example', true, { ...ok, purpose: 'LINK' }, expected).kind, 'ignore');
  });

  it('Core báo lỗi (người dùng từ chối) → trả mã lỗi', () => {
    assert.deepEqual(
      readZaloMessage('https://core.example', true, { ...ok, proof: null, error: 'zalo_consent_denied' }, expected),
      { kind: 'error', error: 'zalo_consent_denied' },
    );
  });

  it('proof sai định dạng → lỗi, không gửi đi đổi token', () => {
    assert.equal(readZaloMessage('https://core.example', true, { ...ok, proof: 'ngan' }, expected).kind, 'error');
  });
});

describe('SHA-256 và nguồn ngẫu nhiên cho Android (Hermes không có Web Crypto)', () => {
  it('SHA-256 viết bằng JS khớp node:crypto ở mọi độ dài, kể cả quanh ranh giới khối 64 byte', () => {
    for (const length of [0, 1, 43, 55, 56, 63, 64, 65, 119, 120, 1000]) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 37 + length) & 255);
      assert.equal(Buffer.from(sha256(bytes)).toString('hex'), createHash('sha256').update(bytes).digest('hex'), `độ dài ${length}`);
    }
  });

  it('ký tự ngoài ASCII bị từ chối như ZaloCrypto.hash ở Core', () => {
    assert.deepEqual([...asciiBytes('Az09-_')], [65, 122, 48, 57, 45, 95]);
    assert.throws(() => asciiBytes('Zalo việt'));
  });

  it('không có crypto.getRandomValues thì lấy từ UUID native của Expo, đủ số byte và mỗi lần một khác', () => {
    const saved = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
    const g = globalThis as { expo?: { uuidv4?: () => string } };
    const savedExpo = g.expo;
    let calls = 0;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true, writable: true });
    g.expo = { uuidv4: () => (calls++, randomUUID()) };
    try {
      const a = secureRandomBytes(32);
      const b = secureRandomBytes(70);
      assert.equal(a.length, 32);
      assert.equal(b.length, 70);
      assert.notEqual(Buffer.from(a).toString('hex'), Buffer.from(b.subarray(0, 32)).toString('hex'));
      assert.ok(b.subarray(64).some((x) => x !== 0), 'khối cuối cũng có byte ngẫu nhiên');
      assert.equal(calls, 6);
      g.expo = undefined;
      assert.throws(() => secureRandomBytes(32));
    } finally {
      if (saved) Object.defineProperty(globalThis, 'crypto', saved);
      g.expo = savedExpo;
    }
  });
});

describe('đọc App Link Zalo trả về app Android', () => {
  const core = 'https://core.example';
  const expected = { coreOrigin: core, nativeClientId: 'android-staging', requestId: 'req_0123456789abcdef', purpose: 'LOGIN' as const };
  const reference = 'B'.repeat(43);
  const url = (fragment: string) => `${core}/mobile/auth/zalo/complete#${fragment}`;
  const ok = `nativeClientId=android-staging&requestId=${expected.requestId}&purpose=LOGIN&handoffReference=${reference}`;

  it('đúng Core, đúng client và lượt → lấy handoffReference', () => {
    assert.deepEqual(readZaloReturn(url(ok), expected), { kind: 'handoff', handoffReference: reference });
  });

  it('Core khác, đường khác hay link không có fragment của lượt này → bỏ qua', () => {
    assert.equal(readZaloReturn(`https://evil.example/mobile/auth/zalo/complete#${ok}`, expected).kind, 'ignore');
    assert.equal(readZaloReturn(`${core}/mobile/auth/zalo/completeX#${ok}`, expected).kind, 'ignore');
    assert.equal(readZaloReturn(`${core}/mobile/auth/zalo/complete?${ok}`, expected).kind, 'ignore');
    assert.equal(readZaloReturn(`${core}/mobile/auth/zalo/complete`, expected).kind, 'ignore');
  });

  it('client, requestId hay purpose của lượt khác → bỏ qua', () => {
    assert.equal(readZaloReturn(url(ok.replace('android-staging', 'android-production')), expected).kind, 'ignore');
    assert.equal(readZaloReturn(url(ok.replace(expected.requestId, 'req_khac_1234567890')), expected).kind, 'ignore');
    assert.equal(readZaloReturn(url(ok.replace('purpose=LOGIN', 'purpose=LINK')), expected).kind, 'ignore');
  });

  it('Core báo lỗi cố định → trả mã lỗi, không có reference', () => {
    const denied = `nativeClientId=android-staging&requestId=${expected.requestId}&purpose=LOGIN&error=zalo_consent_denied`;
    assert.deepEqual(readZaloReturn(url(denied), expected), { kind: 'error', error: 'zalo_consent_denied' });
  });

  it('reference sai định dạng hay fragment mã hoá hỏng → lỗi, không gửi đi đổi token', () => {
    assert.equal(readZaloReturn(url(ok.replace(reference, 'ngan')), expected).kind, 'error');
    assert.equal(readZaloReturn(url(`${ok}&x=%E0%A4%A`), expected).kind, 'error');
  });

  it('nhận ra link trả về và origin của Core', () => {
    assert.equal(originOf('https://Core.Example/api/v1'), core);
    assert.equal(originOf('core.example'), '');
    assert.ok(isZaloReturnUrl(url(ok), core));
    assert.ok(!isZaloReturnUrl(`${core}/api/v1/auth/zalo/callback`, core));
  });
});
