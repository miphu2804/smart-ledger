import {
  CalendarBlank,
  Check,
  Clock,
  FileText,
  Phone,
  Sparkle,
  Storefront,
  Ticket,
  UsersThree,
  WarningCircle,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Initials } from '@/components/AvatarStack'
import { Card } from '@/components/Card'
import { DataTable, type Column } from '@/components/DataTable'
import { InsightBanner } from '@/components/InsightBanner'
import { KpiStrip } from '@/components/KpiStrip'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import {
  attentionRows,
  dashboardInsight,
  firstActions,
  loadByHour,
  overview,
} from '@/mocks/overview'
import type { AdminTaskStatus, AttentionRow, ChipTone, FirstAction } from '@/mocks/types'

const statusTone: Record<AdminTaskStatus, ChipTone> = {
  INBOX: 'gray',
  INVESTIGATING: 'blue',
  WAITING: 'green',
  RESOLVED: 'gray',
}

const statusLabel: Record<AdminTaskStatus, string> = {
  INBOX: 'Inbox',
  INVESTIGATING: 'Investigating',
  WAITING: 'Waiting',
  RESOLVED: 'Resolved',
}

const actionIcon: Record<FirstAction['icon'], ReactNode> = {
  ticket: <Ticket size={14} />,
  phone: <Phone size={14} />,
  store: <Storefront size={14} />,
  file: <FileText size={14} />,
  warning: <WarningCircle size={14} />,
}

const attentionColumns: Column<AttentionRow>[] = [
  {
    id: 'shop',
    header: 'Shop',
    className: 'w-[28%]',
    cell: (row) => (
      <div className="flex items-center gap-2.5">
        <Initials initial={row.avatarInitial} tone={row.avatarTone} size={28} />
        <span className="font-medium">{row.shopName}</span>
      </div>
    ),
  },
  {
    id: 'owner',
    header: 'Owner',
    className: 'w-[18%]',
    cell: (row) => <span className="text-text-2">{row.ownerName}</span>,
  },
  {
    id: 'reason',
    header: 'Reason',
    cell: (row) => <span>{row.reason}</span>,
  },
  {
    id: 'status',
    header: 'Status',
    className: 'w-[16%]',
    cell: (row) => (
      <StatusChip tone={statusTone[row.status]}>{statusLabel[row.status]}</StatusChip>
    ),
  },
  {
    id: 'seen',
    header: 'Last seen',
    className: 'w-[12%] text-right',
    cell: (row) => <span className="text-text-2">{row.lastSeen}</span>,
  },
]

const APRIL_2026 = [
  [null, null, null, 1, 2, 3, 4],
  [5, 6, 7, 8, 9, 10, 11],
  [12, 13, 14, 15, 16, 17, 18],
  [19, 20, 21, 22, 23, 24, 25],
  [26, 27, 28, 29, 30, null, null],
] as const

const checks = new Set([3, 6, 9, 11, 13, 15, 16])
const hatches = new Set([4, 8, 10, 18])

function CalendarCard() {
  return (
    <Card
      dark
      title="This month"
      icon={<CalendarBlank size={15} weight="bold" />}
      className="min-h-0 overflow-hidden"
      bodyClassName="flex min-h-0 flex-1 flex-col pt-0"
    >
      <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(5,minmax(0,1fr))] gap-x-1 gap-y-1">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
          <span
            key={`${d}-${i}`}
            className="flex items-center justify-center text-[10px] font-medium text-white/35"
          >
            {d}
          </span>
        ))}
        {APRIL_2026.flat().map((day, i) => {
          if (day == null) return <span key={`e-${i}`} />
          const base =
            'mx-auto flex size-[28px] items-center justify-center rounded-full text-[11px] font-medium'
          if (day === 20) {
            return (
              <span key={day} className={`${base} bg-accent font-semibold text-accent-ink`}>
                {day}
              </span>
            )
          }
          if (day > 20) {
            return (
              <span key={day} className={`${base} border border-white/10 text-white/35`}>
                {day}
              </span>
            )
          }
          if (checks.has(day)) {
            return (
              <span key={day} className={`${base} bg-white/10 text-white/80`}>
                <Check size={12} weight="bold" />
              </span>
            )
          }
          if (hatches.has(day)) {
            return (
              <span key={day} className={`${base} hatch bg-white/8 text-white/40`}>
                {day}
              </span>
            )
          }
          return (
            <span key={day} className={`${base} bg-white/10 text-white/70`}>
              {day}
            </span>
          )
        })}
      </div>
    </Card>
  )
}

function LoadChart() {
  const max = 100
  return (
    <Card
      title="Support load by hour"
      icon={<Clock size={15} weight="bold" />}
      className="min-h-0"
      bodyClassName="flex min-h-0 flex-1 flex-col pt-1"
    >
      <div className="mb-3 grid grid-cols-3 gap-2">
        {[
          ['18 min', 'Avg. first reply'],
          ['14', 'Open right now'],
          ['6 min', 'Median handle'],
        ].map(([n, l]) => (
          <div
            key={l}
            className="rounded-[14px] border border-line px-2.5 py-2 text-center"
          >
            <p className="text-[15px] font-semibold text-[#2F6B1F]">{n}</p>
            <p className="text-[10.5px] text-text-3">{l}</p>
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[28px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_16px] gap-x-2">
        <div className="flex flex-col justify-between pb-0.5 text-right text-[10px] leading-none text-text-3">
          <span>100</span>
          <span>50</span>
          <span>0</span>
        </div>
        <div className="flex min-h-0 items-end gap-2.5">
          {loadByHour.map((b) => (
            <div key={b.label} className="flex h-full min-h-0 flex-1 items-end justify-center">
              <span
                className="w-[70%] max-w-9 rounded-t-md"
                style={{
                  height: `${(b.value / max) * 100}%`,
                  background: b.isNow ? 'var(--accent)' : '#EFEDE6',
                }}
              />
            </div>
          ))}
        </div>
        <span />
        <div className="flex gap-2.5 text-center text-[10px] text-text-3">
          {loadByHour.map((b) => (
            <span key={b.label} className="flex-1">
              {b.label}
            </span>
          ))}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] text-text-3">Less busy</span>
        <span className="h-1.5 flex-1 rounded-full bg-linear-to-r from-accent/30 via-accent to-[#4a8f32]" />
        <span className="text-[10px] text-text-3">Busy</span>
      </div>
    </Card>
  )
}

export function DashboardPage() {
  const navigate = useNavigate()

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden px-4 pb-4">
      <KpiStrip
        items={[
          {
            id: 'shops',
            label: 'Shops active',
            value: String(overview.shopsActive),
            icon: <Storefront size={15} weight="bold" />,
            hint: { text: `+${overview.shopsActiveDelta}`, tone: 'green' },
          },
          {
            id: 'tasks',
            label: 'Open support tasks',
            value: String(overview.openTasks),
            icon: <Ticket size={15} weight="bold" />,
            hint: { text: `${overview.waitingTasks} waiting`, tone: 'amber' },
          },
          {
            id: 'owners',
            label: 'Owners contacted',
            value: `${overview.ownersContacted}/${overview.ownersContactTarget}`,
            icon: <UsersThree size={15} weight="bold" />,
          },
          {
            id: 'ai',
            label: 'AI drafts pending',
            value: String(overview.aiDraftsPending),
            icon: <Sparkle size={15} weight="bold" />,
            hint: { text: 'review', tone: 'amber' },
          },
        ]}
      />

      <div className="grid min-h-0 flex-1 grid-cols-[1.35fr_1fr] gap-3">
        <Card
          title="Shops needing attention"
          icon={<Storefront size={15} weight="bold" />}
          badge={
            <span className="rounded-full bg-[#EEEBE4] px-1.5 py-0.5 text-[11px] font-semibold text-text-2">
              {attentionRows.length}
            </span>
          }
          hint="4 waiting on an owner"
          className="min-h-0"
          bodyClassName="flex min-h-0 flex-col pt-1"
        >
          <DataTable columns={attentionColumns} rows={attentionRows} />
          <InsightBanner className="mt-3">{dashboardInsight}</InsightBanner>
        </Card>
        <LoadChart />
      </div>

      <div className="grid h-[292px] shrink-0 grid-cols-[0.85fr_1.5fr] gap-3">
        <CalendarCard />
        <Card
          title="Do these first"
          icon={<Ticket size={15} weight="bold" />}
          badge={
            <span className="rounded-full bg-[#EEEBE4] px-1.5 py-0.5 text-[11px] font-semibold text-text-2">
              {firstActions.length}
            </span>
          }
          className="min-h-0 overflow-hidden"
          bodyClassName="flex min-h-0 flex-col gap-0.5 overflow-y-auto px-2 pb-3"
        >
          {firstActions.map((a) => (
            <div key={a.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1">
              <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#EEEBE4] text-text-2">
                {actionIcon[a.icon]}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-semibold text-text">{a.title}</p>
                <p className="truncate text-[11.5px] text-text-2">{a.detail}</p>
              </div>
              <Button
                variant={a.action === 'Confirm' ? 'default' : 'secondary'}
                size="sm"
                onClick={() => navigate(a.action === 'Confirm' ? '/tasks' : '/customers')}
              >
                {a.action}
              </Button>
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
