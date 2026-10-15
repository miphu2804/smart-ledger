/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { debtAgeDays, groupDebtsByCustomer, matchesDebtSearch, type DebtRow } from '../src/lib/debtGroups.ts';

const row = (over: Partial<DebtRow> & Pick<DebtRow, 'id' | 'customerId'>): DebtRow => ({
  saleId: over.id * 10,
  originalVnd: 100_000,
  outstandingVnd: 100_000,
  status: 'OPEN',
  createdAt: '2026-10-10T09:00:00+07:00',
  name: 'Khách',
  phone: '',
  ...over,
});

describe('groupDebtsByCustomer', () => {
  it('gộp các khoản cùng SĐT dù Core tạo nhiều khách trùng tên', () => {
    const groups = groupDebtsByCustomer([
      row({ id: 1, customerId: 1, name: 'Anh Minh', phone: '0912 345 678', outstandingVnd: 50_000 }),
      row({ id: 2, customerId: 7, name: 'Anh Minh', phone: '0912345678', outstandingVnd: 30_000, createdAt: '2026-10-01T09:00:00+07:00' }),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].outstandingVnd, 80_000);
    assert.equal(groups[0].openCount, 2);
    assert.equal(groups[0].oldestOpenAt, '2026-10-01T09:00:00+07:00');
    // Khoản cũ trước
    assert.deepEqual(
      groups[0].debts.map((d) => d.id),
      [2, 1],
    );
  });

  it('không gộp khách không có SĐT chỉ vì trùng tên', () => {
    const groups = groupDebtsByCustomer([
      row({ id: 1, customerId: 1, name: 'Chị Lan' }),
      row({ id: 2, customerId: 2, name: 'Chị Lan' }),
    ]);
    assert.equal(groups.length, 2);
  });

  it('khách nợ nhiều trước; khoản đã trả xong không cộng vào số còn nợ', () => {
    const groups = groupDebtsByCustomer([
      row({ id: 1, customerId: 1, name: 'A', outstandingVnd: 20_000 }),
      row({ id: 2, customerId: 2, name: 'B', outstandingVnd: 90_000 }),
      row({ id: 3, customerId: 3, name: 'C', outstandingVnd: 0, status: 'SETTLED' }),
    ]);
    assert.deepEqual(
      groups.map((g) => [g.name, g.outstandingVnd, g.openCount]),
      [
        ['B', 90_000, 1],
        ['A', 20_000, 1],
        ['C', 0, 0],
      ],
    );
  });

  it('trong một khách: khoản còn nợ trước khoản đã trả', () => {
    const [g] = groupDebtsByCustomer([
      row({ id: 1, customerId: 1, phone: '0901', status: 'SETTLED', outstandingVnd: 0, createdAt: '2026-10-12T09:00:00+07:00' }),
      row({ id: 2, customerId: 1, phone: '0901', createdAt: '2026-10-11T09:00:00+07:00' }),
    ]);
    assert.deepEqual(
      g.debts.map((d) => d.id),
      [2, 1],
    );
  });
});

describe('matchesDebtSearch', () => {
  const minh = { name: 'Anh Minh', phone: '0912 345 678' };
  it('tìm tên không dấu, không phân biệt hoa thường', () => {
    assert.equal(matchesDebtSearch(minh, 'minh'), true);
    assert.equal(matchesDebtSearch({ name: 'Cô Đào', phone: '' }, 'co dao'), true);
    assert.equal(matchesDebtSearch(minh, 'lan'), false);
  });
  it('tìm theo SĐT bỏ khoảng trắng, cần ít nhất 3 chữ số', () => {
    assert.equal(matchesDebtSearch(minh, '345678'), true);
    assert.equal(matchesDebtSearch(minh, '0912 34'), true);
    assert.equal(matchesDebtSearch(minh, '12'), false);
  });
  it('từ khoá rỗng khớp tất cả', () => {
    assert.equal(matchesDebtSearch(minh, '  '), true);
  });
});

describe('debtAgeDays', () => {
  it('tính theo ngày lịch', () => {
    const now = new Date(2026, 9, 16, 8, 0);
    assert.equal(debtAgeDays(new Date(2026, 9, 16, 1, 0).toISOString(), now), 0);
    assert.equal(debtAgeDays(new Date(2026, 9, 15, 23, 0).toISOString(), now), 1);
    assert.equal(debtAgeDays(new Date(2026, 8, 16, 12, 0).toISOString(), now), 30);
  });
});
