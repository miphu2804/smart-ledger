/**
 * AI Support — danh sách hội thoại | khung chat | ngữ cảnh cơ sở.
 * - Câu trả lời luôn kèm phạm vi dữ liệu, bằng chứng và giới hạn.
 * - Task draft chỉ được tạo khi ADMIN bấm xác nhận (idempotency key = draftId).
 * - Gửi lỗi: giữ nguyên prompt, cho thử lại.
 */
import {
  ArrowClockwise,
  ArrowUp,
  ChatCircleDots,
  CheckCircle,
  Info,
  ListBullets,
  MagnifyingGlass,
  Plus,
  Robot,
  ShieldCheck,
  Sparkle,
  Storefront,
  Trash,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useSearchParams } from 'react-router-dom'
import { MeAvatar, Panel, PlanPill, SeverityPill, StatusPill } from '../../components/admin/ui'
import Modal from '../../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { useToast } from '../../components/Toast'
import { useAsync } from '../../hooks/useAsync'
import { getShopDetail, listShops, now } from '../../services/accountService'
import { SUGGESTED_PROMPTS, confirmedDraftIds, deleteConversation, listConversations, sendMessage } from '../../services/aiService'
import { createTask } from '../../services/taskService'
import type { AiConversation, AiMessage, CustomerListItem, TaskDraft } from '../../types'
import { formatRelative } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

export default function AiSupportPage() {
  const { dataVersion, bump } = useOutletContext<AdminOutletContext>()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const navigate = useNavigate()

  const convs = useAsync(() => listConversations(), [dataVersion])
  const [list, setList] = useState<AiConversation[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(params.get('c'))
  const [shopId, setShopId] = useState<string | undefined>(params.get('shop') ?? undefined)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState<Set<string>>(() => confirmedDraftIds())
  const [review, setReview] = useState<TaskDraft | null>(null)
  const [panes, setPanes] = useState<{ ctx: boolean; list: boolean }>({
    ctx: false,
    list: false,
  })
  const threadRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // đồng bộ danh sách tải về vào state cục bộ (để cập nhật lạc quan khi gửi)
  useEffect(() => {
    if (convs.data) setList(convs.data)
  }, [convs.data])

  const conv = list?.find((c) => c.id === activeId) ?? null

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conv?.messages.length, pending])

  const selectConv = (c: AiConversation | null) => {
    setActiveId(c?.id ?? null)
    setShopId(c?.shopId)
    setSendError(null)
    setPanes((p) => ({ ...p, list: false }))
    const p = new URLSearchParams()
    if (c) p.set('c', c.id)
    if (c?.shopId) p.set('shop', c.shopId)
    setParams(p, { replace: true })
  }

  const chooseShop = (id: string | undefined) => {
    setShopId(id)
    const p = new URLSearchParams(params)
    if (id) p.set('shop', id)
    else p.delete('shop')
    setParams(p, { replace: true })
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || pending) return
    setPending(content)
    setSendError(null)
    setDraft('')
    try {
      const updated = await sendMessage(activeId, content, shopId)
      setList((l) => [updated, ...(l ?? []).filter((c) => c.id !== updated.id)])
      if (updated.id !== activeId) {
        setActiveId(updated.id)
        const p = new URLSearchParams(params)
        p.set('c', updated.id)
        setParams(p, { replace: true })
      }
    } catch (e) {
      // giữ nguyên prompt để thử lại
      setDraft(content)
      setSendError(e instanceof Error ? e.message : 'Không gửi được tin nhắn.')
    } finally {
      setPending(null)
      inputRef.current?.focus()
    }
  }

  async function remove(c: AiConversation) {
    await deleteConversation(c.id)
    setList((l) => (l ?? []).filter((x) => x.id !== c.id))
    if (activeId === c.id) selectConv(null)
    toast.info('Đã xoá hội thoại')
  }

  const layoutClass = `ai${panes.ctx ? ' ctx-open' : ''}${panes.list ? ' list-open' : ''}`
  const current = now()

  return (
    <>
      <div className={layoutClass}>
        {/* ---------- Danh sách hội thoại ---------- */}
        <Panel
          className="ai-col ai-convs"
          title="Hội thoại"
          bodyClass="ai-col"
          actions={
            <button type="button" className="icon-btn" aria-label="Cuộc trò chuyện mới" title="Cuộc trò chuyện mới" onClick={() => selectConv(null)}>
              <Plus size={18} />
            </button>
          }
        >
          {convs.error ? (
            <ErrorState compact error={convs.error} onRetry={convs.reload} title="Không tải được hội thoại" />
          ) : !list ? (
            <div style={{ padding: 12 }}>
              <LoadingState variant="list" rows={4} label="Đang tải hội thoại…" />
            </div>
          ) : list.length === 0 ? (
            <EmptyState compact icon={ChatCircleDots} title="Chưa có hội thoại" description="Đặt câu hỏi đầu tiên ở khung bên cạnh." />
          ) : (
            <ul className="ai-conv-list">
              {list.map((c) => (
                <li key={c.id} className="row" style={{ gap: 2 }}>
                  <button
                    type="button"
                    className={`ai-conv${c.id === activeId ? ' active' : ''}`}
                    aria-current={c.id === activeId || undefined}
                    onClick={() => selectConv(c)}
                  >
                    <strong>{c.title}</strong>
                    <span>
                      {formatRelative(c.updatedAt, current)} · {c.messages.filter((m) => m.role === 'admin').length} câu hỏi
                    </span>
                  </button>
                  <button type="button" className="icon-btn" aria-label={`Xoá hội thoại ${c.title}`} title="Xoá" onClick={() => remove(c)}>
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* ---------- Khung chat ---------- */}
        <section className="panel ai-col ai-chat" aria-label="Khung trò chuyện với AI">
          <header className="panel-head">
            <button
              type="button"
              className="icon-btn show-sm"
              aria-label="Mở danh sách hội thoại"
              onClick={() => setPanes({ ctx: false, list: true })}
            >
              <ListBullets size={20} />
            </button>
            <div>
              <h2>{conv?.title ?? 'Cuộc trò chuyện mới'}</h2>
              <p className="scope-line">
                <ShieldCheck size={14} aria-hidden="true" /> AI chỉ đọc dữ liệu ADMIN được phép xem · không tự tạo hay di chuyển task
              </p>
            </div>
            <div className="head-actions">
              <button
                type="button"
                className="btn btn-outline btn-sm hide-xl"
                aria-label="Ngữ cảnh cơ sở"
                onClick={() => setPanes({ list: false, ctx: true })}
              >
                <Storefront size={16} aria-hidden="true" /> <span>Ngữ cảnh</span>
              </button>
            </div>
          </header>

          <div className="ai-thread" ref={threadRef} aria-live="polite">
            {!conv && !pending ? (
              <div className="ai-welcome">
                <span className="tile" style={{ width: 48, height: 48 }}>
                  <Sparkle size={24} aria-hidden="true" />
                </span>
                <h2>Hôm nay cần hỗ trợ gì?</h2>
                <p>Hỏi về tình trạng tài khoản, đồng bộ, xác minh hoặc hạn mức. AI trả lời kèm bằng chứng và có thể đề xuất task để bạn xác nhận.</p>
                <div className="prompt-grid">
                  {SUGGESTED_PROMPTS.map((p) => (
                    <button key={p} type="button" className="prompt-card" onClick={() => send(p)}>
                      <Sparkle size={16} aria-hidden="true" /> {p}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {conv?.messages.map((m) => (
                  <Message
                    key={m.id}
                    m={m}
                    confirmed={confirmed}
                    onReview={setReview}
                    onOpenShop={(id) => navigate(`/admin/customers?tab=shops&shop=${id}`)}
                  />
                ))}
                {pending && (
                  <>
                    <div className="msg msg-admin">
                      <MeAvatar size={32} />
                      <div className="msg-bubble">{pending}</div>
                    </div>
                    <div className="msg msg-ai" role="status">
                      <span className="msg-avatar">
                        <Robot size={18} aria-hidden="true" />
                      </span>
                      <div className="msg-bubble">
                        <span className="typing" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span className="sr-only">AI đang phân tích…</span>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
          >
            {sendError && (
              <div className="notice notice-danger composer-error" role="alert">
                <WarningCircle size={18} aria-hidden="true" />
                <span style={{ flex: 1 }}>{sendError} Nội dung câu hỏi vẫn được giữ lại.</span>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => send(draft)} disabled={!draft.trim() || Boolean(pending)}>
                  <ArrowClockwise size={14} /> Thử lại
                </button>
              </div>
            )}
            <div className="composer-box">
              <label htmlFor="ai-input" className="sr-only">
                Câu hỏi cho AI
              </label>
              <textarea
                id="ai-input"
                ref={inputRef}
                rows={2}
                value={draft}
                placeholder="Hỏi về đồng bộ, xác minh, hạn mức… (Enter để gửi, Shift+Enter xuống dòng)"
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault()
                    send(draft)
                  }
                }}
              />
              <div className="composer-foot">
                <ScopeChip shopId={shopId} onClear={() => chooseShop(undefined)} onPick={() => setPanes({ list: false, ctx: true })} />
                <button type="submit" className="btn btn-primary btn-sm" disabled={!draft.trim() || Boolean(pending)}>
                  {pending ? <span className="spinner" /> : <ArrowUp size={16} weight="bold" />} Gửi
                </button>
              </div>
            </div>
          </form>
        </section>

        {/* ---------- Ngữ cảnh ---------- */}
        <ContextPanel shopId={shopId} onChoose={chooseShop} onClose={() => setPanes({ ctx: false, list: false })} />
      </div>
      {(panes.ctx || panes.list) && (
        <div className="adm-overlay ai-overlay" onClick={() => setPanes({ ctx: false, list: false })} aria-hidden="true" />
      )}

      <ConfirmDraftModal
        key={review?.draftId ?? 'none'}
        draft={review}
        onClose={() => setReview(null)}
        onDone={(code, duplicated) => {
          setConfirmed(confirmedDraftIds())
          bump()
          if (duplicated) toast.info('Task đã tồn tại', `${code} đã được tạo từ đề xuất này trước đó.`)
          else toast.success(`Đã tạo ${code}`, 'Task nằm ở cột Inbox trên Kanban.')
        }}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */

function Message({
  m,
  confirmed,
  onReview,
  onOpenShop,
}: {
  m: AiMessage
  confirmed: Set<string>
  onReview: (d: TaskDraft) => void
  onOpenShop: (id: string) => void
}) {
  if (m.role === 'admin')
    return (
      <div className="msg msg-admin">
        <MeAvatar size={32} />
        <div className="msg-bubble">{m.content}</div>
      </div>
    )
  return (
    <div className="msg msg-ai">
      <span className="msg-avatar">
        <Robot size={18} aria-hidden="true" />
      </span>
      <div className="msg-card">
        {m.scope && (
          <div className="msg-meta">
            <ShieldCheck size={14} aria-hidden="true" /> Phạm vi: {m.scope}
          </div>
        )}
        <div className="msg-bubble">{m.content}</div>
        {m.evidence && m.evidence.length > 0 && (
          <details className="evidence">
            <summary>
              <MagnifyingGlass size={14} aria-hidden="true" /> Bằng chứng ({m.evidence.length})
            </summary>
            <ul>
              {m.evidence.map((e, i) => (
                <li key={i}>
                  <span>{e.label}</span>
                  {e.shopId ? (
                    <button type="button" onClick={() => onOpenShop(e.shopId!)}>
                      {e.value}
                    </button>
                  ) : (
                    <span>{e.value}</span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {m.limits && m.limits.length > 0 && (
          <div className="limits">
            {m.limits.map((l, i) => (
              <span key={i} className="row" style={{ gap: 6, alignItems: 'flex-start' }}>
                <Info size={14} aria-hidden="true" style={{ marginTop: 2, flex: 'none' }} /> {l}
              </span>
            ))}
          </div>
        )}
        {m.drafts?.map((d) => {
          const done = confirmed.has(d.draftId)
          return (
            <div key={d.draftId} className={`draft${done ? ' is-confirmed' : ''}`}>
              <div className="draft-head">
                <span className="pill pill-info">
                  <Sparkle size={13} weight="bold" aria-hidden="true" /> Task draft
                </span>
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
              <div className="row" style={{ gap: 8 }}>
                {done ? (
                  <span className="pill pill-success">
                    <CheckCircle size={13} weight="bold" aria-hidden="true" /> Đã tạo task
                  </span>
                ) : (
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => onReview(d)}>
                    Xem & xác nhận
                  </button>
                )}
                {done && (
                  <Link to="/admin/tasks" className="btn btn-ghost btn-sm">
                    Mở Kanban
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ScopeChip({ shopId, onClear, onPick }: { shopId?: string; onClear: () => void; onPick: () => void }) {
  const { data } = useAsync(() => (shopId ? listShops({ pageSize: 100 }) : Promise.resolve(null)), [shopId])
  const name = data?.items.find((s) => s.businessId === shopId)?.businessName
  if (!shopId)
    return (
      <button type="button" className="chip-link" onClick={onPick}>
        <ShieldCheck size={14} aria-hidden="true" /> Phạm vi: toàn hệ thống (chỉ dữ liệu hỗ trợ)
      </button>
    )
  return (
    <span className="chip-link" style={{ borderColor: 'var(--accent-strong)' }}>
      <Storefront size={14} aria-hidden="true" /> Phạm vi: {name ?? shopId}
      <button type="button" className="icon-btn" style={{ width: 22, height: 22 }} aria-label="Bỏ ngữ cảnh cơ sở" onClick={onClear}>
        <X size={12} />
      </button>
    </span>
  )
}

function ContextPanel({ shopId, onChoose, onClose }: { shopId?: string; onChoose: (id: string | undefined) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<CustomerListItem[] | null>(null)
  useEffect(() => {
    let alive = true
    const t = setTimeout(() => {
      listShops({ q, pageSize: 6, sortBy: 'lastActiveAt', sortDir: 'desc' })
        .then((r) => alive && setResults(r.items))
        .catch(() => alive && setResults([]))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])
  const detail = useAsync(() => (shopId ? getShopDetail(shopId) : Promise.resolve(null)), [shopId])
  const d = detail.data && detail.data.business.id === shopId ? detail.data : null
  const current = useMemo(() => now(), [])

  return (
    <aside className="panel ai-col ai-context" aria-label="Ngữ cảnh cơ sở">
      <header className="panel-head">
        <div>
          <h2>Ngữ cảnh</h2>
          <p>Chỉ dữ liệu ADMIN được phép xem</p>
        </div>
        <div className="head-actions">
          <button type="button" className="icon-btn ai-ctx-close" aria-label="Đóng ngữ cảnh" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <div className="panel-body">
        {shopId && (
          <div className="stack" style={{ gap: 10, marginBottom: 16 }}>
            {detail.error ? (
              <ErrorState compact error={detail.error} onRetry={detail.reload} />
            ) : !d ? (
              <LoadingState variant="list" rows={2} />
            ) : (
              <>
                <div className="detail-hero" style={{ marginBottom: 0 }}>
                  <span className="shop-mark">
                    <Storefront size={20} aria-hidden="true" />
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ display: 'block' }}>{d.business.name}</strong>
                    <span className="muted" style={{ fontSize: 12.5 }}>
                      {d.owner.fullName} · {d.owner.phone}
                    </span>
                  </div>
                </div>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
                  <StatusPill status={d.owner.status} />
                  <PlanPill plan={d.subscription.plan} />
                </div>
                <dl className="kv">
                  <dt>Đồng bộ</dt>
                  <dd>{d.usage.lastSyncAt ? formatRelative(d.usage.lastSyncAt, current) : 'Chưa có'}</dd>
                  <dt>Lỗi 7 ngày</dt>
                  <dd>{d.usage.syncErrors7d}</dd>
                  <dt>Hạn mức</dt>
                  <dd>{d.subscription.quotaLimit ? `${d.subscription.quotaUsed}/${d.subscription.quotaLimit}` : 'Không giới hạn'}</dd>
                  <dt>App</dt>
                  <dd>{d.devices.map((x) => x.appVersion).join(', ') || '—'}</dd>
                </dl>
                <div className="row" style={{ gap: 8 }}>
                  <Link className="btn btn-outline btn-sm" to={`/admin/customers?tab=shops&shop=${d.business.id}`}>
                    Mở chi tiết
                  </Link>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onChoose(undefined)}>
                    Bỏ chọn
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <h3 className="section-title">{shopId ? 'Đổi cơ sở' : 'Chọn cơ sở để hỏi'}</h3>
        <label className="sr-only" htmlFor="ctx-search">
          Tìm cơ sở
        </label>
        <div className="input-wrap">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input
            id="ctx-search"
            className="input"
            type="search"
            placeholder="Tên cơ sở, chủ, SĐT…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {!results ? (
          <LoadingState variant="list" rows={3} />
        ) : results.length === 0 ? (
          <EmptyState compact search title="Không tìm thấy cơ sở" />
        ) : (
          <ul className="list" style={{ marginTop: 6 }}>
            {results.map((s) => (
              <li key={s.businessId}>
                <button
                  type="button"
                  className="list-item"
                  style={{ paddingInline: 4 }}
                  aria-pressed={s.businessId === shopId}
                  onClick={() => {
                    onChoose(s.businessId)
                    onClose()
                  }}
                >
                  <span className={`list-icon${s.businessId === shopId ? ' tone-success' : ''}`}>
                    {s.businessId === shopId ? <CheckCircle size={16} /> : <Storefront size={16} />}
                  </span>
                  <div>
                    <strong>{s.businessName}</strong>
                    <span>{s.owner.fullName}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="notice" style={{ marginTop: 16 }}>
          <ShieldCheck size={18} aria-hidden="true" />
          <span>
            AI không truy cập hoá đơn, doanh thu, chi phí, công nợ, tồn kho hay thông tin đăng nhập. Câu hỏi có ngữ cảnh cơ sở được ghi nhật ký.
          </span>
        </div>
      </div>
    </aside>
  )
}

function ConfirmDraftModal({
  draft,
  onClose,
  onDone,
}: {
  draft: TaskDraft | null
  onClose: () => void
  onDone: (code: string, duplicated: boolean) => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState(draft?.title ?? '')
  if (!draft) return null

  async function confirm() {
    if (!draft || busy) return
    setBusy(true)
    setError(null)
    try {
      const { task, duplicated } = await createTask(
        {
          title: title.trim() || draft.title,
          description: draft.description,
          severity: draft.severity,
          source: 'ai',
          shopId: draft.shopId,
        },
        draft.draftId,
      )
      onDone(task.code, duplicated)
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tạo được task.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Xác nhận tạo task từ đề xuất AI"
      description="AI chỉ đề xuất. Task chỉ được tạo khi bạn xác nhận; bấm nhiều lần cũng không tạo trùng."
      icon={<Sparkle size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy}>
            {busy && <span className="spinner" />} {error ? 'Thử lại' : 'Xác nhận tạo task'}
          </button>
        </>
      }
    >
      <div className="auth-form">
        {error && (
          <div className="notice notice-danger" role="alert">
            {error}
          </div>
        )}
        <div className="field">
          <label htmlFor="draft-title">Tiêu đề</label>
          <input id="draft-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <dl className="kv">
          <dt>Cơ sở</dt>
          <dd>{draft.shopName ?? 'Không gắn cơ sở'}</dd>
          <dt>Mức độ</dt>
          <dd>
            <SeverityPill severity={draft.severity} />
          </dd>
          <dt>Mô tả</dt>
          <dd>{draft.description}</dd>
          <dt>Căn cứ</dt>
          <dd>{draft.reason}</dd>
          <dt>Cột</dt>
          <dd>Inbox</dd>
        </dl>
      </div>
    </Modal>
  )
}
