/**
 * Trạng thái dùng chung: đang tải, rỗng, lỗi, không có quyền, chỉ đọc.
 */
import { ArrowClockwise, CloudX, Eye, MagnifyingGlass, ShieldWarning, Tray, type Icon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

type LoadingVariant = 'table' | 'cards' | 'detail' | 'list'

export function LoadingState({
  variant = 'table',
  rows = 6,
  label = 'Đang tải dữ liệu…',
}: {
  variant?: LoadingVariant
  rows?: number
  label?: string
}) {
  return (
    <div className={`state state-loading state-loading-${variant}`} role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {variant === 'cards' && (
        <div className="kpi-grid">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="kpi skeleton" />
          ))}
        </div>
      )}
      {variant === 'table' &&
        Array.from({ length: rows }, (_, i) => (
          <div key={i} className="state-skel-row">
            <span className="skeleton skel-avatar" />
            <span className="skeleton" style={{ width: `${34 + ((i * 17) % 30)}%` }} />
            <span className="skeleton" style={{ width: '18%' }} />
            <span className="skeleton" style={{ width: '12%' }} />
          </div>
        ))}
      {variant === 'list' && (
        <div className="state-skel-list">
          {Array.from({ length: rows }, (_, i) => (
            <span key={i} className="skeleton" style={{ height: 52 }} />
          ))}
        </div>
      )}
      {variant === 'detail' && (
        <div className="state-skel-detail">
          <span className="skeleton" style={{ height: 64 }} />
          <div className="state-skel-grid">
            {Array.from({ length: rows }, (_, i) => (
              <span key={i} className="skeleton" style={{ height: 120 }} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

interface MessageProps {
  title: string
  description?: ReactNode
  action?: ReactNode
  icon?: Icon
  compact?: boolean
}

function Message({ title, description, action, icon: I, tone, compact }: MessageProps & { tone: string }) {
  return (
    <div className={`state state-msg state-${tone}${compact ? ' is-compact' : ''}`} role={tone === 'error' ? 'alert' : undefined}>
      {I && (
        <span className="state-icon">
          <I size={compact ? 20 : 24} aria-hidden="true" />
        </span>
      )}
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="state-action">{action}</div>}
    </div>
  )
}

export function EmptyState({ title = 'Chưa có dữ liệu', search, icon, ...rest }: Partial<MessageProps> & { search?: boolean }) {
  return <Message tone="empty" title={title} icon={icon ?? (search ? MagnifyingGlass : Tray)} {...rest} />
}

export function ErrorState({
  title = 'Không tải được dữ liệu',
  error,
  onRetry,
  ...rest
}: Partial<MessageProps> & { error?: Error | string | null; onRetry?: () => void }) {
  const msg = typeof error === 'string' ? error : error?.message
  return (
    <Message
      tone="error"
      title={title}
      icon={CloudX}
      description={rest.description ?? msg ?? 'Đã có lỗi xảy ra, vui lòng thử lại.'}
      compact={rest.compact}
      action={
        rest.action ??
        (onRetry && (
          <button type="button" className="btn btn-outline" onClick={onRetry}>
            <ArrowClockwise size={16} /> Thử lại
          </button>
        ))
      }
    />
  )
}

export function ForbiddenState({
  title = 'Bạn không có quyền truy cập',
  description = 'Khu vực này chỉ dành cho tài khoản ADMIN.',
  action,
  compact,
}: Partial<MessageProps>) {
  return <Message tone="forbidden" title={title} description={description} action={action} icon={ShieldWarning} compact={compact} />
}

export function ReadOnlyState({ title = 'Chỉ đọc', description, compact = true }: Partial<MessageProps>) {
  return <Message tone="readonly" title={title} description={description} icon={Eye} compact={compact} />
}
