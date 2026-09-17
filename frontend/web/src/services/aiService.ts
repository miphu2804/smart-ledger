/**
 * AI Support (FR-025) — FE chỉ gọi Core; Core lọc context và điều phối AI.
 *
 * Bản mock này là bộ trả lời theo luật, chạy trên dữ liệu ADMIN được phép xem.
 * Mỗi câu trả lời có: phạm vi dữ liệu, bằng chứng, giới hạn và (nếu có) task draft.
 * Task draft KHÔNG có side effect — chỉ tạo khi ADMIN bấm xác nhận (taskService.createTask).
 */
import { BASIC_MONTHLY_QUOTA, USE_MOCK } from '../config'
import type { MockBusiness } from '../mocks/accounts'
import { simulate } from '../mocks/scenario'
import type { AiConversation, AiEvidence, AiMessage, TaskDraft } from '../types'
import { normalizeVi } from '../utils/format'
import { request } from './api'
import { clone, conversations, db, idempotency, log, mockNow, saveConversations, tasks } from './mockStore'

export const SUGGESTED_PROMPTS = [
  'Tóm tắt các cơ sở cần chú ý hôm nay',
  'Cơ sở nào đang lỗi đồng bộ?',
  'Chủ cơ sở nào chưa xác minh số điện thoại?',
  'Đề xuất task cho cơ sở đang chọn',
]

const OUT_OF_SCOPE = /hoa don|doanh thu|cong no|chi phi|ton kho|loi nhuan|sua so|gia danh|dang nhap thay|mat khau|token/

const uid = (p: string) => `${p}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : 'chưa có'

function shopEvidence(b: MockBusiness): AiEvidence[] {
  const o = db().owners.find((x) => x.id === b.ownerId)!
  return [
    { label: 'Cơ sở', value: `${b.name} (${b.id})`, shopId: b.id },
    { label: 'Trạng thái OWNER', value: o.status === 'active' ? 'Hoạt động' : o.status === 'locked' ? 'Bị khoá' : 'Chờ xác minh' },
    { label: 'Đồng bộ gần nhất', value: fmtTime(b.lastSyncAt) },
    { label: 'Lỗi đồng bộ 7 ngày', value: String(b.syncErrors7d) },
  ]
}

function draftFor(b: MockBusiness): TaskDraft | null {
  const o = db().owners.find((x) => x.id === b.ownerId)!
  const hasOpen = tasks().some((t) => t.shopId === b.id && t.status !== 'resolved')
  let d: TaskDraft | null = null
  if (b.syncErrors7d > 0)
    d = {
      draftId: `ai_sync_${b.id}`,
      title: 'Kiểm tra lỗi đồng bộ',
      description: `${b.syncErrors7d} lần đồng bộ thất bại trong 7 ngày. Liên hệ chủ cơ sở kiểm tra kết nối mạng và phiên bản ứng dụng.`,
      severity: b.syncErrors7d >= 4 ? 'high' : 'medium',
      shopId: b.id,
      shopName: b.name,
      reason: `Căn cứ: sự kiện đồng bộ 7 ngày của ${b.id}.`,
    }
  else if (o.status === 'pending')
    d = {
      draftId: `ai_pend_${b.id}`,
      title: 'Hỗ trợ xác minh số điện thoại',
      description: 'Chủ cơ sở chưa hoàn tất xác minh OTP. Gọi hỏi khách có nhận được SMS không.',
      severity: 'low',
      shopId: b.id,
      shopName: b.name,
      reason: 'Căn cứ: trạng thái OWNER = Chờ xác minh.',
    }
  else if (o.plan === 'basic' && b.ordersThisMonth >= BASIC_MONTHLY_QUOTA * 0.8)
    d = {
      draftId: `ai_quota_${b.id}`,
      title: 'Thông báo sắp hết lượt tạo đơn',
      description: `Cơ sở đã dùng ${b.ordersThisMonth}/${BASIC_MONTHLY_QUOTA} lượt. Giải thích hạn mức cho khách (không tự đổi gói).`,
      severity: 'low',
      shopId: b.id,
      shopName: b.name,
      reason: 'Căn cứ: lượt tạo đơn trong kỳ.',
    }
  if (d && hasOpen) d.reason += ' Lưu ý: cơ sở đã có task đang mở — kiểm tra trùng trước khi tạo.'
  return d
}

function answer(prompt: string, shopId?: string): Omit<AiMessage, 'id' | 'at' | 'role'> {
  const n = normalizeVi(prompt)
  const { owners, businesses } = db()
  const shop = shopId ? businesses.find((b) => b.id === shopId) : undefined
  const scopeAll = `Toàn bộ ${businesses.length} cơ sở ADMIN được xem · dữ liệu hỗ trợ (tài khoản, đồng bộ, hạn mức)`
  const scopeShop = shop ? `Cơ sở ${shop.name} (${shop.id}) · dữ liệu hỗ trợ` : scopeAll
  const baseLimits = ['Không truy cập hoá đơn, chi phí, công nợ, tồn kho hay doanh thu của cơ sở.']

  if (OUT_OF_SCOPE.test(n)) {
    return {
      content:
        'Yêu cầu này nằm ngoài phạm vi AI Support. Mình không đọc hay sửa sổ nghiệp vụ (hoá đơn, chi phí, công nợ, tồn kho), không xem mật khẩu/token và không thao tác thay chủ cơ sở. Bạn có thể hỏi về trạng thái tài khoản, đồng bộ, thiết bị hoặc hạn mức.',
      scope: 'Không truy vấn dữ liệu',
      evidence: [],
      limits: baseLimits,
    }
  }

  if (/dong bo|sync/.test(n)) {
    const list = (shop ? [shop] : businesses.filter((b) => b.syncErrors7d > 0)).sort((a, b) => b.syncErrors7d - a.syncErrors7d)
    if (shop && shop.syncErrors7d === 0)
      return {
        content: `${shop.name} không có lỗi đồng bộ trong 7 ngày qua. Lần đồng bộ gần nhất: ${fmtTime(shop.lastSyncAt)}.`,
        scope: scopeShop,
        evidence: shopEvidence(shop),
        limits: [...baseLimits, 'Chỉ xem được số lần lỗi, không xem nội dung dữ liệu đồng bộ.'],
      }
    return {
      content: `Có ${list.length} cơ sở gặp lỗi đồng bộ trong 7 ngày. Nhiều nhất là ${list[0]?.name} (${list[0]?.syncErrors7d} lần). Nguyên nhân thường gặp: mất kết nối mạng hoặc app phiên bản cũ — cần xác nhận với chủ cơ sở.`,
      scope: scopeShop,
      evidence: list
        .slice(0, 5)
        .map((b) => ({ label: b.name, value: `${b.syncErrors7d} lỗi · đồng bộ gần nhất ${fmtTime(b.lastSyncAt)}`, shopId: b.id })),
      limits: [...baseLimits, 'Nguyên nhân là suy luận từ sự kiện, chưa có log chi tiết từ thiết bị.'],
      drafts: list
        .slice(0, 2)
        .map(draftFor)
        .filter((d): d is TaskDraft => Boolean(d)),
    }
  }

  if (/xac minh|otp|chua xac/.test(n)) {
    const pend = owners.filter((o) => o.status === 'pending')
    return {
      content: `${pend.length} chủ cơ sở chưa xác minh số điện thoại. Đa số đăng ký trong 14 ngày gần đây — nên gọi hỏi khách có nhận được SMS OTP không.`,
      scope: scopeAll,
      evidence: pend.slice(0, 6).map((o) => {
        const b = businesses.find((x) => x.ownerId === o.id)!
        return { label: o.fullName, value: `${b.name} · đăng ký ${fmtTime(o.createdAt)}`, shopId: b.id }
      }),
      limits: [...baseLimits, 'Không biết lý do khách chưa xác minh (không có log nhà mạng).'],
      drafts: pend
        .slice(0, 2)
        .map((o) => draftFor(businesses.find((x) => x.ownerId === o.id)!))
        .filter((d): d is TaskDraft => Boolean(d)),
    }
  }

  if (/han muc|luot|quota|goi/.test(n)) {
    const near = businesses.filter((b) => owners.find((o) => o.id === b.ownerId)?.plan === 'basic' && b.ordersThisMonth >= BASIC_MONTHLY_QUOTA * 0.8)
    return {
      content: `${near.length} cơ sở gói Cơ bản đã dùng trên 80% hạn mức ${BASIC_MONTHLY_QUOTA} lượt tạo đơn tháng này. AI không tự đổi gói; có thể tạo task để liên hệ tư vấn.`,
      scope: scopeAll,
      evidence: near.slice(0, 6).map((b) => ({ label: b.name, value: `${b.ordersThisMonth}/${BASIC_MONTHLY_QUOTA} lượt`, shopId: b.id })),
      limits: baseLimits,
      drafts: near
        .slice(0, 2)
        .map(draftFor)
        .filter((d): d is TaskDraft => Boolean(d)),
    }
  }

  if (/task|de xuat|goi y/.test(n)) {
    if (!shop)
      return {
        content: 'Hãy chọn một cơ sở ở khung Ngữ cảnh bên phải để mình đề xuất task có căn cứ.',
        scope: 'Chưa chọn cơ sở',
        evidence: [],
        limits: ['Cần ngữ cảnh cơ sở để đưa ra đề xuất.'],
      }
    const d = draftFor(shop)
    return {
      content: d
        ? `Đề xuất 1 task cho ${shop.name}. Xem lại nội dung và bấm “Xem & xác nhận” nếu đồng ý — task chỉ được tạo sau khi bạn xác nhận.`
        : `${shop.name} hiện không có dấu hiệu cần hỗ trợ (không lỗi đồng bộ, đã xác minh, chưa chạm hạn mức). Không đề xuất task.`,
      scope: scopeShop,
      evidence: shopEvidence(shop),
      limits: baseLimits,
      drafts: d ? [d] : [],
    }
  }

  if (/tom tat|can chu y|hom nay|tong quan/.test(n) || !shop) {
    const sync = businesses.filter((b) => b.syncErrors7d > 0).length
    const pend = owners.filter((o) => o.status === 'pending').length
    const locked = owners.filter((o) => o.status === 'locked').length
    const overdue = tasks().filter((t) => t.status !== 'resolved' && t.dueAt && new Date(t.dueAt) < mockNow()).length
    return {
      content: `Hôm nay có ${sync} cơ sở lỗi đồng bộ, ${pend} chủ cơ sở chưa xác minh, ${locked} tài khoản bị khoá và ${overdue} task quá hạn. Nên ưu tiên task quá hạn và các cơ sở lỗi đồng bộ nhiều lần.`,
      scope: scopeAll,
      evidence: [
        { label: 'Cơ sở lỗi đồng bộ (7 ngày)', value: String(sync) },
        { label: 'OWNER chờ xác minh', value: String(pend) },
        { label: 'Tài khoản bị khoá', value: String(locked) },
        { label: 'Task quá hạn', value: String(overdue) },
      ],
      limits: baseLimits,
    }
  }

  return {
    content: `${shop.name}: chủ cơ sở ${owners.find((o) => o.id === shop.ownerId)?.fullName}, ${shop.syncErrors7d ? `${shop.syncErrors7d} lỗi đồng bộ trong 7 ngày` : 'đồng bộ ổn định'}, hoạt động gần nhất ${fmtTime(shop.lastActiveAt)}.`,
    scope: scopeShop,
    evidence: shopEvidence(shop),
    limits: baseLimits,
    drafts: [draftFor(shop)].filter((d): d is TaskDraft => Boolean(d)),
  }
}

function seed(): AiConversation[] {
  const now = mockNow()
  const at = (m: number) => new Date(now.getTime() - m * 60_000).toISOString()
  const q = 'Tóm tắt các cơ sở cần chú ý hôm nay'
  return [
    {
      id: 'conv_seed_1',
      title: q,
      updatedAt: at(95),
      messages: [
        { id: 'm1', role: 'admin', content: q, at: at(96) },
        { id: 'm2', role: 'ai', at: at(95), ...answer(q) },
      ],
    },
  ]
}

function list(): AiConversation[] {
  const c = conversations()
  if (!c.length && !localStorageSeeded) {
    localStorageSeeded = true
    c.push(...seed())
    saveConversations()
  }
  return c
}
let localStorageSeeded = false

/** GET /admin/ai/conversations */
export async function listConversations(): Promise<AiConversation[]> {
  if (!USE_MOCK) return request('/admin/ai/conversations') // TODO(backend)
  const { empty } = await simulate(250)
  return empty ? [] : clone([...list()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)))
}

/**
 * POST /admin/ai/conversations/{id}/messages  { content, shopId }
 * id = null → tạo hội thoại mới. Lỗi được ném ra để UI giữ nguyên prompt và cho thử lại.
 */
export async function sendMessage(conversationId: string | null, content: string, shopId?: string): Promise<AiConversation> {
  if (!USE_MOCK) {
    // TODO(backend)
    return request(`/admin/ai/conversations${conversationId ? `/${conversationId}` : ''}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content, shopId }),
    })
  }
  await simulate(900)
  const all = list()
  let conv = conversationId ? all.find((c) => c.id === conversationId) : undefined
  const now = mockNow().toISOString()
  if (!conv) {
    conv = { id: uid('conv'), title: content.slice(0, 60), shopId, updatedAt: now, messages: [] }
    all.push(conv)
  }
  conv.shopId = shopId
  conv.messages.push({ id: uid('m'), role: 'admin', content, at: now })
  const res = answer(content, shopId)
  conv.messages.push({ id: uid('m'), role: 'ai', at: now, ...res })
  conv.updatedAt = now
  saveConversations()
  if (shopId) log('AI Support truy vấn ngữ cảnh cơ sở', shopId, content.slice(0, 80))
  return clone(conv)
}

/** Draft nào đã được xác nhận thành task (theo idempotency key) */
export function confirmedDraftIds(): Set<string> {
  return new Set(Object.keys(idempotency()))
}

export async function deleteConversation(id: string): Promise<void> {
  if (!USE_MOCK) return request(`/admin/ai/conversations/${id}`, { method: 'DELETE' }) // TODO(backend)
  const all = list()
  const i = all.findIndex((c) => c.id === id)
  if (i >= 0) all.splice(i, 1)
  saveConversations()
}
