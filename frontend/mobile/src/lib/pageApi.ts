import { apiRequest } from './api';

/**
 * Khung trả về của sáu GET danh sách OWNER (`/products`, `/sales`, `/sale-drafts`, `/customers`, `/debts`,
 * `/expenses`): docs/contracts/api-contracts.md#phân-trang-danh-sách-owner.
 */
export interface PageResponse<T> {
  items: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/** Kích thước trang lớn nhất Core cho phép; mặc định của Core là 20 nên luôn gửi `size` rõ ràng. */
export const MAX_PAGE_SIZE = 100;

/** Chặn vòng tải khi Core trả `totalPages` bất thường (≈ 20.000 bản ghi với trang 100). */
const MAX_PAGES = 200;

type Query = Record<string, string | number | undefined>;

/** Ghép query string, bỏ giá trị `undefined` và mã hoá phần giá trị. */
export function withQuery(path: string, query: Query): string {
  const parts = Object.entries(query)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
  return parts.length === 0 ? path : `${path}?${parts.join('&')}`;
}

/**
 * Tải một trang của danh sách OWNER. Core cũ (production trước khi có phân trang) trả mảng trần: coi đó là một trang
 * duy nhất chứa toàn bộ để app chạy được với cả hai phiên bản Core.
 */
export async function fetchPage<T>(path: string, page: number, size: number, query: Query = {}): Promise<PageResponse<T>> {
  const raw = await apiRequest<PageResponse<T> | T[]>(withQuery(path, { ...query, page, size }), { withShop: true });
  if (Array.isArray(raw)) {
    return { items: raw, page: 0, size: raw.length, totalElements: raw.length, totalPages: raw.length === 0 ? 0 : 1 };
  }
  return raw;
}

/**
 * Tải hết các trang của một danh sách rồi gộp thành mảng, để các màn hình vẫn tính tổng và lọc trên toàn tiệm.
 *
 * Các trang không chung snapshot: nếu có bản ghi mới giữa hai lần gọi thì một bản ghi có thể xuất hiện ở hai trang,
 * nên loại trùng theo `id`. Nếu có bản ghi bị lưu trữ giữa hai lần gọi thì một bản ghi có thể bị bỏ sót đến lần
 * làm mới kế tiếp.
 */
export async function fetchAllPages<T extends { id: number | string }>(
  path: string,
  query: Query = {},
  pageSize: number = MAX_PAGE_SIZE,
): Promise<T[]> {
  const items: T[] = [];
  const seen = new Set<number | string>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const result = await fetchPage<T>(path, page, pageSize, query);
    for (const item of result.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      items.push(item);
    }
    if (result.items.length === 0 || page + 1 >= result.totalPages) break;
  }
  return items;
}
