/**
 * Khách hàng (OWNER + cơ sở) và tổng quan cho trang quản trị.
 *
 * - USE_MOCK = true: đọc mock store (src/services/mockStore.ts). Tình huống
 *   chậm/rỗng/lỗi: src/mocks/scenario.ts.
 * - USE_MOCK = false: gọi Core API. Endpoint theo API contract trong plan
 *   (/admin/overview, /admin/users, /admin/shops, /admin/shops/{id}) — field
 *   là GIẢ ĐỊNH, đánh dấu TODO(backend) để khoá lại khi có contract thật.
 *
 * Chỉ ĐỌC: không có hàm sửa hoá đơn, chi phí, công nợ, tồn kho; không giả danh OWNER.
 */
import { BASIC_MONTHLY_QUOTA, USE_MOCK } from '../config'
import type { MockBusiness, MockOwner } from '../mocks/accounts'
import { simulate } from '../mocks/scenario'
import type {
  AdminOverviewView,
  AdminShopDetailView,
  AdminUserItem,
  AdminUserQuery,
  AttentionItem,
  AuditEntry,
  CustomerListItem,
  CustomerQuery,
  OwnerSummary,
  Paged,
} from '../types'
import { normalizeVi, toDateKey } from '../utils/format'
import { request, toQueryString } from './api'
import { audit, clone, db, log, mockNow, resetStore, tasks } from './mockStore'

export class NotFoundError extends Error {
  status = 404
}

const ownerOf = (b: MockBusiness) => db().owners.find((o) => o.id === b.ownerId)!

function ownerSummary(o: MockOwner): OwnerSummary {
  return { id: o.id, fullName: o.fullName, email: o.email, phone: o.phone, status: o.status }
}

function toShopItem(b: MockBusiness): CustomerListItem {
  const o = ownerOf(b)
  return {
    businessId: b.id,
    businessName: b.name,
    industry: b.industry,
    area: b.area,
    plan: o.plan,
    owner: ownerSummary(o),
    ownerBusinessCount: db().businesses.filter((x) => x.ownerId === o.id).length,
    createdAt: b.createdAt,
    lastActiveAt: b.lastActiveAt,
  }
}

function toUserItem(o: MockOwner): AdminUserItem {
  const shops = db().businesses.filter((b) => b.ownerId === o.id)
  return {
    ...ownerSummary(o),
    plan: o.plan,
    loginMethod: o.loginMethod,
    shopCount: shops.length,
    shops: shops.map((s) => ({ id: s.id, name: s.name })),
    createdAt: o.createdAt,
    lastLoginAt: o.lastLoginAt,
  }
}

function matches(term: string, digits: string, text: string, phone: string) {
  if (!term) return true
  return normalizeVi(text).includes(term) || (digits.length >= 3 && phone.includes(digits))
}

function paginate<T>(rows: T[], page = 1, pageSize = 10): Paged<T> {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safe = Math.min(Math.max(1, page), totalPages)
  return { items: clone(rows.slice((safe - 1) * pageSize, safe * pageSize)), total: rows.length, page: safe, pageSize, totalPages }
}

function queryShops(q: CustomerQuery): CustomerListItem[] {
  const term = normalizeVi(q.q ?? '')
  const digits = (q.q ?? '').replace(/\D/g, '')
  const rows = db()
    .businesses.map(toShopItem)
    .filter(
      (r) =>
        (!q.status || q.status === 'all' || r.owner.status === q.status) &&
        (!q.plan || q.plan === 'all' || r.plan === q.plan) &&
        matches(term, digits, `${r.businessName} ${r.owner.fullName} ${r.owner.email ?? ''}`, r.owner.phone),
    )
  const by = q.sortBy ?? 'createdAt'
  const dir = q.sortDir === 'asc' ? 1 : -1
  return rows.sort((a, b) => (by === 'businessName' ? a.businessName.localeCompare(b.businessName, 'vi') : a[by].localeCompare(b[by])) * dir)
}

/* ------------------------------------------------------------------ */

/** GET /admin/shops?q=&status=&plan=&sortBy=&sortDir=&page=&pageSize= */
export async function listShops(q: CustomerQuery = {}): Promise<Paged<CustomerListItem>> {
  if (!USE_MOCK) return request(`/admin/shops${toQueryString({ ...q })}`) // TODO(backend)
  const { empty } = await simulate()
  return paginate(empty ? [] : queryShops(q), q.page, q.pageSize)
}

/** GET /admin/users?q=&status=&page=&pageSize= */
export async function listUsers(q: AdminUserQuery = {}): Promise<Paged<AdminUserItem>> {
  if (!USE_MOCK) return request(`/admin/users${toQueryString({ ...q })}`) // TODO(backend)
  const { empty } = await simulate()
  const term = normalizeVi(q.q ?? '')
  const digits = (q.q ?? '').replace(/\D/g, '')
  const rows = empty
    ? []
    : db()
        .owners.map(toUserItem)
        .filter(
          (u) =>
            (!q.status || q.status === 'all' || u.status === q.status) &&
            matches(term, digits, `${u.fullName} ${u.email ?? ''} ${u.shops.map((s) => s.name).join(' ')}`, u.phone),
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  return paginate(rows, q.page, q.pageSize)
}

/** Tìm nhanh ở thanh trên cùng — ưu tiên OWNER và cơ sở */
export async function quickSearch(q: string): Promise<{ users: AdminUserItem[]; shops: CustomerListItem[] }> {
  const [users, shops] = await Promise.all([listUsers({ q, pageSize: 4 }), listShops({ q, pageSize: 4 })])
  return { users: users.items, shops: shops.items }
}

/**
 * GET /admin/shops/{id} — thông tin hỗ trợ tối thiểu.
 * Mỗi lần mở chi tiết đều ghi audit (AC-017).
 */
export async function getShopDetail(id: string): Promise<AdminShopDetailView> {
  if (!USE_MOCK) return request(`/admin/shops/${encodeURIComponent(id)}`) // TODO(backend): Core ghi audit
  const { empty } = await simulate(300)
  const b = db().businesses.find((x) => x.id === id)
  if (!b || empty) throw new NotFoundError('Không tìm thấy cơ sở này. Có thể cơ sở đã bị xoá hoặc đường dẫn không đúng.')
  const o = ownerOf(b)
  log('Xem chi tiết cơ sở', b.name, `Mã ${b.id} · OWNER ${o.fullName}`)
  const now = mockNow()
  return clone({
    business: { id: b.id, name: b.name, industry: b.industry, address: b.address, createdAt: b.createdAt, lastActiveAt: b.lastActiveAt },
    owner: {
      ...ownerSummary(o),
      loginMethod: o.loginMethod,
      phoneVerified: o.phoneVerified,
      emailVerified: o.emailVerified,
      createdAt: o.createdAt,
      lastLoginAt: o.lastLoginAt,
      lockReason: o.lockReason,
    },
    otherBusinesses: db()
      .businesses.filter((x) => x.ownerId === o.id && x.id !== b.id)
      .map((x) => ({ id: x.id, name: x.name, industry: x.industry })),
    subscription: {
      plan: o.plan,
      quotaUsed: b.ordersThisMonth,
      quotaLimit: o.plan === 'basic' ? BASIC_MONTHLY_QUOTA : null,
      periodStart: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      periodEnd: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString(),
    },
    usage: { voiceOrderRatio: b.voiceOrderRatio, staffCount: b.staffCount, lastSyncAt: b.lastSyncAt, syncErrors7d: b.syncErrors7d },
    devices: o.devices,
    events: b.events.slice(0, 8),
  })
}

/** GET /admin/users/{id} — chi tiết OWNER (ghi audit) */
export async function getUserDetail(
  id: string,
): Promise<AdminUserItem & { devices: MockOwner['devices']; lockReason?: string; phoneVerified: boolean; emailVerified: boolean }> {
  if (!USE_MOCK) return request(`/admin/users/${encodeURIComponent(id)}`) // TODO(backend)
  const { empty } = await simulate(300)
  const o = db().owners.find((x) => x.id === id)
  if (!o || empty) throw new NotFoundError('Không tìm thấy chủ cơ sở này.')
  log('Xem chi tiết OWNER', o.fullName, `Mã ${o.id}`)
  return clone({ ...toUserItem(o), devices: o.devices, lockReason: o.lockReason, phoneVerified: o.phoneVerified, emailVerified: o.emailVerified })
}

/** GET /admin/overview?days= */
export async function getOverview(days = 14): Promise<AdminOverviewView> {
  if (!USE_MOCK) return request(`/admin/overview?days=${days}`) // TODO(backend)
  const { empty } = await simulate()
  const now = mockNow()
  const DAY = 86_400_000
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * DAY
  const prevStart = start - days * DAY
  const { owners, businesses } = empty ? { owners: [], businesses: [] } : db()
  const allTasks = empty ? [] : tasks()
  const inRange = (iso: string, from: number, to = Infinity) => {
    const t = new Date(iso).getTime()
    return t >= from && t < to
  }
  const openTasks = allTasks.filter((t) => t.status !== 'resolved')
  const overdue = openTasks.filter((t) => t.dueAt && new Date(t.dueAt) < now)

  const trend = Array.from({ length: days }, (_, i) => {
    const key = toDateKey(new Date(start + i * DAY))
    const same = (iso: string) => toDateKey(new Date(iso)) === key
    return {
      date: key,
      newShops: businesses.filter((b) => same(b.createdAt)).length,
      tasksOpened: allTasks.filter((t) => same(t.createdAt)).length,
      tasksResolved: allTasks.filter((t) => t.status === 'resolved' && same(t.updatedAt)).length,
    }
  })

  const attention: AttentionItem[] = []
  overdue.forEach((t) =>
    attention.push({
      id: `a_${t.id}`,
      kind: 'overdue_task',
      title: `${t.code} quá hạn`,
      detail: t.title,
      taskId: t.id,
      shopId: t.shopId,
      at: t.dueAt!,
    }),
  )
  businesses
    .filter((b) => b.syncErrors7d > 0)
    .forEach((b) =>
      attention.push({
        id: `a_sync_${b.id}`,
        kind: 'sync_error',
        title: b.name,
        detail: `${b.syncErrors7d} lần đồng bộ thất bại trong 7 ngày`,
        shopId: b.id,
        at: b.lastActiveAt,
      }),
    )
  businesses
    .filter((b) => owners.find((o) => o.id === b.ownerId)?.status === 'pending')
    .forEach((b) =>
      attention.push({
        id: `a_pend_${b.id}`,
        kind: 'pending_verify',
        title: b.name,
        detail: 'Chủ cơ sở chưa xác minh số điện thoại',
        shopId: b.id,
        at: b.createdAt,
      }),
    )
  businesses
    .filter((b) => owners.find((o) => o.id === b.ownerId)?.plan === 'basic' && b.ordersThisMonth >= BASIC_MONTHLY_QUOTA * 0.8)
    .forEach((b) =>
      attention.push({
        id: `a_quota_${b.id}`,
        kind: 'near_quota',
        title: b.name,
        detail: `Đã dùng ${b.ordersThisMonth}/${BASIC_MONTHLY_QUOTA} lượt tạo đơn`,
        shopId: b.id,
        at: b.lastActiveAt,
      }),
    )
  const rank = { overdue_task: 0, sync_error: 1, locked: 2, pending_verify: 3, near_quota: 4 }
  attention.sort((a, b) => rank[a.kind] - rank[b.kind] || b.at.localeCompare(a.at))

  return {
    periodDays: days,
    activeShops: businesses.filter((b) => owners.find((o) => o.id === b.ownerId)?.status === 'active').length,
    totalShops: businesses.length,
    newOwners: owners.filter((o) => inRange(o.createdAt, start)).length,
    newOwnersPrev: owners.filter((o) => inRange(o.createdAt, prevStart, start)).length,
    openTasks: openTasks.length,
    overdueTasks: overdue.length,
    shopsWithSyncErrors: businesses.filter((b) => b.syncErrors7d > 0).length,
    trend,
    needsAttention: attention.slice(0, 8),
    recentShops: empty ? [] : clone(queryShops({ sortBy: 'createdAt', sortDir: 'desc' }).slice(0, 6)),
    recentAdminAccess: empty
      ? []
      : clone(
          audit()
            .filter((a) => a.action.startsWith('Xem'))
            .slice(0, 6),
        ),
  }
}

/** GET /admin/audit-logs */
export async function listAuditLog(): Promise<AuditEntry[]> {
  if (!USE_MOCK) return request('/admin/audit-logs') // TODO(backend)
  const { empty } = await simulate(200)
  return empty ? [] : clone(audit())
}

/** Xoá mọi thay đổi và sinh lại bộ dữ liệu mẫu ban đầu. */
export async function resetMockData(): Promise<void> {
  await new Promise((r) => setTimeout(r, 200))
  resetStore()
  db()
  tasks()
  log('Khôi phục dữ liệu mẫu')
}

/** "Bây giờ" dùng để hiển thị thời gian tương đối. */
export function now(): Date {
  return USE_MOCK ? mockNow() : new Date()
}
