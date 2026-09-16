import {
  AlignCenterVertical,
  Palette,
  ShieldCheck,
  Translate,
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { Card } from '@/components/Card'
import { InsightBanner } from '@/components/InsightBanner'
import { StatusChip } from '@/components/StatusChip'
import { currentAdmin } from '@/mocks/session'
import { loadPreferences, savePreferences } from '@/mocks/preferences'
import type { AdminPreferences } from '@/mocks/types'
import { cn } from '@/lib/utils'

function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { id: T; label: string }[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={cn(
              'inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold transition-colors',
              active
                ? 'bg-primary text-white'
                : 'border border-line bg-white text-text hover:bg-frame',
            )}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px] text-[13px]">
      <span className="text-text-2">{label}</span>
      <span className="text-right font-medium text-text">{children}</span>
    </div>
  )
}

export function SettingsPage() {
  const [prefs, setPrefs] = useState<AdminPreferences>(() => loadPreferences())

  function patch(next: Partial<AdminPreferences>) {
    const merged = { ...prefs, ...next }
    setPrefs(merged)
    savePreferences(merged)
  }

  return (
    <div className="h-full min-h-0 overflow-auto px-4 pb-4">
      <div className="grid grid-cols-2 gap-3">
        <Card
          title="Appearance"
          icon={<Palette size={15} weight="bold" />}
          hint="Default is light. Dark is optional."
        >
          <Segmented
            value={prefs.theme}
            onChange={(theme) => patch({ theme })}
            options={[
              { id: 'light', label: 'Light' },
              { id: 'system', label: 'System' },
              { id: 'dark', label: 'Dark' },
            ]}
          />
        </Card>

        <Card
          title="Density"
          icon={<AlignCenterVertical size={15} weight="bold" />}
          hint="Comfortable is the working default."
        >
          <Segmented
            value={prefs.density}
            onChange={(density) => patch({ density })}
            options={[
              { id: 'comfortable', label: 'Comfortable' },
              { id: 'compact', label: 'Compact' },
            ]}
          />
        </Card>

        <Card
          title="Locale"
          icon={<Translate size={15} weight="bold" />}
          hint="Chrome stays English in this prototype."
        >
          <Segmented
            value={prefs.locale}
            onChange={(locale) => patch({ locale })}
            options={[
              { id: 'en', label: 'English' },
              { id: 'vi', label: 'Tiếng Việt' },
            ]}
          />
        </Card>

        <Card
          title="Role and permissions"
          icon={<ShieldCheck size={15} weight="bold" />}
          hint="Read-only from session. No role editor."
          extra={<StatusChip tone="green">{currentAdmin.role}</StatusChip>}
        >
          <Row label="Signed in">{currentAdmin.name}</Row>
          <Row label="Email">{currentAdmin.email}</Row>
          <Row label="Role">{currentAdmin.role}</Row>
          <Row label="Impersonate owner">Not allowed</Row>
          <Row label="Edit ledger">Not allowed</Row>
        </Card>
      </div>

      <InsightBanner className="mt-3">
        Preferences stay on this device. Role comes from session — this prototype cannot
        grant OWNER access or impersonate a shop.
      </InsightBanner>
    </div>
  )
}
