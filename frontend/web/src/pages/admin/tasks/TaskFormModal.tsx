import { NotePencil } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import Modal from '../../../components/Modal'
import { listShops } from '../../../services/accountService'
import { createTask, currentMemberId, listMembers } from '../../../services/taskService'
import { SEVERITY_LABEL, type AdminMember, type CustomerListItem, type SupportTask, type TaskSeverity } from '../../../types'

export interface TaskPrefill {
  title?: string
  description?: string
  shopId?: string
  severity?: TaskSeverity
}

const newKey = () => `manual_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

/** Tạo support task thủ công. Idempotency key sinh 1 lần mỗi lần mở form → bấm nhiều lần không tạo trùng. */
export default function TaskFormModal({
  open,
  prefill,
  onClose,
  onCreated,
}: {
  open: boolean
  prefill?: TaskPrefill
  onClose: () => void
  onCreated: (t: SupportTask) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [shopId, setShopId] = useState('')
  const [severity, setSeverity] = useState<TaskSeverity>('medium')
  const [assigneeId, setAssigneeId] = useState('')
  const [due, setDue] = useState('')
  const [shops, setShops] = useState<CustomerListItem[]>([])
  const [members, setMembers] = useState<AdminMember[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [key, setKey] = useState(newKey)

  useEffect(() => {
    if (!open) return
    setTitle(prefill?.title ?? '')
    setDescription(prefill?.description ?? '')
    setShopId(prefill?.shopId ?? '')
    setSeverity(prefill?.severity ?? 'medium')
    setAssigneeId(currentMemberId())
    setDue('')
    setError(null)
    setTouched(false)
    setKey(newKey())
    listShops({ pageSize: 100, sortBy: 'businessName', sortDir: 'asc' })
      .then((r) => setShops(r.items))
      .catch(() => setShops([]))
    listMembers().then(setMembers)
  }, [open, prefill])

  const titleErr = touched && title.trim().length < 5 ? 'Tiêu đề tối thiểu 5 ký tự.' : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (title.trim().length < 5 || busy) return
    setBusy(true)
    setError(null)
    try {
      const { task } = await createTask(
        {
          title,
          description,
          severity,
          source: 'manual',
          shopId: shopId || undefined,
          assigneeId: assigneeId || undefined,
          dueAt: due ? new Date(due).toISOString() : undefined,
        },
        key,
      )
      onCreated(task)
      onClose()
    } catch (err) {
      // Giữ nguyên dữ liệu đã nhập để thử lại (cùng idempotency key)
      setError(err instanceof Error ? err.message : 'Không tạo được task.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title="Tạo support task"
      description="Task chỉ dùng để theo dõi công việc hỗ trợ, không thay đổi dữ liệu của cơ sở."
      icon={<NotePencil size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="submit" form="task-form" className="btn btn-primary" disabled={busy}>
            {busy && <span className="spinner" />} {error ? 'Thử lại' : 'Tạo task'}
          </button>
        </>
      }
    >
      <form id="task-form" className="auth-form" onSubmit={submit} noValidate>
        {error && (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="t-title">Tiêu đề</label>
          <input
            id="t-title"
            className={`input${titleErr ? ' has-error' : ''}`}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Khách không nhận được OTP"
          />
          {titleErr && <span className="field-error">{titleErr}</span>}
        </div>
        <div className="field">
          <label htmlFor="t-desc">Mô tả</label>
          <textarea
            id="t-desc"
            className="textarea"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Khách báo gì, đã thử những gì…"
          />
        </div>
        <div className="field">
          <label htmlFor="t-shop">Cơ sở liên quan</label>
          <select id="t-shop" className="select" value={shopId} onChange={(e) => setShopId(e.target.value)}>
            <option value="">— Không gắn cơ sở —</option>
            {shops.map((s) => (
              <option key={s.businessId} value={s.businessId}>
                {s.businessName} · {s.owner.fullName}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <span className="field-label" id="t-sev">
            Mức độ
          </span>
          <div className="seg-tabs" role="radiogroup" aria-labelledby="t-sev">
            {(['high', 'medium', 'low'] as TaskSeverity[]).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={severity === s} aria-selected={severity === s} onClick={() => setSeverity(s)}>
                {SEVERITY_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="t-as">Người phụ trách</label>
            <select id="t-as" className="select" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Chưa gán</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="t-due">Hạn xử lý</label>
            <input id="t-due" type="datetime-local" className="input" value={due} onChange={(e) => setDue(e.target.value)} />
          </div>
        </div>
      </form>
    </Modal>
  )
}
