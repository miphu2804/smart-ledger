export type AdminTaskStatus = 'INBOX' | 'INVESTIGATING' | 'WAITING' | 'RESOLVED'

export type AdminTaskPriority = 'HIGH' | 'MEDIUM' | 'LOW'

export type ShopSupportStatus = 'NEEDS_ACTION' | 'ACTIVE' | 'INACTIVE'

export type ChipTone = 'green' | 'blue' | 'amber' | 'red' | 'gray'

export type AdminUser = {
  id: string
  name: string
  phone: string
  email: string
  role: 'ADMIN' | 'OWNER'
  // inferred
  avatarInitial: string
}

export type AdminShop = {
  id: string
  name: string
  ownerUserId: string
  ownerName: string
  ownerPhone: string
  industry: string
  status: ShopSupportStatus
  neededNext: string
  lastAccessAt: string
  lastAccessLabel: string
  createdAt: string
  createdLabel: string
  // inferred
  avatarInitial: string
  avatarTone: string
  ownerEmail: string
}

export type BlockingItem = {
  id: string
  title: string
  detail: string
  tone: ChipTone
  // inferred
}

export type AdminShopDetail = AdminShop & {
  blocked: boolean
  blockedReason?: string
  blockingItems: BlockingItem[]
  // inferred
}

export type AdminOverviewView = {
  shopsActive: number
  shopsActiveDelta: number
  openTasks: number
  waitingTasks: number
  ownersContacted: number
  ownersContactTarget: number
  aiDraftsPending: number
  // inferred
}

export type AttentionRow = {
  id: string
  shopId: string
  shopName: string
  avatarInitial: string
  avatarTone: string
  ownerName: string
  reason: string
  status: AdminTaskStatus
  lastSeen: string
  // inferred
}

export type HourBucket = {
  label: string
  value: number
  isNow?: boolean
  // inferred
}

export type FirstAction = {
  id: string
  title: string
  detail: string
  action: 'Confirm' | 'View'
  icon: 'ticket' | 'phone' | 'store' | 'file' | 'warning'
  // inferred
}

export type AdminTask = {
  id: string
  title: string
  shopId?: string
  ownerUserId?: string
  priority: AdminTaskPriority
  assigneeUserId?: string
  dueAt?: string
  source: string
  status: AdminTaskStatus
  version: number
  createdAt: string
  updatedAt: string
  // inferred
  blockedNote?: string
}

export type AdminPreferences = {
  theme: 'light' | 'system' | 'dark'
  density: 'comfortable' | 'compact'
  locale: 'vi' | 'en'
}

export type SupportCitation = {
  id: string
  label: string
}

export type SupportTaskDraft = {
  title: string
  shopId?: string
  shopName?: string
  priority: AdminTaskPriority
  dueAt?: string
  note?: string
}

export type AdminSupportMessage = {
  conversationId: string
  messageId: string
  answer: string
  scope: string
  citations: SupportCitation[]
  insufficientData: boolean
  taskDraft?: SupportTaskDraft
}

