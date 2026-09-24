/**
 * Tasks — Kanban hỗ trợ: Inbox / Đang điều tra / Chờ phản hồi / Đã xử lý.
 * - Kéo thả hoặc chọn trạng thái trong drawer; mỗi lần đổi đều kiểm tra version và ghi audit.
 * - Đề xuất của AI chỉ để xem lại; ADMIN xác nhận từng đề xuất mới tạo task.
 */
import { ArrowRight, CalendarBlank, ChatCircleDots, Clock, Kanban, Sparkle, Storefront, UserCircle } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Avatar, DetailDrawer, SearchInput, SeverityPill, SourcePill, TaskStatusPill } from '../../components/admin/ui'
import Modal from '../../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { useToast } from '../../components/Toast'
import { useAsync } from '../../hooks/useAsync'
import { now } from '../../services/accountService'
import {
  ConflictError,
  createTask,
  currentMemberId,
  listMembers,
  listTasks,
  suggestTasks,
  updateTask,
  type TaskPatch,
} from '../../services/taskService'
import {
  SEVERITY_LABEL,
  SOURCE_LABEL,
  TASK_STATUS_LABEL,
  type AdminMember,
  type SupportTask,
  type TaskDraft,
  type TaskSeverity,
  type TaskSource,
  type TaskStatus,
} from '../../types'
import { formatDateTime, formatDue, formatRelative, normalizeVi } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

const COLUMNS: TaskStatus[] = ['inbox', 'investigating', 'waiting', 'resolved']
type Due = 'all' | 'overdue' | 'today' | 'week'

function dueInfo(t: SupportTask, current: Date) {
  if (!t.dueAt) return null
  const diff = new Date(t.dueAt).getTime() - current.getTime()
  const overdue = diff < 0 && t.status !== 'resolved'
  return { overdue, label: t.status === 'resolved' ? `Hạn ${formatDateTime(t.dueAt)}` : formatDue(t.dueAt, current) }
}

export default function TasksPage() {
  const { dataVersion, bump, openCreateTask } = useOutletContext<AdminOutletContext>()
  const toast = useToast()
  const [params, setParams] = useSearchParams()
  const openId = params.get('task')

  const res = useAsync(() => listTasks(), [dataVersion])
  const [items, setItems] = useState<SupportTask[] | null>(null)
  const [members, setMembers] = useState<AdminMember[]>([])
  useEffect(() => {
    if (res.data) setItems(res.data)
  }, [res.data])
  useEffect(() => {
    listMembers().then(setMembers)
  }, [])

  const [q, setQ] = useState('')
  const [assignee, setAssignee] = useState('all')
  const [severity, setSeverity] = useState<TaskSeverity | 'all'>('all')
  const [source, setSource] = useState<TaskSource | 'all'>('all')
  const [due, setDue] = useState<Due>('all')
  const [mine, setMine] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [over, setOver] = useState<TaskStatus | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [suggestOpen, setSuggestOpen] = useState(false)

  const suggestions = useAsync(() => suggestTasks(), [dataVersion])
  const current = now()
  const me = currentMemberId()

  const filtered = useMemo(() => {
    if (!items) return []
    const term = normalizeVi(q.trim())
    const end = new Date(current)
    return items.filter((t) => {
      if (term && !normalizeVi(`${t.code} ${t.title} ${t.shopName ?? ''} ${t.ownerName ?? ''}`).includes(term)) return false
      if (mine && t.assigneeId !== me) return false
      if (assignee !== 'all' && (assignee === 'none' ? t.assigneeId : t.assigneeId !== assignee)) return false
      if (severity !== 'all' && t.severity !== severity) return false
      if (source !== 'all' && t.source !== source) return false
      if (due !== 'all') {
        if (!t.dueAt) return false
        const d = new Date(t.dueAt).getTime()
        if (due === 'overdue' && !(d < current.getTime() && t.status !== 'resolved')) return false
        if (due === 'today') {
          end.setHours(23, 59, 59, 999)
          if (d < current.getTime() || d > end.getTime()) return false
        }
        if (due === 'week' && (d < current.getTime() || d > current.getTime() + 7 * 86_400_000)) return false
      }
      return true
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, q, mine, assignee, severity, source, due, me])

  const hasFilter = Boolean(q) || mine || assignee !== 'all' || severity !== 'all' || source !== 'all' || due !== 'all'
  const clearFilters = () => {
    setQ('')
    setMine(false)
    setAssignee('all')
    setSeverity('all')
    setSource('all')
    setDue('all')
  }

  const openTask = (id: string | null) => {
    const p = new URLSearchParams(params)
    if (id) p.set('task', id)
    else p.delete('task')
    setParams(p)
  }

  async function patchTask(t: SupportTask, patch: TaskPatch) {
    setSavingId(t.id)
    // cập nhật lạc quan
    const optimistic = {
      ...patch,
      assigneeId: patch.assigneeId === undefined ? t.assigneeId : (patch.assigneeId ?? undefined),
    }
    setItems((l) => l && l.map((x) => (x.id === t.id ? { ...x, ...optimistic } : x)))
    try {
      const saved = await updateTask(t.id, patch, t.version)
      setItems((l) => l && l.map((x) => (x.id === saved.id ? saved : x)))
      if (patch.status) toast.success(`${t.code} → ${TASK_STATUS_LABEL[patch.status]}`)
      bump()
    } catch (e) {
      if (e instanceof ConflictError) {
        setItems((l) => l && l.map((x) => (x.id === e.current.id ? e.current : x)))
        toast.error('Xung đột phiên bản', e.message)
      } else {
        setItems((l) => l && l.map((x) => (x.id === t.id ? t : x)))
        toast.error('Không cập nhật được task', e instanceof Error ? e.message : undefined)
      }
    } finally {
      setSavingId(null)
    }
  }

  const onDrop = (status: TaskStatus) => (e: DragEvent) => {
    e.preventDefault()
    setOver(null)
    const id = e.dataTransfer.getData('text/plain') || dragId
    setDragId(null)
    const t = items?.find((x) => x.id === id)
    if (t && t.status !== status) patchTask(t, { status })
  }

  const memberName = (id?: string) => members.find((m) => m.id === id)?.name
  const selected = items?.find((t) => t.id === openId) ?? null

  return (
    <>
      <div className="kb-filters">
        <div className="filter-group" role="search" aria-label="Lọc task">
          <SearchInput className="grow" value={q} onChange={setQ} label="Tìm task" placeholder="Mã, tiêu đề, cơ sở hoặc chủ cơ sở…" />
          <button type="button" className="chip-toggle" aria-pressed={mine} onClick={() => setMine((v) => !v)}>
            <UserCircle size={16} aria-hidden="true" /> Của tôi
          </button>
          <select className="select" aria-label="Người phụ trách" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="all">Mọi người phụ trách</option>
            <option value="none">Chưa gán</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Mức độ" value={severity} onChange={(e) => setSeverity(e.target.value as TaskSeverity | 'all')}>
            <option value="all">Mọi mức độ</option>
            {(Object.keys(SEVERITY_LABEL) as TaskSeverity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Nguồn" value={source} onChange={(e) => setSource(e.target.value as TaskSource | 'all')}>
            <option value="all">Mọi nguồn</option>
            {(Object.keys(SOURCE_LABEL) as TaskSource[]).map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Hạn xử lý" value={due} onChange={(e) => setDue(e.target.value as Due)}>
            <option value="all">Mọi hạn</option>
            <option value="overdue">Quá hạn</option>
            <option value="today">Đến hạn hôm nay</option>
            <option value="week">Trong 7 ngày</option>
          </select>
          {hasFilter && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters} style={{ alignSelf: 'center' }}>
              Xoá lọc
            </button>
          )}
        </div>
      </div>

      {suggestions.data && suggestions.data.length > 0 && (
        <div className="kb-suggest">
          <span className="list-icon tone-info">
            <Sparkle size={18} aria-hidden="true" />
          </span>
          <div>
            <strong>AI có {suggestions.data.length} đề xuất task</strong>
            <p>Chỉ là bản nháp — không có task nào được tạo cho đến khi bạn xác nhận.</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setSuggestOpen(true)}>
            Xem đề xuất
          </button>
        </div>
      )}

      {res.error ? (
        <div className="panel">
          <ErrorState error={res.error} onRetry={res.reload} title="Không tải được task" />
        </div>
      ) : !items ? (
        <div className="kb" aria-busy="true">
          {COLUMNS.map((c) => (
            <div key={c} className="kb-col">
              <LoadingState variant="list" rows={3} label="Đang tải task…" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="panel">
          <EmptyState
            icon={Kanban}
            title="Chưa có support task"
            description="Tạo task thủ công hoặc xác nhận đề xuất từ AI Support."
            action={
              <button type="button" className="btn btn-primary" onClick={() => openCreateTask()}>
                Tạo task
              </button>
            }
          />
        </div>
      ) : (
        <>
          {hasFilter && filtered.length === 0 && (
            <div className="notice" style={{ marginBottom: 12 }} role="status">
              Không có task khớp bộ lọc.{' '}
              <button type="button" className="link-btn" onClick={clearFilters}>
                Xoá bộ lọc
              </button>
            </div>
          )}
          <div className={`kb${res.loading ? ' dt-loading' : ''}`} aria-label="Bảng Kanban">
            {COLUMNS.map((col) => {
              const list = filtered
                .filter((t) => t.status === col)
                .sort((a, b) => (col === 'resolved' ? b.updatedAt.localeCompare(a.updatedAt) : (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9')))
              return (
                <section
                  key={col}
                  className={`kb-col${over === col ? ' is-over' : ''}`}
                  aria-label={`${TASK_STATUS_LABEL[col]} (${list.length})`}
                  data-col={col}
                  onDragOver={(e) => {
                    e.preventDefault()
                    if (over !== col) setOver(col)
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null)
                  }}
                  onDrop={onDrop(col)}
                >
                  <header className="kb-col-head">
                    <h2 style={{ fontSize: 14, fontWeight: 650 }}>{TASK_STATUS_LABEL[col]}</h2>
                    <span className="count-badge">{list.length}</span>
                  </header>
                  {list.length === 0 && <div className="kb-empty">{dragId ? 'Thả task vào đây' : 'Không có task'}</div>}
                  {list.map((t) => {
                    const d = dueInfo(t, current)
                    const who = memberName(t.assigneeId)
                    return (
                      <button
                        key={t.id}
                        type="button"
                        className="tcard"
                        draggable
                        data-task={t.id}
                        aria-grabbed={dragId === t.id}
                        aria-busy={savingId === t.id}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', t.id)
                          e.dataTransfer.effectAllowed = 'move'
                          setDragId(t.id)
                        }}
                        onDragEnd={() => {
                          setDragId(null)
                          setOver(null)
                        }}
                        onClick={() => openTask(t.id)}
                      >
                        <span className="tcard-top">
                          <span className="tcard-code">{t.code}</span>
                          <SeverityPill severity={t.severity} />
                          {t.source === 'ai' && <SourcePill source="ai" />}
                        </span>
                        <span className="tcard-title">{t.title}</span>
                        {t.shopName && (
                          <span className="tcard-shop">
                            <Storefront size={14} aria-hidden="true" style={{ flex: 'none' }} />
                            <span>
                              {t.shopName}
                              {t.ownerName ? ` · ${t.ownerName}` : ''}
                            </span>
                          </span>
                        )}
                        <span className="tcard-foot">
                          {d ? (
                            <span className={`due${d.overdue ? ' overdue' : ''}`}>
                              <Clock size={14} aria-hidden="true" /> {d.label}
                            </span>
                          ) : (
                            <span>Cập nhật {formatRelative(t.updatedAt, current).toLowerCase()}</span>
                          )}
                          {who ? <Avatar name={who} size={24} title={`Phụ trách: ${who}`} /> : <span style={{ marginLeft: 'auto' }}>Chưa gán</span>}
                        </span>
                      </button>
                    )
                  })}
                </section>
              )
            })}
          </div>
        </>
      )}

      <TaskDrawer
        task={selected}
        members={members}
        saving={savingId === selected?.id}
        onClose={() => openTask(null)}
        onPatch={(patch) => selected && patchTask(selected, patch)}
      />

      <SuggestionModal
        open={suggestOpen}
        drafts={suggestions.data ?? []}
        onClose={() => setSuggestOpen(false)}
        onCreated={(t, duplicated) => {
          if (duplicated) toast.info('Task đã tồn tại', t.code)
          else toast.success(`Đã tạo ${t.code}`, t.title)
          setItems((l) => (l && !l.some((x) => x.id === t.id) ? [t, ...l] : l))
        }}
        onFinish={bump}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */

function TaskDrawer({
  task,
  members,
  saving,
  onClose,
  onPatch,
}: {
  task: SupportTask | null
  members: AdminMember[]
  saving: boolean
  onClose: () => void
  onPatch: (p: TaskPatch) => void
}) {
  const current = now()
  if (!task) return null
  const d = dueInfo(task, current)
  return (
    <DetailDrawer
      open
      onClose={onClose}
      title={task.title}
      subtitle={`${task.code} · tạo ${formatRelative(task.createdAt, current)}`}
      leading={
        <span className="tile">
          <Kanban size={20} aria-hidden="true" />
        </span>
      }
      footer={
        <>
          {task.shopId && (
            <>
              <Link to={`/admin/ai?shop=${task.shopId}`} className="btn btn-outline">
                <ChatCircleDots size={16} /> Hỏi AI
              </Link>
              <Link to={`/admin/customers?tab=shops&shop=${task.shopId}`} className="btn btn-primary">
                Mở cơ sở <ArrowRight size={16} />
              </Link>
            </>
          )}
        </>
      }
    >
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <TaskStatusPill status={task.status} />
        <SeverityPill severity={task.severity} />
        <SourcePill source={task.source} />
        {saving && <span className="spinner" aria-label="Đang lưu" />}
      </div>
      {task.description && <p style={{ lineHeight: 1.6 }}>{task.description}</p>}

      <h3 className="section-title">Trạng thái</h3>
      <div className="status-select" role="group" aria-label="Chuyển trạng thái">
        {COLUMNS.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={task.status === c}
            disabled={saving}
            onClick={() => task.status !== c && onPatch({ status: c })}
          >
            {TASK_STATUS_LABEL[c]}
          </button>
        ))}
      </div>

      <h3 className="section-title">Chi tiết</h3>
      <dl className="kv">
        <dt>
          <label htmlFor="td-assignee">Người phụ trách</label>
        </dt>
        <dd>
          <select
            id="td-assignee"
            className="select"
            value={task.assigneeId ?? ''}
            disabled={saving}
            onChange={(e) => onPatch({ assigneeId: e.target.value || null })}
          >
            <option value="">Chưa gán</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </dd>
        <dt>
          <label htmlFor="td-sev">Mức độ</label>
        </dt>
        <dd>
          <select
            id="td-sev"
            className="select"
            value={task.severity}
            disabled={saving}
            onChange={(e) => onPatch({ severity: e.target.value as TaskSeverity })}
          >
            {(Object.keys(SEVERITY_LABEL) as TaskSeverity[]).map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABEL[s]}
              </option>
            ))}
          </select>
        </dd>
        <dt>Hạn xử lý</dt>
        <dd style={{ color: d?.overdue ? 'var(--danger)' : undefined }}>
          {task.dueAt ? (
            <span className="row" style={{ gap: 6 }}>
              <CalendarBlank size={16} aria-hidden="true" /> {formatDateTime(task.dueAt)} · {d?.label}
            </span>
          ) : (
            'Không đặt hạn'
          )}
        </dd>
        <dt>Cơ sở</dt>
        <dd>{task.shopName ? `${task.shopName}${task.ownerName ? ` · ${task.ownerName}` : ''}` : 'Không gắn cơ sở'}</dd>
        <dt>Cập nhật</dt>
        <dd>
          {formatDateTime(task.updatedAt)} · phiên bản {task.version}
        </dd>
      </dl>

      <h3 className="section-title">Lịch sử (audit)</h3>
      <ol className="tl">
        {[...task.history].reverse().map((h) => (
          <li key={h.id}>
            <span className="tl-dot">
              <Clock size={14} aria-hidden="true" />
            </span>
            <div>
              <p>
                <strong>{h.action}</strong>
                {h.detail ? ` — ${h.detail}` : ''}
              </p>
              <small>
                {h.actor} · {formatDateTime(h.at)}
              </small>
            </div>
          </li>
        ))}
      </ol>
    </DetailDrawer>
  )
}

function SuggestionModal({
  open,
  drafts,
  onClose,
  onCreated,
  onFinish,
}: {
  open: boolean
  drafts: TaskDraft[]
  onClose: () => void
  onCreated: (t: SupportTask, duplicated: boolean) => void
  onFinish: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [done, setDone] = useState<Set<string>>(new Set())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const close = () => {
    if (busy) return
    if (done.size) onFinish()
    setDone(new Set())
    setErrors({})
    onClose()
  }

  async function confirm(d: TaskDraft) {
    setBusy(d.draftId)
    setErrors((e) => ({ ...e, [d.draftId]: '' }))
    try {
      const { task, duplicated } = await createTask(
        {
          title: d.title,
          description: d.description,
          severity: d.severity,
          source: 'ai',
          shopId: d.shopId,
        },
        d.draftId,
      )
      setDone((s) => new Set(s).add(d.draftId))
      onCreated(task, duplicated)
    } catch (e) {
      setErrors((x) => ({
        ...x,
        [d.draftId]: e instanceof Error ? e.message : 'Không tạo được task.',
      }))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title="Đề xuất task từ AI"
      description="Xem lại từng đề xuất. Chỉ đề xuất bạn bấm “Xác nhận” mới trở thành task ở cột Inbox."
      icon={<Sparkle size={20} />}
      footer={
        <button type="button" className="btn btn-outline" onClick={close} disabled={Boolean(busy)}>
          Đóng
        </button>
      }
    >
      <div className="stack" style={{ gap: 10 }}>
        {drafts.map((d) => {
          const ok = done.has(d.draftId)
          return (
            <div key={d.draftId} className={`draft${ok ? ' is-confirmed' : ''}`}>
              <div className="draft-head">
                <strong>{d.title}</strong>
                <SeverityPill severity={d.severity} />
              </div>
              {d.shopName && (
                <span className="scope-line">
                  <Storefront size={14} aria-hidden="true" /> {d.shopName}
                </span>
              )}
              <p>{d.description}</p>
              <p style={{ fontSize: 12 }}>{d.reason}</p>
              {errors[d.draftId] && (
                <div className="notice notice-danger" role="alert">
                  {errors[d.draftId]}
                </div>
              )}
              <div className="row" style={{ gap: 8 }}>
                {ok ? (
                  <span className="pill pill-success">Đã tạo task</span>
                ) : (
                  <button type="button" className="btn btn-primary btn-sm" disabled={Boolean(busy)} onClick={() => confirm(d)}>
                    {busy === d.draftId && <span className="spinner" />} {errors[d.draftId] ? 'Thử lại' : 'Xác nhận'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
