/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addressError,
  bankAccountError,
  bankNameError,
  emailError,
  facebookError,
  nameError,
  normalizeBankAccount,
  shopNameError,
  shopPhoneError,
} from '../src/lib/profileValidation.ts';

describe('họ tên và tên tiệm', () => {
  it('bắt buộc và cần có chữ', () => {
    assert.equal(nameError('  '), 'Nhập họ và tên');
    assert.equal(nameError('!!! 123'), 'Họ tên cần có chữ cái');
    assert.equal(nameError('Nguyễn Thị Lan'), '');
    assert.equal(shopNameError(''), 'Nhập tên tiệm');
    assert.equal(shopNameError('.,!@#'), 'Tên tiệm cần có chữ hoặc số');
    assert.equal(shopNameError('mipu nè'), '');
    assert.equal(shopNameError('Tiệm 79'), '');
  });
});

describe('email', () => {
  it('để trống thì không báo lỗi', () => {
    assert.equal(emailError(''), '');
  });

  it('nhận email thường gặp', () => {
    assert.equal(emailError('mipu@student.fpt.edu.vn'), '');
    assert.equal(emailError(' ten.ban+shop@gmail.com '), '');
  });

  it('từ chối khoảng trắng, thiếu đuôi tên miền hay hai dấu chấm liền nhau', () => {
    for (const bad of ['m ipu@student.fpt.edu.vn', 'mipu@gmail', 'mipu@gmail.c', 'mi..pu@gmail.com', 'mipu@@gmail.com', 'mipu@gmail.com!']) {
      assert.notEqual(emailError(bad), '', bad);
    }
  });
});

describe('link Facebook', () => {
  it('nhận link có hoặc không có https và www', () => {
    for (const ok of ['facebook.com/tenban', 'https://www.facebook.com/tiemcotho', 'm.facebook.com/profile.php?id=1000123', 'fb.com/tiem.co.tho', 'https://fb.me/tiemcotho']) {
      assert.equal(facebookError(ok), '', ok);
    }
  });

  it('từ chối chữ lung tung, khoảng trắng và tên miền khác', () => {
    for (const bad of ['dsa mipu gfd.,!@#$%^&*()', 'facebook.com/ten ban', 'tenban', 'facebook.com/', 'instagram.com/tenban', 'facebook.com.vn/tenban']) {
      assert.notEqual(facebookError(bad), '', bad);
    }
  });
});

describe('số điện thoại tiệm', () => {
  it('nhận số di động, số bàn và +84, có thể chia nhóm', () => {
    for (const ok of ['0909875643', '0901 234 567', '0901.234.567', '(028) 3822 1234', '+84 901 234 567', '']) {
      assert.equal(shopPhoneError(ok), '', ok);
    }
  });

  it('từ chối toàn dấu chấm, có chữ, thiếu hay thừa số', () => {
    for (const bad of ['........', '0909abc643', '090987564', '090987564312', '1900 6522', '84901234567']) {
      assert.notEqual(shopPhoneError(bad), '', bad);
    }
  });
});

describe('địa chỉ', () => {
  it('tuỳ chọn nhưng không nhận toàn ký hiệu', () => {
    assert.equal(addressError(''), '');
    assert.equal(addressError('12 Lê Lợi, Q.1'), '');
    assert.equal(addressError('---'), 'Địa chỉ cần có chữ hoặc số');
  });
});

describe('nhận chuyển khoản', () => {
  it('để trống cả hai thì không báo lỗi', () => {
    assert.equal(bankNameError('', ''), '');
    assert.equal(bankAccountError('', ''), '');
  });

  it('có một ô thì phải có ô còn lại', () => {
    assert.equal(bankNameError('', '0123456789'), 'Nhập tên ngân hàng của số tài khoản này');
    assert.equal(bankAccountError('', 'Vietcombank'), 'Nhập số tài khoản');
  });

  it('tên ngân hàng chỉ gồm chữ, số và khoảng trắng', () => {
    for (const ok of ['Vietcombank', 'Nam A Bank', 'BIDV', 'MB Bank', 'Ngân hàng Á Châu (ACB)']) {
      assert.equal(bankNameError(ok, '0123456789'), '', ok);
    }
    assert.notEqual(bankNameError('!@#$%', '0123456789'), '');
    assert.notEqual(bankNameError('123', '0123456789'), '');
  });

  it('số tài khoản chỉ gồm chữ số, từ 6 đến 19 số', () => {
    assert.equal(bankAccountError('0123 456 789', 'Vietcombank'), '');
    assert.equal(bankAccountError('324253432dsa2', 'Vietcombank'), 'Số tài khoản chỉ gồm chữ số');
    assert.equal(bankAccountError('12345', 'Vietcombank'), 'Số tài khoản cần từ 6 đến 19 chữ số');
    assert.equal(bankAccountError('12345678901234567890', 'Vietcombank'), 'Số tài khoản cần từ 6 đến 19 chữ số');
    assert.equal(normalizeBankAccount(' 0123 456 789 '), '0123456789');
  });
});
