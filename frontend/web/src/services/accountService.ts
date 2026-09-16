/**
 * Dịch vụ quản lý tài khoản cửa hàng.
 *
 * - USE_MOCK = true: đọc/ghi dữ liệu mẫu trong localStorage (key `snl_mock_accounts`),
 *   nếu storage bị chặn thì giữ trong bộ nhớ.
 * - USE_MOCK = false: gọi API thật qua `request()` — các chỗ cần nối backend được
 *   đánh dấu TODO(backend).
 */
import { BASIC_MONTHLY_QUOTA, MOCK_DELAY_MS, MOCK_TODAY, USE_MOCK } from '../config'
import { generateMockAccounts, mockNow } from '../mocks/accounts'
import {
  INDUSTRIES,
  PLAN_LABEL,
  STATUS_LABEL,
  type Account,
  type AccountInput,
  type AccountQuery,
  type AccountStatus,
  type AdminStats,
  type AuditEntry,
  type LoginMethod,
  type Paged,
  type PlanId,
} from '../types'
import { EMAIL_RE, PHONE_RE, normalizeVi, toDateKey } from '../utils/format'
import { readJSON, removeKey, writeJSON } from '../utils/storage'
import { getSession } from './authService'
import { request, toQueryString } from './api'

const ACCOUNTS_KEY = 'snl_mock_accounts'
const AUDIT_KEY = 'snl_mock_audit'
const DATA_VERSION = 1

interface Stored<T> {
  version: number
  data: T
}

let memAccounts: Account[] | null = null
let memAudit: AuditEntry[] | null = null

const wait = (ms = MOCK_DELAY_MS) => new Promise((r) => setTimeout(r, ms))
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/* ------------------------------------------------------------------ */
/* Lưu trữ mock                                                        */
/* ------------------------------------------------------------------ */

function seedAudit(): AuditEntry[] {
  return [
    {
      id: 'log_seed',
      at: new Date(`${MOCK_TODAY}T08:00:00`).toISOString(),
      actor: 'Hệ thống',
      action: 'Khởi tạo dữ liệu mẫu',
      detail: 'Tạo 48 tài khoản cửa hàng mẫu cho môi trường demo',
    },
  ]
}

function loadAccounts(): Account[] {
  if (memAccounts) return memAccounts
  const stored = readJSON<Stored<Account[]>>(ACCOUNTS_KEY)
  if (stored && stored.version === DATA_VERSION && Array.isArray(stored.data)) {
    memAccounts = stored.data
  } else {
    memAccounts = generateMockAccounts()
    saveAccounts()
  }
  return memAccounts
}

function saveAccounts() {
  if (memAccounts) writeJSON(ACCOUNTS_KEY, { version: DATA_VERSION, data: memAccounts })
}

function loadAudit(): AuditEntry[] {
  if (memAudit) return memAudit
  const stored = readJSON<Stored<AuditEntry[]>>(AUDIT_KEY)
  memAudit = stored && stored.version === DATA_VERSION ? stored.data : seedAudit()
  return memAudit
}

function log(action: string, target?: string, detail?: string) {
  const list = loadAudit()
  list.unshift({
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: mockNow().toISOString(),
    actor: getSession()?.user.email ?? 'admin',
    action,
    target,
    detail,
  })
  memAudit = list.slice(0, 300)
  writeJSON(AUDIT_KEY, { version: DATA_VERSION, data: memAudit })
}

function findOrThrow(id: string): Account {
  const acc = loadAccounts().find((a) => a.id === id)
  if (!acc) throw new Error('Không tìm thấy tài khoản.')
  return acc
}

function pushActivity(acc: Account, type: Account['activity'][number]['type'], label: string) {
  acc.activity.unshift({ id: `${acc.id}-act-${Date.now().toString(36)}`, type, label, at: mockNow().toISOString() })
}

/* ------------------------------------------------------------------ */
/* Lọc / sắp xếp (dùng chung cho list + export)                        */
/* ------------------------------------------------------------------ */

function applyQuery(all: Account[], q: AccountQuery): Account[] {
  const term = normalizeVi(q.search ?? '')
  const digits = (q.search ?? '').replace(/\D/g, '')
  let rows = all.filter((a) => {
    if (q.status && q.status !== 'all' && a.status !== q.status) return false
    if (q.plan && q.plan !== 'all' && a.plan !== q.plan) return false
    if (q.industry && q.industry !== 'all' && a.industry !== q.industry) return false
    if (term) {
      const hay = normalizeVi(`${a.storeName} ${a.ownerName} ${a.email ?? ''}`)
      const phoneHit = digits.length >= 3 && a.phone.includes(digits)
      if (!hay.includes(term) && !phoneHit) return false
    }
    return true
  })
  const by = q.sortBy ?? 'createdAt'
  const dir = q.sortDir === 'asc' ? 1 : -1
  rows = [...rows].sort((a, b) => {
    let cmp: number
    if (by === 'storeName') cmp = a.storeName.localeCompare(b.storeName, 'vi')
    else if (by === 'ordersThisMonth') cmp = a.ordersThisMonth - b.ordersThisMonth
    else cmp = new Date(a[by]).getTime() - new Date(b[by]).getTime()
    return cmp * dir
  })
  return rows
}

function validateInput(input: AccountInput, ignoreId?: string) {
  const errors: Partial<Record<keyof AccountInput, string>> = {}
  if (!input.storeName.trim()) errors.storeName = 'Vui lòng nhập tên cửa hàng.'
  if (!input.ownerName.trim()) errors.ownerName = 'Vui lòng nhập tên chủ cửa hàng.'
  if (!PHONE_RE.test(input.phone)) errors.phone = 'Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.'
  else if (loadAccounts().some((a) => a.phone === input.phone && a.id !== ignoreId))
    errors.phone = 'Số điện thoại này đã được đăng ký.'
  if (input.email && !EMAIL_RE.test(input.email)) errors.email = 'Email không hợp lệ.'
  if (!INDUSTRIES.includes(input.industry)) errors.industry = 'Vui lòng chọn ngành hàng.'
  return errors
}

export class ValidationError extends Error {
  fields: Partial<Record<keyof AccountInput, string>>
  constructor(fields: Partial<Record<keyof AccountInput, string>>) {
    super('Dữ liệu chưa hợp lệ.')
    this.fields = fields
  }
}

/* ------------------------------------------------------------------ */
/* API công khai                                                       */
/* ------------------------------------------------------------------ */

export async function listAccounts(q: AccountQuery = {}): Promise<Paged<Account>> {
  const page = Math.max(1, q.page ?? 1)
  const pageSize = q.pageSize ?? 10
  if (!USE_MOCK) {
    // TODO(backend): GET /admin/accounts?search=&status=&plan=&industry=&sortBy=&sortDir=&page=&pageSize=
    return request<Paged<Account>>(`/admin/accounts${toQueryString({ ...q, page, pageSize })}`)
  }
  await wait()
  const rows = applyQuery(loadAccounts(), q)
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize))
  const safePage = Math.min(page, totalPages)
  return {
    items: clone(rows.slice((safePage - 1) * pageSize, safePage * pageSize)),
    total: rows.length,
    page: safePage,
    pageSize,
    totalPages,
  }
}

/** Toàn bộ kết quả theo bộ lọc (không phân trang) — dùng cho Xuất CSV. */
export async function exportAccounts(q: AccountQuery = {}): Promise<Account[]> {
  if (!USE_MOCK) {
    // TODO(backend): GET /admin/accounts/export?... (hoặc trả file CSV trực tiếp)
    return request<Account[]>(`/admin/accounts/export${toQueryString({ ...q, page: undefined, pageSize: undefined })}`)
  }
  await wait(150)
  return clone(applyQuery(loadAccounts(), q))
}

export async function getAccount(id: string): Promise<Account> {
  if (!USE_MOCK) {
    // TODO(backend): GET /admin/accounts/:id
    return request<Account>(`/admin/accounts/${id}`)
  }
  await wait(200)
  return clone(findOrThrow(id))
}

export async function createAccount(input: AccountInput): Promise<Account> {
  if (!USE_MOCK) {
    // TODO(backend): POST /admin/accounts
    return request<Account>('/admin/accounts', { method: 'POST', body: JSON.stringify(input) })
  }
  await wait()
  const errors = validateInput(input)
  if (Object.keys(errors).length) throw new ValidationError(errors)
  const list = loadAccounts()
  const now = mockNow().toISOString()
  const nextNum = list.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, '')) || 0), 0) + 1
  const acc: Account = {
    id: `acc_${String(nextNum).padStart(3, '0')}`,
    storeName: input.storeName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone,
    email: input.email?.trim() || undefined,
    industry: input.industry,
    address: input.address?.trim() || 'Chưa cập nhật',
    plan: input.plan,
    status: 'pending',
    loginMethod: 'phone' as LoginMethod,
    createdAt: now,
    lastActiveAt: now,
    ordersThisMonth: 0,
    orderQuota: input.plan === 'basic' ? BASIC_MONTHLY_QUOTA : null,
    voiceOrderRatio: 0,
    revenue7d: [0, 0, 0, 0, 0, 0, 0],
    staffCount: 0,
    productCount: 0,
    activity: [{ id: `new-${Date.now()}`, type: 'signup', label: 'Tài khoản được tạo bởi quản trị viên', at: now }],
  }
  list.unshift(acc)
  saveAccounts()
  log('Thêm tài khoản', acc.storeName, `SĐT ${acc.phone} · Gói ${PLAN_LABEL[acc.plan]}`)
  return clone(acc)
}

export async function updateAccount(id: string, input: AccountInput): Promise<Account> {
  if (!USE_MOCK) {
    // TODO(backend): PATCH /admin/accounts/:id
    return request<Account>(`/admin/accounts/${id}`, { method: 'PATCH', body: JSON.stringify(input) })
  }
  await wait()
  const acc = findOrThrow(id)
  const errors = validateInput(input, id)
  if (Object.keys(errors).length) throw new ValidationError(errors)
  Object.assign(acc, {
    storeName: input.storeName.trim(),
    ownerName: input.ownerName.trim(),
    phone: input.phone,
    email: input.email?.trim() || undefined,
    industry: input.industry,
    address: input.address?.trim() || acc.address,
  })
  if (input.plan !== acc.plan) {
    acc.plan = input.plan
    acc.orderQuota = input.plan === 'basic' ? BASIC_MONTHLY_QUOTA : null
  }
  saveAccounts()
  log('Sửa thông tin tài khoản', acc.storeName)
  return clone(acc)
}

export async function setAccountStatus(ids: string[], status: AccountStatus, reason?: string): Promise<Account[]> {
  if (!USE_MOCK) {
    // TODO(backend): POST /admin/accounts/status { ids, status, reason }
    return request<Account[]>('/admin/accounts/status', {
      method: 'POST',
      body: JSON.stringify({ ids, status, reason }),
    })
  }
  await wait()
  const changed: Account[] = []
  for (const id of ids) {
    const acc = findOrThrow(id)
    if (acc.status === status) continue
    acc.status = status
    acc.lockReason = status === 'locked' ? reason?.trim() || 'Không ghi lý do' : undefined
    pushActivity(
      acc,
      'status',
      status === 'locked' ? `Tài khoản bị khoá: ${acc.lockReason}` : `Trạng thái chuyển sang “${STATUS_LABEL[status]}”`,
    )
    changed.push(acc)
  }
  saveAccounts()
  if (changed.length) {
    const action = status === 'locked' ? 'Khoá tài khoản' : status === 'active' ? 'Mở khoá tài khoản' : 'Đổi trạng thái'
    log(
      changed.length > 1 ? `${action} (${changed.length})` : action,
      changed.map((a) => a.storeName).join(', '),
      reason ? `Lý do: ${reason}` : undefined,
    )
  }
  return clone(changed)
}

export async function changePlan(id: string, plan: PlanId): Promise<Account> {
  if (!USE_MOCK) {
    // TODO(backend): POST /admin/accounts/:id/plan { plan }
    return request<Account>(`/admin/accounts/${id}/plan`, { method: 'POST', body: JSON.stringify({ plan }) })
  }
  await wait()
  const acc = findOrThrow(id)
  const from = acc.plan
  acc.plan = plan
  acc.orderQuota = plan === 'basic' ? BASIC_MONTHLY_QUOTA : null
  pushActivity(acc, 'plan', `Đổi gói: ${PLAN_LABEL[from]} → ${PLAN_LABEL[plan]}`)
  saveAccounts()
  log('Đổi gói dịch vụ', acc.storeName, `${PLAN_LABEL[from]} → ${PLAN_LABEL[plan]}`)
  return clone(acc)
}

export async function deleteAccount(id: string): Promise<void> {
  if (!USE_MOCK) {
    // TODO(backend): DELETE /admin/accounts/:id
    return request<void>(`/admin/accounts/${id}`, { method: 'DELETE' })
  }
  await wait()
  const list = loadAccounts()
  const idx = list.findIndex((a) => a.id === id)
  if (idx < 0) throw new Error('Không tìm thấy tài khoản.')
  const [removed] = list.splice(idx, 1)
  saveAccounts()
  log('Xoá tài khoản', removed.storeName, `SĐT ${removed.phone}`)
}

export async function sendPasswordReset(id: string, channel: 'password' | 'otp'): Promise<void> {
  if (!USE_MOCK) {
    // TODO(backend): POST /admin/accounts/:id/reset-password | /resend-otp
    return request<void>(`/admin/accounts/${id}/${channel === 'otp' ? 'resend-otp' : 'reset-password'}`, {
      method: 'POST',
    })
  }
  await wait(250)
  const acc = findOrThrow(id)
  log(channel === 'otp' ? 'Gửi lại mã OTP' : 'Đặt lại mật khẩu', acc.storeName, `Gửi tới ${acc.phone}`)
}

export async function getStats(): Promise<AdminStats> {
  if (!USE_MOCK) {
    // TODO(backend): GET /admin/stats
    return request<AdminStats>('/admin/stats')
  }
  await wait()
  const all = loadAccounts()
  const now = mockNow()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const DAY = 86_400_000

  const signupsPerDay = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(todayStart.getTime() - (13 - i) * DAY)
    const key = toDateKey(d)
    return { date: key, count: all.filter((a) => toDateKey(new Date(a.createdAt)) === key).length }
  })
  const weekAgo = todayStart.getTime() - 6 * DAY
  const totalOrders = all.reduce((s, a) => s + a.ordersThisMonth, 0)
  const voiceOrders = all.reduce((s, a) => s + a.ordersThisMonth * a.voiceOrderRatio, 0)

  const industryBreakdown = INDUSTRIES.map((industry) => ({
    industry,
    count: all.filter((a) => a.industry === industry).length,
  }))
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count)

  const loginMethods: Record<LoginMethod, number> = { phone: 0, google: 0, facebook: 0, apple: 0 }
  all.forEach((a) => loginMethods[a.loginMethod]++)

  return {
    totalAccounts: all.length,
    activeAccounts: all.filter((a) => a.status === 'active').length,
    lockedAccounts: all.filter((a) => a.status === 'locked').length,
    pendingAccounts: all.filter((a) => a.status === 'pending').length,
    newAccounts7d: all.filter((a) => new Date(a.createdAt).getTime() >= weekAgo).length,
    ordersThisMonth: totalOrders,
    voiceOrderRatio: totalOrders ? voiceOrders / totalOrders : 0,
    signupsPerDay,
    planDistribution: {
      basic: all.filter((a) => a.plan === 'basic').length,
      pro: all.filter((a) => a.plan === 'pro').length,
    },
    industryBreakdown,
    loginMethods,
    basicNearQuota: all.filter((a) => a.plan === 'basic' && a.ordersThisMonth >= BASIC_MONTHLY_QUOTA * 0.8).length,
    newestAccounts: clone(
      [...all].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5),
    ),
  }
}

export async function listAuditLog(): Promise<AuditEntry[]> {
  if (!USE_MOCK) {
    // TODO(backend): GET /admin/audit-logs
    return request<AuditEntry[]>('/admin/audit-logs')
  }
  await wait(200)
  return clone(loadAudit())
}

/** Xoá mọi thay đổi và sinh lại bộ dữ liệu mẫu ban đầu. */
export async function resetMockData(): Promise<void> {
  await wait(200)
  removeKey(ACCOUNTS_KEY)
  removeKey(AUDIT_KEY)
  memAccounts = null
  memAudit = null
  loadAccounts()
  loadAudit()
  log('Khôi phục dữ liệu mẫu')
}

/** "Bây giờ" dùng để hiển thị thời gian tương đối. */
export function now(): Date {
  return USE_MOCK ? mockNow() : new Date()
}
