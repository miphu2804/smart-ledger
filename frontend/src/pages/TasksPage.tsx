import {
  CheckCircle,
  Hourglass,
  Info,
  Plus,
  Ticket,
  WarningCircle,
} from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Initials } from '@/components/AvatarStack'
import { Drawer, DrawerFooter, DrawerHeader } from '@/components/Drawer'
import { FilterChips } from '@/components/FilterChips'
import { KpiStrip } from '@/components/KpiStrip'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import { currentAdmin } from '@/mocks/session'
import { listShops } from '@/mocks/shops'
import {
  BOARD_DAY,
  taskColumns,
  taskKpis,
  taskStatusLabel,
  tasks as seedTasks,
} from '@/mocks/tasks'
import type { AdminTask, AdminTaskPriority, AdminTaskStatus, ChipTone } from '@/mocks/types'
import { cn } from '@/lib/utils'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const NEXT: Record<
  AdminTaskStatus,
  { label: string; status: AdminTaskStatus }
> = {
  INBOX: { label: 'Start investigating', status: 'INVESTIGATING' },
  INVESTIGATING: { label: 'Wait on owner', status: 'WAITING' },
  WAITING: { label: 'Resolve', status: 'RESOLVED' },
  RESOLVED: { label: 'Reopen', status: 'INBOX' },
}

function day(iso?: string) {
  return iso?.slice(0, 10)
}

function isOverdue(task: AdminTask) {
  const d = day(task.dueAt)
  return Boolean(d && d < BOARD_DAY)
}

function dueChip(task: AdminTask): { text: string; tone: ChipTone } | null {
  const d = day(task.dueAt)
  if (!d) return null
  if (d < BOARD_DAY) return { text: 'Overdue', tone: 'red' }
  if (d === BOARD_DAY) return { text: 'Today', tone: 'amber' }
  const [, m, dd] = d.split('-')
  return { text: `${Number(dd)} ${MONTHS[Number(m) - 1]}`, tone: 'gray' }
}

function priorityTone(p: AdminTaskPriority): ChipTone {
  if (p === 'HIGH') return 'red'
  if (p === 'MEDIUM') return 'amber'
  return 'gray'
}

function priorityLabel(p: AdminTaskPriority) {
  if (p === 'HIGH') return 'High'
  if (p === 'MEDIUM') return 'Medium'
  return 'Low'
}

function matchesFilter(task: AdminTask, filter: string) {
  if (!filter) return true
  if (filter === 'overdue') return isOverdue(task)
  if (filter === 'waiting') return task.status === 'WAITING'
  if (filter === 'unassigned') return !task.assigneeUserId
  if (filter === 'high') return task.priority === 'HIGH'
  return true
}

function Toast({ text, onGone }: { text: string; onGone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onGone, 2200)
    return () => window.clearTimeout(t)
  }, [onGone])
  return (
    <div className="pointer-events-none fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#1A1916] px-3.5 py-2 text-[12px] font-medium text-white shadow-lg">
      {text}
    </div>
  )
}

function TaskCard({
  task,
  shopName,
  selected,
  onClick,
}: {
  task: AdminTask
  shopName: string
  selected: boolean
  onClick: () => void
}) {
  const due = dueChip(task)
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'w-full rounded-[14px] border bg-white p-3 text-left transition-[box-shadow,border-color,transform]',
        selected
          ? 'border-accent shadow-[0_0_0_2px_rgba(143,219,110,0.45)]'
          : 'border-transparent hover:-translate-y-px hover:border-line hover:shadow-[0_8px_18px_-12px_rgba(40,36,28,0.45)]',
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-snug tracking-tight text-text">
            {task.title}
          </p>
          <p className="mt-0.5 truncate text-[12px] text-text-2">{shopName}</p>
        </div>
        {task.assigneeUserId ? (
          <Initials initial={currentAdmin.avatarInitial} tone="#c9784a" size={22} />
        ) : (
          <span className="mt-0.5 size-[22px] shrink-0 rounded-full border border-dashed border-line" />
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatusChip tone={priorityTone(task.priority)}>{priorityLabel(task.priority)}</StatusChip>
        {due ? <StatusChip tone={due.tone}>{due.text}</StatusChip> : null}
      </div>
      {task.blockedNote ? (
        <div className="mt-2 flex gap-1.5 rounded-[10px] bg-[var(--warn-bg)] px-2 py-1.5 text-[11.5px] leading-snug text-[var(--chip-amber-fg)]">
          <Info size={12} weight="fill" className="mt-0.5 shrink-0" />
          <p>{task.blockedNote}</p>
        </div>
      ) : null}
    </button>
  )
}

export function TasksPage() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [toast, setToast] = useState<string | null>(null)
  const [items, setItems] = useState<AdminTask[]>(() => seedTasks.map((t) => ({ ...t })))

  const shopsById = useMemo(
    () => Object.fromEntries(listShops('ALL').map((s) => [s.id, s])),
    [],
  )

  const visible = useMemo(
    () => items.filter((t) => matchesFilter(t, filter)),
    [filter, items],
  )

  const selected = items.find((t) => t.id === selectedId)
  const selectedShop = selected?.shopId ? shopsById[selected.shopId] : undefined

  const counts = {
    overdue: items.filter(isOverdue).length,
    waiting: items.filter((t) => t.status === 'WAITING').length,
    unassigned: items.filter((t) => !t.assigneeUserId).length,
    high: items.filter((t) => t.priority === 'HIGH').length,
  }

  function patch(id: string, next: Partial<AdminTask>, note: string) {
    setItems((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...next, version: t.version + 1 } : t)),
    )
    setToast(note)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4">
      <KpiStrip
        items={[
          {
            id: 'open',
            label: 'Open',
            value: String(taskKpis.open),
            icon: <Ticket size={15} weight="bold" />,
          },
          {
            id: 'waiting',
            label: 'Waiting on owner',
            value: String(taskKpis.waitingOnOwner),
            icon: <Hourglass size={15} weight="bold" />,
            hint: { text: 'On target', tone: 'green' },
          },
          {
            id: 'overdue',
            label: 'Overdue',
            value: String(taskKpis.overdue),
            icon: <WarningCircle size={15} weight="bold" />,
            hint: { text: 'breach', tone: 'red' },
          },
          {
            id: 'resolved',
            label: 'Resolved this week',
            value: String(taskKpis.resolvedThisWeek),
            icon: <CheckCircle size={15} weight="bold" />,
          },
        ]}
      />

      <FilterChips
        value={filter}
        onChange={(id) => setFilter((prev) => (prev === id ? '' : id))}
        items={[
          { id: 'overdue', label: 'Overdue', count: counts.overdue },
          { id: 'waiting', label: 'Waiting', count: counts.waiting },
          { id: 'unassigned', label: 'Unassigned', count: counts.unassigned },
          { id: 'high', label: 'High priority', count: counts.high },
        ]}
      />

      <div className="flex min-h-0 flex-1 gap-2.5 overflow-x-auto">
        {taskColumns.map((status) => {
          const cards = visible.filter((t) => t.status === status)
          const done = status === 'RESOLVED'
          return (
            <section
              key={status}
              className={cn(
                'flex h-full min-w-[280px] flex-1 flex-col rounded-2xl p-2',
                done ? 'bg-[var(--kanban-done-col)]' : 'bg-[#EEEBE4]',
              )}
            >
              <header className="flex shrink-0 items-center gap-2 px-1.5 py-1.5">
                <h2 className="text-[13.5px] font-semibold tracking-tight text-text">
                  {taskStatusLabel[status]}
                </h2>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/80 px-1.5 text-[11px] font-semibold text-text-2">
                  {cards.length}
                </span>
              </header>
              <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
                {cards.map((task) => {
                  const shop = task.shopId ? shopsById[task.shopId] : undefined
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      shopName={shop?.name ?? 'No shop'}
                      selected={task.id === selectedId}
                      onClick={() =>
                        setSelectedId((id) => (id === task.id ? '' : task.id))
                      }
                    />
                  )
                })}
              </div>
              <button
                type="button"
                onClick={() => setToast('prototype — no write')}
                className="mt-1 flex shrink-0 items-center justify-center gap-1 py-2 text-[12.5px] font-medium text-text-2 hover:text-text"
              >
                <Plus size={12} weight="bold" />
                Add task
              </button>
            </section>
          )
        })}
      </div>

      <Drawer open={Boolean(selected)} onClose={() => setSelectedId('')}>
        {selected ? (
          <>
            <DrawerHeader onClose={() => setSelectedId('')}>
              <h2 className="text-[16px] font-semibold tracking-tight text-text">
                {selected.title}
              </h2>
              <p className="mt-0.5 text-[12px] text-text-2">
                {selectedShop?.name ?? 'No shop'}
                {selectedShop ? ` · ${selectedShop.ownerName}` : ''}
              </p>
            </DrawerHeader>
            <div className="min-h-0 flex-1 overflow-auto px-4 pb-3">
              <p className="mb-1.5 text-[11px] font-medium text-text-3">Move to</p>
              <div className="flex flex-wrap gap-1">
                {taskColumns.map((status) => {
                  const active = selected.status === status
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => {
                        if (active) return
                        patch(
                          selected.id,
                          { status },
                          `Moved to ${taskStatusLabel[status]} — prototype`,
                        )
                      }}
                      className={cn(
                        'h-7 rounded-full px-2.5 text-[12px] font-semibold',
                        active
                          ? 'bg-accent text-accent-ink'
                          : 'bg-[#EEEBE4] text-text-2 hover:bg-line',
                      )}
                    >
                      {taskStatusLabel[status]}
                    </button>
                  )
                })}
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <StatusChip tone={priorityTone(selected.priority)}>
                  {priorityLabel(selected.priority)}
                </StatusChip>
                {dueChip(selected) ? (
                  <StatusChip tone={dueChip(selected)!.tone}>
                    {dueChip(selected)!.text}
                  </StatusChip>
                ) : null}
              </div>

              {selected.blockedNote ? (
                <div className="mt-3 flex gap-1.5 rounded-[14px] bg-[var(--warn-bg)] px-3 py-2.5 text-[12.5px] leading-snug text-[var(--chip-amber-fg)]">
                  <Info size={14} weight="fill" className="mt-0.5 shrink-0" />
                  <p>{selected.blockedNote}</p>
                </div>
              ) : null}

              <dl className="mt-4 divide-y divide-line text-[13px]">
                <div className="flex items-center justify-between gap-4 py-[7px]">
                  <dt className="text-text-2">Assignee</dt>
                  <dd className="font-medium">
                    {selected.assigneeUserId ? currentAdmin.name : 'Unassigned'}
                  </dd>
                </div>
                <div className="flex justify-between gap-4 py-[7px]">
                  <dt className="text-text-2">Source</dt>
                  <dd className="font-medium">{selected.source.replaceAll('_', ' ')}</dd>
                </div>
                <div className="flex justify-between gap-4 py-[7px]">
                  <dt className="text-text-2">Due</dt>
                  <dd className="font-medium">{dueChip(selected)?.text ?? 'None'}</dd>
                </div>
                <div className="flex justify-between gap-4 py-[7px]">
                  <dt className="text-text-2">Shop id</dt>
                  <dd className="font-medium">{selected.shopId?.toUpperCase() ?? '—'}</dd>
                </div>
              </dl>
            </div>
            <DrawerFooter>
              <Button
                variant="accent"
                className="flex-1"
                onClick={() => {
                  const step = NEXT[selected.status]
                  patch(
                    selected.id,
                    { status: step.status },
                    `${step.label} — prototype`,
                  )
                }}
              >
                {NEXT[selected.status].label}
              </Button>
              {selected.shopId ? (
                <Button variant="secondary" onClick={() => navigate('/customers')}>
                  Shop
                </Button>
              ) : null}
              {!selected.assigneeUserId ? (
                <Button
                  variant="secondary"
                  onClick={() =>
                    patch(
                      selected.id,
                      { assigneeUserId: currentAdmin.id },
                      'Assigned to you — prototype',
                    )
                  }
                >
                  Assign me
                </Button>
              ) : null}
            </DrawerFooter>
          </>
        ) : null}
      </Drawer>

      {toast ? <Toast text={toast} onGone={() => setToast(null)} /> : null}
    </div>
  )
}
