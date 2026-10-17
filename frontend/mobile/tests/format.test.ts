/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { capMoney, MAX_MONEY_VND } from '../src/lib/format.ts';

describe('capMoney: ô nhập tiền không nhận số vô lý', () => {
  it('chỉ giữ chữ số', () => {
    assert.equal(capMoney('150.000đ', ''), '150000');
  });

  it('đúng 10 tỷ vẫn nhận', () => {
    assert.equal(capMoney('10.000.000.000', ''), String(MAX_MONEY_VND));
  });

  it('gõ thêm một chữ số làm vượt 10 tỷ thì giữ giá trị cũ', () => {
    assert.equal(capMoney('100000000000', '10000000000'), '10000000000');
  });

  it('số của người test (1 tỷ tỷ đồng) không lọt vào', () => {
    assert.equal(capMoney('1000000000000000000', '25000'), '25000');
  });

  it('xoá hết thì rỗng', () => {
    assert.equal(capMoney('', '25000'), '');
  });
});
