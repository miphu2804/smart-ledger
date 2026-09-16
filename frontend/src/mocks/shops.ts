import type { AdminShop, AdminShopDetail, ShopSupportStatus } from './types'

const tone = {
  teal: '#1f8a70',
  pine: '#2f6f5e',
  moss: '#3d8b6e',
  sea: '#2a9d8f',
  leaf: '#4c9a6a',
  deep: '#1e7a62',
}

const shops: AdminShop[] = [
  {
    id: 'shp-hanh',
    name: 'Tiệm Bánh Mì Hạnh',
    ownerUserId: 'own-hanh',
    ownerName: 'Hạnh Nguyễn',
    ownerPhone: '0903 221 118',
    ownerEmail: 'hanh@tiembanhmi.vn',
    industry: 'Bakery',
    status: 'NEEDS_ACTION',
    neededNext: 'Owner must confirm the AI sale draft from Saturday',
    lastAccessAt: '2026-04-17T08:12:00Z',
    lastAccessLabel: '3d',
    createdAt: '2025-11-02T00:00:00Z',
    createdLabel: '2 Nov 2025',
    avatarInitial: 'H',
    avatarTone: tone.teal,
  },
  {
    id: 'shp-che',
    name: 'Quán Nước Chè Tư',
    ownerUserId: 'own-tu',
    ownerName: 'Tư Phạm',
    ownerPhone: '0912 445 667',
    ownerEmail: 'tu@nuocche.vn',
    industry: 'Drinks',
    status: 'NEEDS_ACTION',
    neededNext: 'Phone unreachable — two call attempts this morning',
    lastAccessAt: '2026-04-20T02:40:00Z',
    lastAccessLabel: '4h',
    createdAt: '2025-08-18T00:00:00Z',
    createdLabel: '18 Aug 2025',
    avatarInitial: 'T',
    avatarTone: tone.pine,
  },
  {
    id: 'shp-nam',
    name: 'Tiệm Tạp Hóa Năm',
    ownerUserId: 'own-nam',
    ownerName: 'Năm Lê',
    ownerPhone: '0988 112 334',
    ownerEmail: 'nam@taphoa.vn',
    industry: 'Grocery',
    status: 'NEEDS_ACTION',
    neededNext: 'No owner login in 9 days, onboarding still open',
    lastAccessAt: '2026-04-11T11:00:00Z',
    lastAccessLabel: '9d',
    createdAt: '2026-01-09T00:00:00Z',
    createdLabel: '9 Jan 2026',
    avatarInitial: 'N',
    avatarTone: tone.moss,
  },
  {
    id: 'shp-lan',
    name: 'Quán Cơm Tấm Lan',
    ownerUserId: 'own-lan',
    ownerName: 'Lan Trần',
    ownerPhone: '0906 778 990',
    ownerEmail: 'lan@comtam.vn',
    industry: 'Rice shop',
    status: 'NEEDS_ACTION',
    neededNext: 'Waiting on tax papers before support can close',
    lastAccessAt: '2026-04-19T09:10:00Z',
    lastAccessLabel: '1d',
    createdAt: '2025-06-04T00:00:00Z',
    createdLabel: '4 Jun 2025',
    avatarInitial: 'L',
    avatarTone: tone.sea,
  },
  {
    id: 'shp-suong',
    name: 'Tiệm Cà Phê Sương',
    ownerUserId: 'own-suong',
    ownerName: 'Sương Võ',
    ownerPhone: '0933 556 778',
    ownerEmail: 'suong@caphe.vn',
    industry: 'Cafe',
    status: 'NEEDS_ACTION',
    neededNext: 'AI draft has two unmatched item names',
    lastAccessAt: '2026-04-20T06:05:00Z',
    lastAccessLabel: '22m',
    createdAt: '2025-12-12T00:00:00Z',
    createdLabel: '12 Dec 2025',
    avatarInitial: 'S',
    avatarTone: tone.leaf,
  },
  {
    id: 'shp-thanh',
    name: 'Quán Phở Bò Thành',
    ownerUserId: 'own-thanh',
    ownerName: 'Thành Đỗ',
    ownerPhone: '0977 334 221',
    ownerEmail: 'thanh@phobo.vn',
    industry: 'Noodles',
    status: 'NEEDS_ACTION',
    neededNext: 'Owner asked to pause alerts; confirm if still blocked',
    lastAccessAt: '2026-04-20T05:50:00Z',
    lastAccessLabel: '40m',
    createdAt: '2025-03-22T00:00:00Z',
    createdLabel: '22 Mar 2025',
    avatarInitial: 'Th',
    avatarTone: tone.deep,
  },
  {
    id: 'shp-minh',
    name: 'Tiệm Rau Sạch Minh',
    ownerUserId: 'own-minh',
    ownerName: 'Minh Bùi',
    ownerPhone: '0944 221 009',
    ownerEmail: 'minh@rausach.vn',
    industry: 'Produce',
    status: 'NEEDS_ACTION',
    neededNext: 'Device switch — last access from a new phone, not verified',
    lastAccessAt: '2026-04-18T14:20:00Z',
    lastAccessLabel: '2d',
    createdAt: '2026-02-01T00:00:00Z',
    createdLabel: '1 Feb 2026',
    avatarInitial: 'M',
    avatarTone: tone.teal,
  },
  {
    id: 'shp-hong',
    name: 'Quán Bún Riêu Hồng',
    ownerUserId: 'own-hong',
    ownerName: 'Hồng Mai',
    ownerPhone: '0966 880 112',
    ownerEmail: 'hong@bunrieu.vn',
    industry: 'Noodles',
    status: 'NEEDS_ACTION',
    neededNext: 'Support reply overdue by 6 hours',
    lastAccessAt: '2026-04-20T06:18:00Z',
    lastAccessLabel: '8m',
    createdAt: '2025-09-30T00:00:00Z',
    createdLabel: '30 Sep 2025',
    avatarInitial: 'Ho',
    avatarTone: tone.pine,
  },
  {
    id: 'shp-khoa',
    name: 'Tiệm Giày Dép Khoa',
    ownerUserId: 'own-khoa',
    ownerName: 'Khoa Huỳnh',
    ownerPhone: '0922 667 445',
    ownerEmail: 'khoa@giaydep.vn',
    industry: 'Retail',
    status: 'NEEDS_ACTION',
    neededNext: 'Onboarding checklist stuck on shop photo',
    lastAccessAt: '2026-04-16T10:00:00Z',
    lastAccessLabel: '4d',
    createdAt: '2026-03-03T00:00:00Z',
    createdLabel: '3 Mar 2026',
    avatarInitial: 'K',
    avatarTone: tone.moss,
  },
  {
    id: 'shp-quyen',
    name: 'Quán Trái Cây Quyên',
    ownerUserId: 'own-quyen',
    ownerName: 'Quyên Đặng',
    ownerPhone: '0918 334 770',
    ownerEmail: 'quyen@traicay.vn',
    industry: 'Produce',
    status: 'ACTIVE',
    neededNext: 'Nothing waiting — healthy this week',
    lastAccessAt: '2026-04-20T06:22:00Z',
    lastAccessLabel: '4m',
    createdAt: '2025-07-14T00:00:00Z',
    createdLabel: '14 Jul 2025',
    avatarInitial: 'Q',
    avatarTone: tone.sea,
  },
  {
    id: 'shp-duc',
    name: 'Quán Bánh Xèo Đức',
    ownerUserId: 'own-duc',
    ownerName: 'Đức Phan',
    ownerPhone: '0904 119 228',
    ownerEmail: 'duc@banhxeo.vn',
    industry: 'Street food',
    status: 'ACTIVE',
    neededNext: 'Follow up next Monday on new tablet',
    lastAccessAt: '2026-04-19T18:00:00Z',
    lastAccessLabel: '12h',
    createdAt: '2025-10-21T00:00:00Z',
    createdLabel: '21 Oct 2025',
    avatarInitial: 'D',
    avatarTone: tone.leaf,
  },
  {
    id: 'shp-yen',
    name: 'Tiệm Tóc Yến',
    ownerUserId: 'own-yen',
    ownerName: 'Yến Ngô',
    ownerPhone: '0938 552 441',
    ownerEmail: 'yen@tiemtoc.vn',
    industry: 'Services',
    status: 'INACTIVE',
    neededNext: 'Shop paused by owner until May',
    lastAccessAt: '2026-03-28T09:00:00Z',
    lastAccessLabel: '23d',
    createdAt: '2025-04-11T00:00:00Z',
    createdLabel: '11 Apr 2025',
    avatarInitial: 'Y',
    avatarTone: tone.deep,
  },
]

const details: Record<string, Pick<AdminShopDetail, 'blocked' | 'blockedReason' | 'blockingItems'>> =
  {
    'shp-hanh': {
      blocked: true,
      blockedReason:
        'Saturday AI sale draft is still unconfirmed. Until Hạnh accepts or discards it, evening totals stay frozen for this shop.',
      blockingItems: [
        {
          id: 'b1',
          title: 'AI sale draft · 18 Apr',
          detail: '12 line items, 2 unmatched names',
          tone: 'amber',
        },
        {
          id: 'b2',
          title: 'Owner confirm overdue',
          detail: 'Pinged yesterday, no reply',
          tone: 'red',
        },
        {
          id: 'b3',
          title: 'Follow-up task not opened',
          detail: 'Support has not filed a task yet',
          tone: 'gray',
        },
      ],
    },
    'shp-che': {
      blocked: true,
      blockedReason:
        'Owner phone returned unreachable twice this morning. Do not keep calling the same number without a second channel.',
      blockingItems: [
        {
          id: 'b1',
          title: 'Outbound call failed',
          detail: '0912 445 667 · 07:40 and 08:15',
          tone: 'red',
        },
        {
          id: 'b2',
          title: 'Zalo not on file',
          detail: 'Ask for a second contact on next login',
          tone: 'amber',
        },
      ],
    },
    'shp-nam': {
      blocked: true,
      blockedReason:
        'Onboarding is still open and the owner has not signed in for 9 days. Treat as stalled, not churned.',
      blockingItems: [
        {
          id: 'b1',
          title: 'Onboarding step 3 of 5',
          detail: 'Shop photo and opening hours missing',
          tone: 'amber',
        },
      ],
    },
  }

export const shopCounts: Record<ShopSupportStatus | 'ALL', number> = {
  NEEDS_ACTION: 9,
  ACTIVE: 86,
  INACTIVE: 12,
  ALL: 128,
}

export function listShops(filter: ShopSupportStatus | 'ALL' = 'ALL'): AdminShop[] {
  if (filter === 'ALL') return shops
  return shops.filter((s) => s.status === filter)
}

export function getShopDetail(id: string): AdminShopDetail | undefined {
  const shop = shops.find((s) => s.id === id)
  if (!shop) return undefined
  const extra = details[id] ?? {
    blocked: shop.status === 'NEEDS_ACTION',
    blockedReason:
      shop.status === 'NEEDS_ACTION'
        ? shop.neededNext
        : undefined,
    blockingItems:
      shop.status === 'NEEDS_ACTION'
        ? [
            {
              id: 'b1',
              title: shop.neededNext,
              detail: `Last access ${shop.lastAccessLabel} ago`,
              tone: 'amber' as const,
            },
          ]
        : [],
  }
  return { ...shop, ...extra }
}
