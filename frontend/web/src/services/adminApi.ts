/**
 * API quản trị của Core (`/api/v1/admin/*`, xem docs/contracts/api-contracts.md §7) — chỉ dùng ở chế độ thật.
 * Kiểu dữ liệu khớp đúng DTO của Core (`AdminDashboardViews`, `AdminPageResponse`): trang đếm từ 0, enum viết hoa.
 * Core chỉ trả dữ liệu hỗ trợ tối thiểu (không doanh thu, hoá đơn, công nợ) và ghi nhật ký mỗi lần đọc.
 */
import { request, toQueryString } from './api'

export type UserStatus = 'ACTIVE' | 'DISABLED'
export type ShopStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
export type AdminAccessAction =
  | 'OVERVIEW_VIEWED'
  | 'OWNERS_SEARCHED'
  | 'OWNER_VIEWED'
  | 'SHOPS_SEARCHED'
  | 'SHOP_VIEWED'
  | 'SHOP_STATUS_HISTORY_VIEWED'
  | 'ACCESS_LOGS_VIEWED'
  | 'SHOP_STATUS_UPDATED'

export const USER_STATUS_LABEL: Record<UserStatus, string> = { ACTIVE: 'Hoạt động', DISABLED: 'Bị khoá' }
export const SHOP_STATUS_LABEL: Record<ShopStatus, string> = {
  ACTIVE: 'Đang hoạt động',
  INACTIVE: 'Tạm ngưng',
  ARCHIVED: 'Đã lưu trữ',
}
export const ACCESS_ACTION_LABEL: Record<AdminAccessAction, string> = {
  OVERVIEW_VIEWED: 'Xem tổng quan',
  OWNERS_SEARCHED: 'Tìm chủ tiệm',
  OWNER_VIEWED: 'Xem chủ tiệm',
  SHOPS_SEARCHED: 'Tìm cửa hàng',
  SHOP_VIEWED: 'Xem cửa hàng',
  SHOP_STATUS_HISTORY_VIEWED: 'Xem lịch sử trạng thái',
  ACCESS_LOGS_VIEWED: 'Xem nhật ký truy cập',
  SHOP_STATUS_UPDATED: 'Đổi trạng thái cửa hàng',
}

export interface AdminPage<T> {
  items: T[]
  /** Trang hiện tại, đếm từ 0 */
  page: number
  size: number
  totalElements: number
  totalPages: number
}

export interface AdminOverview {
  asOf: string
  timezone: string
  fromDate: string
  toDate: string
  owners: { total: number; active: number; disabled: number; createdInPeriod: number }
  shops: { total: number; active: number; inactive: number; archived: number; createdInPeriod: number }
}

export interface OwnerSummary {
  id: number
  displayName: string | null
  maskedEmail: string | null
  maskedPhone: string | null
  status: UserStatus
  createdAt: string
  shopCount: number
}

export interface OwnerDetail {
  id: number
  displayName: string | null
  email: string | null
  phone: string | null
  status: UserStatus
  createdAt: string
  updatedAt: string
  shopCount: number
}

export interface ShopSummary {
  id: number
  ownerId: number
  ownerDisplayName: string | null
  name: string
  industry: string | null
  maskedPhone: string | null
  status: ShopStatus
  createdAt: string
}

export interface ShopDetail {
  id: number
  name: string
  industry: string | null
  phone: string | null
  address: string | null
  status: ShopStatus
  inactiveReason: string | null
  archivedReason: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  owner: { id: number; displayName: string | null; email: string | null; phone: string | null; status: UserStatus } | null
}

export interface ShopStatusEvent {
  id: number
  actorUserId: number | null
  beforeStatus: ShopStatus | null
  afterStatus: ShopStatus | null
  reason: string | null
  requestId: string | null
  createdAt: string
}

export interface AccessLog {
  id: number
  actorUserId: number | null
  actorRole: string | null
  action: AdminAccessAction
  targetType: string | null
  targetId: number | null
  shopId: number | null
  outcome: string | null
  requestId: string | null
  occurredAt: string
  beforeStatus: ShopStatus | null
  afterStatus: ShopStatus | null
  reason: string | null
}

interface PageQuery {
  page?: number
  size?: number
}

/** Tổng quan; `fromDate`/`toDate` (yyyy-MM-dd, giờ Việt Nam, tính cả hai đầu) phải cùng có hoặc cùng bỏ (mặc định 30 ngày) */
export function getOverview(range?: { fromDate: string; toDate: string }): Promise<AdminOverview> {
  return request(`/admin/overview${toQueryString({ fromDate: range?.fromDate, toDate: range?.toDate })}`)
}

export function listOwners(q: PageQuery & { query?: string; status?: UserStatus }): Promise<AdminPage<OwnerSummary>> {
  return request(`/admin/users${toQueryString({ ...q })}`)
}

export function getOwner(id: number): Promise<OwnerDetail> {
  return request(`/admin/users/${id}`)
}

export function listShops(q: PageQuery & { query?: string; status?: ShopStatus; ownerId?: number }): Promise<AdminPage<ShopSummary>> {
  return request(`/admin/shops${toQueryString({ ...q })}`)
}

export function getShop(id: number): Promise<ShopDetail> {
  return request(`/admin/shops/${id}`)
}

export function listShopStatusHistory(id: number, q: PageQuery = {}): Promise<AdminPage<ShopStatusEvent>> {
  return request(`/admin/shops/${id}/status-history${toQueryString({ ...q })}`)
}

/** Nhật ký truy cập của chính ADMIN đang đăng nhập; `from` tính cả, `to` không tính (ISO có múi giờ) */
export function listAccessLogs(
  q: PageQuery & { action?: AdminAccessAction; shopId?: number; from?: string; to?: string },
): Promise<AdminPage<AccessLog>> {
  return request(`/admin/access-logs${toQueryString({ ...q })}`)
}

/** Tạm ngưng (cần lý do) hoặc mở lại cửa hàng — `PATCH /api/v1/shops/{id}/status`, chỉ ADMIN */
export async function updateShopStatus(id: number, status: 'ACTIVE' | 'INACTIVE', inactiveReason?: string): Promise<void> {
  await request(`/shops/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify(status === 'INACTIVE' ? { status, inactiveReason } : { status }),
  })
}

/** Ngày yyyy-MM-dd theo giờ Việt Nam (Core tính khoảng thời gian theo Asia/Ho_Chi_Minh) */
export function vnDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/** Khoảng `days` ngày gần nhất tính cả hôm nay (giờ Việt Nam) */
export function lastDays(days: number, today = new Date()): { fromDate: string; toDate: string } {
  const from = new Date(today.getTime() - (days - 1) * 24 * 60 * 60 * 1000)
  return { fromDate: vnDateKey(from), toDate: vnDateKey(today) }
}
