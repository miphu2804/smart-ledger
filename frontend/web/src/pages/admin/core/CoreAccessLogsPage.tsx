/**
 * Nhật ký truy cập quản trị (`/admin/access-logs`): các lần chính ADMIN đang đăng nhập xem hoặc đổi dữ liệu quản trị.
 * Core không cho xem nhật ký của ADMIN khác và không có nhật ký nghiệp vụ (hoá đơn, công nợ) ở đây.
 * Lọc theo thao tác, mã cửa hàng và khoảng ngày (giờ Việt Nam; "đến ngày" tính cả ngày đó).
 */
import { ClockCounterClockwise, ShieldCheck } from '@phosphor-icons/react'
import { useState } from 'react'
import { Panel } from '../../../components/admin/ui'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States'
import { useAsync } from '../../../hooks/useAsync'
import { ACCESS_ACTION_LABEL, SHOP_STATUS_LABEL, listAccessLogs, type AdminAccessAction } from '../../../services/adminApi'
import { formatDateTime } from '../../../utils/format'
import { useDebounced } from './coreUtils'
import { CorePager } from './parts'

/** yyyy-MM-dd (giờ Việt Nam) → mốc ISO có múi giờ +07:00; `nextDay` để làm mốc "đến" không tính */
function vnStart(date: string, nextDay = false): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined
  const d = new Date(`${date}T00:00:00+07:00`)
  if (nextDay) d.setTime(d.getTime() + 24 * 60 * 60 * 1000)
  return d.toISOString()
}

const TARGET_LABEL: Record<string, string> = {
  SYSTEM: 'Hệ thống',
  OWNER_LIST: 'Danh sách chủ tiệm',
  OWNER: 'Chủ tiệm',
  SHOP_LIST: 'Danh sách cửa hàng',
  SHOP: 'Cửa hàng',
  ADMIN_ACCESS_LOG_LIST: 'Nhật ký truy cập',
}

export default function CoreAccessLogsPage() {
  const [action, setAction] = useState<AdminAccessAction | ''>('')
  const [shopInput, setShopInput] = useState('')
  const shopId = useDebounced(shopInput.trim())
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const shopNum = /^\d+$/.test(shopId) ? Number(shopId) : undefined
  const rangeErr = from && to && from > to ? '“Từ ngày” phải trước “Đến ngày”.' : null

  const logs = useAsync(
    () =>
      rangeErr
        ? Promise.resolve(null)
        : listAccessLogs({ action: action || undefined, shopId: shopNum, from: vnStart(from), to: vnStart(to, true), page, size }),
    [action, shopNum, from, to, page, size, rangeErr],
  )
  const filtered = Boolean(action || shopNum || from || to)
  function reset() {
    setAction('')
    setShopInput('')
    setFrom('')
    setTo('')
    setPage(0)
  }

  return (
    <>
      <div className="page-bar">
        <p className="scope-line">
          <ShieldCheck size={16} aria-hidden="true" /> Chỉ các lần bạn truy cập dữ liệu quản trị. Không ai tắt hay sửa được nhật ký này.
        </p>
      </div>
      <Panel bodyClass="">
        <div className="filterbar" role="search">
          <select
            className="select"
            aria-label="Thao tác"
            value={action}
            onChange={(e) => {
              setAction(e.target.value as AdminAccessAction | '')
              setPage(0)
            }}
          >
            <option value="">Mọi thao tác</option>
            {(Object.keys(ACCESS_ACTION_LABEL) as AdminAccessAction[]).map((a) => (
              <option key={a} value={a}>
                {ACCESS_ACTION_LABEL[a]}
              </option>
            ))}
          </select>
          <input
            className="input"
            inputMode="numeric"
            aria-label="Mã cửa hàng"
            placeholder="Mã cửa hàng"
            style={{ maxWidth: 150 }}
            value={shopInput}
            onChange={(e) => {
              setShopInput(e.target.value.replace(/\D/g, ''))
              setPage(0)
            }}
          />
          <label className="sr-only" htmlFor="log-from">
            Từ ngày
          </label>
          <input
            id="log-from"
            className="input"
            type="date"
            style={{ maxWidth: 170 }}
            value={from}
            onChange={(e) => {
              setFrom(e.target.value)
              setPage(0)
            }}
          />
          <label className="sr-only" htmlFor="log-to">
            Đến ngày
          </label>
          <input
            id="log-to"
            className="input"
            type="date"
            style={{ maxWidth: 170 }}
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setPage(0)
            }}
          />
          {filtered && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Xoá lọc
            </button>
          )}
        </div>

        {rangeErr ? (
          <div className="notice notice-warning" style={{ margin: 16 }}>
            {rangeErr}
          </div>
        ) : logs.error ? (
          <ErrorState error={logs.error} onRetry={logs.reload} title="Không tải được nhật ký" />
        ) : !logs.data ? (
          <LoadingState variant="table" rows={6} label="Đang tải nhật ký…" />
        ) : logs.data.items.length === 0 ? (
          <EmptyState search={filtered} icon={filtered ? undefined : ClockCounterClockwise} title={filtered ? 'Không có lần truy cập phù hợp' : 'Chưa có lần truy cập nào'} />
        ) : (
          <div className={logs.loading ? 'dt-loading' : undefined} aria-busy={logs.loading}>
            <div className="dt-wrap">
              <table className="dt dt-list">
                <caption className="sr-only">Nhật ký truy cập quản trị</caption>
                <thead>
                  <tr>
                    <th scope="col">Thời gian</th>
                    <th scope="col">Thao tác</th>
                    <th scope="col" className="hide-md">
                      Đối tượng
                    </th>
                    <th scope="col" className="hide-md">
                      Chi tiết
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.data.items.map((l) => (
                    <tr key={l.id}>
                      <td className="num">{formatDateTime(l.occurredAt)}</td>
                      <td>
                        <strong>{ACCESS_ACTION_LABEL[l.action] ?? l.action}</strong>
                        {l.outcome && l.outcome !== 'SUCCESS' && <span className="sub"> · {l.outcome}</span>}
                      </td>
                      <td className="hide-md">
                        {(l.targetType && TARGET_LABEL[l.targetType]) ?? l.targetType ?? '—'}
                        {l.targetId ? ` #${l.targetId}` : ''}
                        {l.shopId && l.shopId !== l.targetId ? ` · cửa hàng #${l.shopId}` : ''}
                      </td>
                      <td className="hide-md">
                        {l.beforeStatus || l.afterStatus
                          ? `${l.beforeStatus ? SHOP_STATUS_LABEL[l.beforeStatus] : '—'} → ${l.afterStatus ? SHOP_STATUS_LABEL[l.afterStatus] : '—'}${l.reason ? ` · ${l.reason}` : ''}`
                          : l.reason || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <CorePager
              data={logs.data}
              unit="lần truy cập"
              onPage={setPage}
              onPageSize={(n) => {
                setSize(n)
                setPage(0)
              }}
            />
          </div>
        )}
      </Panel>
    </>
  )
}
