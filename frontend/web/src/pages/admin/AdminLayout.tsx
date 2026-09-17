import {
  Bell,
  CaretUpDown,
  ChatCircleDots,
  Flask,
  GearSix,
  Kanban,
  List,
  MagnifyingGlass,
  Plus,
  ArrowCounterClockwise,
  SidebarSimple,
  SignOut,
  Sparkle,
  SquaresFour,
  Storefront,
  User,
  UserCircle,
  X,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, BrandMark, MeAvatar } from '../../components/admin/ui'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { USE_MOCK } from '../../config'
import { SCENARIO_LABEL, getScenario, setScenario, subscribeScenario, type MockScenario } from '../../mocks/scenario'
import { getOverview, quickSearch, resetMockData } from '../../services/accountService'
import { getSession, logout } from '../../services/authService'
import { resetPreferencesCache, setPreferences, usePreferences } from '../../services/preferences'
import { listTasks } from '../../services/taskService'
import type { AdminUserItem, AttentionItem, CustomerListItem } from '../../types'
import { formatDate, formatRelative } from '../../utils/format'
import '@fontsource-variable/geist'
import '../../styles/admin.css'
import TaskFormModal, { type TaskPrefill } from './tasks/TaskFormModal'

export interface AdminOutletContext {
  /** Tăng khi dữ liệu mẫu được khôi phục hoặc có task mới → các trang tải lại */
  dataVersion: number
  bump: () => void
  openCreateTask: (prefill?: TaskPrefill) => void
}

const META: { match: (p: string) => boolean; title: string; sub?: string }[] = [
  { match: (p) => p === '/admin' || p === '/admin/', title: 'Dashboard' },
  {
    match: (p) => p.startsWith('/admin/customers'),
    title: 'Khách hàng',
    sub: 'OWNER và cơ sở · chỉ đọc',
  },
  {
    match: (p) => p.startsWith('/admin/ai'),
    title: 'AI Support',
    sub: 'Phân tích & đề xuất — ADMIN xác nhận trước khi tạo task',
  },
  {
    match: (p) => p.startsWith('/admin/tasks'),
    title: 'Tasks',
    sub: 'Kanban hỗ trợ khách hàng',
  },
  {
    match: (p) => p.startsWith('/admin/settings'),
    title: 'Cài đặt',
    sub: 'Tuỳ chọn cá nhân · quyền chỉ đọc',
  },
]

function useResolvedTheme(theme: 'light' | 'system') {
  const [dark, setDark] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => setDark(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return theme === 'system' && dark ? 'dark' : 'light'
}

export default function AdminLayout() {
  const session = getSession()
  const prefs = usePreferences()
  const theme = useResolvedTheme(prefs.theme)
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const toast = useToast()
  const scenario = useSyncExternalStore(subscribeScenario, getScenario)

  const [navOpen, setNavOpen] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [openTasks, setOpenTasks] = useState<number | null>(null)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [taskModal, setTaskModal] = useState<{
    open: boolean
    prefill?: TaskPrefill
  }>({ open: false })

  const bump = useCallback(() => setDataVersion((v) => v + 1), [])
  const openCreateTask = useCallback((prefill?: TaskPrefill) => setTaskModal({ open: true, prefill }), [])

  useEffect(() => setNavOpen(false), [pathname])
  useEffect(() => {
    listTasks()
      .then((t) => setOpenTasks(t.filter((x) => x.status !== 'resolved').length))
      .catch(() => setOpenTasks(null))
  }, [dataVersion, pathname])

  const meta: { title: string; sub?: string } = META.find((m) => m.match(pathname)) ?? { title: 'Quản trị' }
  const subtitle = meta.sub ?? `Tổng quan hỗ trợ · ${formatDate(new Date().toISOString())}`

  useEffect(() => {
    document.title = `${meta.title} · Admin Sổ Nghe Lời`
  }, [meta.title])

  async function onLogout() {
    await logout()
    resetPreferencesCache()
    navigate('/admin/login', { replace: true })
  }

  async function onReset() {
    setResetting(true)
    await resetMockData()
    setResetting(false)
    setResetOpen(false)
    bump()
    toast.success('Đã khôi phục dữ liệu mẫu')
  }

  const collapsed = prefs.sidebarCollapsed
  const nav = [
    { to: '/admin', end: true, label: 'Dashboard', icon: SquaresFour },
    { to: '/admin/customers', label: 'Khách hàng', icon: Storefront },
    { to: '/admin/ai', label: 'AI Support', icon: ChatCircleDots },
    { to: '/admin/tasks', label: 'Tasks', icon: Kanban, badge: openTasks },
  ]

  return (
    <div className="adm" data-theme={theme} data-density={prefs.density}>
      <a href="#main" className="skip-link">
        Bỏ qua điều hướng
      </a>
      <div className={`shell${collapsed ? ' is-collapsed' : ''}${navOpen ? ' nav-open' : ''}`}>
        <aside className="sb" aria-label="Điều hướng quản trị">
          <div className="sb-brand">
            <BrandMark />
            <div className="sb-brand-text">
              <strong>Sổ Nghe Lời</strong>
              <span>Admin workspace</span>
            </div>
            <CaretUpDown size={16} className="ico-chev" aria-hidden="true" />
          </div>

          <nav className="sb-group" aria-label="Workspace">
            <span className="sb-label">Workspace</span>
            <span className="sb-label-sep" aria-hidden="true" />
            {nav.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className="sb-item" title={n.label}>
                <n.icon size={20} aria-hidden="true" />
                <span className="sb-item-label">{n.label}</span>
                {n.badge ? (
                  <>
                    <span className="count-badge" aria-label={`${n.badge} task đang mở`}>
                      {n.badge}
                    </span>
                    <span className="dot-badge" aria-hidden="true" />
                  </>
                ) : null}
              </NavLink>
            ))}
          </nav>

          <div className="sb-spacer" />

          <div className="sb-foot">
            {USE_MOCK && (
              <div className="sb-mock">
                <strong>
                  <Flask size={14} /> Dữ liệu mẫu
                </strong>
                <label className="sr-only" htmlFor="mock-scn">
                  Giả lập API
                </label>
                <select id="mock-scn" className="select" value={scenario} onChange={(e) => setScenario(e.target.value as MockScenario)}>
                  {(Object.keys(SCENARIO_LABEL) as MockScenario[]).map((k) => (
                    <option key={k} value={k}>
                      API: {SCENARIO_LABEL[k]}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setResetOpen(true)}>
                  <ArrowCounterClockwise size={15} /> Khôi phục dữ liệu mẫu
                </button>
              </div>
            )}
            <span className="sb-label">Hệ thống</span>
            <NavLink to="/admin/settings" className="sb-item" title="Cài đặt">
              <GearSix size={20} aria-hidden="true" />
              <span className="sb-item-label">Cài đặt</span>
            </NavLink>
            <button
              type="button"
              className="sb-item sb-collapse"
              onClick={() => setPreferences({ sidebarCollapsed: !collapsed })}
              aria-pressed={collapsed}
              title={collapsed ? 'Mở rộng thanh bên' : 'Thu gọn thanh bên'}
            >
              <SidebarSimple size={20} aria-hidden="true" />
              <span className="sb-item-label">Thu gọn</span>
            </button>
            <div className="sb-user">
              <MeAvatar size={32} />
              <div>
                <strong>{prefs.displayName}</strong>
                <span>{session?.user.role}</span>
              </div>
              <button type="button" className="icon-btn icon-btn-sm" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất">
                <SignOut size={18} />
              </button>
            </div>
          </div>
        </aside>
        <div className="sb-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />

        <div className="main">
          <header className="tb">
            <button type="button" className="icon-btn tb-burger" onClick={() => setNavOpen(true)} aria-label="Mở menu">
              <List size={20} />
            </button>
            <div className="tb-title">
              <h1>{meta.title}</h1>
              <p>{subtitle}</p>
            </div>
            <div className="tb-right">
              <GlobalSearch
                onOpenShop={(id) => navigate(`/admin/customers?tab=shops&shop=${id}`)}
                onOpenUser={(id) => navigate(`/admin/customers?tab=owners&owner=${id}`)}
              />
              <Link to="/admin/ai" className="icon-btn tb-hide-md" aria-label="Hỏi AI Support" title="Hỏi AI Support">
                <Sparkle size={20} />
              </Link>
              <Notifications dataVersion={dataVersion} />
              <button type="button" className="btn btn-primary tb-primary" onClick={() => openCreateTask()} aria-label="Tạo task">
                <Plus size={18} weight="bold" /> <span>Tạo task</span>
              </button>
              <UserMenu onLogout={onLogout} />
            </div>
          </header>

          <main id="main" className="content" tabIndex={-1}>
            <Outlet
              context={
                {
                  dataVersion,
                  bump,
                  openCreateTask,
                } satisfies AdminOutletContext
              }
            />
          </main>
        </div>
      </div>

      <TaskFormModal
        open={taskModal.open}
        prefill={taskModal.prefill}
        onClose={() => setTaskModal({ open: false })}
        onCreated={(t) => {
          bump()
          toast.success(`Đã tạo ${t.code}`, t.title)
        }}
      />

      <Modal
        open={resetOpen}
        onClose={() => !resetting && setResetOpen(false)}
        title="Khôi phục dữ liệu mẫu?"
        description="Task, hội thoại AI, nhật ký và dữ liệu khách hàng mẫu sẽ trở về trạng thái ban đầu."
        size="sm"
        icon={<ArrowCounterClockwise size={20} />}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Huỷ
            </button>
            <button type="button" className="btn btn-primary" onClick={onReset} disabled={resetting} data-autofocus>
              {resetting && <span className="spinner" />} Khôi phục
            </button>
          </>
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function useClickOutside(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, close])
  return ref
}

function GlobalSearch({ onOpenShop, onOpenUser }: { onOpenShop: (id: string) => void; onOpenUser: (id: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [res, setRes] = useState<{
    users: AdminUserItem[]
    shops: CustomerListItem[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    setMobileOpen(false)
  }, [])
  const ref = useClickOutside(open || mobileOpen, close)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setMobileOpen(true)
        inputRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) {
      setRes(null)
      return
    }
    let alive = true
    setLoading(true)
    const t = setTimeout(() => {
      quickSearch(term)
        .then((r) => alive && (setRes(r), setErr(false)))
        .catch(() => alive && setErr(true))
        .finally(() => alive && setLoading(false))
    }, 250)
    return () => {
      alive = false
      clearTimeout(t)
    }
  }, [q])

  const pick = (fn: () => void) => {
    fn()
    setQ('')
    close()
  }

  return (
    <>
      <button
        type="button"
        className="icon-btn tb-search-btn"
        aria-label="Tìm kiếm"
        onClick={() => {
          setMobileOpen(true)
          setTimeout(() => inputRef.current?.focus())
        }}
      >
        <MagnifyingGlass size={20} />
      </button>
      <div className={`tb-search${mobileOpen ? ' is-open' : ''}`} ref={ref} role="search">
        <div className="input-wrap">
          <MagnifyingGlass size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            className="input"
            type="search"
            placeholder="Tìm OWNER, email, SĐT, cơ sở…"
            aria-label="Tìm OWNER hoặc cơ sở"
            value={q}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.target.value)
              setOpen(true)
            }}
          />
          <kbd aria-hidden="true">⌘K</kbd>
        </div>
        {open && q.trim().length >= 2 && (
          <div className="popover" role="listbox" aria-label="Kết quả tìm kiếm">
            {loading && !res ? (
              <div className="pop-empty">Đang tìm…</div>
            ) : err ? (
              <div className="pop-empty">Không tìm được, thử lại sau.</div>
            ) : res && res.users.length + res.shops.length === 0 ? (
              <div className="pop-empty">Không có kết quả cho “{q.trim()}”.</div>
            ) : res ? (
              <>
                {res.users.length > 0 && <div className="pop-label">Chủ cơ sở</div>}
                {res.users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="pop-item"
                    onClick={() => pick(() => onOpenUser(u.id))}
                  >
                    <Avatar name={u.fullName} size={30} />
                    <div>
                      <strong>{u.fullName}</strong>
                      <span>
                        {u.phone} · {u.email ?? 'chưa có email'}
                      </span>
                    </div>
                  </button>
                ))}
                {res.shops.length > 0 && <div className="pop-label">Cơ sở</div>}
                {res.shops.map((s) => (
                  <button
                    key={s.businessId}
                    type="button"
                    role="option"
                    aria-selected="false"
                    className="pop-item"
                    onClick={() => pick(() => onOpenShop(s.businessId))}
                  >
                    <span className="shop-mark">
                      <Storefront size={18} />
                    </span>
                    <div>
                      <strong>{s.businessName}</strong>
                      <span>
                        {s.owner.fullName} · {s.industry}
                      </span>
                    </div>
                  </button>
                ))}
              </>
            ) : null}
          </div>
        )}
        {mobileOpen && (
          <button type="button" className="icon-btn sr-only" onClick={close} aria-label="Đóng tìm kiếm">
            <X />
          </button>
        )}
      </div>
    </>
  )
}

function Notifications({ dataVersion }: { dataVersion: number }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<AttentionItem[] | null>(null)
  const [count, setCount] = useState(0)
  const navigate = useNavigate()
  const ref = useClickOutside(open, () => setOpen(false))

  useEffect(() => {
    getOverview(7)
      .then((o) => {
        setItems(o.needsAttention)
        setCount(o.needsAttention.filter((a) => a.kind === 'overdue_task' || a.kind === 'sync_error').length)
      })
      .catch(() => setItems([]))
  }, [dataVersion])

  return (
    <div className="rel" ref={ref}>
      <button
        type="button"
        className="icon-btn"
        aria-label={`Thông báo${count ? `, ${count} mục cần chú ý` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={20} />
        {count > 0 && <span className="notif-dot">{count > 9 ? '9+' : count}</span>}
      </button>
      {open && (
        <div className="popover" role="menu">
          <div className="pop-label">Cần chú ý</div>
          {!items ? (
            <div className="pop-empty">Đang tải…</div>
          ) : items.length === 0 ? (
            <div className="pop-empty">Không có mục nào cần chú ý.</div>
          ) : (
            items.slice(0, 6).map((a) => (
              <button
                key={a.id}
                type="button"
                role="menuitem"
                className="pop-item"
                onClick={() => {
                  setOpen(false)
                  navigate(a.taskId ? `/admin/tasks?task=${a.taskId}` : `/admin/customers?tab=shops&shop=${a.shopId}`)
                }}
              >
                <div>
                  <strong>{a.title}</strong>
                  <span>
                    {a.detail} · {formatRelative(a.at, new Date())}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useClickOutside(open, () => setOpen(false))
  const prefs = usePreferences()
  const s = getSession()
  const navigate = useNavigate()
  return (
    <div className="rel" ref={ref}>
      <button
        type="button"
        className="avatar-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Tài khoản"
        onClick={() => setOpen((v) => !v)}
      >
        <MeAvatar size={36} />
      </button>
      {open && (
        <div className="popover" role="menu" style={{ width: 260 }}>
          <div className="pop-item" style={{ cursor: 'default' }}>
            <MeAvatar size={36} />
            <div>
              <strong>{prefs.displayName}</strong>
              <span>
                {s?.user.email} · {s?.user.role}
              </span>
            </div>
          </div>
          <div className="pop-sep" />
          <button type="button" role="menuitem" className="pop-item" onClick={() => (setOpen(false), navigate('/admin/settings/profile'))}>
            <UserCircle size={18} /> Hồ sơ
          </button>
          <button type="button" role="menuitem" className="pop-item" onClick={() => (setOpen(false), navigate('/admin/settings/security'))}>
            <User size={18} /> Phiên & quyền truy cập
          </button>
          <div className="pop-sep" />
          <button type="button" role="menuitem" className="pop-item danger" onClick={onLogout}>
            <SignOut size={18} /> Đăng xuất
          </button>
        </div>
      )}
    </div>
  )
}
