/**
 * Cài đặt — Hồ sơ | Giao diện | Bảo mật & quyền (chỉ đọc) | Nhật ký (luôn bật).
 * Không có thao tác tự nâng quyền, không có công tắc tắt audit.
 */
import {
  CheckCircle,
  ClockCounterClockwise,
  Desktop,
  Eye,
  LockSimple,
  Palette,
  ShieldCheck,
  Sun,
  User,
  XCircle,
  type Icon,
} from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { NavLink, Navigate, useOutletContext, useParams } from 'react-router-dom'
import { Avatar, Panel, SearchInput } from '../../components/admin/ui'
import { EmptyState, ErrorState, LoadingState, ReadOnlyState } from '../../components/States'
import { useToast } from '../../components/Toast'
import { useAsync } from '../../hooks/useAsync'
import { listAuditLog, now } from '../../services/accountService'
import { getSession } from '../../services/authService'
import { AVATAR_COLORS, setPreferences, usePreferences } from '../../services/preferences'
import { formatDateTime, formatRelative, normalizeVi } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

type Tab = 'profile' | 'appearance' | 'security' | 'audit'
const TABS: { id: Tab; label: string; icon: Icon }[] = [
  { id: 'profile', label: 'Hồ sơ', icon: User },
  { id: 'appearance', label: 'Giao diện', icon: Palette },
  { id: 'security', label: 'Bảo mật & quyền', icon: ShieldCheck },
  { id: 'audit', label: 'Nhật ký', icon: ClockCounterClockwise },
]

export default function SettingsPage() {
  const { tab = 'profile' } = useParams()
  if (!TABS.some((t) => t.id === tab)) return <Navigate to="/admin/settings/profile" replace />
  return (
    <div className="settings">
      <nav className="panel settings-nav" aria-label="Mục cài đặt">
        {TABS.map(({ id, label, icon: I }) => (
          <NavLink
            key={id}
            to={`/admin/settings/${id}`}
            className={({ isActive }) => (isActive || (id === 'profile' && tab === 'profile') ? 'active' : '')}
          >
            <I size={20} aria-hidden="true" /> {label}
          </NavLink>
        ))}
      </nav>
      <div>
        {tab === 'profile' && <ProfileTab />}
        {tab === 'appearance' && <AppearanceTab />}
        {tab === 'security' && <SecurityTab />}
        {tab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="form-row">
      <div>
        <strong>{title}</strong>
        {hint && <span>{hint}</span>}
      </div>
      <div>{children}</div>
    </div>
  )
}

/* ---------- Hồ sơ ---------- */
function ProfileTab() {
  const prefs = usePreferences()
  const toast = useToast()
  const session = getSession()
  const [name, setName] = useState(prefs.displayName)
  const [color, setColor] = useState(prefs.avatarColor)
  const [saving, setSaving] = useState(false)
  const nameErr = name.trim().length < 2 ? 'Tên hiển thị tối thiểu 2 ký tự.' : null
  const dirty = name.trim() !== prefs.displayName || color !== prefs.avatarColor

  async function save(e: FormEvent) {
    e.preventDefault()
    if (nameErr || !dirty) return
    setSaving(true)
    await new Promise((r) => setTimeout(r, 400))
    setPreferences({ displayName: name.trim(), avatarColor: color }, true)
    setSaving(false)
    toast.success('Đã lưu hồ sơ')
  }

  return (
    <Panel title="Hồ sơ" subtitle="Thông tin hiển thị trong trang quản trị và nhật ký" bodyClass="panel-body">
      <form onSubmit={save} noValidate>
        <Row title="Ảnh đại diện" hint="Chọn màu cho chữ viết tắt">
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <Avatar name={name || '?'} color={color} size={56} />
            <div className="swatches" role="group" aria-label="Màu ảnh đại diện">
              {AVATAR_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  style={{ background: c }}
                  aria-pressed={c === color}
                  aria-label={`Màu ${c}`}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>
        </Row>
        <Row title="Tên hiển thị">
          <div className="field">
            <label htmlFor="pf-name" className="sr-only">
              Tên hiển thị
            </label>
            <input
              id="pf-name"
              className={`input${nameErr ? ' has-error' : ''}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={{ maxWidth: 360 }}
            />
            {nameErr && <span className="field-error">{nameErr}</span>}
          </div>
        </Row>
        <Row title="Email đăng nhập" hint="Do quản trị hệ thống cấp, không tự đổi">
          <span className="row" style={{ gap: 6 }}>
            <LockSimple size={16} aria-hidden="true" /> {session?.user.email}
          </span>
        </Row>
        <Row title="Ngôn ngữ">
          <div className="choice-grid" role="radiogroup" aria-label="Ngôn ngữ">
            <label className="choice">
              <input type="radio" name="locale" checked readOnly />
              <div>
                <strong>Tiếng Việt</strong>
                <span>Mặc định</span>
              </div>
            </label>
            <label className="choice" style={{ opacity: 0.55, cursor: 'not-allowed' }}>
              <input type="radio" name="locale" disabled />
              <div>
                <strong>English</strong>
                <span>Sắp có</span>
              </div>
            </label>
          </div>
        </Row>
        <div className="row" style={{ justifyContent: 'flex-end', gap: 8, paddingTop: 16 }}>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!dirty || saving}
            onClick={() => {
              setName(prefs.displayName)
              setColor(prefs.avatarColor)
            }}
          >
            Huỷ thay đổi
          </button>
          <button type="submit" className="btn btn-primary" disabled={!dirty || Boolean(nameErr) || saving}>
            {saving && <span className="spinner" />} Lưu hồ sơ
          </button>
        </div>
      </form>
    </Panel>
  )
}

/* ---------- Giao diện ---------- */
function AppearanceTab() {
  const prefs = usePreferences()
  return (
    <Panel title="Giao diện" subtitle="Lưu trên trình duyệt này" bodyClass="panel-body">
      <Row title="Chủ đề" hint="“Theo hệ thống” dùng chế độ tối khi máy bạn bật">
        <div className="choice-grid" role="radiogroup" aria-label="Chủ đề">
          {(
            [
              ['light', 'Sáng', 'Nền sáng, dễ đọc ban ngày', Sun],
              ['system', 'Theo hệ thống', 'Tự đổi sáng/tối', Desktop],
            ] as const
          ).map(([v, label, hint, I]) => (
            <label key={v} className="choice">
              <input type="radio" name="theme" value={v} checked={prefs.theme === v} onChange={() => setPreferences({ theme: v })} />
              <I size={20} aria-hidden="true" />
              <div>
                <strong>{label}</strong>
                <span>{hint}</span>
              </div>
            </label>
          ))}
        </div>
      </Row>
      <Row title="Mật độ hiển thị" hint="Thu gọn khoảng cách trong bảng và thẻ">
        <div className="choice-grid" role="radiogroup" aria-label="Mật độ hiển thị">
          {(
            [
              ['comfortable', 'Thoải mái', 'Mặc định'],
              ['compact', 'Gọn', 'Nhiều dòng hơn trên màn hình'],
            ] as const
          ).map(([v, label, hint]) => (
            <label key={v} className="choice">
              <input type="radio" name="density" value={v} checked={prefs.density === v} onChange={() => setPreferences({ density: v })} />
              <div>
                <strong>{label}</strong>
                <span>{hint}</span>
              </div>
            </label>
          ))}
        </div>
      </Row>
      <Row title="Thanh bên">
        <label className="row" style={{ gap: 8 }}>
          <input
            type="checkbox"
            className="checkbox"
            checked={prefs.sidebarCollapsed}
            onChange={(e) => setPreferences({ sidebarCollapsed: e.target.checked })}
          />
          Thu gọn thanh bên trên màn hình lớn
        </label>
      </Row>
    </Panel>
  )
}

/* ---------- Bảo mật & quyền ---------- */
const PERMS: [string, boolean][] = [
  ['Xem danh sách và chi tiết hỗ trợ của OWNER/cơ sở', true],
  ['Tạo và cập nhật support task', true],
  ['Dùng AI Support trên dữ liệu được phép xem', true],
  ['Đăng nhập thay / giả danh OWNER', false],
  ['Xem hoặc sửa hoá đơn, chi phí, công nợ, tồn kho', false],
  ['Tự thay đổi vai trò hoặc cấp thêm quyền', false],
  ['Tắt nhật ký hoạt động', false],
]

function SecurityTab() {
  const session = getSession()
  const current = now()
  return (
    <div className="stack" style={{ gap: 16 }}>
      <Panel title="Bảo mật & quyền" subtitle="Chỉ đọc — quyền do quản trị hệ thống cấp" bodyClass="panel-body">
        <Row title="Vai trò">
          <span className="pill pill-accent">
            <ShieldCheck size={13} weight="bold" aria-hidden="true" /> {session?.user.role}
          </span>
        </Row>
        <Row title="Phiên đăng nhập">
          <span>Bắt đầu {session ? `${formatDateTime(session.issuedAt)} (${formatRelative(session.issuedAt, current)})` : '—'}</span>
        </Row>
        <Row title="Quyền hiện có">
          <ul className="perm-list">
            {PERMS.map(([p, ok]) => (
              <li key={p} style={{ color: ok ? undefined : 'var(--text-secondary)' }}>
                {ok ? (
                  <CheckCircle size={18} weight="fill" color="var(--success)" aria-label="Có" />
                ) : (
                  <XCircle size={18} color="var(--danger)" aria-label="Không có" />
                )}
                {p}
              </li>
            ))}
          </ul>
        </Row>
      </Panel>
      <div className="panel">
        <ReadOnlyState
          title="Không thể tự nâng quyền"
          description="Cần thêm quyền? Liên hệ quản trị hệ thống. Mọi thay đổi quyền được thực hiện ngoài trang này và đều được ghi nhật ký."
        />
      </div>
    </div>
  )
}

/* ---------- Nhật ký ---------- */
function AuditTab() {
  const { dataVersion } = useOutletContext<AdminOutletContext>()
  const { data, error, loading, reload } = useAsync(() => listAuditLog(), [dataVersion])
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<'all' | 'view' | 'task' | 'other'>('all')
  const [limit, setLimit] = useState(30)
  const current = now()

  const rows = useMemo(() => {
    const term = normalizeVi(q.trim())
    return (data ?? []).filter((a) => {
      const isView = a.action.startsWith('Xem') || a.action.startsWith('AI')
      const isTask = /task/i.test(a.action)
      if (kind === 'view' && !isView) return false
      if (kind === 'task' && !isTask) return false
      if (kind === 'other' && (isView || isTask)) return false
      return !term || normalizeVi(`${a.actor} ${a.action} ${a.target ?? ''} ${a.detail ?? ''}`).includes(term)
    })
  }, [data, q, kind])

  return (
    <Panel
      title="Nhật ký hoạt động"
      subtitle="Ghi lại mọi lần xem chi tiết khách hàng, thao tác task và truy vấn AI"
      bodyClass=""
      actions={
        <span className="row" style={{ gap: 8 }}>
          <span className="muted" style={{ fontSize: 12.5 }} id="audit-switch">
            Luôn bật
          </span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked="true"
            aria-labelledby="audit-switch"
            disabled
            title="Nhật ký không thể tắt"
          >
            <i />
          </button>
        </span>
      }
    >
      <div className="filterbar" role="search">
        <SearchInput
          className="grow"
          value={q}
          onChange={(v) => {
            setQ(v)
            setLimit(30)
          }}
          label="Tìm trong nhật ký"
          placeholder="Người thực hiện, hành động, đối tượng…"
        />
        <select
          className="select"
          aria-label="Loại hoạt động"
          value={kind}
          onChange={(e) => {
            setKind(e.target.value as typeof kind)
            setLimit(30)
          }}
        >
          <option value="all">Mọi hoạt động</option>
          <option value="view">Xem dữ liệu / AI</option>
          <option value="task">Support task</option>
          <option value="other">Khác</option>
        </select>
      </div>
      <div className="panel-body">
        {error ? (
          <ErrorState error={error} onRetry={reload} title="Không tải được nhật ký" />
        ) : !data ? (
          <LoadingState variant="list" rows={6} label="Đang tải nhật ký…" />
        ) : rows.length === 0 ? (
          <EmptyState search={Boolean(q) || kind !== 'all'} title={q || kind !== 'all' ? 'Không có mục phù hợp' : 'Chưa có hoạt động nào'} />
        ) : (
          <div className={loading ? 'dt-loading' : undefined}>
            <ol className="tl">
              {rows.slice(0, limit).map((a) => (
                <li key={a.id}>
                  <span className="tl-dot">{a.action.startsWith('Xem') ? <Eye size={14} /> : <ClockCounterClockwise size={14} />}</span>
                  <div>
                    <p>
                      <strong>{a.actor}</strong> · {a.action}
                      {a.target && (
                        <>
                          {' '}
                          <strong>{a.target}</strong>
                        </>
                      )}
                    </p>
                    {a.detail && <small>{a.detail}</small>}
                    <time dateTime={a.at} title={formatDateTime(a.at)}>
                      {formatRelative(a.at, current)}
                    </time>
                  </div>
                </li>
              ))}
            </ol>
            {rows.length > limit && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setLimit((n) => n + 30)}>
                Xem thêm ({rows.length - limit})
              </button>
            )}
          </div>
        )}
      </div>
    </Panel>
  )
}
