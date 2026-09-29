/**
 * Thành phần giao diện dùng chung cho Admin Dashboard (theo plan MVP).
 * Icon: Phosphor, weight regular.
 */
import {
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  Hand,
  LockSimple,
  MagnifyingGlass,
  Robot,
  SealWarning,
  WarningCircle,
  X,
  type Icon,
} from '@phosphor-icons/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { usePreferences } from '../../services/preferences'
import {
  PLAN_LABEL,
  SEVERITY_LABEL,
  SOURCE_LABEL,
  STATUS_LABEL,
  TASK_STATUS_LABEL,
  type AccountStatus,
  type PlanId,
  type TaskSeverity,
  type TaskSource,
  type TaskStatus,
} from '../../types'

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg className="sb-brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="var(--tile)" />
      <rect x="12.5" y="6.5" width="7" height="12" rx="3.5" fill="var(--tile-fg)" />
      <path d="M9.5 15a6.5 6.5 0 0 0 13 0" fill="none" stroke="var(--tile-fg)" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M16 21.5v3.5M12.5 25h7" stroke="var(--tile-fg)" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="24" cy="8" r="2.6" fill="var(--accent-soft)" />
    </svg>
  )
}

const PALETTE = ['#2F7A43', '#3478F6', '#C47A16', '#8A5CF6', '#C84337', '#0E7C86', '#5B6B2E']
export function colorFor(key: string) {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[h % PALETTE.length]
}
export function initialsOf(name: string) {
  const w = name.trim().split(/\s+/)
  const last = w[w.length - 1]?.[0] ?? '?'
  return (w.length > 1 ? (w[0][0] ?? '') + last : last).toUpperCase()
}

export function Avatar({ name, color, size = 32, title }: { name: string; color?: string; size?: number; title?: string }) {
  return (
    <span
      className="avatar-c"
      title={title ?? name}
      aria-hidden={title ? undefined : true}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: color ?? colorFor(name) }}
    >
      {initialsOf(name)}
    </span>
  )
}

/** Avatar của ADMIN đang đăng nhập (theo preference) */
export function MeAvatar({ size = 32 }: { size?: number }) {
  const p = usePreferences()
  return <Avatar name={p.displayName} color={p.avatarColor} size={size} />
}

/* ---------- Pills ---------- */
export function Pill({ tone = 'neutral', icon: I, children }: { tone?: string; icon?: Icon; children: ReactNode }) {
  return (
    <span className={`pill pill-${tone}`}>
      {I && <I size={13} weight="bold" aria-hidden="true" />}
      {children}
    </span>
  )
}

const STATUS_TONE: Record<AccountStatus, [string, Icon]> = {
  active: ['success', CheckCircle],
  pending: ['warning', Clock],
  locked: ['danger', LockSimple],
}
export function StatusPill({ status }: { status: AccountStatus }) {
  const [tone, I] = STATUS_TONE[status]
  return (
    <Pill tone={tone} icon={I}>
      {STATUS_LABEL[status]}
    </Pill>
  )
}
export function PlanPill({ plan }: { plan: PlanId }) {
  return <Pill tone={plan === 'pro' ? 'accent' : 'outline'}>{PLAN_LABEL[plan]}</Pill>
}
const SEV: Record<TaskSeverity, [string, Icon]> = { high: ['danger', ArrowUp], medium: ['warning', SealWarning], low: ['neutral', ArrowDown] }
export function SeverityPill({ severity }: { severity: TaskSeverity }) {
  const [tone, I] = SEV[severity]
  return (
    <Pill tone={tone} icon={I}>
      {SEVERITY_LABEL[severity]}
    </Pill>
  )
}
const SRC: Record<TaskSource, Icon> = { ai: Robot, manual: Hand, system: WarningCircle }
export function SourcePill({ source }: { source: TaskSource }) {
  return (
    <Pill tone={source === 'ai' ? 'info' : 'outline'} icon={SRC[source]}>
      {SOURCE_LABEL[source]}
    </Pill>
  )
}
const TS_TONE: Record<TaskStatus, string> = { inbox: 'outline', investigating: 'info', waiting: 'warning', resolved: 'success' }
export function TaskStatusPill({ status }: { status: TaskStatus }) {
  return <Pill tone={TS_TONE[status]}>{TASK_STATUS_LABEL[status]}</Pill>
}

/* ---------- Panel ---------- */
export function Panel({
  title,
  subtitle,
  icon: I,
  actions,
  children,
  className = '',
  bodyClass = 'panel-body',
  headBorder = true,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  icon?: Icon
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClass?: string
  headBorder?: boolean
}) {
  return (
    <section className={`panel ${className}`}>
      {title && (
        <header className={`panel-head${headBorder ? '' : ' no-border'}`}>
          {I && (
            <span className="tile">
              <I size={20} aria-hidden="true" />
            </span>
          )}
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions && <div className="head-actions">{actions}</div>}
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

/* ---------- Search input ---------- */
export function SearchInput({
  value,
  onChange,
  placeholder,
  label,
  className = '',
  onEnter,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  label: string
  className?: string
  onEnter?: () => void
}) {
  return (
    <div className={`input-wrap ${className}`}>
      <MagnifyingGlass size={18} aria-hidden="true" />
      <input
        className="input"
        type="search"
        value={value}
        placeholder={placeholder}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onEnter?.()}
      />
    </div>
  )
}

/* ---------- Drawer ---------- */
export function DetailDrawer({
  open,
  title,
  subtitle,
  leading,
  onClose,
  children,
  footer,
}: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  leading?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
}) {
  const id = useId()
  const ref = useRef<HTMLElement>(null)
  const cb = useRef(onClose)
  useEffect(() => {
    cb.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cb.current()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      prev?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <>
      <div className="adm-overlay" onClick={onClose} aria-hidden="true" />
      <aside ref={ref} tabIndex={-1} className="adm-drawer" role="dialog" aria-modal="true" aria-labelledby={id}>
        <header className="adm-drawer-head">
          {leading}
          <div>
            <h2 id={id}>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={20} />
          </button>
        </header>
        <div className="adm-drawer-body">{children}</div>
        {footer && <footer className="adm-drawer-foot">{footer}</footer>}
      </aside>
    </>
  )
}

/* ---------- Quota bar ---------- */
export function QuotaLine({ used, limit }: { used: number; limit: number | null }) {
  if (limit === null)
    return (
      <div className="quota-line">
        <strong className="num">{used.toLocaleString('vi-VN')} lượt</strong>
        <span className="muted">Không giới hạn (gói Pro)</span>
      </div>
    )
  const pct = Math.min(1, used / limit)
  return (
    <div className="quota-line">
      <div className="row-between">
        <strong className="num">
          {used}/{limit} lượt
        </strong>
        <span className="muted num">{Math.round(pct * 100)}%</span>
      </div>
      <div className={`bar${pct >= 0.95 ? ' danger' : pct >= 0.8 ? ' warn' : ''}`} role="img" aria-label={`Đã dùng ${Math.round(pct * 100)}%`}>
        <i style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  )
}
