import { CaretRight, Storefront } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Initials } from '@/components/AvatarStack'
import { Card } from '@/components/Card'
import { DataTable, type Column } from '@/components/DataTable'
import { Drawer } from '@/components/Drawer'
import { FilterChips } from '@/components/FilterChips'
import { StatusChip } from '@/components/StatusChip'
import { getShopDetail, listShops, shopCounts } from '@/mocks/shops'
import type { AdminShop, ChipTone, ShopSupportStatus } from '@/mocks/types'
import { AdminShopDetailView } from './AdminShopDetailView'

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

function accessTone(shop: AdminShop): ChipTone {
  if (shop.status === 'INACTIVE') return 'gray'
  if (shop.lastAccessLabel.endsWith('d') && parseInt(shop.lastAccessLabel, 10) >= 3) {
    return 'red'
  }
  if (shop.status === 'NEEDS_ACTION') return 'amber'
  return 'gray'
}

const columns: Column<AdminShop>[] = [
  {
    id: 'shop',
    header: 'Shop',
    className: 'w-[28%]',
    cell: (row) => (
      <div className="flex items-center gap-2.5">
        <Initials initial={row.avatarInitial} tone={row.avatarTone} size={32} />
        <div className="min-w-0">
          <p className="truncate font-semibold">{row.name}</p>
          <p className="truncate text-[11.5px] text-text-2">{row.ownerPhone}</p>
        </div>
      </div>
    ),
  },
  {
    id: 'status',
    header: 'Status',
    className: 'w-[14%]',
    cell: (row) => (
      <div>
        <StatusChip tone={statusTone[row.status]}>{statusLabel[row.status]}</StatusChip>
        <p className="mt-1 text-[11.5px] text-text-3">{row.industry}</p>
      </div>
    ),
  },
  {
    id: 'next',
    header: 'What is needed next',
    cell: (row) => <span className="leading-snug">{row.neededNext}</span>,
  },
  {
    id: 'access',
    header: 'Last access',
    className: 'w-[12%]',
    cell: (row) => <StatusChip tone={accessTone(row)}>{row.lastAccessLabel}</StatusChip>,
  },
  {
    id: 'owner',
    header: 'Owner',
    className: 'w-[14%]',
    cell: (row) => (
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <Initials initial={row.ownerName.charAt(0)} tone={row.avatarTone} size={26} />
          <span className="text-[12.5px] text-text-2">{row.ownerName.split(' ')[0]}</span>
        </span>
        <CaretRight size={14} className="text-text-3" />
      </div>
    ),
  },
]

export function CustomersPage() {
  const [filter, setFilter] = useState<ShopSupportStatus | 'ALL'>('NEEDS_ACTION')
  const [selectedId, setSelectedId] = useState<string>('shp-hanh')

  const rows = useMemo(() => listShops(filter), [filter])
  const selected = selectedId ? getShopDetail(selectedId) : undefined

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 px-4 pb-4">
      <FilterChips
        value={filter}
        onChange={(id) => setFilter(id as ShopSupportStatus | 'ALL')}
        items={[
          { id: 'NEEDS_ACTION', label: 'Needs action', count: shopCounts.NEEDS_ACTION },
          { id: 'ACTIVE', label: 'Active', count: shopCounts.ACTIVE },
          { id: 'INACTIVE', label: 'Inactive', count: shopCounts.INACTIVE },
          { id: 'ALL', label: 'All', count: shopCounts.ALL },
        ]}
      />

      <Card
        title="Shops"
        icon={<Storefront size={15} weight="bold" />}
        badge={
          <span className="rounded-full bg-[#EEEBE4] px-1.5 py-0.5 text-[11px] font-semibold text-text-2">
            {rows.length}
          </span>
        }
        hint={
          filter === 'NEEDS_ACTION'
            ? '4 waiting on an owner reply'
            : `${shopCounts.ALL} shops in the book`
        }
        className="min-h-0 flex-1"
        bodyClassName="flex min-h-0 flex-col pt-1"
      >
        <DataTable
          columns={columns}
          rows={rows}
          selectedId={selectedId}
          onRowClick={(row) => setSelectedId(row.id)}
        />
      </Card>

      <Drawer open={Boolean(selected)} onClose={() => setSelectedId('')}>
        {selected ? (
          <AdminShopDetailView shop={selected} onClose={() => setSelectedId('')} />
        ) : null}
      </Drawer>
    </div>
  )
}
