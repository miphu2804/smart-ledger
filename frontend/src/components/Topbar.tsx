import { Bell, Plus, SidebarSimple, SquaresFour } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { currentAdmin } from '@/mocks/session'

export function Topbar({
  title,
  onToggle,
}: {
  title: string
  onToggle: () => void
}) {
  return (
    <header className="flex h-[64px] shrink-0 items-center gap-3 px-4">
      <button
        type="button"
        onClick={onToggle}
        aria-label="Collapse sidebar"
        className="inline-flex size-8 items-center justify-center rounded-[10px] text-text-2 hover:bg-black/5"
      >
        <SidebarSimple size={18} />
      </button>
      <h1 className="flex-1 text-[22px] font-semibold tracking-tight text-text">
        {title}
      </h1>
      <label className="relative hidden w-[220px] lg:block">
        <span className="sr-only">Search</span>
        <input
          placeholder="Search"
          className="h-9 w-full rounded-full border border-line bg-white/70 pr-14 pl-3.5 text-[13px] text-text outline-none placeholder:text-text-3"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-md border border-line bg-frame px-1.5 py-0.5 text-[11px] font-medium text-text-3">
          ⌘K
        </kbd>
      </label>
      <Button variant="icon" size="icon" aria-label="Apps">
        <SquaresFour size={16} />
      </Button>
      <Button variant="icon" size="icon" aria-label="Notifications">
        <Bell size={16} />
      </Button>
      <Button>
        <Plus size={14} weight="bold" />
        New
      </Button>
      <span
        className="inline-flex size-9 items-center justify-center rounded-full bg-[#c9784a] text-[11px] font-semibold text-white"
        title={currentAdmin.name}
      >
        {currentAdmin.avatarInitial}
      </span>
    </header>
  )
}
