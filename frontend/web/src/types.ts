/**
 * Kiểu dữ liệu dùng chung cho web quản trị.
 *
 * Backend (CORE-005) chưa có — các kiểu "DTO" bên dưới là hợp đồng API giả định
 * để frontend chạy bằng mock. Khi backend chốt hợp đồng, chỉ cần sửa file này
 * và các hàm trong src/services/*, giao diện giữ nguyên.
 */

export const INDUSTRIES = [
  'Đồ ăn',
  'Đồ uống',
  'Tạp hóa',
  'Nông sản & Thực phẩm',
  'Thời trang',
  'Cắt tóc & làm móng',
  'Mỹ phẩm',
  'Mẹ & Bé',
  'Hoa - Quà tặng',
  'Khác',
] as const

export type Industry = (typeof INDUSTRIES)[number]

/* ------------------------------------------------------------------ */
/* Auth & phân quyền                                                   */
/* ------------------------------------------------------------------ */

/** ADMIN: đội vận hành. OWNER: chủ cơ sở dùng app mobile — không được vào /admin. */
export type Role = 'ADMIN' | 'OWNER'

export interface SessionUser {
  id: string
  fullName: string
  email: string
  role: Role
}

export interface AuthSession {
  accessToken: string
  user: SessionUser
  /** ISO datetime */
  issuedAt: string
}

/* ------------------------------------------------------------------ */
/* Khách hàng (OWNER + cơ sở)                                          */
/* ------------------------------------------------------------------ */

export type PlanId = 'basic' | 'pro'
/** Trạng thái tài khoản OWNER */
export type AccountStatus = 'active' | 'locked' | 'pending'
export type LoginMethod = 'phone' | 'google' | 'facebook' | 'apple'
export type Platform = 'android' | 'ios' | 'web'

export const PLAN_LABEL: Record<PlanId, string> = {
  basic: 'Cơ bản',
  pro: 'Pro',
}

export const STATUS_LABEL: Record<AccountStatus, string> = {
  active: 'Hoạt động',
  locked: 'Bị khoá',
  pending: 'Chờ xác minh',
}

export const LOGIN_METHOD_LABEL: Record<LoginMethod, string> = {
  phone: 'Số điện thoại (OTP)',
  google: 'Google',
  facebook: 'Facebook',
  apple: 'Apple',
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  android: 'Android',
  ios: 'iOS',
  web: 'Trình duyệt',
}

export interface OwnerSummary {
  id: string
  fullName: string
  email?: string
  /** 0xxxxxxxxx */
  phone: string
  status: AccountStatus
}

/** Một dòng trong danh sách khách hàng — mỗi dòng là một cơ sở kèm chủ cơ sở. */
export interface CustomerListItem {
  businessId: string
  businessName: string
  industry: Industry
  /** Tỉnh/thành hoặc khu vực — không trả địa chỉ đầy đủ ở danh sách */
  area: string
  plan: PlanId
  owner: OwnerSummary
  /** Tổng số cơ sở của OWNER này */
  ownerBusinessCount: number
  createdAt: string
  lastActiveAt: string
}

export type CustomerSortKey = 'createdAt' | 'lastActiveAt' | 'businessName'
export type SortDir = 'asc' | 'desc'

/** GET /admin/customers */
export interface CustomerQuery {
  /** Tìm theo tên chủ, email, số điện thoại hoặc tên cơ sở */
  q?: string
  status?: AccountStatus | 'all'
  plan?: PlanId | 'all'
  sortBy?: CustomerSortKey
  sortDir?: SortDir
  page?: number
  pageSize?: number
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export type SupportEventType = 'signup' | 'login' | 'login_failed' | 'otp' | 'sync' | 'sync_error' | 'app_update' | 'plan' | 'status'

/** Sự kiện phục vụ hỗ trợ — KHÔNG chứa nội dung hoá đơn, chi phí, công nợ, tồn kho. */
export interface SupportEvent {
  id: string
  type: SupportEventType
  label: string
  at: string
}

export interface DeviceInfo {
  id: string
  platform: Platform
  model: string
  appVersion: string
  lastSeenAt: string
}

/**
 * GET /admin/customers/:businessId — thông tin tối thiểu phục vụ hỗ trợ.
 * Cố ý không có: token/secret/mật khẩu, doanh thu, danh sách hoá đơn,
 * chi phí, công nợ, hàng hoá/tồn kho.
 */
export interface CustomerSupportDetail {
  business: {
    id: string
    name: string
    industry: Industry
    address: string
    createdAt: string
    lastActiveAt: string
  }
  owner: OwnerSummary & {
    loginMethod: LoginMethod
    phoneVerified: boolean
    emailVerified: boolean
    createdAt: string
    lastLoginAt: string
    lockReason?: string
  }
  /** Các cơ sở khác cùng OWNER */
  otherBusinesses: { id: string; name: string; industry: Industry }[]
  subscription: {
    plan: PlanId
    /** Lượt tạo đơn đã dùng trong kỳ */
    quotaUsed: number
    /** null = không giới hạn */
    quotaLimit: number | null
    periodStart: string
    periodEnd: string
  }
  /** Chỉ số đếm để chẩn đoán, không có số tiền */
  usage: {
    voiceOrderRatio: number
    staffCount: number
    lastSyncAt: string | null
    syncErrors7d: number
  }
  devices: DeviceInfo[]
  events: SupportEvent[]
}

/** Tên theo API contract: GET /admin/shops/{id} */
export type AdminShopDetailView = CustomerSupportDetail
/** GET /admin/shops — một dòng cơ sở */
export type AdminShopItem = CustomerListItem

/** GET /admin/users — một dòng OWNER */
export interface AdminUserItem extends OwnerSummary {
  plan: PlanId
  loginMethod: LoginMethod
  shopCount: number
  shops: { id: string; name: string }[]
  createdAt: string
  lastLoginAt: string
}

export interface AdminUserQuery {
  q?: string
  status?: AccountStatus | 'all'
  page?: number
  pageSize?: number
}

/* ------------------------------------------------------------------ */
/* Tổng quan                                                           */
/* ------------------------------------------------------------------ */

export interface DailyCount {
  /** yyyy-mm-dd */
  date: string
  count: number
}

export type AttentionKind = 'sync_error' | 'pending_verify' | 'near_quota' | 'locked' | 'overdue_task'

/** Mục "Cần chú ý" — tổng hợp chỉ đọc, không tự tạo task */
export interface AttentionItem {
  id: string
  kind: AttentionKind
  title: string
  detail: string
  shopId?: string
  taskId?: string
  at: string
}

/** GET /admin/overview?days= — field là GIẢ ĐỊNH, cần khoá với API */
export interface AdminOverviewView {
  periodDays: number
  activeShops: number
  totalShops: number
  newOwners: number
  newOwnersPrev: number
  openTasks: number
  overdueTasks: number
  shopsWithSyncErrors: number
  /** Theo ngày trong kỳ */
  trend: { date: string; newShops: number; tasksOpened: number; tasksResolved: number }[]
  needsAttention: AttentionItem[]
  recentShops: CustomerListItem[]
  recentAdminAccess: AuditEntry[]
}

/* ------------------------------------------------------------------ */
/* Support task & Kanban                                               */
/* ------------------------------------------------------------------ */

export type TaskStatus = 'inbox' | 'investigating' | 'waiting' | 'resolved'
export type TaskSeverity = 'high' | 'medium' | 'low'
export type TaskSource = 'ai' | 'manual' | 'system'

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  inbox: 'Inbox',
  investigating: 'Đang điều tra',
  waiting: 'Chờ phản hồi',
  resolved: 'Đã xử lý',
}
export const SEVERITY_LABEL: Record<TaskSeverity, string> = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' }
export const SOURCE_LABEL: Record<TaskSource, string> = { ai: 'AI đề xuất', manual: 'Thủ công', system: 'Hệ thống' }

export interface AdminMember {
  id: string
  name: string
}

export interface SupportTask {
  id: string
  code: string
  title: string
  description: string
  status: TaskStatus
  severity: TaskSeverity
  source: TaskSource
  shopId?: string
  shopName?: string
  ownerName?: string
  assigneeId?: string
  dueAt?: string
  createdAt: string
  updatedAt: string
  /** Tăng mỗi lần sửa — dùng phát hiện xung đột */
  version: number
  history: AuditEntry[]
}

export interface TaskDraft {
  /** Dùng làm idempotency key khi xác nhận tạo */
  draftId: string
  title: string
  description: string
  severity: TaskSeverity
  shopId?: string
  shopName?: string
  reason: string
}

export interface CreateTaskInput {
  title: string
  description: string
  severity: TaskSeverity
  source: TaskSource
  shopId?: string
  assigneeId?: string
  dueAt?: string
}

/* ------------------------------------------------------------------ */
/* AI Support                                                          */
/* ------------------------------------------------------------------ */

export interface AiEvidence {
  label: string
  value: string
  shopId?: string
}

export interface AiMessage {
  id: string
  role: 'admin' | 'ai'
  content: string
  at: string
  /** Phạm vi dữ liệu AI đã dùng */
  scope?: string
  evidence?: AiEvidence[]
  /** Giới hạn / dữ liệu thiếu */
  limits?: string[]
  drafts?: TaskDraft[]
}

export interface AiConversation {
  id: string
  title: string
  shopId?: string
  updatedAt: string
  messages: AiMessage[]
}

/* ------------------------------------------------------------------ */
/* Preferences                                                         */
/* ------------------------------------------------------------------ */

export interface AdminPreferences {
  displayName: string
  avatarColor: string
  locale: 'vi' | 'en'
  theme: 'light' | 'system'
  density: 'comfortable' | 'compact'
  sidebarCollapsed: boolean
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  target?: string
  detail?: string
}
