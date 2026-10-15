/**
 * Phần thuần của màn Công nợ (không gọi mạng, không import gì để test được bằng `node --test`): gộp các khoản nợ theo khách,
 * tìm theo tên/SĐT và tính số ngày đã nợ.
 */

/** Bỏ dấu, chữ thường (như `normalizeText` ở format.ts). */
const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .trim();

/** Một khoản nợ đã gắn tên/SĐT khách (Core không trả kèm tên khách trong `/debts`). */
export interface DebtRow {
  id: number;
  saleId: number;
  customerId: number;
  originalVnd: number;
  outstandingVnd: number;
  status: 'OPEN' | 'SETTLED' | 'VOIDED';
  createdAt: string;
  name: string;
  phone: string;
}

export interface DebtGroup<T extends DebtRow = DebtRow> {
  key: string;
  name: string;
  phone: string;
  /** Các khoản của khách: khoản còn nợ trước, cũ trước; rồi các khoản đã trả xong, mới trước */
  debts: T[];
  /** Tổng còn nợ của các khoản đang mở */
  outstandingVnd: number;
  openCount: number;
  /** Lúc ghi khoản nợ đang mở cũ nhất; null khi khách không còn nợ */
  oldestOpenAt: string | null;
}

/** Chỉ giữ chữ số của SĐT để "0908 123 456" và "0908123456" là một. */
const phoneDigits = (phone: string) => phone.replace(/\D/g, '');

/**
 * Khoá gộp của một khách. Mỗi lần ghi nợ có thể tạo một khách mới trong Core (cùng tên, cùng SĐT), nên khách có SĐT được gộp
 * theo SĐT; khách không có SĐT giữ theo mã khách vì cùng tên chưa chắc là cùng người.
 */
export function customerKey(row: Pick<DebtRow, 'customerId' | 'phone'>): string {
  const digits = phoneDigits(row.phone);
  return digits ? `phone:${digits}` : `customer:${row.customerId}`;
}

/** Gộp theo khách; khách còn nợ nhiều trước, bằng nhau thì khách nợ lâu hơn trước, rồi tới khách đã trả xong. */
export function groupDebtsByCustomer<T extends DebtRow>(rows: T[]): DebtGroup<T>[] {
  const groups = new Map<string, DebtGroup<T>>();
  for (const row of rows) {
    const key = customerKey(row);
    let group = groups.get(key);
    if (!group) {
      group = { key, name: row.name, phone: row.phone, debts: [], outstandingVnd: 0, openCount: 0, oldestOpenAt: null };
      groups.set(key, group);
    }
    group.debts.push(row);
    if (row.status === 'OPEN') {
      group.outstandingVnd += row.outstandingVnd;
      group.openCount += 1;
      if (!group.oldestOpenAt || row.createdAt < group.oldestOpenAt) group.oldestOpenAt = row.createdAt;
    }
  }
  const time = (iso: string) => new Date(iso).getTime();
  for (const group of groups.values()) {
    group.debts.sort((a, b) => {
      const aOpen = a.status === 'OPEN' ? 0 : 1;
      const bOpen = b.status === 'OPEN' ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      return aOpen === 0 ? time(a.createdAt) - time(b.createdAt) : time(b.createdAt) - time(a.createdAt);
    });
  }
  return [...groups.values()].sort((a, b) => {
    if (b.outstandingVnd !== a.outstandingVnd) return b.outstandingVnd - a.outstandingVnd;
    if (a.oldestOpenAt && b.oldestOpenAt) return time(a.oldestOpenAt) - time(b.oldestOpenAt);
    return a.name.localeCompare(b.name, 'vi');
  });
}

/** Khớp từ khoá với tên (không dấu, không phân biệt hoa thường) hoặc SĐT (chỉ so chữ số). Từ khoá rỗng khớp tất cả. */
export function matchesDebtSearch(row: Pick<DebtRow, 'name' | 'phone'>, query: string): boolean {
  const q = fold(query);
  if (!q) return true;
  if (fold(row.name).includes(q)) return true;
  const digits = phoneDigits(query);
  return digits.length >= 3 && phoneDigits(row.phone).includes(digits);
}

/** Số ngày lịch (giờ máy) từ lúc ghi nợ tới hôm nay: ghi hôm nay là 0. */
export function debtAgeDays(createdAt: string, now = new Date()): number {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.max(0, Math.round((day(now) - day(new Date(createdAt))) / 86_400_000));
}
