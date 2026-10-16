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

  it('chữ thừa không thuộc món nào thì hỏi: món khớp được hay thêm món mới', () => {
    const r = parseOrder('hai sting lạnh', catalog);
    assert.equal(r.items.length, 0);
    assert.equal(r.disambiguations?.[0].rawName, 'Sting lạnh');
    assert.equal(r.disambiguations?.[0].qty, 2);
    assert.deepEqual(
      r.disambiguations?.[0].options.map((o) => o.product_id),
      [10],
    );
  });

  it('bỏ qua từ mô tả ở giữa tên sản phẩm khi chỉ còn một ứng viên', () => {
    const r = parseOrder('một sting dâu', [{ id: 20, name: 'Sting hương dâu', price: 12_000 }]);
    assert.deepEqual(r.items.map((i) => [i.productId, i.qty]), [[20, 1]]);
    assert.equal(r.disambiguations?.length, 0);
    assert.equal(r.unknown.length, 0);
  });
});

describe('parseOrder: tên dài hơn món duy nhất trong danh mục', () => {
  const catalog = [
    { id: 1, name: 'Cà phê', price: 15_000 },
    { id: 2, name: 'Bánh mì thịt', price: 20_000 },
  ];

  it('"một cà phê sữa" khi chỉ có "Cà phê": hỏi lại, không ghi thành Cà phê', () => {
    const r = parseOrder('một cà phê sữa', catalog);
    assert.equal(r.items.length, 0);
    assert.equal(r.disambiguations?.[0].rawName, 'Cà phê sữa');
    assert.deepEqual(
      r.disambiguations?.[0].options.map((o) => o.name),
      ['Cà phê'],
    );
  });

  it('nói đúng tên món thì ghi thẳng', () => {
    assert.deepEqual(
      parseOrder('hai cà phê', catalog).items.map((i) => [i.name, i.qty]),
      [['Cà phê', 2]],
    );
  });

  it('từ thêm ở cuối câu ("nữa", "luôn") không làm hỏi lại', () => {
    assert.deepEqual(
      parseOrder('thêm hai cà phê nữa', catalog).items.map((i) => [i.name, i.qty]),
      [['Cà phê', 2]],
    );
    assert.deepEqual(
      parseOrder('lấy một bánh mì thịt luôn', catalog).items.map((i) => [i.name, i.qty]),
      [['Bánh mì thịt', 1]],
    );
  });

  it('nói liền món có sẵn và tên dài hơn', () => {
    const r = parseOrder('hai cà phê sữa một bánh mì thịt', catalog);
    assert.deepEqual(
      r.items.map((i) => [i.name, i.qty]),
      [['Bánh mì thịt', 1]],
    );
    assert.equal(r.disambiguations?.[0].rawName, 'Cà phê sữa');
    assert.equal(r.disambiguations?.[0].qty, 2);
  });
});

describe('parseOrder: nói liền hai món không ngắt câu', () => {
  const catalog = [
    { id: 1, name: 'Sting vàng', price: 10_000 },
    { id: 2, name: 'Sting đỏ', price: 10_000 },
    { id: 3, name: 'Bánh mì thịt', price: 20_000 },
    { id: 4, name: 'Cà phê sữa', price: 25_000 },
    { id: 5, name: 'Trà đá', price: 5_000 },
    { id: 6, name: 'Nước Tăng Lực Sting Gold Lốc 6 Lon 320ml', price: 63_000 },
  ];
  const summary = (text: string) => {
    const r = parseOrder(text, catalog);
    return {
      items: r.items.map((i) => `${i.qty} ${i.name}`),
      choose: (r.disambiguations ?? []).map((d) => `${d.qty} ${d.rawName}`),
      unknown: r.unknown.map((u) => `${u.qty} ${u.name}`),
    };
  };

  it('"hai sting một bánh mì thịt": hỏi mẫu Sting và ghi bánh mì, không thành 2 bánh mì', () => {
    assert.deepEqual(summary('hai sting một bánh mì thịt'), { items: ['1 Bánh mì thịt'], choose: ['2 Sting'], unknown: [] });
  });

  it('thứ tự ngược lại cũng tách được', () => {
    assert.deepEqual(summary('một bánh mì thịt hai sting'), { items: ['1 Bánh mì thịt'], choose: ['2 Sting'], unknown: [] });
  });

  it('món chưa có trong danh mục nói liền với món có sẵn không mất món nào', () => {
    assert.deepEqual(summary('hai bia tiger một bánh mì thịt'), { items: ['1 Bánh mì thịt'], choose: [], unknown: ['2 Bia tiger'] });
  });

  it('hai tên chung nói liền', () => {
    assert.deepEqual(summary('hai sting ba trà đá'), { items: ['3 Trà đá'], choose: ['2 Sting'], unknown: [] });
  });

  it('số lượng có đơn vị và số hai chữ', () => {
    assert.deepEqual(summary('hai mươi ly trà đá một bánh mì thịt'), { items: ['20 Trà đá', '1 Bánh mì thịt'], choose: [], unknown: [] });
  });

  it('không tách bên trong tên món có số ("Lốc 6 Lon")', () => {
    // Nói đủ tên: đúng món
    assert.deepEqual(summary('một nước tăng lực sting gold lốc 6 lon 320ml'), {
      items: ['1 Nước Tăng Lực Sting Gold Lốc 6 Lon 320ml'],
      choose: [],
      unknown: [],
    });
    // Nói một phần tên: "lốc 6" liền nhau trong tên món nên không bị cắt thành hai mục
    const r = summary('một sting gold lốc 6 lon 320ml');
    assert.equal(r.items.length + r.choose.length + r.unknown.length, 1);
  });

  it('không tách khi phía trước chỉ là từ đệm', () => {
    assert.deepEqual(summary('cho em hai cà phê sữa'), { items: ['2 Cà phê sữa'], choose: [], unknown: [] });
  });
});

describe('parseOrder: chữ trùng đơn vị khi bỏ dấu', () => {
  const catalog = [
    { id: 1, name: 'Bò húc', price: 12_000 },
    { id: 2, name: 'Bánh mì thịt', price: 20_000 },
    { id: 3, name: 'Gỏi cuốn', price: 30_000 },
  ];
  const summary = (text: string, cat: { id: number; name: string; price: number }[] = []) => {
    const r = parseOrder(text, cat);
    return { items: r.items.map((i) => `${i.qty} ${i.name}`), unknown: r.unknown.map((u) => `${u.qty} ${u.name}`) };
  };

  it('"bò húc" chưa có trong danh mục giữ đủ tên, không thành "Húc"', () => {
    assert.deepEqual(summary('hai bò húc một bánh mì thịt', [catalog[1]]), { items: ['1 Bánh mì thịt'], unknown: ['2 Bò húc'] });
  });

  it('"gỏi cuốn", "rau cải" không bị cắt chữ đầu', () => {
    assert.deepEqual(summary('ba gỏi cuốn').unknown, ['3 Gỏi cuốn']);
    assert.deepEqual(summary('hai rau cải').unknown, ['2 Rau cải']);
  });

  it('đơn vị thật vẫn đi theo số lượng', () => {
    assert.deepEqual(summary('hai bó rau').unknown, ['2 Rau']);
    assert.deepEqual(summary('một gói mì tôm').unknown, ['1 Mì tôm']);
    assert.deepEqual(summary('hai cái bánh bao').unknown, ['2 Bánh bao']);
  });

  it('món có trong danh mục khớp cả khi nói có dấu và gõ không dấu', () => {
    assert.deepEqual(summary('hai bò húc', catalog).items, ['2 Bò húc']);
    assert.deepEqual(summary('hai bo huc', catalog).items, ['2 Bò húc']);
    assert.deepEqual(summary('một goi cuon', catalog).items, ['1 Gỏi cuốn']);
  });
});
