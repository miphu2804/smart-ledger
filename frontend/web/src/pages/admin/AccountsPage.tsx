import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  Eye,
  FilterX,
  KeyRound,
  MessageSquareMore,
  MoreHorizontal,
  PencilLine,
  Plus,
  Search,
  SearchX,
  Trash2,
  Unlock,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import { Avatar, PlanBadge, QuotaBar, StatusBadge } from '../../components/Badges'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import {
  changePlan,
  deleteAccount,
  exportAccounts,
  listAccounts,
  now,
  sendPasswordReset,
  setAccountStatus,
} from '../../services/accountService'
import {
  INDUSTRIES,
  LOGIN_METHOD_LABEL,
  PLAN_LABEL,
  STATUS_LABEL,
  type Account,
  type AccountQuery,
  type AccountSortKey,
  type AccountStatus,
  type Industry,
  type Paged,
  type PlanId,
  type SortDir,
} from '../../types'
import { downloadCSV } from '../../utils/csv'
import { formatDate, formatDateTime, formatRelative, toDateKey } from '../../utils/format'
import AccountDetailDrawer from './AccountDetailDrawer'
import AccountFormModal from './AccountFormModal'
import type { AdminOutletContext } from './AdminLayout'

const PAGE_SIZE = 10

const SORT_OPTIONS: { value: `${AccountSortKey}-${SortDir}`; label: string }[] = [
  { value: 'createdAt-desc', label: 'Mới tạo nhất' },
  { value: 'createdAt-asc', label: 'Cũ nhất' },
  { value: 'lastActiveAt-desc', label: 'Hoạt động gần đây' },
  { value: 'lastActiveAt-asc', label: 'Lâu không hoạt động' },
  { value: 'ordersThisMonth-desc', label: 'Nhiều đơn nhất' },
  { value: 'ordersThisMonth-asc', label: 'Ít đơn nhất' },
  { value: 'storeName-asc', label: 'Tên cửa hàng A → Z' },
  { value: 'storeName-desc', label: 'Tên cửa hàng Z → A' },
]

type Dialog =
  | { kind: 'lock'; ids: string[]; names: string[] }
  | { kind: 'unlock'; ids: string[]; names: string[] }
  | { kind: 'activate'; account: Account }
  | { kind: 'plan'; account: Account }
  | { kind: 'delete'; account: Account }
  | null

/* ---------- Menu hành động theo hàng (định vị fixed để không bị cắt) ---------- */
function RowMenu({
  account,
  anchor,
  onClose,
  onAction,
}: {
  account: Account
  anchor: HTMLElement
  onClose: () => void
  onAction: (action: string, a: Account) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.getBoundingClientRect()
      const el = ref.current
      const w = el?.offsetWidth ?? 220
      const h = el?.offsetHeight ?? 300
      let top = r.bottom + 6
      if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6)
      const left = Math.min(Math.max(8, r.right - w), window.innerWidth - w - 8)
      setPos({ top, left })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [anchor])

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        anchor.focus()
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [anchor, onClose])

  const item = (action: string, icon: ReactNode, label: string, danger = false) => (
    <button
      type="button"
      role="menuitem"
      className={`menu-item${danger ? ' danger' : ''}`}
      onClick={() => {
        onClose()
        onAction(action, account)
      }}
    >
      {icon} {label}
    </button>
  )

  return (
    <div
      ref={ref}
      className="menu row-menu"
      role="menu"
      aria-label={`Thao tác cho ${account.storeName}`}
      style={pos ? { top: pos.top, left: pos.left } : { visibility: 'hidden', top: 0, left: 0 }}
    >
      {item('view', <Eye size={16} />, 'Xem chi tiết')}
      {item('edit', <PencilLine size={16} />, 'Sửa thông tin')}
      {item('plan', <CreditCard size={16} />, 'Đổi gói')}
      <div className="menu-sep" />
      {account.loginMethod === 'phone' || account.status === 'pending'
        ? item('otp', <MessageSquareMore size={16} />, 'Gửi lại mã OTP')
        : null}
      {item('reset', <KeyRound size={16} />, 'Đặt lại mật khẩu')}
      <div className="menu-sep" />
      {account.status === 'pending' && item('activate', <BadgeCheck size={16} />, 'Xác minh & kích hoạt')}
      {account.status === 'locked'
        ? item('unlock', <Unlock size={16} />, 'Mở khoá')
        : item('lock', <Ban size={16} />, 'Khoá tài khoản', true)}
      {item('delete', <Trash2 size={16} />, 'Xoá tài khoản', true)}
    </div>
  )
}

function SortHeader({
  label,
  k,
  sortBy,
  sortDir,
  onSort,
  wrap = false,
}: {
  wrap?: boolean
  label: string
  k: AccountSortKey
  sortBy: AccountSortKey
  sortDir: SortDir
  onSort: (k: AccountSortKey) => void
}) {
  const active = sortBy === k
  return (
    <th className={wrap ? 'th-wrap' : undefined} aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort${active ? ' is-active' : ''}`} onClick={() => onSort(k)}>
        {label}
        {active ? sortDir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} /> : <ArrowUpDown size={14} />}
      </button>
    </th>
  )
}

function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(total - 1, page + 1)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('…')
  out.push(total)
  return out
}

export default function AccountsPage() {
  const { dataVersion } = useOutletContext<AdminOutletContext>()
  const toast = useToast()
  const [params, setParams] = useSearchParams()

  // ----- Bộ lọc lấy từ URL -----
  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? 'all') as AccountStatus | 'all'
  const plan = (params.get('plan') ?? 'all') as PlanId | 'all'
  const industry = (params.get('industry') ?? 'all') as Industry | 'all'
  const sortRaw = params.get('sort') ?? 'createdAt-desc'
  const [sortBy, sortDir] = (SORT_OPTIONS.some((o) => o.value === sortRaw) ? sortRaw : 'createdAt-desc').split('-') as [
    AccountSortKey,
    SortDir,
  ]
  const page = Math.max(1, Number(params.get('page')) || 1)

  const query = useMemo<AccountQuery>(
    () => ({ search: q, status, plan, industry, sortBy, sortDir, page, pageSize: PAGE_SIZE }),
    [q, status, plan, industry, sortBy, sortDir, page],
  )

  const updateParams = useCallback(
    (patch: Record<string, string | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === '' || v === 'all') next.delete(k)
            else next.set(k, v)
          }
          if (resetPage) next.delete('page')
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  // Ô tìm kiếm có debounce
  const [searchText, setSearchText] = useState(q)
  useEffect(() => setSearchText(q), [q])
  useEffect(() => {
    if (searchText === q) return
    const t = setTimeout(() => updateParams({ q: searchText.trim() || null }), 300)
    return () => clearTimeout(t)
  }, [searchText, q, updateParams])

  // ----- Dữ liệu -----
  const [data, setData] = useState<Paged<Account> | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    document.title = 'Tài khoản · Quản trị Sổ Nghe Lời'
  }, [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    setLoadError(null)
    listAccounts(query)
      .then((res) => {
        if (!alive) return
        setData(res)
        if (res.page !== page) updateParams({ page: res.page > 1 ? String(res.page) : null }, false)
      })
      .catch((e: unknown) => alive && setLoadError(e instanceof Error ? e.message : 'Không tải được danh sách'))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [query, refresh, dataVersion, page, updateParams])

  const reload = () => setRefresh((v) => v + 1)

  // ----- Chọn nhiều -----
  const [selected, setSelected] = useState<Map<string, string>>(new Map())
  useEffect(() => {
    setSelected(new Map())
  }, [q, status, plan, industry, dataVersion])

  const items = data?.items ?? []
  const allOnPage = items.length > 0 && items.every((a) => selected.has(a.id))
  const someOnPage = items.some((a) => selected.has(a.id))
  const headerCb = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (headerCb.current) headerCb.current.indeterminate = someOnPage && !allOnPage
  }, [someOnPage, allOnPage])

  function toggleAll() {
    setSelected((prev) => {
      const next = new Map(prev)
      if (allOnPage) items.forEach((a) => next.delete(a.id))
      else items.forEach((a) => next.set(a.id, a.storeName))
      return next
    })
  }
  function toggleOne(a: Account) {
    setSelected((prev) => {
      const next = new Map(prev)
      if (next.has(a.id)) next.delete(a.id)
      else next.set(a.id, a.storeName)
      return next
    })
  }

  // ----- Menu, drawer, modal -----
  const [menu, setMenu] = useState<{ account: Account; anchor: HTMLElement } | null>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const [detailId, setDetailId] = useState<string | null>(null)
  const [detailVersion, setDetailVersion] = useState(0)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [dialog, setDialog] = useState<Dialog>(null)
  const [reason, setReason] = useState('')
  const [planChoice, setPlanChoice] = useState<PlanId>('basic')
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    if (dataVersion) setDetailId(null)
  }, [dataVersion])

  function afterMutation() {
    reload()
    setDetailVersion((v) => v + 1)
  }

  function openDialog(d: Exclude<Dialog, null>) {
    setReason('')
    if (d.kind === 'plan') setPlanChoice(d.account.plan)
    setDialog(d)
  }

  async function onRowAction(action: string, a: Account) {
    switch (action) {
      case 'view':
        setDetailId(a.id)
        break
      case 'edit':
        setEditing(a)
        setFormOpen(true)
        break
      case 'plan':
        openDialog({ kind: 'plan', account: a })
        break
      case 'lock':
        openDialog({ kind: 'lock', ids: [a.id], names: [a.storeName] })
        break
      case 'unlock':
        openDialog({ kind: 'unlock', ids: [a.id], names: [a.storeName] })
        break
      case 'activate':
        openDialog({ kind: 'activate', account: a })
        break
      case 'delete':
        openDialog({ kind: 'delete', account: a })
        break
      case 'reset':
      case 'otp':
        try {
          await sendPasswordReset(a.id, action === 'otp' ? 'otp' : 'password')
          toast.success(
            action === 'otp' ? 'Đã gửi lại mã OTP' : 'Đã gửi liên kết đặt lại mật khẩu',
            `Tới ${a.phone} · ${a.storeName}`,
          )
        } catch (e) {
          toast.error('Gửi không thành công', e instanceof Error ? e.message : undefined)
        }
        break
    }
  }

  async function confirmDialog() {
    if (!dialog) return
    setBusy(true)
    try {
      if (dialog.kind === 'lock' || dialog.kind === 'unlock') {
        const target: AccountStatus = dialog.kind === 'lock' ? 'locked' : 'active'
        const changed = await setAccountStatus(dialog.ids, target, dialog.kind === 'lock' ? reason : undefined)
        const n = changed.length
        toast.success(
          dialog.kind === 'lock' ? `Đã khoá ${n} tài khoản` : `Đã mở khoá ${n} tài khoản`,
          n === 1 ? changed[0].storeName : n === 0 ? 'Không có tài khoản nào cần thay đổi' : undefined,
        )
        setSelected((prev) => {
          const next = new Map(prev)
          dialog.ids.forEach((id) => next.delete(id))
          return next
        })
      } else if (dialog.kind === 'activate') {
        await setAccountStatus([dialog.account.id], 'active')
        toast.success('Đã kích hoạt tài khoản', dialog.account.storeName)
      } else if (dialog.kind === 'plan') {
        if (planChoice === dialog.account.plan) {
          setDialog(null)
          return
        }
        await changePlan(dialog.account.id, planChoice)
        toast.success('Đã đổi gói', `${dialog.account.storeName}: ${PLAN_LABEL[dialog.account.plan]} → ${PLAN_LABEL[planChoice]}`)
      } else if (dialog.kind === 'delete') {
        await deleteAccount(dialog.account.id)
        toast.success('Đã xoá tài khoản', dialog.account.storeName)
        if (detailId === dialog.account.id) setDetailId(null)
        setSelected((prev) => {
          const next = new Map(prev)
          next.delete(dialog.account.id)
          return next
        })
      }
      setDialog(null)
      afterMutation()
    } catch (e) {
      toast.error('Thao tác thất bại', e instanceof Error ? e.message : undefined)
    } finally {
      setBusy(false)
    }
  }

  async function onExport() {
    setExporting(true)
    try {
      const rows = await exportAccounts({ ...query, page: undefined, pageSize: undefined })
      downloadCSV(
        `tai-khoan-songheloi-${toDateKey(now())}.csv`,
        ['Mã', 'Cửa hàng', 'Chủ cửa hàng', 'SĐT', 'Email', 'Ngành hàng', 'Địa chỉ', 'Gói', 'Trạng thái', 'Lý do khoá', 'Đăng nhập bằng', 'Đơn tháng này', 'Hạn mức', 'Tỉ lệ đơn giọng nói (%)', 'Nhân viên', 'Ngày tạo', 'Hoạt động gần nhất'],
        rows.map((a) => [
          a.id,
          a.storeName,
          a.ownerName,
          a.phone,
          a.email ?? '',
          a.industry,
          a.address,
          PLAN_LABEL[a.plan],
          STATUS_LABEL[a.status],
          a.lockReason ?? '',
          LOGIN_METHOD_LABEL[a.loginMethod],
          a.ordersThisMonth,
          a.orderQuota ?? 'Không giới hạn',
          Math.round(a.voiceOrderRatio * 100),
          a.staffCount,
          formatDate(a.createdAt),
          formatDateTime(a.lastActiveAt),
        ]),
      )
      toast.success('Đã xuất CSV', `${rows.length} tài khoản theo bộ lọc hiện tại`)
    } catch (e) {
      toast.error('Xuất CSV thất bại', e instanceof Error ? e.message : undefined)
    } finally {
      setExporting(false)
    }
  }

  function onSort(k: AccountSortKey) {
    const dir: SortDir = sortBy === k ? (sortDir === 'asc' ? 'desc' : 'asc') : k === 'storeName' ? 'asc' : 'desc'
    updateParams({ sort: `${k}-${dir}` })
  }

  const hasFilters = Boolean(q) || status !== 'all' || plan !== 'all' || industry !== 'all'
  const current = now()
  const selectedIds = [...selected.keys()]

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Quản lý tài khoản</h1>
          <p>Tài khoản cửa hàng đăng ký Sổ Nghe Lời</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-outline" onClick={onExport} disabled={exporting || !data?.total}>
            {exporting ? <span className="spinner" /> : <Download size={17} />} Xuất CSV
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            <Plus size={18} /> Thêm tài khoản
          </button>
        </div>
      </div>

      <div className="card card-flush">
        <div className="filters">
          <div className="input-wrap filters-search">
            <Search size={18} />
            <input
              type="search"
              className="input"
              placeholder="Tìm theo tên, SĐT, email…"
              aria-label="Tìm tài khoản"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <select className="select" aria-label="Lọc theo trạng thái" value={status} onChange={(e) => updateParams({ status: e.target.value })}>
            <option value="all">Mọi trạng thái</option>
            <option value="active">Hoạt động</option>
            <option value="locked">Bị khoá</option>
            <option value="pending">Chờ xác minh</option>
          </select>
          <select className="select" aria-label="Lọc theo gói" value={plan} onChange={(e) => updateParams({ plan: e.target.value })}>
            <option value="all">Mọi gói</option>
            <option value="basic">Cơ bản</option>
            <option value="pro">Pro</option>
          </select>
          <select className="select" aria-label="Lọc theo ngành hàng" value={industry} onChange={(e) => updateParams({ industry: e.target.value })}>
            <option value="all">Mọi ngành hàng</option>
            {INDUSTRIES.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
          <select className="select" aria-label="Sắp xếp" value={`${sortBy}-${sortDir}`} onChange={(e) => updateParams({ sort: e.target.value })}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              className="btn btn-ghost filters-clear"
              onClick={() => {
                setSearchText('')
                updateParams({ q: null, status: null, plan: null, industry: null })
              }}
            >
              <FilterX size={16} /> Xoá lọc
            </button>
          )}
        </div>

        <div className={`bulkbar${selected.size ? ' is-visible' : ''}`} aria-live="polite">
          {selected.size > 0 && (
            <>
              <span className="bulk-count">
                Đã chọn <b>{selected.size}</b> tài khoản
              </span>
              <div className="bulk-actions">
                <button
                  type="button"
                  className="btn btn-sm btn-outline danger-text"
                  onClick={() => openDialog({ kind: 'lock', ids: selectedIds, names: [...selected.values()] })}
                >
                  <Ban size={15} /> Khoá
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline"
                  onClick={() => openDialog({ kind: 'unlock', ids: selectedIds, names: [...selected.values()] })}
                >
                  <Unlock size={15} /> Mở khoá
                </button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected(new Map())}>
                  <X size={15} /> Bỏ chọn
                </button>
              </div>
            </>
          )}
        </div>

        {loadError ? (
          <div className="empty">
            <h3>Không tải được danh sách</h3>
            <p>{loadError}</p>
            <button type="button" className="btn btn-primary" onClick={reload}>
              Thử lại
            </button>
          </div>
        ) : data && data.total === 0 && !loading ? (
          <div className="empty">
            <span className="empty-icon">
              <SearchX size={28} />
            </span>
            <h3>{hasFilters ? 'Không có tài khoản phù hợp' : 'Chưa có tài khoản nào'}</h3>
            <p>{hasFilters ? 'Thử đổi từ khoá hoặc bỏ bớt bộ lọc.' : 'Bấm “Thêm tài khoản” để tạo cửa hàng đầu tiên.'}</p>
            {hasFilters ? (
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setSearchText('')
                  updateParams({ q: null, status: null, plan: null, industry: null })
                }}
              >
                <FilterX size={16} /> Xoá bộ lọc
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
                <Plus size={16} /> Thêm tài khoản
              </button>
            )}
          </div>
        ) : (
          <div className={`table-wrap${loading ? ' is-loading' : ''}`}>
            <table className="table table-accounts">
              <thead>
                <tr>
                  <th className="col-check">
                    <input
                      ref={headerCb}
                      type="checkbox"
                      className="cb"
                      checked={allOnPage}
                      onChange={toggleAll}
                      aria-label="Chọn tất cả trên trang"
                      disabled={!items.length}
                    />
                  </th>
                  <SortHeader label="Cửa hàng" k="storeName" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <th>SĐT</th>
                  <th>Ngành hàng</th>
                  <th>Gói</th>
                  <th>Trạng thái</th>
                  <SortHeader label="Đơn tháng này" k="ordersThisMonth" sortBy={sortBy} sortDir={sortDir} onSort={onSort} wrap />
                  <SortHeader label="Ngày tạo" k="createdAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <SortHeader label="Hoạt động" k="lastActiveAt" sortBy={sortBy} sortDir={sortDir} onSort={onSort} />
                  <th className="col-actions">
                    <span className="sr-only">Thao tác</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {!data &&
                  Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="row-skeleton">
                      <td colSpan={10}>
                        <div className="skeleton" />
                      </td>
                    </tr>
                  ))}
                {items.map((a) => (
                  <tr key={a.id} className={selected.has(a.id) ? 'is-selected' : undefined}>
                    <td className="col-check">
                      <input
                        type="checkbox"
                        className="cb"
                        checked={selected.has(a.id)}
                        onChange={() => toggleOne(a)}
                        aria-label={`Chọn ${a.storeName}`}
                      />
                    </td>
                    <td className="col-store">
                      <button type="button" className="cell-store as-button" onClick={() => setDetailId(a.id)}>
                        <Avatar name={a.storeName} seed={a.id} size={38} />
                        <div>
                          <strong>{a.storeName}</strong>
                          <span title={a.email}>{a.ownerName}</span>
                        </div>
                      </button>
                    </td>
                    <td data-label="SĐT">
                      <span className="mono">{a.phone}</span>
                    </td>
                    <td data-label="Ngành hàng" className="col-industry">
                      {a.industry}
                    </td>
                    <td data-label="Gói">
                      <PlanBadge plan={a.plan} />
                    </td>
                    <td data-label="Trạng thái">
                      <StatusBadge status={a.status} />
                    </td>
                    <td data-label="Đơn tháng này">
                      <QuotaBar used={a.ordersThisMonth} quota={a.orderQuota} />
                    </td>
                    <td data-label="Ngày tạo">
                      <span className="cell-date">{formatDate(a.createdAt)}</span>
                    </td>
                    <td data-label="Hoạt động">
                      <span className="cell-date" title={formatDateTime(a.lastActiveAt)}>
                        {formatRelative(a.lastActiveAt, current)}
                      </span>
                    </td>
                    <td className="col-actions">
                      <div className="row-actions">
                        <button
                          type="button"
                          className={`icon-btn${menu?.account.id === a.id ? ' is-active' : ''}`}
                          aria-label={`Thao tác khác cho ${a.storeName}`}
                          aria-haspopup="menu"
                          aria-expanded={menu?.account.id === a.id}
                          onClick={(e) => {
                            const anchor = e.currentTarget
                            setMenu((m) => (m?.account.id === a.id ? null : { account: a, anchor }))
                          }}
                        >
                          <MoreHorizontal size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <div className="pager">
            <span className="pager-info">
              {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)} / {data.total} tài khoản
            </span>
            <nav className="pager-btns" aria-label="Phân trang">
              <button
                type="button"
                className="icon-btn"
                disabled={data.page <= 1}
                onClick={() => updateParams({ page: String(data.page - 1) }, false)}
                aria-label="Trang trước"
              >
                <ChevronLeft size={18} />
              </button>
              {pageList(data.page, data.totalPages).map((p, i) =>
                p === '…' ? (
                  <span key={`e${i}`} className="pager-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`pager-num${p === data.page ? ' is-active' : ''}`}
                    aria-current={p === data.page ? 'page' : undefined}
                    onClick={() => updateParams({ page: p > 1 ? String(p) : null }, false)}
                  >
                    {p}
                  </button>
                ),
              )}
              <button
                type="button"
                className="icon-btn"
                disabled={data.page >= data.totalPages}
                onClick={() => updateParams({ page: String(data.page + 1) }, false)}
                aria-label="Trang sau"
              >
                <ChevronRight size={18} />
              </button>
            </nav>
          </div>
        )}
      </div>

      {menu && <RowMenu account={menu.account} anchor={menu.anchor} onClose={closeMenu} onAction={onRowAction} />}

      <AccountDetailDrawer
        accountId={detailId}
        version={detailVersion}
        onClose={() => setDetailId(null)}
        onEdit={(a) => {
          setEditing(a)
          setFormOpen(true)
        }}
        onChangePlan={(a) => openDialog({ kind: 'plan', account: a })}
        onToggleLock={(a) =>
          openDialog(
            a.status === 'locked'
              ? { kind: 'unlock', ids: [a.id], names: [a.storeName] }
              : { kind: 'lock', ids: [a.id], names: [a.storeName] },
          )
        }
      />

      <AccountFormModal
        open={formOpen}
        account={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(acc) => {
          setFormOpen(false)
          afterMutation()
          if (!editing) {
            // Hiện tài khoản mới ở đầu danh sách
            setSearchText('')
            updateParams({ q: null, status: null, plan: null, industry: null, sort: null })
            setDetailId(acc.id)
          }
        }}
      />

      {/* Khoá / mở khoá */}
      <Modal
        open={dialog?.kind === 'lock' || dialog?.kind === 'unlock'}
        onClose={() => !busy && setDialog(null)}
        tone={dialog?.kind === 'lock' ? 'danger' : 'default'}
        icon={dialog?.kind === 'lock' ? <Ban size={20} /> : <Unlock size={20} />}
        size="sm"
        title={
          dialog?.kind === 'lock'
            ? dialog.ids.length > 1
              ? `Khoá ${dialog.ids.length} tài khoản?`
              : 'Khoá tài khoản?'
            : dialog?.kind === 'unlock' && dialog.ids.length > 1
              ? `Mở khoá ${dialog.ids.length} tài khoản?`
              : 'Mở khoá tài khoản?'
        }
        description={
          dialog && (dialog.kind === 'lock' || dialog.kind === 'unlock')
            ? dialog.kind === 'lock'
              ? 'Chủ cửa hàng và nhân viên sẽ không đăng nhập hay tạo đơn được cho tới khi được mở khoá.'
              : 'Tài khoản sẽ trở lại trạng thái hoạt động và dùng được ngay.'
            : undefined
        }
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
              Huỷ
            </button>
            <button
              type="button"
              className={`btn ${dialog?.kind === 'lock' ? 'btn-danger' : 'btn-primary'}`}
              onClick={confirmDialog}
              disabled={busy || (dialog?.kind === 'lock' && !reason.trim())}
            >
              {busy && <span className="spinner" />}
              {dialog?.kind === 'lock' ? 'Khoá tài khoản' : 'Mở khoá'}
            </button>
          </>
        }
      >
        {dialog && (dialog.kind === 'lock' || dialog.kind === 'unlock') && (
          <div className="dialog-stack">
            <ul className="target-list">
              {dialog.names.slice(0, 4).map((n) => (
                <li key={n}>{n}</li>
              ))}
              {dialog.names.length > 4 && <li className="muted">và {dialog.names.length - 4} tài khoản khác</li>}
            </ul>
            {dialog.kind === 'lock' && (
              <div className="field">
                <label htmlFor="lock-reason">Lý do khoá *</label>
                <textarea
                  id="lock-reason"
                  className="textarea"
                  placeholder="VD: Nghi ngờ tạo đơn ảo hàng loạt"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={200}
                  data-autofocus
                />
                <div className="chips-row">
                  {['Vi phạm điều khoản sử dụng', 'Chủ cửa hàng yêu cầu', 'Nghi ngờ gian lận'].map((r) => (
                    <button key={r} type="button" className="chip chip-btn" onClick={() => setReason(r)}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Kích hoạt */}
      <Modal
        open={dialog?.kind === 'activate'}
        onClose={() => !busy && setDialog(null)}
        icon={<BadgeCheck size={20} />}
        size="sm"
        title="Kích hoạt tài khoản?"
        description={
          dialog?.kind === 'activate'
            ? `Xác nhận thủ công cho “${dialog.account.storeName}” (${dialog.account.phone}) khi chủ quán không nhận được OTP.`
            : undefined
        }
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
              Huỷ
            </button>
            <button type="button" className="btn btn-primary" onClick={confirmDialog} disabled={busy} data-autofocus>
              {busy && <span className="spinner" />} Kích hoạt
            </button>
          </>
        }
      />

      {/* Đổi gói */}
      <Modal
        open={dialog?.kind === 'plan'}
        onClose={() => !busy && setDialog(null)}
        icon={<CreditCard size={20} />}
        size="sm"
        title="Đổi gói dịch vụ"
        description={dialog?.kind === 'plan' ? dialog.account.storeName : undefined}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy}>
              Huỷ
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirmDialog}
              disabled={busy || (dialog?.kind === 'plan' && planChoice === dialog.account.plan)}
            >
              {busy && <span className="spinner" />} Xác nhận đổi gói
            </button>
          </>
        }
      >
        {dialog?.kind === 'plan' && (
          <div className="radio-cards" role="radiogroup" aria-label="Chọn gói">
            {(['basic', 'pro'] as const).map((p) => (
              <label key={p} className={`radio-card${planChoice === p ? ' is-checked' : ''}`}>
                <input type="radio" name="plan-choice" checked={planChoice === p} onChange={() => setPlanChoice(p)} />
                <div>
                  <strong>
                    <PlanBadge plan={p} />
                    {dialog.account.plan === p && <span className="chip">Gói hiện tại</span>}
                  </strong>
                  <p>
                    {p === 'basic'
                      ? 'Miễn phí · 200 lượt tạo đơn mỗi tháng.'
                      : 'Không giới hạn lượt tạo đơn · gói đang thử nghiệm, chưa công bố giá.'}
                  </p>
                </div>
              </label>
            ))}
            {planChoice === 'basic' && dialog.account.plan === 'pro' && dialog.account.ordersThisMonth > 200 && (
              <div className="alert alert-warn">
                Tài khoản đã tạo {dialog.account.ordersThisMonth} đơn tháng này — vượt hạn mức 200 của Gói Cơ bản.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Xoá */}
      <Modal
        open={dialog?.kind === 'delete'}
        onClose={() => !busy && setDialog(null)}
        tone="danger"
        icon={<Trash2 size={20} />}
        size="sm"
        title="Xoá tài khoản?"
        description={
          dialog?.kind === 'delete' ? (
            <>
              Tài khoản <b>{dialog.account.storeName}</b> cùng toàn bộ sổ bán hàng sẽ bị xoá vĩnh viễn. Không thể hoàn tác.
            </>
          ) : undefined
        }
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setDialog(null)} disabled={busy} data-autofocus>
              Huỷ
            </button>
            <button type="button" className="btn btn-danger" onClick={confirmDialog} disabled={busy}>
              {busy && <span className="spinner" />} Xoá vĩnh viễn
            </button>
          </>
        }
      />
    </div>
  )
}
