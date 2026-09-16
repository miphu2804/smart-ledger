import { Info } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function InsightBanner({
  children,
  tone = 'blue',
  className,
}: {
  children: ReactNode
  tone?: 'blue' | 'green'
  className?: string
}) {
  const isBlue = tone === 'blue'
  return (
    <div
      className={cn(
        'flex gap-2.5 rounded-[14px] px-3 py-2.5 text-[12.5px] leading-snug',
        isBlue
          ? 'bg-insight-blue-bg text-insight-blue-fg'
          : 'bg-[var(--insight-green-bg)] text-[var(--insight-green-fg)]',
        className,
      )}
    >
      <span
        className={cn(
          'mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md',
          isBlue ? 'bg-[#3B6FCB] text-white' : 'bg-[#3D8A2A] text-white',
        )}
      >
        <Info size={12} weight="bold" />
      </span>
      <p className="min-w-0">{children}</p>
    </div>
  )
}
