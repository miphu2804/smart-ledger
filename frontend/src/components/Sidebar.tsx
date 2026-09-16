import {
  ChatCircle,
  Checks,
  GearSix,
  House,
  UsersThree,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'

type NavItem = {
  to: string
  label: string
  icon: Icon
  end: boolean
  count?: number
}

const support: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: House, end: true },
  { to: '/customers', label: 'Customers', icon: UsersThree, end: false },
  { to: '/ai', label: 'AI Support', icon: ChatCircle, end: false },
  { to: '/tasks', label: 'Tasks', icon: Checks, end: false, count: 14 },
]

const account: NavItem[] = [
  { to: '/settings', label: 'Settings', icon: GearSix, end: false },
]

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 px-2', collapsed && 'justify-center px-0')}>
      <span className="grid size-7 grid-cols-2 place-items-center gap-[3px]" aria-hidden>
        <span className="size-[7px] rounded-full bg-accent-ink" />
        <span className="size-[7px] rounded-full bg-accent" />
        <span className="size-[7px] rounded-full bg-accent" />
        <span className="size-[7px] rounded-full bg-accent-ink" />
      </span>
      {collapsed ? null : (
        <span className="text-[15px] font-semibold tracking-tight text-text">
          SmartLedger
        </span>
      )}
    </div>
  )
}

function NavGroup({
  label,
  collapsed,
  items,
}: {
  label: string
  collapsed: boolean
  items: NavItem[]
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {collapsed ? (
        <div className="h-6" />
      ) : (
        <p className="px-3 pb-1.5 pt-4 text-[11px] font-medium text-text-3">{label}</p>
      )}
      {items.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            className={({ isActive }) =>
              cn(
                'flex h-9 items-center gap-2.5 rounded-full px-3 text-[13.5px] font-medium transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-accent text-accent-ink'
                  : 'text-text/80 hover:bg-black/[0.04]',
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon
                  size={18}
                  weight={isActive ? 'fill' : 'regular'}
                  className="shrink-0"
                />
                {collapsed ? null : (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.count != null ? (
                      <span
                        className={cn(
                          'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold',
                          isActive ? 'bg-accent-ink/10' : 'bg-[#EEEBE4] text-text-2',
                        )}
                      >
                        {item.count}
                      </span>
                    ) : null}
                  </>
                )}
              </>
            )}
          </NavLink>
        )
      })}
    </div>
  )
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col bg-transparent py-5 pl-3 pr-2',
        collapsed ? 'w-[76px]' : 'w-[232px]',
      )}
    >
      <Brand collapsed={collapsed} />
      <nav className="mt-3 flex flex-1 flex-col">
        <NavGroup label="Support" collapsed={collapsed} items={support} />
        <div className="mt-auto pb-1">
          <NavGroup label="Account" collapsed={collapsed} items={account} />
        </div>
      </nav>
    </aside>
  )
}
