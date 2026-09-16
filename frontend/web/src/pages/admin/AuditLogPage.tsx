import { History, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { listAuditLog, now } from '../../services/accountService'
import type { AuditEntry } from '../../types'
import { formatDateTime, formatRelative } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

export default function AuditLogPage() {
  const { dataVersion } = useOutletContext<AdminOutletContext>()
  const [rows, setRows] = useState<AuditEntry[] | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    document.title = 'Nhật ký · Quản trị Sổ Nghe Lời'
  }, [])

  useEffect(() => {
    let alive = true
    listAuditLog().then((r) => alive && setRows(r))
    return () => {
      alive = false
    }
  }, [dataVersion, tick])

  const current = now()

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Nhật ký thao tác</h1>
          <p>Các thay đổi do quản trị viên thực hiện trên tài khoản cửa hàng</p>
        </div>
        <button type="button" className="btn btn-outline" onClick={() => setTick((v) => v + 1)}>
          <RefreshCw size={16} /> Làm mới
        </button>
      </div>
      <div className="card">
        {!rows ? (
          <div className="drawer-skeleton">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="skeleton" style={{ height: 56 }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <History size={28} />
            </span>
            <h3>Chưa có thao tác nào</h3>
          </div>
        ) : (
          <ol className="timeline timeline-log">
            {rows.map((r) => (
              <li key={r.id}>
                <span className="tl-icon">
                  <History size={14} />
                </span>
                <div>
                  <p>
                    <strong>{r.action}</strong>
                    {r.target && <> · {r.target}</>}
                  </p>
                  {r.detail && <p className="muted">{r.detail}</p>}
                  <time dateTime={r.at} title={formatDateTime(r.at)}>
                    {r.actor} · {formatRelative(r.at, current)} · {formatDateTime(r.at)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}
