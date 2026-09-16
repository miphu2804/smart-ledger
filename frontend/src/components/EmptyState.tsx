import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function EmptyState({
  icon,
  title,
  body,
  className,
}: {
  icon?: ReactNode
  title: string
  body?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-2 rounded-2xl border border-line bg-card px-5 py-6',
        className,
      )}
    >
      {icon ? (
        <span className="inline-flex size-9 items-center justify-center rounded-[10px] bg-icon-well text-white">
          {icon}
        </span>
      ) : null}
      <h2 className="text-[15px] font-semibold tracking-tight text-text">{title}</h2>
      {body ? <p className="max-w-md text-[13px] leading-relaxed text-text-2">{body}</p> : null}
    </div>
  )
}
