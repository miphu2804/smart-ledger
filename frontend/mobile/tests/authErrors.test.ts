/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AuthError, safeDiagCode } from '../src/lib/auth/types.ts';

describe('mã chẩn đoán trong lỗi đăng nhập', () => {
  it('chỉ nhận mã ngắn, không nhận chuỗi tự do', () => {
    assert.equal(safeDiagCode('auth/internal-error'), 'auth/internal-error');
    assert.equal(safeDiagCode(12500), '12500');
    assert.equal(safeDiagCode('google-10'), 'google-10');
    assert.equal(safeDiagCode('a@b.com'), undefined);
    assert.equal(safeDiagCode('Bearer eyJhbGciOi xyz'), undefined);
    assert.equal(safeDiagCode('x'.repeat(49)), undefined);
    assert.equal(safeDiagCode(undefined), undefined);
  });

  it('lỗi chưa phân loại hiện kèm mã gốc', () => {
    const e = new AuthError('unknown', undefined, 'auth/internal-error');
    assert.equal(e.message, 'Không đăng nhập được. Vui lòng thử lại (mã: auth/internal-error)');
    assert.equal(e.diag, 'auth/internal-error');
  });

  it('lỗi cấu hình là câu chung kèm mã, chi tiết kỹ thuật chỉ để ghi log', () => {
    const e = new AuthError('not-configured', 'SHA-1 của khoá ký chưa có trong Firebase project', 'google-10');
    assert.equal(
      e.message,
      'Cách đăng nhập này chưa dùng được lúc này. Vui lòng chọn cách khác hoặc thử lại sau (mã: google-10)',
    );
    assert.equal(e.detail, 'SHA-1 của khoá ký chưa có trong Firebase project');
  });

  it('mã không an toàn bị bỏ, không có mã thì thông báo như cũ', () => {
    assert.equal(new AuthError('unknown', undefined, 'mail me@x.com').message, 'Không đăng nhập được. Vui lòng thử lại');
    assert.equal(new AuthError('invalid-credentials').message, 'Email hoặc mật khẩu chưa đúng');
  });
});
