/**
 * Tổng quan quản trị đọc từ Core: số chủ tiệm và cửa hàng theo trạng thái, số mới trong kỳ, cửa hàng mới nhất và
 * các lần truy cập quản trị gần đây. Core không có doanh thu, xu hướng hay task, nên trang không hiện các số đó.
 */
import { ArrowRight, ClockCounterClockwise, Storefront, UserCircle, UserPlus, type Icon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Panel } from '../../../components/admin/ui'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States'
import { useAsync } from '../../../hooks/useAsync'
import { ACCESS_ACTION_LABEL, getOverview, lastDays, listAccessLogs, listShops } from '../../../services/adminApi'
import { formatDate, formatDateTime } from '../../../utils/format'
import { nameOf } from './coreUtils'
import { ShopStatusPill } from './parts'

const PERIODS = [7, 30, 90] as const

function Metric({ icon: I, label, value, suffix, foot }: { icon: Icon; label: string; value: number; suffix?: string; foot: React.ReactNode }) {
  return (
    <div className="panel metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className="list-icon">
          <I size={18} aria-hidden="true" />
        </span>
      </div>
      <div className="metric-value">
        {value}
        {suffix && <small>{suffix}</small>}
      </div>
      <div className="metric-foot">{foot}</div>
    </div>
  )
}

export default function CoreDashboardPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(30)
  const navigate = useNavigate()
  const overview = useAsync(() => getOverview(lastDays(days)), [days])
  const shops = useAsync(() => listShops({ page: 0, size: 5 }), [])
  const logs = useAsync(() => listAccessLogs({ page: 0, size: 8 }), [])
  const data = overview.data

  return (
    <>
      <div className="page-bar">
        <p>
          {data
            ? `Từ ${formatDate(data.fromDate)} đến ${formatDate(data.toDate)} · cập nhật ${formatDateTime(data.asOf)} · chỉ dữ liệu hỗ trợ, không có doanh thu hay sổ nghiệp vụ`
            : 'Chỉ dữ liệu hỗ trợ, không có doanh thu hay sổ nghiệp vụ'}
        </p>
        <div className="seg-tabs" role="tablist" aria-label="Khoảng thời gian">
          {PERIODS.map((d) => (
            <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}>
              {d} ngày
            </button>
          ))}
        </div>
      </div>

      {overview.error ? (
        <ErrorState error={overview.error} onRetry={overview.reload} title="Không tải được tổng quan" />
      ) : !data ? (
        <LoadingState variant="cards" label="Đang tải tổng quan…" />
      ) : (
        <div className="metrics" style={{ marginBottom: 16 }}>
          <Metric
            icon={UserCircle}
            label="Chủ tiệm"
            value={data.owners.total}
            foot={`${data.owners.active} hoạt động · ${data.owners.disabled} bị khoá`}
          />
          <Metric icon={UserPlus} label={`Chủ tiệm mới · ${days} ngày`} value={data.owners.createdInPeriod} foot="Đăng ký trong kỳ đang xem" />
          <Metric
            icon={Storefront}
            label="Cửa hàng đang hoạt động"
            value={data.shops.active}
            suffix={`/ ${data.shops.total}`}
            foot={`${data.shops.inactive} tạm ngưng · ${data.shops.archived} đã lưu trữ`}
          />
          <Metric icon={Storefront} label={`Cửa hàng mới · ${days} ngày`} value={data.shops.createdInPeriod} foot="Tạo trong kỳ đang xem" />
        </div>
      )}

      <div className="grid-12">
        <Panel
          className="col-8"
          icon={Storefront}
          title="Cửa hàng mới nhất"
          subtitle="5 cửa hàng tạo gần đây"
          actions={
            <Link to="/admin/customers?tab=shops" className="btn btn-ghost btn-sm">
              Xem tất cả <ArrowRight size={14} />
            </Link>
          }
          bodyClass=""
        >
          {shops.error ? (
            <ErrorState compact error={shops.error} onRetry={shops.reload} title="Không tải được cửa hàng" />
          ) : !shops.data ? (
            <LoadingState variant="table" rows={5} label="Đang tải cửa hàng…" />
          ) : shops.data.items.length === 0 ? (
            <EmptyState compact icon={Storefront} title="Chưa có cửa hàng" />
          ) : (
            <div className="dt-wrap">
              <table className="dt dt-list">
                <caption className="sr-only">Cửa hàng mới nhất</caption>
                <thead>
                  <tr>
                    <th scope="col">Cửa hàng</th>
                    <th scope="col" className="hide-md">
                      Chủ tiệm
                    </th>
                    <th scope="col">Trạng thái</th>
                    <th scope="col" className="hide-md">
                      Ngày tạo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {shops.data.items.map((s) => (
                    <tr key={s.id} className="clickable" onClick={() => navigate(`/admin/customers?tab=shops&shop=${s.id}`)}>
                      <td>
                        <div className="cell-main">
                          <span className="shop-mark">
                            <Storefront size={18} aria-hidden="true" />
                          </span>
                          <div>
                            <strong>{s.name}</strong>
                            <span className="sub">{s.industry ?? 'Chưa chọn ngành'}</span>
                          </div>
                        </div>
                      </td>
                      <td className="hide-md">{nameOf(s.ownerDisplayName)}</td>
                      <td>
                        <ShopStatusPill status={s.status} />
                      </td>
                      <td className="hide-md num">{formatDate(s.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          className="col-4"
          icon={ClockCounterClockwise}
          title="Truy cập gần đây"
          subtitle="Các lần bạn xem dữ liệu quản trị"
          actions={
            <Link to="/admin/access-logs" className="btn btn-ghost btn-sm">
              Nhật ký <ArrowRight size={14} />
            </Link>
          }
        >
          {logs.error ? (
            <ErrorState compact error={logs.error} onRetry={logs.reload} title="Không tải được nhật ký" />
          ) : !logs.data ? (
            <LoadingState variant="list" rows={5} label="Đang tải nhật ký…" />
          ) : logs.data.items.length === 0 ? (
            <EmptyState compact title="Chưa có lần truy cập nào" />
          ) : (
            <ol className="tl">
              {logs.data.items.map((l) => (
                <li key={l.id}>
                  <span className={`tl-dot${l.outcome && l.outcome !== 'SUCCESS' ? ' tone-danger' : ''}`}>
                    <i style={{ width: 6, height: 6, borderRadius: 9, background: 'currentColor' }} />
                  </span>
                  <div>
                    <p>
                      {ACCESS_ACTION_LABEL[l.action] ?? l.action}
                      {l.shopId ? ` · cửa hàng #${l.shopId}` : l.targetId ? ` · #${l.targetId}` : ''}
                    </p>
                    <time dateTime={l.occurredAt}>{formatDateTime(l.occurredAt)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </>
  )
}
