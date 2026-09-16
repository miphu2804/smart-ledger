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

export type PlanId = 'basic' | 'pro'
export type AccountStatus = 'active' | 'locked' | 'pending'
export type LoginMethod = 'phone' | 'google' | 'facebook' | 'apple'

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

export type ActivityType =
  | 'order_voice'
  | 'order_pos'
  | 'login'
  | 'product'
  | 'expense'
  | 'debt'
  | 'plan'
  | 'status'
  | 'signup'

export interface ActivityItem {
  id: string
  type: ActivityType
  label: string
  /** ISO datetime */
  at: string
}

export interface Account {
  id: string
  storeName: string
  ownerName: string
  /** Định dạng 0xxxxxxxxx */
  phone: string
  email?: string
  industry: Industry
  address: string
  plan: PlanId
  status: AccountStatus
  lockReason?: string
  loginMethod: LoginMethod
  /** ISO datetime */
  createdAt: string
  /** ISO datetime */
  lastActiveAt: string
  ordersThisMonth: number
  /** null = không giới hạn */
  orderQuota: number | null
  /** 0..1 — tỉ lệ đơn tạo bằng giọng nói */
  voiceOrderRatio: number
  /** Doanh thu 7 ngày gần nhất (VND), phần tử cuối là hôm nay */
  revenue7d: number[]
  staffCount: number
  productCount: number
  activity: ActivityItem[]
}

export interface AccountInput {
  storeName: string
  ownerName: string
  phone: string
  email?: string
  industry: Industry
  address?: string
  plan: PlanId
}

export type AccountSortKey = 'createdAt' | 'lastActiveAt' | 'ordersThisMonth' | 'storeName'
export type SortDir = 'asc' | 'desc'

export interface AccountQuery {
  search?: string
  status?: AccountStatus | 'all'
  plan?: PlanId | 'all'
  industry?: Industry | 'all'
  sortBy?: AccountSortKey
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

export interface DailyCount {
  /** yyyy-mm-dd */
  date: string
  count: number
}

export interface AdminStats {
  totalAccounts: number
  activeAccounts: number
  lockedAccounts: number
  pendingAccounts: number
  newAccounts7d: number
  ordersThisMonth: number
  /** 0..1, có trọng số theo số đơn */
  voiceOrderRatio: number
  signupsPerDay: DailyCount[]
  planDistribution: Record<PlanId, number>
  industryBreakdown: { industry: Industry; count: number }[]
  loginMethods: Record<LoginMethod, number>
  basicNearQuota: number
  newestAccounts: Account[]
}

export interface AuditEntry {
  id: string
  at: string
  actor: string
  action: string
  target?: string
  detail?: string
}

export interface AdminUser {
  id: string
  name: string
  email: string
  role: 'super_admin' | 'admin'
}

export interface AuthSession {
  token: string
  user: AdminUser
  /** ISO datetime */
  issuedAt: string
}
