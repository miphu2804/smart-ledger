import { CaretLeft, CaretRight } from '@phosphor-icons/react'

function pageList(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const out: (number | '…')[] = [1]
  const start = Math.max(2, page - 1)
  const end = Math.min(total - 1, page + 1)
  if (start > 2) out.push('…')
  for (let i = start; i <= end; i++) out.push(i)
  if (end < total - 1) out.push('…')
  out.push(total)
  return out
}

interface Props {
  page: number
  pageSize: number
  total: number
  totalPages: number
  unit?: string
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
}

export default function Pagination({ page, pageSize, total, totalPages, unit = 'mục', onPage, onPageSize }: Props) {
  if (total === 0) return null
  return (
    <div className="pager">
      <span className="pager-info">
        <span className="num">
          {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} {unit}
        </span>
        {onPageSize && (
          <select className="select" aria-label="Số dòng mỗi trang" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
            {[10, 20, 50].map((n) => (
              <option key={n} value={n}>
                {n} / trang
              </option>
            ))}
          </select>
        )}
      </span>
      <nav className="pager-btns" aria-label="Phân trang">
        <button type="button" className="icon-btn" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">
          <CaretLeft size={16} />
        </button>
        {pageList(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="pager-ellipsis">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              className={`pager-num${p === page ? ' is-active' : ''}`}
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Trang ${p}`}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" className="icon-btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">
          <CaretRight size={16} />
        </button>
      </nav>
    </div>
  )
}
