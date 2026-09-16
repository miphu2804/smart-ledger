import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { IconWell } from './Card'
import { StatusChip } from './StatusChip'
import type { ChipTone } from '@/mocks/types'

export type KpiItem = {
  id: string
  label: string
  value: string
  icon: ReactNode
  hint?: { text: string; tone: ChipTone }
}

export function KpiStrip({ items }: { items: KpiItem[] }) {
  return (
    <section className="grid grid-cols-4 overflow-hidden rounded-2xl border border-line bg-card">
      {items.map((item, i) => (
        <div
          key={item.id}
          className={cn(
            'flex items-center gap-3 px-4 py-3.5',
            i > 0 && 'border-l border-line',
          )}
        >
          <IconWell>{item.icon}</IconWell>
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] font-medium text-text-2">{item.label}</p>
            <p className="text-[22px] font-semibold tracking-tight text-text">
              {item.value}
            </p>
          </div>
          {item.hint ? (
            <StatusChip tone={item.hint.tone}>{item.hint.text}</StatusChip>
          ) : null}
        </div>
      ))}
    </section>
  )
}
