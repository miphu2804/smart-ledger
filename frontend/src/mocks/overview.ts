import type {
  AdminOverviewView,
  AttentionRow,
  FirstAction,
  HourBucket,
} from './types'

export const overview: AdminOverviewView = {
  shopsActive: 128,
  shopsActiveDelta: 6,
  openTasks: 14,
  waitingTasks: 4,
  ownersContacted: 23,
  ownersContactTarget: 40,
  aiDraftsPending: 5,
}

export const attentionRows: AttentionRow[] = [
  {
    id: 'shp-hanh',
    shopId: 'shp-hanh',
    shopName: 'Tiệm Bánh Mì Hạnh',
    avatarInitial: 'H',
    avatarTone: '#1f8a70',
    ownerName: 'Hạnh Nguyễn',
    reason: 'AI draft unconfirmed',
    status: 'WAITING',
    lastSeen: '3d',
  },
  {
    id: 'shp-che',
    shopId: 'shp-che',
    shopName: 'Quán Nước Chè Tư',
    avatarInitial: 'T',
    avatarTone: '#2f6f5e',
    ownerName: 'Tư Phạm',
    reason: 'Phone unreachable',
    status: 'INVESTIGATING',
    lastSeen: '4h',
  },
  {
    id: 'shp-nam',
    shopId: 'shp-nam',
    shopName: 'Tiệm Tạp Hóa Năm',
    avatarInitial: 'N',
    avatarTone: '#3d8b6e',
    ownerName: 'Năm Lê',
    reason: 'No login in 9 days',
    status: 'WAITING',
    lastSeen: '9d',
  },
  {
    id: 'shp-suong',
    shopId: 'shp-suong',
    shopName: 'Tiệm Cà Phê Sương',
    avatarInitial: 'S',
    avatarTone: '#4c9a6a',
    ownerName: 'Sương Võ',
    reason: 'Unmatched draft lines',
    status: 'INBOX',
    lastSeen: '22m',
  },
  {
    id: 'shp-hong',
    shopId: 'shp-hong',
    shopName: 'Quán Bún Riêu Hồng',
    avatarInitial: 'Ho',
    avatarTone: '#2f6f5e',
    ownerName: 'Hồng Mai',
    reason: 'Reply overdue 6h',
    status: 'INBOX',
    lastSeen: '8m',
  },
  {
    id: 'shp-lan',
    shopId: 'shp-lan',
    shopName: 'Quán Cơm Tấm Lan',
    avatarInitial: 'L',
    avatarTone: '#2a9d8f',
    ownerName: 'Lan Trần',
    reason: 'Tax papers pending',
    status: 'RESOLVED',
    lastSeen: '1d',
  },
]

export const loadByHour: HourBucket[] = [
  { label: '8 am', value: 22 },
  { label: '10 am', value: 34 },
  { label: '12 pm', value: 92 },
  { label: '2 pm', value: 40 },
  { label: '4 pm', value: 64, isNow: true },
  { label: '6 pm', value: 86 },
  { label: '8 pm', value: 38 },
]

export const firstActions: FirstAction[] = [
  {
    id: 'a1',
    title: 'Confirm AI draft · Tiệm Bánh Mì Hạnh',
    detail: '12 lines · owner silent 3 days',
    action: 'Confirm',
    icon: 'ticket',
  },
  {
    id: 'a2',
    title: 'Owner not reachable · Quán Nước Chè Tư',
    detail: 'Two failed calls this morning',
    action: 'View',
    icon: 'phone',
  },
  {
    id: 'a3',
    title: 'Access stalled 9 days · Tiệm Tạp Hóa Năm',
    detail: 'Onboarding still open at step 3',
    action: 'View',
    icon: 'store',
  },
  {
    id: 'a4',
    title: 'Tax papers · Quán Cơm Tấm Lan',
    detail: 'Waiting on owner upload',
    action: 'View',
    icon: 'file',
  },
  {
    id: 'a5',
    title: '3 shops share the same onboarding block',
    detail: 'Shop photo still missing',
    action: 'View',
    icon: 'warning',
  },
]

export const dashboardInsight =
  'Tiệm Bánh Mì Hạnh has been waiting three days for an owner confirm. Four other shops are sitting on the same AI-draft review queue — clear Hạnh first and the rest usually follow.'
