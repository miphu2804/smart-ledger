/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseOrder } from '../src/lib/parseOrder.ts';

const products = [
  { id: 1, name: 'Sting vàng', price: 10_000 },
  { id: 2, name: 'Sting đỏ', price: 10_000 },
  { id: 3, name: 'Bánh mì thịt', price: 20_000 },
  { id: 4, name: 'Cà phê sữa', price: 25_000 },
];

describe('parseOrder: tên chung của nhiều mẫu', () => {
  it('"hai sting" hỏi chọn Sting vàng hay Sting đỏ, không thêm món mới', () => {
    const r = parseOrder('hai sting', products);
    assert.equal(r.items.length, 0);
    assert.equal(r.unknown.length, 0);
    assert.deepEqual(r.missingQuantityItems, []);
    assert.equal(r.disambiguations?.length, 1);
    assert.equal(r.disambiguations?.[0].qty, 2);
    assert.deepEqual(
      r.disambiguations?.[0].options.map((o) => o.name),
      ['Sting vàng', 'Sting đỏ'],
    );
  });

  it('không nói số lượng thì hỏi mẫu với số lượng 1, không hỏi số lượng', () => {
    const r = parseOrder('sting', products);
    assert.equal(r.disambiguations?.[0].qty, 1);
    assert.deepEqual(r.missingQuantityItems, []);
  });

  it('nói rõ mẫu thì ghi thẳng, không hỏi', () => {
    const r = parseOrder('hai sting vàng', products);
    assert.deepEqual(
      r.items.map((i) => [i.name, i.qty]),
      [['Sting vàng', 2]],
    );
    assert.equal(r.disambiguations?.length, 0);
  });

  it('chỉ một món chứa tên đã nói thì vẫn hỏi xác nhận', () => {
    const r = parseOrder('một cà phê', products);
    assert.deepEqual(
      r.disambiguations?.[0].options.map((o) => o.name),
      ['Cà phê sữa'],
    );
  });

  it('món có trong danh mục cùng câu vẫn được ghi', () => {
    const r = parseOrder('một bánh mì thịt, hai sting', products);
    assert.deepEqual(
      r.items.map((i) => [i.name, i.qty]),
      [['Bánh mì thịt', 1]],
    );
    assert.equal(r.disambiguations?.[0].qty, 2);
  });

  it('tên không thuộc món nào vẫn là món mới', () => {
    const r = parseOrder('hai trà tắc', products);
    assert.equal(r.disambiguations?.length, 0);
    assert.equal(r.unknown[0]?.name, 'Trà tắc');
  });

  it('nói kèm giá là món mới có giá, không hỏi mẫu', () => {
    const r = parseOrder('sting 12k', products);
    assert.equal(r.disambiguations?.length, 0);
    assert.equal(r.unknown[0]?.price, 12_000);
  });
});

describe('parseOrder: tên dài hơn món khớp được', () => {
  // Như danh mục mẫu: có món "Sting" và hai loại Sting Gold tên dài
  const catalog = [
    { id: 10, name: 'Sting', price: 12_000 },
    { id: 11, name: 'Nước Tăng Lực Sting Gold Lon 320ml', price: 11_000 },
    { id: 12, name: 'Nước Tăng Lực Sting Gold Lốc 6 Lon 320ml', price: 63_000 },
  ];

  it('"hai sting gold" hỏi chọn giữa hai loại Sting Gold, không lấy nhầm "Sting"', () => {
    const r = parseOrder('hai sting gold', catalog);
    assert.equal(r.items.length, 0);
    assert.equal(r.disambiguations?.[0].qty, 2);
    assert.deepEqual(
      r.disambiguations?.[0].options.map((o) => o.product_id),
      [11, 12],
    );
  });

  it('"một sting" trùng hẳn tên món "Sting" thì ghi thẳng', () => {
    const r = parseOrder('một sting', catalog);
    assert.deepEqual(
      r.items.map((i) => [i.productId, i.qty]),
      [[10, 1]],
    );
    assert.equal(r.disambiguations?.length, 0);
  });

  it('chữ thừa không thuộc món nào thì vẫn ghi món khớp được như trước', () => {
    const r = parseOrder('hai sting lạnh', catalog);
    assert.deepEqual(
      r.items.map((i) => [i.productId, i.qty]),
      [[10, 2]],
    );
  });
});
