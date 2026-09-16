import { X } from '@phosphor-icons/react'
import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

export function Drawer({
  open,
  onClose,
  children,
  className,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  className?: string
}) {
  const [rail, setRail] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setRail(document.getElementById('shell-rail'))
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open || !rail) return null

  return createPortal(
    <aside
      className={cn(
        'flex h-full w-[340px] shrink-0 flex-col border-l border-line bg-white',
        className,
      )}
    >
      {children}
    </aside>,
    rail,
  )
}

export function DrawerHeader({
  onClose,
  children,
}: {
  onClose: () => void
  children: ReactNode
}) {
  return (
    <header className="flex items-start justify-between gap-3 px-4 pt-5 pb-3">
      <div className="min-w-0 flex-1">{children}</div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="inline-flex size-8 items-center justify-center rounded-full text-text-2 hover:bg-black/5"
      >
        <X size={16} weight="bold" />
      </button>
    </header>
  )
}

export function DrawerFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="mt-auto flex items-center gap-2 border-t border-line px-4 py-3">
      {children}
    </footer>
  )
}
