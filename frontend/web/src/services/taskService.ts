/**
 * Support task (Kanban). Mọi thao tác ghi đều:
 * - kiểm tra `version` để phát hiện xung đột,
 * - tạo task cần idempotency key (chống tạo trùng),
 * - ghi audit.
 * AI không tự tạo / di chuyển task: `suggestTasks()` chỉ trả bản nháp để ADMIN xác nhận.
 */
import { USE_MOCK } from '../config'
import { simulate } from '../mocks/scenario'
import type { AdminMember, CreateTaskInput, SupportTask, TaskDraft, TaskSeverity, TaskStatus } from '../types'
import { SEVERITY_LABEL, TASK_STATUS_LABEL } from '../types'
import { request } from './api'
import { getSession } from './authService'
import { MEMBERS, clone, db, idempotency, log, mockNow, saveIdempotency, saveTasks, tasks } from './mockStore'

export class ConflictError extends Error {
  status = 409
  current: SupportTask
  constructor(current: SupportTask) {
    super('Task vừa được người khác cập nhật. Dữ liệu mới nhất đã được tải lại.')
    this.current = current
  }
}

export const currentMemberId = () => getSession()?.user.id ?? MEMBERS[0].id

/** GET /admin/support-tasks */
export async function listTasks(): Promise<SupportTask[]> {
  if (!USE_MOCK) return request('/admin/support-tasks') // TODO(backend)
  const { empty } = await simulate()
  return empty ? [] : clone(tasks())
}

/** GET /admin/members — thành viên có thể được gán task */
export async function listMembers(): Promise<AdminMember[]> {
  if (!USE_MOCK) return request('/admin/members') // TODO(backend)
  return clone(MEMBERS)
}

function nextCode() {
  const max = tasks().reduce((m, t) => Math.max(m, Number(t.code.replace(/\D/g, '')) || 0), 100)
  return `T-${max + 1}`
}

/**
 * POST /admin/support-tasks  (header Idempotency-Key)
 * Gọi lại với cùng key sẽ trả task đã tạo, không tạo bản thứ hai.
 */
export async function createTask(input: CreateTaskInput, idempotencyKey: string): Promise<{ task: SupportTask; duplicated: boolean }> {
  if (!USE_MOCK) {
    // TODO(backend)
    const task = await request<SupportTask>('/admin/support-tasks', {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(input),
    })
    return { task, duplicated: false }
  }
  await simulate()
  const existingId = idempotency()[idempotencyKey]
  const existing = existingId && tasks().find((t) => t.id === existingId)
  if (existing) return { task: clone(existing), duplicated: true }

  const shop = input.shopId ? db().businesses.find((b) => b.id === input.shopId) : undefined
  const owner = shop && db().owners.find((o) => o.id === shop.ownerId)
  const now = mockNow().toISOString()
  const code = nextCode()
  const entry = log(input.source === 'ai' ? 'Xác nhận task từ đề xuất AI' : 'Tạo support task', code, input.title)
  const task: SupportTask = {
    id: `tsk_${Date.now().toString(36)}`,
    code,
    title: input.title.trim(),
    description: input.description.trim(),
    status: 'inbox',
    severity: input.severity,
    source: input.source,
    shopId: shop?.id,
    shopName: shop?.name,
    ownerName: owner?.fullName,
    assigneeId: input.assigneeId,
    dueAt: input.dueAt,
    createdAt: now,
    updatedAt: now,
    version: 1,
    history: [{ ...entry, action: input.source === 'ai' ? 'Tạo task (ADMIN xác nhận đề xuất AI)' : 'Tạo task' }],
  }
  tasks().unshift(task)
  idempotency()[idempotencyKey] = task.id
  saveTasks()
  saveIdempotency()
  return { task: clone(task), duplicated: false }
}

export interface TaskPatch {
  status?: TaskStatus
  assigneeId?: string | null
  severity?: TaskSeverity
}

/** PATCH /admin/support-tasks/{id}  { ...patch, version } */
export async function updateTask(id: string, patch: TaskPatch, version: number): Promise<SupportTask> {
  if (!USE_MOCK) {
    // TODO(backend)
    return request(`/admin/support-tasks/${id}`, { method: 'PATCH', body: JSON.stringify({ ...patch, version }) })
  }
  await simulate(250)
  const t = tasks().find((x) => x.id === id)
  if (!t) throw new Error('Không tìm thấy task.')
  if (t.version !== version) throw new ConflictError(clone(t))

  const changes: string[] = []
  if (patch.status && patch.status !== t.status) {
    changes.push(`Trạng thái: ${TASK_STATUS_LABEL[t.status]} → ${TASK_STATUS_LABEL[patch.status]}`)
    t.status = patch.status
  }
  if (patch.assigneeId !== undefined && (patch.assigneeId ?? undefined) !== t.assigneeId) {
    const name = MEMBERS.find((m) => m.id === patch.assigneeId)?.name ?? 'Chưa gán'
    changes.push(`Người phụ trách: ${name}`)
    t.assigneeId = patch.assigneeId ?? undefined
  }
  if (patch.severity && patch.severity !== t.severity) {
    changes.push(`Mức độ: ${SEVERITY_LABEL[t.severity]} → ${SEVERITY_LABEL[patch.severity]}`)
    t.severity = patch.severity
  }
  if (!changes.length) return clone(t)
  const entry = log('Cập nhật support task', t.code, changes.join(' · '))
  t.version += 1
  t.updatedAt = entry.at
  t.history.unshift({ ...entry, action: changes.join(' · ') })
  saveTasks()
  return clone(t)
}

/**
 * GET /admin/support-tasks/suggestions — AI đề xuất (chỉ bản nháp, không side effect).
 * Bỏ qua các cơ sở đã có task đang mở.
 */
export async function suggestTasks(): Promise<TaskDraft[]> {
  if (!USE_MOCK) return request('/admin/support-tasks/suggestions') // TODO(backend)
  await simulate(500)
  const openShops = new Set(
    tasks()
      .filter((t) => t.status !== 'resolved')
      .map((t) => t.shopId),
  )
  const used = idempotency()
  const drafts: TaskDraft[] = []
  for (const b of db().businesses) {
    if (drafts.length >= 3) break
    if (openShops.has(b.id)) continue
    const o = db().owners.find((x) => x.id === b.ownerId)!
    let d: TaskDraft | null = null
    if (b.syncErrors7d >= 2)
      d = {
        draftId: `sug_sync_${b.id}`,
        title: 'Kiểm tra lỗi đồng bộ',
        description: `Cơ sở có ${b.syncErrors7d} lần đồng bộ thất bại trong 7 ngày. Liên hệ chủ cơ sở kiểm tra mạng và phiên bản app.`,
        severity: b.syncErrors7d >= 4 ? 'high' : 'medium',
        shopId: b.id,
        shopName: b.name,
        reason: `Nguồn: sự kiện đồng bộ 7 ngày (${b.syncErrors7d} lỗi).`,
      }
    else if (o.status === 'pending' && Date.now() > 0 && new Date(b.createdAt) < new Date(mockNow().getTime() - 86_400_000))
      d = {
        draftId: `sug_pend_${b.id}`,
        title: 'Hỗ trợ xác minh số điện thoại',
        description: 'Chủ cơ sở đăng ký hơn 1 ngày nhưng chưa xác minh OTP.',
        severity: 'low',
        shopId: b.id,
        shopName: b.name,
        reason: 'Nguồn: trạng thái tài khoản OWNER = Chờ xác minh.',
      }
    if (d && !used[d.draftId]) drafts.push(d)
  }
  return drafts
}
