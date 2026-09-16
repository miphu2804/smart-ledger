import { ArrowRight, Ban, Crown, Mic, ReceiptText, RefreshCw, UserCheck, UserPlus, Users, type LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { Avatar, PlanBadge, StatusBadge } from '../../components/Badges'
import { getStats, now } from '../../services/accountService'
import { LOGIN_METHOD_LABEL, type AdminStats, type LoginMethod } from '../../types'
import { formatDate, formatNumber, formatPercent, formatRelative } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

function Kpi({ icon: Icon, tone, label, value, sub }: { icon: LucideIcon; tone: string; label: string; value: string; sub?: string }) {
  return (
    <div className={`kpi tone-${tone}`}>
      <span className="kpi-icon">
        <Icon size={20} />
      </span>
      <div className="kpi-body">
        <span className="kpi-label">{label}</span>
        <strong className="kpi-value">{value}</strong>
        {sub && <span className="kpi-sub">{sub}</span>}
      </div>
    </div>
  )
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function SignupChart({ data }: { data: AdminStats['signupsPerDay'] }) {
  const max = Math.max(...data.map((d) => d.count), 1)
  const ticks = Array.from(new Set([0, Math.ceil(max / 2), max])).sort((a, b) => b - a)
  const total = data.reduce((s, d) => s + d.count, 0)
  return (
    <div className="bar-chart" role="img" aria-label={`Đăng ký mới 14 ngày qua: tổng ${total} tài khoản`}>
      <div className="bar-y">
        {ticks.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      <div className="bar-area">
        <div className="bar-grid" aria-hidden="true">
          {ticks.map((t) => (
            <i key={t} />
          ))}
        </div>
        <div className="bar-cols">
          {data.map((d, i) => {
            const date = new Date(`${d.date}T00:00:00`)
            const isToday = i === data.length - 1
            return (
              <div key={d.date} className={`bar-col${isToday ? ' is-today' : ''}`}>
                <div className="bar-track">
                  <div className="bar" style={{ height: `${(d.count / max) * 100}%` }}>
                    <span className="bar-tip">
                      {d.count} tài khoản · {formatDate(date.toISOString())}
                    </span>
                  </div>
                </div>
                <span className="bar-x">
                  <b>{date.getDate()}</b>
                  <small>{isToday ? 'Nay' : WEEKDAY[date.getDay()]}</small>
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Donut({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  const r = 42
  const c = 2 * Math.PI * r
  const offsets = parts.map((_, i) => parts.slice(0, i).reduce((s, p) => s + (p.value / total) * c, 0))
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 110 110" className="donut" role="img" aria-label="Phân bổ gói dịch vụ">
        <circle cx="55" cy="55" r={r} fill="none" stroke="var(--bg-soft-2)" strokeWidth="14" />
        {parts.map((p, i) => {
          const len = (p.value / total) * c
          return (
            <circle
              key={p.label}
              cx="55"
              cy="55"
              r={r}
              fill="none"
              stroke={p.color}
              strokeWidth="14"
              strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
              strokeDashoffset={-offsets[i]}
              transform="rotate(-90 55 55)"
              strokeLinecap="butt"
            />
          )
        })}
        <text x="55" y="52" textAnchor="middle" className="donut-num">
          {total}
        </text>
        <text x="55" y="68" textAnchor="middle" className="donut-cap">
          tài khoản
        </text>
      </svg>
      <ul className="legend">
        {parts.map((p) => (
          <li key={p.label}>
            <i style={{ background: p.color }} />
            <span>{p.label}</span>
            <b>{p.value}</b>
            <small>{formatPercent(p.value / total)}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}

const LOGIN_COLORS: Record<LoginMethod, string> = {
  phone: 'var(--primary)',
  google: 'var(--green)',
  facebook: 'var(--primary-300)',
  apple: 'var(--ink)',
}

export default function DashboardPage() {
  const { dataVersion } = useOutletContext<AdminOutletContext>()
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    document.title = 'Tổng quan · Quản trị Sổ Nghe Lời'
  }, [])

  useEffect(() => {
    let alive = true
    setError(null)
    getStats()
      .then((s) => alive && setStats(s))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Không tải được dữ liệu'))
    return () => {
      alive = false
    }
  }, [dataVersion, reload])

  if (error) {
    return (
      <div className="empty">
        <h3>Không tải được số liệu</h3>
        <p>{error}</p>
        <button type="button" className="btn btn-primary" onClick={() => setReload((v) => v + 1)}>
          <RefreshCw size={16} /> Thử lại
        </button>
      </div>
    )
  }

  const current = now()
  const maxIndustry = stats ? Math.max(...stats.industryBreakdown.map((x) => x.count), 1) : 1

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Tổng quan</h1>
          <p>
            Số liệu tính đến {formatDate(current.toISOString())} · tháng {current.getMonth() + 1}/{current.getFullYear()}
          </p>
        </div>
        <Link to="/admin/accounts" className="btn btn-primary">
          <Users size={17} /> Quản lý tài khoản
        </Link>
      </div>

      {!stats ? (
        <div className="kpi-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="kpi skeleton" />
          ))}
        </div>
      ) : (
        <>
          <div className="kpi-grid">
            <Kpi icon={Users} tone="blue" label="Tổng tài khoản" value={formatNumber(stats.totalAccounts)} sub={`${stats.pendingAccounts} chờ xác minh`} />
            <Kpi
              icon={UserCheck}
              tone="green"
              label="Đang hoạt động"
              value={formatNumber(stats.activeAccounts)}
              sub={`${formatPercent(stats.activeAccounts / Math.max(1, stats.totalAccounts))} tổng số`}
            />
            <Kpi icon={Ban} tone="red" label="Bị khoá" value={formatNumber(stats.lockedAccounts)} sub="Cần xem xét định kỳ" />
            <Kpi icon={UserPlus} tone="purple" label="Đăng ký mới 7 ngày" value={formatNumber(stats.newAccounts7d)} sub="Tính cả hôm nay" />
            <Kpi
              icon={ReceiptText}
              tone="gold"
              label="Tổng đơn tháng này"
              value={formatNumber(stats.ordersThisMonth)}
              sub={`${stats.basicNearQuota} tài khoản Cơ bản sắp hết lượt`}
            />
            <Kpi icon={Mic} tone="red-soft" label="Đơn tạo bằng giọng nói" value={formatPercent(stats.voiceOrderRatio, 1)} sub="Theo tổng số đơn tháng này" />
          </div>

          <div className="dash-grid">
            <section className="card card-chart">
              <header className="card-head">
                <div>
                  <h2>Đăng ký mới mỗi ngày</h2>
                  <p>14 ngày gần nhất · tổng {stats.signupsPerDay.reduce((s, d) => s + d.count, 0)} tài khoản</p>
                </div>
              </header>
              <SignupChart data={stats.signupsPerDay} />
            </section>

            <section className="card card-plan">
              <header className="card-head">
                <div>
                  <h2>Phân bổ gói</h2>
                  <p>Theo số tài khoản</p>
                </div>
              </header>
              <Donut
                parts={[
                  { label: 'Cơ bản', value: stats.planDistribution.basic, color: 'var(--primary)' },
                  { label: 'Pro', value: stats.planDistribution.pro, color: 'var(--gold)' },
                ]}
              />
              <div className="login-methods">
                <span className="mini-title">Cách đăng nhập</span>
                <div className="stack-bar">
                  {(Object.keys(stats.loginMethods) as LoginMethod[]).map((k) => (
                    <i
                      key={k}
                      style={{ flex: stats.loginMethods[k], background: LOGIN_COLORS[k] }}
                      title={`${LOGIN_METHOD_LABEL[k]}: ${stats.loginMethods[k]}`}
                    />
                  ))}
                </div>
                <ul className="legend legend-inline">
                  {(Object.keys(stats.loginMethods) as LoginMethod[]).map((k) => (
                    <li key={k}>
                      <i style={{ background: LOGIN_COLORS[k] }} />
                      <span>{k === 'phone' ? 'SĐT' : LOGIN_METHOD_LABEL[k]}</span>
                      <b>{stats.loginMethods[k]}</b>
                    </li>
                  ))}
                </ul>
              </div>
            </section>

            <section className="card card-industry">
              <header className="card-head">
                <div>
                  <h2>Ngành hàng</h2>
                  <p>Số cửa hàng theo ngành</p>
                </div>
              </header>
              <ul className="hbars">
                {stats.industryBreakdown.map((x) => (
                  <li key={x.industry}>
                    <span className="hbar-label">{x.industry}</span>
                    <span className="hbar-track">
                      <i style={{ width: `${(x.count / maxIndustry) * 100}%` }} />
                    </span>
                    <b>{x.count}</b>
                  </li>
                ))}
              </ul>
            </section>

            <section className="card card-newest">
              <header className="card-head">
                <div>
                  <h2>Tài khoản mới nhất</h2>
                  <p>5 cửa hàng đăng ký gần đây</p>
                </div>
                <Link to="/admin/accounts?sort=createdAt-desc" className="btn btn-ghost btn-sm">
                  Xem tất cả <ArrowRight size={15} />
                </Link>
              </header>
              <div className="table-wrap">
                <table className="table table-compact">
                  <thead>
                    <tr>
                      <th>Cửa hàng</th>
                      <th>Ngành hàng</th>
                      <th>Gói</th>
                      <th>Trạng thái</th>
                      <th>Ngày tạo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.newestAccounts.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Cửa hàng">
                          <div className="cell-store">
                            <Avatar name={a.storeName} seed={a.id} size={34} />
                            <div>
                              <strong>{a.storeName}</strong>
                              <span>{a.ownerName}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="Ngành hàng">{a.industry}</td>
                        <td data-label="Gói">
                          <PlanBadge plan={a.plan} />
                        </td>
                        <td data-label="Trạng thái">
                          <StatusBadge status={a.status} />
                        </td>
                        <td data-label="Ngày tạo">
                          <span className="cell-date">
                            {formatDate(a.createdAt)}
                            <small>{formatRelative(a.createdAt, current)}</small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="card card-tip">
              <Crown size={20} />
              <div>
                <strong>Gói Pro chưa mở bán</strong>
                <p>
                  Gói Pro đang “Sắp ra mắt”; {stats.planDistribution.pro} tài khoản Pro hiện có dùng để thử nghiệm. Trang “Gói dịch vụ” sẽ mở khi chốt giá.
                </p>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
