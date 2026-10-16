/// <reference types="node" />
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { describe, it } from 'node:test';
import { base64url, challengeFor, randomToken, readZaloMessage, ZALO_TOKEN } from '../src/lib/auth/zaloProof.ts';

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
