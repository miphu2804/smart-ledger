import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type Column<T> = {
  id: string
  header: string
  className?: string
  cell: (row: T) => ReactNode
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  selectedId,
  onRowClick,
  rowClassName,
}: {
  columns: Column<T>[]
  rows: T[]
  selectedId?: string
  onRowClick?: (row: T) => void
  rowClassName?: (row: T) => string | undefined
}) {
  return (
    <div className="min-h-0 overflow-auto">
      <table className="w-full border-separate border-spacing-0 text-left">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th
                key={col.id}
                className={cn(
                  'sticky top-0 bg-card pb-2 text-[11.5px] font-medium whitespace-nowrap text-text-3',
                  i === 0 && 'pl-2.5',
                  i === columns.length - 1 && 'pr-2.5',
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const selected = row.id === selectedId
            return (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  'group',
                  onRowClick && 'cursor-pointer',
                  rowClassName?.(row),
                )}
              >
                {columns.map((col, i) => (
                  <td
                    key={col.id}
                    className={cn(
                      'border-t border-line py-2.5 text-[13px] text-text',
                      i === 0 && 'pl-2.5',
                      i === columns.length - 1 && 'pr-2.5',
                      selected && 'bg-row-selected',
                      selected && i === 0 && 'rounded-l-[14px] border-t-transparent',
                      selected &&
                        i === columns.length - 1 &&
                        'rounded-r-[14px] border-t-transparent',
                      selected && i !== 0 && i !== columns.length - 1 && 'border-t-transparent',
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
