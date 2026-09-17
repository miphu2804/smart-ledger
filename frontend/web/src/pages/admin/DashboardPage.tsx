import {
  ArrowRight,
  ArrowUpRight,
  CloudSlash,
  Clock,
  Eye,
  Gauge,
  Kanban,
  Pulse,
  ShieldCheck,
  Storefront,
  UserPlus,
  Warning,
  WarningCircle,
  type Icon,
} from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { LineChart, MiniBars } from '../../components/admin/charts'
import { Panel, PlanPill, StatusPill } from '../../components/admin/ui'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { useAsync } from '../../hooks/useAsync'
import { getOverview, now } from '../../services/accountService'
import type { AttentionKind } from '../../types'
import { formatDate, formatRelative } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

const ATTENTION: Record<AttentionKind, [Icon, string, string]> = {
  overdue_task: [Clock, 'tone-danger', 'Task quá hạn'],
  sync_error: [CloudSlash, 'tone-danger', 'Lỗi đồng bộ'],
  locked: [ShieldCheck, 'tone-warning', 'Bị khoá'],
  pending_verify: [WarningCircle, 'tone-warning', 'Chưa xác minh'],
  near_quota: [Gauge, 'tone-info', 'Sắp hết lượt'],
}

function Metric({
  icon: I,
  label,
  value,
  suffix,
  foot,
  tone,
}: {
  icon: Icon
  label: string
  value: number | string
  suffix?: string
  foot: React.ReactNode
  tone?: string
}) {
  return (
    <div className="panel metric">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`list-icon ${tone ?? ''}`}>
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

export default function DashboardPage() {
  const { dataVersion } = useOutletContext<AdminOutletContext>()
  const [days, setDays] = useState(14)
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(() => getOverview(days), [days, dataVersion])
  const current = now()
  const openShop = (id?: string) => id && navigate(`/admin/customers?tab=shops&shop=${id}`)

  const header = (
    <div className="page-bar">
      <p>Số liệu đến {formatDate(current.toISOString())} · chỉ dữ liệu hỗ trợ, không có doanh thu hay sổ nghiệp vụ</p>
      <div className="seg-tabs" role="tablist" aria-label="Khoảng thời gian">
        {[7, 14, 30].map((d) => (
          <button key={d} type="button" role="tab" aria-selected={days === d} onClick={() => setDays(d)}>
            {d} ngày
          </button>
        ))}
      </div>
    </div>
  )

  if (error)
    return (
      <>
        {header}
        <div className="panel">
          <ErrorState error={error} onRetry={reload} title="Không tải được tổng quan" />
        </div>
      </>
    )

  if (!data)
    return (
      <>
        {header}
        <LoadingState variant="cards" rows={4} label="Đang tải tổng quan…" />
        <div style={{ height: 16 }} />
        <LoadingState variant="detail" rows={2} />
      </>
    )

  if (data.totalShops === 0)
    return (
      <>
        {header}
        <div className="panel">
          <EmptyState icon={Storefront} title="Chưa có cơ sở nào" description="Số liệu sẽ xuất hiện khi chủ cơ sở đăng ký trên ứng dụng." />
        </div>
      </>
    )

  const delta = data.newOwners - data.newOwnersPrev
  const labels = data.trend.map((t) => t.date)

  return (
    <div className={loading ? 'dt-loading' : undefined} aria-busy={loading}>
      {header}
      <div className="metrics" style={{ marginBottom: 16 }}>
        <Metric
          icon={Storefront}
          label="Cơ sở đang hoạt động"
          value={data.activeShops}
          suffix={`/ ${data.totalShops}`}
          foot={`${Math.round((data.activeShops / data.totalShops) * 100)}% tổng số cơ sở`}
        />
        <Metric
          icon={UserPlus}
          label={`OWNER mới · ${data.periodDays} ngày`}
          value={data.newOwners}
          foot={
            <>
              <ArrowUpRight size={14} style={{ transform: delta < 0 ? 'rotate(90deg)' : undefined }} aria-hidden="true" />
              {delta >= 0 ? '+' : ''}
              {delta} so với {data.periodDays} ngày trước
            </>
          }
        />
        <Metric
          icon={Kanban}
          label="Task hỗ trợ đang mở"
          value={data.openTasks}
          tone={data.overdueTasks ? 'tone-warning' : undefined}
          foot={
            data.overdueTasks ? (
              <span
                style={{
                  color: 'var(--danger)',
                  display: 'inline-flex',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <Warning size={14} /> {data.overdueTasks} task quá hạn
              </span>
            ) : (
              'Không có task quá hạn'
            )
          }
        />
        <Metric
          icon={CloudSlash}
          label="Cơ sở lỗi đồng bộ"
          value={data.shopsWithSyncErrors}
          tone={data.shopsWithSyncErrors ? 'tone-danger' : undefined}
          foot="Trong 7 ngày gần nhất"
        />
      </div>

      <div className="grid-12">
        <Panel
          className="col-8"
          icon={Pulse}
          title="Tình hình hỗ trợ"
          subtitle={`${data.periodDays} ngày gần nhất · số task mở mới và đã xử lý`}
          actions={
            <Link to="/admin/tasks" className="btn btn-ghost btn-sm">
              Mở Kanban <ArrowRight size={14} />
            </Link>
          }
        >
          <LineChart
            labels={labels}
            unit=" task"
            series={[
              {
                key: 'opened',
                label: 'Task mở mới',
                color: 'var(--chart-1)',
                values: data.trend.map((t) => t.tasksOpened),
              },
              {
                key: 'resolved',
                label: 'Task đã xử lý',
                color: 'var(--chart-2)',
                values: data.trend.map((t) => t.tasksResolved),
              },
            ]}
          />
          <div style={{ marginTop: 16 }}>
            <div className="row-between" style={{ marginBottom: 6 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>
                Cơ sở mới mỗi ngày
              </span>
              <strong className="num">{data.trend.reduce((a, t) => a + t.newShops, 0)} cơ sở</strong>
            </div>
            <MiniBars labels={labels} values={data.trend.map((t) => t.newShops)} label="cơ sở mới" />
          </div>
        </Panel>

        <Panel
          className="col-4"
          title="Cần chú ý"
          subtitle={`${Math.min(5, data.needsAttention.length)} mục ưu tiên · chỉ đọc, không tự tạo task`}
          bodyClass=""
        >
          {data.needsAttention.length === 0 ? (
            <EmptyState compact icon={ShieldCheck} title="Không có mục cần chú ý" />
          ) : (
            <ul className="list">
              {data.needsAttention.slice(0, 5).map((a) => {
                const [I, tone, tag] = ATTENTION[a.kind]
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      className="list-item"
                      onClick={() => (a.taskId ? navigate(`/admin/tasks?task=${a.taskId}`) : openShop(a.shopId))}
                    >
                      <span className={`list-icon ${tone}`}>
                        <I size={16} aria-hidden="true" />
                      </span>
                      <div>
                        <strong>{a.title}</strong>
                        <span>{a.detail}</span>
                        <span style={{ fontSize: 11.5 }}>
                          {tag} · {formatRelative(a.at, current)}
                        </span>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          className="col-8"
          icon={Storefront}
          title="Cơ sở & OWNER mới"
          subtitle="Đăng ký gần đây"
          bodyClass=""
          actions={
            <Link to="/admin/customers" className="btn btn-ghost btn-sm">
              Xem tất cả <ArrowRight size={14} />
            </Link>
          }
        >
          <div className="dt-wrap">
            <table className="dt dt-list">
              <thead>
                <tr>
                  <th>Cơ sở</th>
                  <th>OWNER</th>
                  <th className="hide-md">Gói</th>
                  <th>Trạng thái</th>
                  <th>Đăng ký</th>
                </tr>
              </thead>
              <tbody>
                {data.recentShops.map((s) => (
                  <tr key={s.businessId} className="clickable" onClick={() => openShop(s.businessId)}>
                    <td>
                      <div className="cell-main">
                        <span className="shop-mark">
                          <Storefront size={18} />
                        </span>
                        <div>
                          <Link to={`/admin/customers?tab=shops&shop=${s.businessId}`} onClick={(e) => e.stopPropagation()}>
                            <strong style={{ color: 'var(--text-primary)' }}>{s.businessName}</strong>
                          </Link>
                          <span>{s.industry}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label="OWNER">{s.owner.fullName}</td>
                    <td data-label="Gói" className="hide-md">
                      <PlanPill plan={s.plan} />
                    </td>
                    <td data-label="Trạng thái">
                      <StatusPill status={s.owner.status} />
                    </td>
                    <td data-label="Đăng ký" className="sub" style={{ whiteSpace: 'nowrap' }}>
                      {formatRelative(s.createdAt, current)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="col-4" title="Truy cập gần đây của ADMIN" subtitle="Audit khi mở chi tiết khách hàng" bodyClass="panel-body">
          {data.recentAdminAccess.length === 0 ? (
            <EmptyState compact icon={Eye} title="Chưa có lượt xem" description="Mỗi lần mở chi tiết OWNER/cơ sở sẽ được ghi ở đây." />
          ) : (
            <ol className="tl">
              {data.recentAdminAccess.map((a) => (
                <li key={a.id}>
                  <span className="tl-dot">
                    <Eye size={14} />
                  </span>
                  <div>
                    <p>
                      <strong>{a.actor}</strong> {a.action.toLowerCase()} <strong>{a.target}</strong>
                    </p>
                    <time dateTime={a.at}>{formatRelative(a.at, current)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}
          <Link to="/admin/settings/audit" className="btn btn-ghost btn-sm" style={{ marginTop: 4 }}>
            Toàn bộ nhật ký <ArrowRight size={14} />
          </Link>
        </Panel>
      </div>
    </div>
  )
}
