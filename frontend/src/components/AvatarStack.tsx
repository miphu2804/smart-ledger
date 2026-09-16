import { cn } from '@/lib/utils'

type Person = {
  name: string
  initial: string
  tone?: string
}

export function AvatarStack({ people, max = 3 }: { people: Person[]; max?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((p, i) => (
        <span
          key={p.name}
          title={p.name}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white',
            i > 0 && '-ml-1.5',
          )}
          style={{ background: p.tone ?? '#2f6f5e' }}
        >
          {p.initial}
        </span>
      ))}
      {rest > 0 ? (
        <span className="-ml-1.5 inline-flex size-6 items-center justify-center rounded-full bg-[#EEEBE4] text-[10px] font-semibold text-text-2 ring-2 ring-white">
          +{rest}
        </span>
      ) : null}
    </div>
  )
}

export function Initials({
  initial,
  tone,
  size = 32,
  className,
}: {
  initial: string
  tone: string
  size?: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        className,
      )}
      style={{
        background: tone,
        width: size,
        height: size,
        fontSize: size < 30 ? 11 : 12,
      }}
    >
      {initial}
    </span>
  )
}
