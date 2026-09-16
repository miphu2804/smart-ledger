import { cn } from '@/lib/utils'

export type FilterChip = {
  id: string
  label: string
  count?: number
}

export function FilterChips({
  items,
  value,
  onChange,
}: {
  items: FilterChip[]
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-semibold transition-colors',
              active
                ? 'bg-primary text-white'
                : 'bg-white text-text border border-line hover:bg-frame',
            )}
          >
            {item.label}
            {item.count != null ? (
              <span
                className={cn(
                  'inline-flex min-w-4 items-center justify-center rounded-full px-1.5 text-[11px]',
                  active ? 'bg-white/15 text-white' : 'bg-[#EEEBE4] text-text-2',
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
