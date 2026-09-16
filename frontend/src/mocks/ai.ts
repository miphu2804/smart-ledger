import type { AdminSupportMessage } from './types'

export const promptTiles = [
  {
    id: 'summarize',
    title: 'Summarize this shop',
    prompt: 'Summarize Tiệm Bánh Mì Hạnh',
  },
  {
    id: 'draft',
    title: 'Draft a support task',
    prompt: 'Draft a support task for Tiệm Bánh Mì Hạnh',
  },
  {
    id: 'access',
    title: 'Explain last 7-day access',
    prompt: 'Explain last 7-day access for Tiệm Bánh Mì Hạnh',
  },
  {
    id: 'blocking',
    title: 'What is blocking shop X',
    prompt: 'What is blocking Tiệm Bánh Mì Hạnh?',
  },
] as const

export const demoUserMessage = 'What is blocking Tiệm Bánh Mì Hạnh?'

export const demoSupportMessage: AdminSupportMessage = {
  conversationId: 'conv-hanh-demo',
  messageId: 'msg-hanh-1',
  answer:
    'Hạnh still has not confirmed Saturday’s AI sale draft — 12 lines, two unmatched item names. Until she accepts or discards it, evening totals stay frozen for this shop. Pinged yesterday, no reply. This answer is a draft.',
  scope: 'shop:shp-hanh · last 7 days',
  citations: [
    { id: 'c1', label: 'Shop · Tiệm Bánh Mì Hạnh' },
    { id: 'c2', label: 'AI draft · 18 Apr' },
    { id: 'c3', label: 'Last access · 3d' },
  ],
  insufficientData: false,
  taskDraft: {
    title: 'Confirm Saturday AI sale draft',
    shopId: 'shp-hanh',
    shopName: 'Tiệm Bánh Mì Hạnh',
    priority: 'HIGH',
    dueAt: '2026-04-20T12:00:00Z',
    note: '12 lines, 2 unmatched names. Owner silent 3 days.',
  },
}
