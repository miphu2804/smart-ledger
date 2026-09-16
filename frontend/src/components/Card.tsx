import { DotsThree } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function IconWell({
  children,
  className,
  dark = true,
}: {
  children: ReactNode
  className?: string
  dark?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-[10px]',
        dark ? 'bg-icon-well text-white' : 'bg-white/12 text-white',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function Card({
  title,
  icon,
  badge,
  hint,
  extra,
  menu = true,
  dark = false,
  className,
  bodyClassName,
  children,
}: {
  title?: string
  icon?: ReactNode
  badge?: ReactNode
  hint?: ReactNode
  extra?: ReactNode
  menu?: boolean
  dark?: boolean
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section
      className={cn(
        'flex min-h-0 flex-col rounded-2xl border border-line bg-card',
        dark && 'border-transparent bg-calendar text-white',
        className,
      )}
    >
      {title ? (
        <header className="flex items-center gap-2.5 px-4 pt-3.5 pb-2">
          {icon ? <IconWell dark={!dark}>{icon}</IconWell> : null}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2
                className={cn(
                  'text-[14.5px] font-semibold tracking-tight',
                  dark ? 'text-white' : 'text-text',
                )}
              >
                {title}
              </h2>
              {badge}
            </div>
            {hint ? (
              <p className={cn('text-[12px]', dark ? 'text-white/50' : 'text-text-2')}>
                {hint}
              </p>
            ) : null}
          </div>
          {extra}
          {menu ? (
            <button
              type="button"
              className={cn(
                'inline-flex size-7 items-center justify-center rounded-full',
                dark ? 'text-white/50 hover:bg-white/10' : 'text-text-3 hover:bg-black/5',
              )}
              aria-label="More"
            >
              <DotsThree size={18} weight="bold" />
            </button>
          ) : null}
        </header>
      ) : null}
      <div className={cn('min-h-0 flex-1 px-4 pb-4', bodyClassName)}>{children}</div>
    </section>
  )
}
