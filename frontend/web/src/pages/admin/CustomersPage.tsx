/**
 * Khách hàng — tab OWNER / Cơ sở, tìm kiếm, phân trang, trạng thái tải/rỗng/lỗi.
 * Bấm một dòng mở drawer chi tiết bên phải (mỗi lần mở đều ghi audit).
 * Chỉ đọc: không sửa hoá đơn/chi phí/công nợ/tồn kho, không giả danh OWNER.
 */
import { CaretRight, ChatCircleDots, CloudSlash, DeviceMobile, Info, NotePencil, ShieldCheck, Storefront, UserCircle } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useOutletContext, useSearchParams } from 'react-router-dom'
import { Avatar, DetailDrawer, Panel, PlanPill, QuotaLine, SearchInput, StatusPill } from '../../components/admin/ui'
import Pagination from '../../components/Pagination'
import { EmptyState, ErrorState, LoadingState } from '../../components/States'
import { useAsync } from '../../hooks/useAsync'
import { getShopDetail, getUserDetail, listShops, listUsers, now } from '../../services/accountService'
import { LOGIN_METHOD_LABEL, PLATFORM_LABEL, STATUS_LABEL, type AccountStatus, type PlanId } from '../../types'
import { formatDate, formatDateTime, formatPercent, formatRelative } from '../../utils/format'
import type { AdminOutletContext } from './AdminLayout'

type Tab = 'owners' | 'shops'

function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

export default function CustomersPage() {
  const { dataVersion } = useOutletContext<AdminOutletContext>()
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'shops' ? 'shops' : 'owners'
  const shopId = params.get('shop')
  const ownerId = params.get('owner')

  const [q, setQ] = useState(params.get('q') ?? '')
  const [status, setStatus] = useState<AccountStatus | 'all'>('all')
  const [plan, setPlan] = useState<PlanId | 'all'>('all')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const term = useDebounced(q.trim())

  const patch = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params)
    Object.entries(next).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)))
    setParams(p, { replace: false })
  }

  const setTab = (t: Tab) => {
    setPage(1)
    patch({ tab: t, shop: null, owner: null })
  }

  const users = useAsync(
    () => (tab === 'owners' ? listUsers({ q: term, status, page, pageSize }) : Promise.resolve(null)),
    [tab, term, status, page, pageSize, dataVersion],
  )
  const shops = useAsync(
    () =>
      tab === 'shops'
        ? listShops({
            q: term,
            status,
            plan,
            page,
            pageSize,
            sortBy: 'createdAt',
            sortDir: 'desc',
          })
        : Promise.resolve(null),
    [tab, term, status, plan, page, pageSize, dataVersion],
  )
  const active = tab === 'owners' ? users : shops
  const current = now()
  const filtered = Boolean(term) || status !== 'all' || plan !== 'all'

  const reset = () => {
    setQ('')
    setStatus('all')
    setPlan('all')
    setPage(1)
  }

  return (
    <>
      <div className="page-bar">
        <p className="scope-line">
          <ShieldCheck size={16} aria-hidden="true" /> Chỉ thông tin hỗ trợ tối thiểu. Mỗi lần mở chi tiết đều được ghi nhật ký.
        </p>
      </div>

      <Panel bodyClass="">
        <div className="shop-tabs">
          <div className="seg-tabs" role="tablist" aria-label="Loại khách hàng">
            <button type="button" role="tab" aria-selected={tab === 'owners'} onClick={() => setTab('owners')}>
              <UserCircle size={16} aria-hidden="true" /> OWNER
            </button>
            <button type="button" role="tab" aria-selected={tab === 'shops'} onClick={() => setTab('shops')}>
              <Storefront size={16} aria-hidden="true" /> Cơ sở
            </button>
          </div>
          {active.data && (
            <span className="muted num" aria-live="polite">
              {active.data.total} {tab === 'owners' ? 'OWNER' : 'cơ sở'}
            </span>
          )}
        </div>

        <div className="filterbar" role="search">
          <SearchInput
            className="grow"
            value={q}
            onChange={(v) => {
              setQ(v)
              setPage(1)
            }}
            label="Tìm khách hàng"
            placeholder={tab === 'owners' ? 'Tên, email, số điện thoại hoặc tên cơ sở…' : 'Tên cơ sở, tên chủ, email hoặc SĐT…'}
          />
          <select
            className="select"
            aria-label="Trạng thái tài khoản"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as AccountStatus | 'all')
              setPage(1)
            }}
          >
            <option value="all">Mọi trạng thái</option>
            {(Object.keys(STATUS_LABEL) as AccountStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {tab === 'shops' && (
            <select
              className="select"
              aria-label="Gói dịch vụ"
              value={plan}
              onChange={(e) => {
                setPlan(e.target.value as PlanId | 'all')
                setPage(1)
              }}
            >
              <option value="all">Mọi gói</option>
              <option value="basic">Cơ bản</option>
              <option value="pro">Pro</option>
            </select>
          )}
          {filtered && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Xoá lọc
            </button>
          )}
        </div>

        {active.error ? (
          <ErrorState error={active.error} onRetry={active.reload} title="Không tải được danh sách khách hàng" />
        ) : !active.data ? (
          <LoadingState variant="table" rows={pageSize > 10 ? 10 : 6} label="Đang tải danh sách khách hàng…" />
        ) : active.data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              search
              title="Không tìm thấy khách hàng phù hợp"
              description="Thử từ khoá khác hoặc bỏ bớt bộ lọc."
              action={
                <button type="button" className="btn btn-outline" onClick={reset}>
                  Xoá bộ lọc
                </button>
              }
            />
          ) : (
            <EmptyState icon={Storefront} title="Chưa có khách hàng" description="Chủ cơ sở đăng ký trên ứng dụng sẽ xuất hiện ở đây." />
          )
        ) : (
          <div className={active.loading ? 'dt-loading' : undefined} aria-busy={active.loading}>
            <div className="dt-wrap">
              {tab === 'owners' && users.data ? (
                <table className="dt dt-list">
                  <caption className="sr-only">Danh sách OWNER</caption>
                  <thead>
                    <tr>
                      <th scope="col">OWNER</th>
                      <th scope="col">Số điện thoại</th>
                      <th scope="col" className="hide-md">
                        Cơ sở
                      </th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col" className="hide-md">
                        Đăng nhập gần nhất
                      </th>
                      <th scope="col" className="col-end">
                        <span className="sr-only">Mở</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.data.items.map((u) => (
                      <tr
                        key={u.id}
                        className={`clickable${ownerId === u.id ? ' is-selected' : ''}`}
                        onClick={() => patch({ owner: u.id, shop: null })}
                      >
                        <td>
                          <div className="cell-main">
                            <Avatar name={u.fullName} size={36} />
                            <div>
                              <button
                                type="button"
                                className="link-btn"
                                style={{
                                  color: 'var(--text-primary)',
                                  textAlign: 'left',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  patch({ owner: u.id, shop: null })
                                }}
                              >
                                {u.fullName}
                              </button>
                              <span>{u.email ?? 'Chưa có email'}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="SĐT" className="num">
                          {u.phone}
                        </td>
                        <td data-label="Cơ sở" className="hide-md">
                          {u.shopCount} · <span className="sub">{u.shops[0]?.name}</span>
                        </td>
                        <td data-label="Trạng thái">
                          <StatusPill status={u.status} />
                        </td>
                        <td data-label="Đăng nhập" className="sub hide-md">
                          {formatRelative(u.lastLoginAt, current)}
                        </td>
                        <td className="col-end">
                          <CaretRight size={16} aria-hidden="true" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : shops.data ? (
                <table className="dt dt-list">
                  <caption className="sr-only">Danh sách cơ sở</caption>
                  <thead>
                    <tr>
                      <th scope="col">Cơ sở</th>
                      <th scope="col">OWNER</th>
                      <th scope="col" className="hide-md">
                        Khu vực
                      </th>
                      <th scope="col">Gói</th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col" className="hide-md">
                        Hoạt động
                      </th>
                      <th scope="col" className="col-end">
                        <span className="sr-only">Mở</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shops.data.items.map((s) => (
                      <tr
                        key={s.businessId}
                        className={`clickable${shopId === s.businessId ? ' is-selected' : ''}`}
                        onClick={() => patch({ shop: s.businessId, owner: null })}
                      >
                        <td>
                          <div className="cell-main">
                            <span className="shop-mark">
                              <Storefront size={18} aria-hidden="true" />
                            </span>
                            <div>
                              <button
                                type="button"
                                className="link-btn"
                                style={{
                                  color: 'var(--text-primary)',
                                  textAlign: 'left',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  patch({ shop: s.businessId, owner: null })
                                }}
                              >
                                {s.businessName}
                              </button>
                              <span>{s.industry}</span>
                            </div>
                          </div>
                        </td>
                        <td data-label="OWNER">
                          {s.owner.fullName}
                          {s.ownerBusinessCount > 1 && <span className="sub"> · {s.ownerBusinessCount} cơ sở</span>}
                        </td>
                        <td data-label="Khu vực" className="sub hide-md">
                          {s.area}
                        </td>
                        <td data-label="Gói">
                          <PlanPill plan={s.plan} />
                        </td>
                        <td data-label="Trạng thái">
                          <StatusPill status={s.owner.status} />
                        </td>
                        <td data-label="Hoạt động" className="sub hide-md">
                          {formatRelative(s.lastActiveAt, current)}
                        </td>
                        <td className="col-end">
                          <CaretRight size={16} aria-hidden="true" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
            <Pagination
              page={active.data.page}
              pageSize={active.data.pageSize}
              total={active.data.total}
              totalPages={active.data.totalPages}
              unit={tab === 'owners' ? 'OWNER' : 'cơ sở'}
              onPage={setPage}
              onPageSize={(n) => {
                setPageSize(n)
                setPage(1)
              }}
            />
          </div>
        )}
      </Panel>

      <ShopDrawer id={shopId} onClose={() => patch({ shop: null })} onOpenOwner={(id) => patch({ owner: id, shop: null, tab: 'owners' })} />
      <OwnerDrawer id={ownerId} onClose={() => patch({ owner: null })} onOpenShop={(id) => patch({ shop: id, owner: null })} />
    </>
  )
}

/* ------------------------------------------------------------------ */

function ScopeNotice() {
  return (
    <div className="notice notice-info" style={{ marginTop: 20 }}>
      <Info size={18} aria-hidden="true" />
      <span>
        ADMIN chỉ xem thông tin hỗ trợ. Không hiển thị doanh thu, hoá đơn, chi phí, công nợ, tồn kho hay token; không có thao tác sửa sổ hoặc đăng
        nhập thay chủ cơ sở.
      </span>
    </div>
  )
}

function ShopDrawer({ id, onClose, onOpenOwner }: { id: string | null; onClose: () => void; onOpenOwner: (id: string) => void }) {
  const { openCreateTask } = useOutletContext<AdminOutletContext>()
  const { data, error, reload } = useAsync(() => (id ? getShopDetail(id) : Promise.resolve(null)), [id])
  const current = now()
  const d = data && data.business.id === id ? data : null

  return (
    <DetailDrawer
      open={Boolean(id)}
      onClose={onClose}
      title={d?.business.name ?? 'Chi tiết cơ sở'}
      subtitle={d ? `${d.business.industry} · Mã ${d.business.id}` : 'Đang tải…'}
      leading={
        <span className="shop-mark" style={{ width: 40, height: 40 }}>
          <Storefront size={20} aria-hidden="true" />
        </span>
      }
      footer={
        d && (
          <>
            <Link to={`/admin/ai?shop=${d.business.id}`} className="btn btn-outline">
              <ChatCircleDots size={16} /> Hỏi AI
            </Link>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                openCreateTask({
                  shopId: d.business.id,
                  title: `Hỗ trợ ${d.business.name}`,
                })
              }
            >
              <NotePencil size={16} /> Tạo task
            </button>
          </>
        )
      }
    >
      {error ? (
        <ErrorState compact error={error} onRetry={reload} title="Không mở được chi tiết cơ sở" />
      ) : !d ? (
        <LoadingState variant="list" rows={5} label="Đang tải chi tiết cơ sở…" />
      ) : (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatusPill status={d.owner.status} />
            <PlanPill plan={d.subscription.plan} />
            {d.usage.syncErrors7d > 0 && (
              <span className="pill pill-danger">
                <CloudSlash size={13} weight="bold" aria-hidden="true" /> {d.usage.syncErrors7d} lỗi đồng bộ
              </span>
            )}
          </div>

          <h3 className="section-title">Chủ cơ sở</h3>
          <button type="button" className="list-item" style={{ padding: '8px 0', borderBottom: 0 }} onClick={() => onOpenOwner(d.owner.id)}>
            <Avatar name={d.owner.fullName} size={36} />
            <div>
              <strong>{d.owner.fullName}</strong>
              <span>
                {d.owner.phone}
                {d.owner.email ? ` · ${d.owner.email}` : ''}
              </span>
            </div>
            <CaretRight size={16} aria-hidden="true" style={{ alignSelf: 'center', color: 'var(--text-tertiary)' }} />
          </button>
          {d.owner.lockReason && (
            <div className="notice notice-danger" style={{ marginTop: 8 }}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Lý do khoá: {d.owner.lockReason}</span>
            </div>
          )}
          <dl className="kv">
            <dt>Đăng nhập bằng</dt>
            <dd>{LOGIN_METHOD_LABEL[d.owner.loginMethod]}</dd>
            <dt>Xác minh</dt>
            <dd>
              SĐT {d.owner.phoneVerified ? '✓' : '✗'} · Email {d.owner.emailVerified ? '✓' : '✗'}
            </dd>
            <dt>Đăng nhập gần nhất</dt>
            <dd>{formatDateTime(d.owner.lastLoginAt)}</dd>
          </dl>

          <h3 className="section-title">Cơ sở</h3>
          <dl className="kv">
            <dt>Địa chỉ</dt>
            <dd>{d.business.address}</dd>
            <dt>Ngày tạo</dt>
            <dd>{formatDate(d.business.createdAt)}</dd>
            <dt>Hoạt động gần nhất</dt>
            <dd>{formatRelative(d.business.lastActiveAt, current)}</dd>
            <dt>Nhân viên</dt>
            <dd>{d.usage.staffCount} người</dd>
            <dt>Tỉ lệ đơn bằng giọng nói</dt>
            <dd>{formatPercent(d.usage.voiceOrderRatio)}</dd>
          </dl>

          <h3 className="section-title">Gói & hạn mức tháng này</h3>
          <QuotaLine used={d.subscription.quotaUsed} limit={d.subscription.quotaLimit} />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            Kỳ {formatDate(d.subscription.periodStart)} – {formatDate(d.subscription.periodEnd)} · đếm số lượt tạo đơn, không có số tiền
          </p>

          <h3 className="section-title">Đồng bộ & thiết bị</h3>
          <dl className="kv">
            <dt>Đồng bộ gần nhất</dt>
            <dd>{d.usage.lastSyncAt ? formatRelative(d.usage.lastSyncAt, current) : 'Chưa đồng bộ'}</dd>
            <dt>Lỗi 7 ngày</dt>
            <dd
              style={{
                color: d.usage.syncErrors7d ? 'var(--danger)' : undefined,
              }}
            >
              {d.usage.syncErrors7d}
            </dd>
          </dl>
          {d.devices.length === 0 && <p className="muted">Chưa có thiết bị đăng nhập.</p>}
          {d.devices.map((dv) => (
            <div key={dv.id} className="device">
              <span className="list-icon">
                <DeviceMobile size={16} aria-hidden="true" />
              </span>
              <div>
                <strong>{dv.model}</strong>
                <span>
                  {PLATFORM_LABEL[dv.platform]} · app {dv.appVersion} · {formatRelative(dv.lastSeenAt, current)}
                </span>
              </div>
            </div>
          ))}

          {d.otherBusinesses.length > 0 && (
            <>
              <h3 className="section-title">Cơ sở khác của OWNER</h3>
              <div className="chip-links">
                {d.otherBusinesses.map((b) => (
                  <Link key={b.id} className="chip-link" to={`/admin/customers?tab=shops&shop=${b.id}`}>
                    <Storefront size={14} aria-hidden="true" /> {b.name}
                  </Link>
                ))}
              </div>
            </>
          )}

          <h3 className="section-title">Sự kiện hỗ trợ gần đây</h3>
          {d.events.length === 0 ? (
            <EmptyState compact title="Chưa có sự kiện" />
          ) : (
            <ol className="tl">
              {d.events.map((e) => (
                <li key={e.id}>
                  <span className={`tl-dot${e.type === 'sync_error' || e.type === 'login_failed' ? ' tone-danger' : ''}`}>
                    <i
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 9,
                        background: 'currentColor',
                      }}
                    />
                  </span>
                  <div>
                    <p>{e.label}</p>
                    <time dateTime={e.at}>{formatDateTime(e.at)}</time>
                  </div>
                </li>
              ))}
            </ol>
          )}

          <ScopeNotice />
        </>
      )}
    </DetailDrawer>
  )
}

function OwnerDrawer({ id, onClose, onOpenShop }: { id: string | null; onClose: () => void; onOpenShop: (id: string) => void }) {
  const { data, error, reload } = useAsync(() => (id ? getUserDetail(id) : Promise.resolve(null)), [id])
  const current = now()
  const u = data && data.id === id ? data : null

  return (
    <DetailDrawer
      open={Boolean(id)}
      onClose={onClose}
      title={u?.fullName ?? 'Chi tiết OWNER'}
      subtitle={u ? `OWNER · Mã ${u.id}` : 'Đang tải…'}
      leading={u ? <Avatar name={u.fullName} size={40} /> : undefined}
    >
      {error ? (
        <ErrorState compact error={error} onRetry={reload} title="Không mở được chi tiết OWNER" />
      ) : !u ? (
        <LoadingState variant="list" rows={4} label="Đang tải chi tiết OWNER…" />
      ) : (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            <StatusPill status={u.status} />
            <PlanPill plan={u.plan} />
          </div>
          {u.lockReason && (
            <div className="notice notice-danger" style={{ marginBottom: 12 }}>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Lý do khoá: {u.lockReason}</span>
            </div>
          )}
          <h3 className="section-title">Liên hệ</h3>
          <dl className="kv">
            <dt>Số điện thoại</dt>
            <dd className="num">
              {u.phone} {u.phoneVerified ? '· đã xác minh' : '· chưa xác minh'}
            </dd>
            <dt>Email</dt>
            <dd>{u.email ? `${u.email}${u.emailVerified ? ' · đã xác minh' : ''}` : 'Chưa có'}</dd>
            <dt>Đăng nhập bằng</dt>
            <dd>{LOGIN_METHOD_LABEL[u.loginMethod]}</dd>
            <dt>Ngày đăng ký</dt>
            <dd>{formatDate(u.createdAt)}</dd>
            <dt>Đăng nhập gần nhất</dt>
            <dd>{formatRelative(u.lastLoginAt, current)}</dd>
          </dl>

          <h3 className="section-title">Cơ sở ({u.shopCount})</h3>
          <ul className="list">
            {u.shops.map((s) => (
              <li key={s.id}>
                <button type="button" className="list-item" style={{ paddingInline: 0 }} onClick={() => onOpenShop(s.id)}>
                  <span className="shop-mark">
                    <Storefront size={16} aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{s.name}</strong>
                    <span>Mã {s.id}</span>
                  </div>
                  <CaretRight
                    size={16}
                    aria-hidden="true"
                    style={{
                      alignSelf: 'center',
                      color: 'var(--text-tertiary)',
                    }}
                  />
                </button>
              </li>
            ))}
          </ul>

          <h3 className="section-title">Thiết bị</h3>
          {u.devices.length === 0 && <p className="muted">Chưa có thiết bị đăng nhập.</p>}
          {u.devices.map((dv) => (
            <div key={dv.id} className="device">
              <span className="list-icon">
                <DeviceMobile size={16} aria-hidden="true" />
              </span>
              <div>
                <strong>{dv.model}</strong>
                <span>
                  {PLATFORM_LABEL[dv.platform]} · app {dv.appVersion} · {formatRelative(dv.lastSeenAt, current)}
                </span>
              </div>
            </div>
          ))}

          <ScopeNotice />
        </>
      )}
    </DetailDrawer>
  )
}
