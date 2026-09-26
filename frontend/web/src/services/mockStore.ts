/**
 * "Backend giả" dùng chung cho các service ở chế độ mock.
 * Lưu trong localStorage (bọc try/catch) — storage bị chặn thì giữ trong bộ nhớ.
 */
import { MOCK_TODAY } from '../config'
import { generateMockDb, mockNow, type MockDb } from '../mocks/accounts'
import { generateTasks } from '../mocks/tasks'
import type { AdminMember, AiConversation, AuditEntry, SupportTask } from '../types'
import { readJSON, removeKey, writeJSON } from '../utils/storage'
import { getSession } from './authService'

const DATA_VERSION = 3
const KEYS = {
  db: 'snl_mock_db',
  audit: 'snl_mock_audit',
  tasks: 'snl_mock_tasks',
  ai: 'snl_mock_ai',
  idem: 'snl_mock_idem',
} as const

interface Stored<T> {
  version: number
  data: T
}

function load<T>(key: string, seed: () => T): T {
  const s = readJSON<Stored<T>>(key)
  if (s && s.version === DATA_VERSION && s.data) return s.data
  const data = seed()
  writeJSON(key, { version: DATA_VERSION, data })
  return data
}
const save = (key: string, data: unknown) => writeJSON(key, { version: DATA_VERSION, data })

let mem: {
  db?: MockDb
  audit?: AuditEntry[]
  tasks?: SupportTask[]
  ai?: AiConversation[]
  idem?: Record<string, string>
} = {}

// Tab khác ghi dữ liệu → bỏ cache để lần đọc sau lấy bản mới (giống 2 ADMIN cùng thao tác;
// task đang mở ở tab này sẽ bị phát hiện xung đột version khi lưu).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    const entry = (Object.entries(KEYS) as [keyof typeof mem, string][]).find(([, k]) => k === e.key)
    if (entry) delete mem[entry[0]]
  })
}

export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Thành viên đội hỗ trợ (để gán task) */
export const MEMBERS: AdminMember[] = [
  { id: 'usr_admin_001', name: 'Quản trị viên HEXA' },
  { id: 'usr_admin_002', name: 'Trần Minh Quân' },
  { id: 'usr_admin_003', name: 'Lê Thu Hà' },
]

export function db(): MockDb {
  return (mem.db ??= load(KEYS.db, () => generateMockDb()))
}
export const saveDb = () => mem.db && save(KEYS.db, mem.db)

export function tasks(): SupportTask[] {
  return (mem.tasks ??= load(KEYS.tasks, () => generateTasks(db(), mockNow())))
}
export const saveTasks = () => mem.tasks && save(KEYS.tasks, mem.tasks)

export function conversations(): AiConversation[] {
  return (mem.ai ??= load<AiConversation[]>(KEYS.ai, () => []))
}
export const saveConversations = () => mem.ai && save(KEYS.ai, mem.ai)

/** idempotency key -> id bản ghi đã tạo */
export function idempotency(): Record<string, string> {
  return (mem.idem ??= load<Record<string, string>>(KEYS.idem, () => ({})))
}
export const saveIdempotency = () => mem.idem && save(KEYS.idem, mem.idem)

export function audit(): AuditEntry[] {
  return (mem.audit ??= load<AuditEntry[]>(KEYS.audit, () => [
    {
      id: 'log_seed',
      at: new Date(`${MOCK_TODAY}T08:00:00`).toISOString(),
      actor: 'Hệ thống',
      action: 'Khởi tạo dữ liệu mẫu',
      detail: 'Tạo OWNER, cơ sở và support task mẫu cho môi trường demo',
    },
  ]))
}

/** Ghi audit — mọi hành động nhạy cảm đều gọi hàm này (audit luôn bật). */
export function log(action: string, target?: string, detail?: string): AuditEntry {
  const entry: AuditEntry = {
    id: `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    at: mockNow().toISOString(),
    actor: getSession()?.user.email ?? 'admin',
    action,
    target,
    detail,
  }
  mem.audit = [entry, ...audit()].slice(0, 300)
  save(KEYS.audit, mem.audit)
  return entry
}

export function resetStore() {
  Object.values(KEYS).forEach((k) => removeKey(k))
  removeKey('snl_mock_accounts')
  mem = {}
}

export { mockNow }
