import { Crown } from 'lucide-react'
import { PLAN_LABEL, STATUS_LABEL, type AccountStatus, type PlanId } from '../types'

export function StatusBadge({ status }: { status: AccountStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      <i className="badge-dot" />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function PlanBadge({ plan }: { plan: PlanId }) {
  return (
    <span className={`plan-badge plan-${plan}`}>
      {plan === 'pro' && <Crown size={12} strokeWidth={2.4} />}
      {PLAN_LABEL[plan]}
    </span>
  )
}

export function QuotaBar({ used, quota }: { used: number; quota: number | null }) {
  if (quota === null) {
    return (
      <span className="quota">
        <span className="quota-num">{used.toLocaleString('vi-VN')}</span>
        <span className="quota-sub">Không giới hạn</span>
      </span>
    )
  }
  const pct = Math.min(1, used / quota)
  const tone = pct >= 0.95 ? 'danger' : pct >= 0.8 ? 'warn' : 'ok'
  return (
    <span className="quota" title={`${used}/${quota} lượt tạo đơn`}>
      <span className="quota-num">
        {used}
        <small>/{quota}</small>
      </span>
      <span className={`quota-bar quota-${tone}`}>
        <i style={{ width: `${pct * 100}%` }} />
      </span>
    </span>
  )
}

export function Avatar({ name, seed, size = 36 }: { name: string; seed?: string; size?: number }) {
  const palette = ['#2858D8', '#C8860A', '#2E9E4F', '#7A5AF0', '#E0504F', '#4A6EE5', '#0E8A8A']
  const key = seed ?? name
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  const color = palette[h % palette.length]
  const parts = name.trim().split(/\s+/)
  const letter = (parts[parts.length - 1]?.[0] ?? '?').toUpperCase()
  return (
    <span
      className="avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, color, background: `${color}18`, borderColor: `${color}30` }}
      aria-hidden="true"
    >
      {letter}
    </span>
  )
}
