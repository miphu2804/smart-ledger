import {
  Ban,
  Boxes,
  CalendarDays,
  Clock3,
  CreditCard,
  Crown,
  LogIn,
  Mail,
  MapPin,
  Mic,
  Package,
  PencilLine,
  Phone,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Tag,
  Unlock,
  UserPlus,
  Users,
  Wallet,
  HandCoins,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Avatar, PlanBadge, QuotaBar, StatusBadge } from '../../components/Badges'
import { Drawer } from '../../components/Modal'
import Sparkline from '../../components/Sparkline'
import { getAccount, now } from '../../services/accountService'
import { LOGIN_METHOD_LABEL, type Account, type ActivityType } from '../../types'
import { formatCompactVND, formatDate, formatDateTime, formatPercent, formatRelative, formatVND } from '../../utils/format'

interface Props {
  accountId: string | null
  /** Tăng lên để buộc tải lại (sau khi sửa/khoá…) */
  version: number
  onClose: () => void
  onEdit: (a: Account) => void
  onChangePlan: (a: Account) => void
  onToggleLock: (a: Account) => void
}

const ACT_ICON: Record<ActivityType, LucideIcon> = {
  order_voice: Mic,
  order_pos: ReceiptText,
  login: LogIn,
  product: Package,
  expense: Wallet,
  debt: HandCoins,
  plan: Crown,
  status: ShieldCheck,
  signup: UserPlus,
}

const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function Row({ icon: Icon, label, children }: { icon: LucideIcon; label: string; children: ReactNode }) {
  return (
    <div className="dl-row">
      <dt>
        <Icon size={15} /> {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

export default function AccountDetailDrawer({ accountId, version, onClose, onEdit, onChangePlan, onToggleLock }: Props) {
  const [acc, setAcc] = useState<Account | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!accountId) {
      setAcc(null)
      return
    }
    let alive = true
    setError(null)
    getAccount(accountId)
      .then((a) => alive && setAcc(a))
      .catch((e: unknown) => alive && setError(e instanceof Error ? e.message : 'Lỗi tải dữ liệu'))
    return () => {
      alive = false
    }
  }, [accountId, version])

  const current = now()
  const loaded = acc && acc.id === accountId ? acc : null
  const labels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(current)
    d.setDate(d.getDate() - (6 - i))
    return i === 6 ? 'Nay' : WEEKDAY[d.getDay()]
  })

  return (
    <Drawer
      open={Boolean(accountId)}
      onClose={onClose}
      title="Chi tiết tài khoản"
      footer={
        loaded && (
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEdit(loaded)}>
              <PencilLine size={15} /> Sửa
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onChangePlan(loaded)}>
              <CreditCard size={15} /> Đổi gói
            </button>
            <button
              type="button"
              className={`btn btn-sm ${loaded.status === 'locked' ? 'btn-soft' : 'btn-outline danger-text'}`}
              onClick={() => onToggleLock(loaded)}
            >
              {loaded.status === 'locked' ? (
                <>
                  <Unlock size={15} /> Mở khoá
                </>
              ) : (
                <>
                  <Ban size={15} /> Khoá
                </>
              )}
            </button>
          </>
        )
      }
    >
      {error && <div className="alert alert-error">{error}</div>}
      {!loaded && !error && (
        <div className="drawer-skeleton">
          <div className="skeleton" style={{ height: 72 }} />
          <div className="skeleton" style={{ height: 160 }} />
          <div className="skeleton" style={{ height: 120 }} />
        </div>
      )}
      {loaded && (
        <div className="detail">
          <div className="detail-hero">
            <Avatar name={loaded.storeName} seed={loaded.id} size={56} />
            <div className="detail-hero-text">
              <h3>{loaded.storeName}</h3>
              <p>
                {loaded.ownerName} · <span className="mono">{loaded.id}</span>
              </p>
              <div className="detail-badges">
                <StatusBadge status={loaded.status} />
                <PlanBadge plan={loaded.plan} />
                <span className="chip">
                  <Tag size={12} /> {loaded.industry}
                </span>
              </div>
            </div>
          </div>

          {loaded.status === 'locked' && (
            <div className="alert alert-error">
              <Ban size={17} />
              <span>
                <strong>Đang bị khoá.</strong> Lý do: {loaded.lockReason ?? 'Không ghi lý do'}
              </span>
            </div>
          )}
          {loaded.status === 'pending' && (
            <div className="alert alert-warn">
              <Clock3 size={17} />
              <span>Chủ cửa hàng chưa hoàn tất xác minh số điện thoại (OTP).</span>
            </div>
          )}

          <div className="stat-tiles">
            <div className="stat-tile">
              <span>Đơn tháng này</span>
              <QuotaBar used={loaded.ordersThisMonth} quota={loaded.orderQuota} />
            </div>
            <div className="stat-tile">
              <span>Đơn bằng giọng nói</span>
              <strong>{formatPercent(loaded.voiceOrderRatio)}</strong>
              <span className="ratio-bar">
                <i style={{ width: `${loaded.voiceOrderRatio * 100}%` }} />
              </span>
            </div>
            <div className="stat-tile">
              <span>Nhân viên</span>
              <strong>
                <Users size={16} /> {loaded.staffCount}
              </strong>
            </div>
            <div className="stat-tile">
              <span>Mặt hàng</span>
              <strong>
                <Boxes size={16} /> {loaded.productCount}
              </strong>
            </div>
          </div>

          <section className="detail-sec">
            <div className="detail-sec-head">
              <h4>Doanh thu 7 ngày</h4>
              <span>
                Tổng <b>{formatVND(loaded.revenue7d.reduce((s, v) => s + v, 0))}</b>
              </span>
            </div>
            {loaded.revenue7d.some((v) => v > 0) ? (
              <div className="spark-card">
                <Sparkline values={loaded.revenue7d} labels={labels} />
                <div className="spark-meta">
                  <span>Cao nhất {formatCompactVND(Math.max(...loaded.revenue7d))}</span>
                  <span>Hôm nay (tạm tính) {formatCompactVND(loaded.revenue7d[6])}</span>
                </div>
              </div>
            ) : (
              <div className="spark-card spark-empty">Chưa có doanh thu trong 7 ngày qua.</div>
            )}
          </section>

          <section className="detail-sec">
            <h4>Chủ cửa hàng</h4>
            <dl className="dl">
              <Row icon={Users} label="Họ tên">
                {loaded.ownerName}
              </Row>
              <Row icon={Phone} label="Số điện thoại">
                <span className="mono">{loaded.phone}</span>
              </Row>
              <Row icon={Mail} label="Email">
                {loaded.email ?? <span className="muted">Chưa có</span>}
              </Row>
              <Row icon={LogIn} label="Đăng nhập bằng">
                {LOGIN_METHOD_LABEL[loaded.loginMethod]}
              </Row>
            </dl>
          </section>

          <section className="detail-sec">
            <h4>Cửa hàng</h4>
            <dl className="dl">
              <Row icon={Store} label="Ngành hàng">
                {loaded.industry}
              </Row>
              <Row icon={MapPin} label="Địa chỉ">
                {loaded.address}
              </Row>
              <Row icon={CalendarDays} label="Ngày tạo">
                {formatDate(loaded.createdAt)}
              </Row>
              <Row icon={Clock3} label="Hoạt động gần nhất">
                {formatRelative(loaded.lastActiveAt, current)}
              </Row>
            </dl>
          </section>

          <section className="detail-sec">
            <h4>Hoạt động gần đây</h4>
            <ol className="timeline">
              {loaded.activity.slice(0, 8).map((a) => {
                const Icon = ACT_ICON[a.type] ?? Sparkles
                return (
                  <li key={a.id} className={`tl-${a.type}`}>
                    <span className="tl-icon">
                      <Icon size={14} />
                    </span>
                    <div>
                      <p>{a.label}</p>
                      <time dateTime={a.at}>{formatDateTime(a.at)}</time>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>
        </div>
      )}
    </Drawer>
  )
}
