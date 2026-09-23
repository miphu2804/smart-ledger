import { X } from 'lucide-react'
import { useEffect, useId, useRef, type ReactNode } from 'react'

interface Props {
  open: boolean
  title: string
  description?: ReactNode
  onClose: () => void
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
  tone?: 'default' | 'danger'
  icon?: ReactNode
}

function useEscape(open: boolean, onClose: () => void) {
  const cb = useRef(onClose)
  useEffect(() => {
    cb.current = onClose
  })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cb.current()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])
}

export default function Modal({ open, title, description, onClose, children, footer, size = 'md', tone = 'default', icon }: Props) {
  const titleId = useId()
  const panelRef = useRef<HTMLDivElement>(null)
  useEscape(open, onClose)

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    const el =
      panel?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel?.querySelector<HTMLElement>('input, select, textarea, button:not(.modal-close)')
    el?.focus()
  }, [open])

  if (!open) return null
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className={`modal modal-${size} modal-${tone}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="modal-head">
          {icon && <span className={`modal-icon modal-icon-${tone}`}>{icon}</span>}
          <div className="modal-titles">
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button type="button" className="icon-btn modal-close" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>
        {children && <div className="modal-body">{children}</div>}
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  )
}

export function Drawer({ open, title, onClose, children, footer }: Omit<Props, 'size' | 'tone' | 'icon' | 'description'>) {
  const titleId = useId()
  useEscape(open, onClose)
  if (!open) return null
  return (
    <div className="overlay overlay-drawer" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="drawer-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng">
            <X size={18} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer && <footer className="drawer-foot">{footer}</footer>}
      </aside>
    </div>
  )
}
