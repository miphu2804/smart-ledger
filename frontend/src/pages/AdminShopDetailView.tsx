import { CaretRight, WarningCircle } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Initials } from '@/components/AvatarStack'
import { DrawerFooter, DrawerHeader } from '@/components/Drawer'
import { StatusChip } from '@/components/StatusChip'
import { Button } from '@/components/ui/button'
import type { AdminShopDetail, ChipTone, ShopSupportStatus } from '@/mocks/types'

const statusTone: Record<ShopSupportStatus, ChipTone> = {
  NEEDS_ACTION: 'red',
  ACTIVE: 'green',
  INACTIVE: 'gray',
}

const statusLabel: Record<ShopSupportStatus, string> = {
  NEEDS_ACTION: 'Needs action',
  ACTIVE: 'Active',
  INACTIVE: 'Inactive',
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-[7px] text-[13px]">
      <span className="text-text-2">{label}</span>
      <span className="text-right font-medium text-text">{children}</span>
    </div>
  )
}

export function AdminShopDetailView({
  shop,
  onClose,
}: {
  shop: AdminShopDetail
  onClose: () => void
}) {
  const navigate = useNavigate()

  return (
    <>
      <DrawerHeader onClose={onClose}>
        <div className="flex items-center gap-2.5">
          <Initials initial={shop.avatarInitial} tone={shop.avatarTone} size={36} />
          <div className="min-w-0">
            <h2 className="truncate text-[16px] font-semibold tracking-tight text-text">
              {shop.name}
            </h2>
            <p className="truncate text-[12px] text-text-2">
              {shop.ownerName} · {shop.ownerPhone}
            </p>
          </div>
        </div>
      </DrawerHeader>

      <div className="min-h-0 flex-1 overflow-auto px-4 pb-3">
        <div className="rounded-[14px] border border-line px-3 py-2.5">
          <p className="text-[11px] font-medium text-text-3">What is needed next</p>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-text">
            {shop.neededNext}
          </p>
        </div>

        {shop.blocked && shop.blockedReason ? (
          <div className="mt-3 flex gap-2 rounded-[14px] bg-danger-bg px-3 py-2.5">
            <WarningCircle
              size={16}
              weight="fill"
              className="mt-0.5 shrink-0 text-[var(--chip-red-fg)]"
            />
            <div>
              <p className="text-[12.5px] font-semibold text-[var(--chip-red-fg)]">
                Support is blocked
              </p>
              <p className="text-[12px] leading-snug text-[var(--chip-red-fg)]">
                {shop.blockedReason}
              </p>
            </div>
          </div>
        ) : null}

        <div className="mt-4">
          <Field label="Shop id">{shop.id.toUpperCase()}</Field>
          <Field label="Industry">{shop.industry}</Field>
          <Field label="Created">{shop.createdLabel}</Field>
          <Field label="Last access">{shop.lastAccessLabel} ago</Field>
          <Field label="Status">
            <StatusChip tone={statusTone[shop.status]}>{statusLabel[shop.status]}</StatusChip>
          </Field>
          <Field label="Owner">{shop.ownerName}</Field>
        </div>

        {shop.blockingItems.length > 0 ? (
          <div className="mt-4">
            <p className="mb-2 text-[13px] font-semibold text-text">Blocking this shop</p>
            <div className="flex flex-col gap-1.5">
              {shop.blockingItems.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-[14px] border border-line px-3 py-2"
                >
                  <span
                    className="size-1.5 shrink-0 rounded-full"
                    style={{
                      background:
                        item.tone === 'red'
                          ? 'var(--chip-red-fg)'
                          : item.tone === 'amber'
                            ? 'var(--chip-amber-fg)'
                            : 'var(--chip-gray-fg)',
                    }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-text">{item.title}</p>
                    <p className="truncate text-[11.5px] text-text-2">{item.detail}</p>
                  </div>
                  <CaretRight size={14} className="text-text-3" />
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <p className="mt-4 rounded-[14px] bg-[#F3F1EC] px-3 py-2.5 text-[12px] leading-relaxed text-text-2">
          A shop list that only shows status tells you nothing. What matters is what is
          stopping each owner from moving forward.
        </p>
      </div>

      <DrawerFooter>
        <Button className="flex-1" variant="accent" onClick={() => navigate('/tasks')}>
          Create task
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DrawerFooter>
    </>
  )
}
