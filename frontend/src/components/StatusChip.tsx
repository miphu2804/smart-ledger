import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { ChipTone } from '@/mocks/types'

const tones: Record<ChipTone, string> = {
  green: 'bg-[var(--chip-green-bg)] text-[var(--chip-green-fg)]',
  blue: 'bg-[var(--chip-blue-bg)] text-[var(--chip-blue-fg)]',
  amber: 'bg-[var(--chip-amber-bg)] text-[var(--chip-amber-fg)]',
  red: 'bg-[var(--chip-red-bg)] text-[var(--chip-red-fg)]',
  gray: 'bg-[var(--chip-gray-bg)] text-[var(--chip-gray-fg)]',
}

export function StatusChip({
  tone,
  children,
  className,
}: {
  tone: ChipTone
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
