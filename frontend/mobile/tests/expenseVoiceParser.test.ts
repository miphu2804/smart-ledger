import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpenseVoice } from '../src/lib/expenseVoiceParser.ts';

describe('expenseVoiceParser - Nhận diện tiền tỷ và giữ nguyên nội dung nói', () => {
  it('nhận diện chính xác 1 tỷ đồng và các số tiền tỷ viết số', () => {
    const res1 = parseExpenseVoice('1 tỷ đồng');
    assert.equal(res1.amount, 1_000_000_000);
    assert.equal(res1.title, '');

    const res2 = parseExpenseVoice('Chi 1.5 tỷ mua máy pha cà phê');
    assert.equal(res2.amount, 1_500_000_000);
    assert.equal(res2.title, 'Mua máy pha cà phê');

    const res3 = parseExpenseVoice('Thuê mặt bằng 2 tỉ');
    assert.equal(res3.amount, 2_000_000_000);
    assert.equal(res3.title, 'Thuê mặt bằng');
  });

  it('nhận diện số tiền tỷ đọc bằng chữ tiếng Việt (hai tỷ rưỡi)', () => {
    const res1 = parseExpenseVoice('Chi hai tỷ rưỡi mua đất');
    assert.equal(res1.amount, 2_500_000_000);
    assert.equal(res1.title, 'Mua đất');

    const res2 = parseExpenseVoice('Một tỷ');
    assert.equal(res2.amount, 1_000_000_000);
    assert.equal(res2.title, '');
  });

  it('giữ nguyên vẹn nội dung người nói, không lọc mất từ vựng', () => {
    const res = parseExpenseVoice('Mua 2 cây đá 20 nghìn');
    assert.equal(res.amount, 20_000);
    // Trước đây hàm cleanName cũ lọc mất chữ "2" và "cây", chỉ còn "Đá"
    // Nay phải giữ nguyên vẹn nội dung: "Mua 2 cây đá"
    assert.equal(res.title, 'Mua 2 cây đá');
  });

  it('giữ đúng nội dung mô tả chi tiết: Tiền mặt bằng tháng 10 15 triệu', () => {
    const res = parseExpenseVoice('Tiền mặt bằng tháng 10 15 triệu');
    assert.equal(res.amount, 15_000_000);
    assert.equal(res.title, 'Tiền mặt bằng tháng 10');
  });

  it('nhận diện các định dạng số tiền hàng triệu và trăm nghìn', () => {
    const res1 = parseExpenseVoice('Tiền điện một triệu rưỡi');
    assert.equal(res1.amount, 1_500_000);
    assert.equal(res1.title, 'Tiền điện');

    const res2 = parseExpenseVoice('Nhập hàng tạp hóa 500k');
    assert.equal(res2.amount, 500_000);
    assert.equal(res2.title, 'Nhập hàng tạp hóa');

    const res3 = parseExpenseVoice('Mua đồ gia dụng 200.000đ');
    assert.equal(res3.amount, 200_000);
    assert.equal(res3.title, 'Mua đồ gia dụng');
  });

  it('chỉ nói số tiền thì title để trống cho người dùng tự gõ', () => {
    const res1 = parseExpenseVoice('Chi 50k');
    assert.equal(res1.amount, 50_000);
    assert.equal(res1.title, '');

    const res2 = parseExpenseVoice('100 nghìn');
    assert.equal(res2.amount, 100_000);
    assert.equal(res2.title, '');
  });

  it('chỉ nói nội dung không có số tiền thì amount để null', () => {
    const res = parseExpenseVoice('Mua 3 thùng mì tôm');
    assert.equal(res.amount, null);
    assert.equal(res.title, 'Mua 3 thùng mì tôm');
  });

  it('chuỗi rỗng trả về title rỗng và amount null', () => {
    const res = parseExpenseVoice('');
    assert.equal(res.title, '');
    assert.equal(res.amount, null);
  });
});
