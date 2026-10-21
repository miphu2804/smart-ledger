/**
 * Khách hàng đọc từ Core: tab Chủ tiệm (`/admin/users`) và Cửa hàng (`/admin/shops`), tìm kiếm, lọc trạng thái, phân trang
 * theo trang của Core. Bấm một dòng mở khung chi tiết; khung cửa hàng có lịch sử trạng thái và nút tạm ngưng / mở lại
 * (`PATCH /api/v1/shops/{id}/status`). Mọi lần xem đều được Core ghi vào nhật ký truy cập.
 */
import { PauseCircle, PlayCircle, ShieldCheck, Storefront, UserCircle } from '@phosphor-icons/react'
import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Avatar, DetailDrawer, Panel, SearchInput } from '../../../components/admin/ui'
import Modal from '../../../components/Modal'
import { EmptyState, ErrorState, LoadingState } from '../../../components/States'
import { useToast } from '../../../components/Toast'
import { useAsync } from '../../../hooks/useAsync'
import {
  SHOP_STATUS_LABEL,
  USER_STATUS_LABEL,
  getOwner,
  getShop,
  listOwners,
  listShopStatusHistory,
  listShops,
  updateShopStatus,
  type ShopDetail,
  type ShopStatus,
  type UserStatus,
} from '../../../services/adminApi'
import { formatDate, formatDateTime } from '../../../utils/format'
import { nameOf, useDebounced } from './coreUtils'
import { CorePager, ShopStatusPill, UserStatusPill } from './parts'

type Tab = 'owners' | 'shops'

export default function CoreCustomersPage() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'shops' ? 'shops' : 'owners'
  const ownerId = Number(params.get('owner')) || null
  const shopId = Number(params.get('shop')) || null

  const [q, setQ] = useState('')
  const query = useDebounced(q.trim())
  const [ownerStatus, setOwnerStatus] = useState<UserStatus | ''>('')
  const [shopStatus, setShopStatus] = useState<ShopStatus | ''>('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(20)
  const [version, setVersion] = useState(0)

  const owners = useAsync(
    () => (tab === 'owners' ? listOwners({ query: query || undefined, status: ownerStatus || undefined, page, size }) : Promise.resolve(null)),
    [tab, query, ownerStatus, page, size],
  )
  const shops = useAsync(
    () => (tab === 'shops' ? listShops({ query: query || undefined, status: shopStatus || undefined, page, size }) : Promise.resolve(null)),
    [tab, query, shopStatus, page, size, version],
  )
  const active = tab === 'owners' ? owners : shops
  const filtered = Boolean(query) || (tab === 'owners' ? Boolean(ownerStatus) : Boolean(shopStatus))

  function patch(next: Record<string, string | null>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null) p.delete(k)
      else p.set(k, v)
    }
    setParams(p, { replace: true })
  }
  function switchTab(t: Tab) {
    setPage(0)
    setQ('')
    patch({ tab: t, owner: null, shop: null })
  }
  function reset() {
    setQ('')
    setOwnerStatus('')
    setShopStatus('')
    setPage(0)
  }

  return (
    <>
      <div className="page-bar">
        <p className="scope-line">
          <ShieldCheck size={16} aria-hidden="true" /> Chỉ thông tin hỗ trợ tối thiểu. Mỗi lần tìm và mở chi tiết đều được ghi nhật ký.
        </p>
      </div>

      <Panel bodyClass="">
        <div className="shop-tabs">
          <div className="seg-tabs" role="tablist" aria-label="Loại khách hàng">
            <button type="button" role="tab" aria-selected={tab === 'owners'} onClick={() => switchTab('owners')}>
              <UserCircle size={16} aria-hidden="true" /> Chủ tiệm
            </button>
            <button type="button" role="tab" aria-selected={tab === 'shops'} onClick={() => switchTab('shops')}>
              <Storefront size={16} aria-hidden="true" /> Cửa hàng
            </button>
          </div>
          {active.data && (
            <span className="muted num" aria-live="polite">
              {active.data.totalElements} {tab === 'owners' ? 'chủ tiệm' : 'cửa hàng'}
            </span>
          )}
        </div>

        <div className="filterbar" role="search">
          <SearchInput
            className="grow"
            value={q}
            onChange={(v) => {
              setQ(v)
              setPage(0)
            }}
            label={tab === 'owners' ? 'Tìm chủ tiệm' : 'Tìm cửa hàng'}
            placeholder={tab === 'owners' ? 'Tên, email hoặc số điện thoại…' : 'Tên cửa hàng, tên chủ hoặc số điện thoại…'}
          />
          {tab === 'owners' ? (
            <select
              className="select"
              aria-label="Trạng thái tài khoản"
              value={ownerStatus}
              onChange={(e) => {
                setOwnerStatus(e.target.value as UserStatus | '')
                setPage(0)
              }}
            >
              <option value="">Mọi trạng thái</option>
              {(Object.keys(USER_STATUS_LABEL) as UserStatus[]).map((s) => (
                <option key={s} value={s}>
                  {USER_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          ) : (
            <select
              className="select"
              aria-label="Trạng thái cửa hàng"
              value={shopStatus}
              onChange={(e) => {
                setShopStatus(e.target.value as ShopStatus | '')
                setPage(0)
              }}
            >
              <option value="">Mọi trạng thái</option>
              {(Object.keys(SHOP_STATUS_LABEL) as ShopStatus[]).map((s) => (
                <option key={s} value={s}>
                  {SHOP_STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          )}
          {filtered && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
              Xoá lọc
            </button>
          )}
        </div>

        {active.error ? (
          <ErrorState error={active.error} onRetry={active.reload} title="Không tải được danh sách" />
        ) : !active.data ? (
          <LoadingState variant="table" rows={6} label="Đang tải danh sách…" />
        ) : active.data.items.length === 0 ? (
          filtered ? (
            <EmptyState
              search
              title="Không tìm thấy kết quả phù hợp"
              description="Thử từ khoá khác hoặc bỏ bớt bộ lọc."
              action={
                <button type="button" className="btn btn-outline" onClick={reset}>
                  Xoá bộ lọc
                </button>
              }
            />
          ) : (
            <EmptyState icon={Storefront} title="Chưa có dữ liệu" description="Chủ tiệm đăng ký trên ứng dụng sẽ xuất hiện ở đây." />
          )
        ) : (
          <div className={active.loading ? 'dt-loading' : undefined} aria-busy={active.loading}>
            <div className="dt-wrap">
              {tab === 'owners' && owners.data ? (
                <table className="dt dt-list">
                  <caption className="sr-only">Danh sách chủ tiệm</caption>
                  <thead>
                    <tr>
                      <th scope="col">Chủ tiệm</th>
                      <th scope="col">Số điện thoại</th>
                      <th scope="col" className="hide-md">
                        Cửa hàng
                      </th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col" className="hide-md">
                        Ngày tạo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {owners.data.items.map((u) => (
                      <tr key={u.id} className={`clickable${ownerId === u.id ? ' is-selected' : ''}`} onClick={() => patch({ owner: String(u.id), shop: null })}>
                        <td>
                          <div className="cell-main">
                            <Avatar name={nameOf(u.displayName)} size={36} />
                            <div>
                              <strong>{nameOf(u.displayName)}</strong>
                              <span className="sub">{u.maskedEmail ?? 'Không có email'}</span>
                            </div>
                          </div>
                        </td>
                        <td className="num">{u.maskedPhone ?? '—'}</td>
                        <td className="hide-md num">{u.shopCount}</td>
                        <td>
                          <UserStatusPill status={u.status} />
                        </td>
                        <td className="hide-md num">{formatDate(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : shops.data ? (
                <table className="dt dt-list">
                  <caption className="sr-only">Danh sách cửa hàng</caption>
                  <thead>
                    <tr>
                      <th scope="col">Cửa hàng</th>
                      <th scope="col" className="hide-md">
                        Chủ tiệm
                      </th>
                      <th scope="col" className="hide-md">
                        Số điện thoại
                      </th>
                      <th scope="col">Trạng thái</th>
                      <th scope="col" className="hide-md">
                        Ngày tạo
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shops.data.items.map((s) => (
                      <tr key={s.id} className={`clickable${shopId === s.id ? ' is-selected' : ''}`} onClick={() => patch({ shop: String(s.id), owner: null })}>
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
                        <td className="hide-md num">{s.maskedPhone ?? '—'}</td>
                        <td>
                          <ShopStatusPill status={s.status} />
                        </td>
                        <td className="hide-md num">{formatDate(s.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </div>
            <CorePager
              data={active.data}
              unit={tab === 'owners' ? 'chủ tiệm' : 'cửa hàng'}
              onPage={setPage}
              onPageSize={(n) => {
                setSize(n)
                setPage(0)
              }}
            />
          </div>
        )}
      </Panel>

      <OwnerDrawer id={ownerId} onClose={() => patch({ owner: null })} onOpenShop={(id) => patch({ shop: String(id), owner: null })} />
      <ShopDrawer
        id={shopId}
        onClose={() => patch({ shop: null })}
        onOpenOwner={(id) => patch({ owner: String(id), shop: null })}
        onChanged={() => setVersion((v) => v + 1)}
      />
    </>
  )
}

/* ------------------------------------------------------------------ */

function OwnerDrawer({ id, onClose, onOpenShop }: { id: number | null; onClose: () => void; onOpenShop: (id: number) => void }) {
  const { data: u, error, reload } = useAsync(() => (id ? getOwner(id) : Promise.resolve(null)), [id])
  const shops = useAsync(() => (id ? listShops({ ownerId: id, page: 0, size: 50 }) : Promise.resolve(null)), [id])
  return (
    <DetailDrawer
      open={Boolean(id)}
      onClose={onClose}
      title={u ? nameOf(u.displayName) : 'Chi tiết chủ tiệm'}
      subtitle={u ? `Chủ tiệm · Mã ${u.id}` : 'Đang tải…'}
      leading={u ? <Avatar name={nameOf(u.displayName)} size={40} /> : undefined}
    >
      {error ? (
        <ErrorState compact error={error} onRetry={reload} title="Không mở được chi tiết chủ tiệm" />
      ) : !u ? (
        <LoadingState variant="list" rows={4} label="Đang tải chi tiết chủ tiệm…" />
      ) : (
        <>
          <h3 className="section-title">Tài khoản</h3>
          <dl className="kv">
            <dt>Trạng thái</dt>
            <dd>
              <UserStatusPill status={u.status} />
            </dd>
            <dt>Email</dt>
            <dd>{u.email ?? '—'}</dd>
            <dt>Số điện thoại</dt>
            <dd className="num">{u.phone ?? '—'}</dd>
            <dt>Ngày tạo</dt>
            <dd>{formatDateTime(u.createdAt)}</dd>
            <dt>Cập nhật</dt>
            <dd>{formatDateTime(u.updatedAt)}</dd>
          </dl>

          <h3 className="section-title">Cửa hàng ({u.shopCount})</h3>
          {shops.error ? (
            <ErrorState compact error={shops.error} onRetry={shops.reload} title="Không tải được cửa hàng" />
          ) : !shops.data ? (
            <LoadingState variant="list" rows={2} label="Đang tải cửa hàng…" />
          ) : shops.data.items.length === 0 ? (
            <EmptyState compact icon={Storefront} title="Chưa có cửa hàng" />
          ) : (
            <div className="list">
              {shops.data.items.map((s) => (
                <button key={s.id} type="button" className="list-item" onClick={() => onOpenShop(s.id)}>
                  <span className="shop-mark">
                    <Storefront size={18} aria-hidden="true" />
                  </span>
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <strong>{s.name}</strong>
                    <span className="sub" style={{ display: 'block' }}>
                      {s.industry ?? 'Chưa chọn ngành'} · tạo {formatDate(s.createdAt)}
                    </span>
                  </div>
                  <ShopStatusPill status={s.status} />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </DetailDrawer>
  )
}

/* ------------------------------------------------------------------ */

function ShopDrawer({
  id,
  onClose,
  onOpenOwner,
  onChanged,
}: {
  id: number | null
  onClose: () => void
  onOpenOwner: (id: number) => void
  onChanged: () => void
}) {
  const [version, setVersion] = useState(0)
  const { data: d, error, reload } = useAsync(() => (id ? getShop(id) : Promise.resolve(null)), [id, version])
  const history = useAsync(() => (id ? listShopStatusHistory(id, { page: 0, size: 10 }) : Promise.resolve(null)), [id, version])
  const [action, setAction] = useState<'INACTIVE' | 'ACTIVE' | null>(null)

  return (
    <>
      <DetailDrawer
        open={Boolean(id)}
        onClose={onClose}
        title={d?.name ?? 'Chi tiết cửa hàng'}
        subtitle={d ? `${d.industry ?? 'Chưa chọn ngành'} · Mã ${d.id}` : 'Đang tải…'}
        leading={
          <span className="shop-mark" style={{ width: 40, height: 40 }}>
            <Storefront size={20} aria-hidden="true" />
          </span>
        }
        footer={
          d && d.status !== 'ARCHIVED' ? (
            d.status === 'ACTIVE' ? (
              <button type="button" className="btn btn-outline" onClick={() => setAction('INACTIVE')}>
                <PauseCircle size={16} /> Tạm ngưng cửa hàng
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={() => setAction('ACTIVE')}>
                <PlayCircle size={16} /> Mở lại cửa hàng
              </button>
            )
          ) : undefined
        }
      >
        {error ? (
          <ErrorState compact error={error} onRetry={reload} title="Không mở được chi tiết cửa hàng" />
        ) : !d ? (
          <LoadingState variant="list" rows={4} label="Đang tải chi tiết cửa hàng…" />
        ) : (
          <>
            <h3 className="section-title">Cửa hàng</h3>
            <dl className="kv">
              <dt>Trạng thái</dt>
              <dd>
                <ShopStatusPill status={d.status} />
              </dd>
              {d.status === 'INACTIVE' && (
                <>
                  <dt>Lý do tạm ngưng</dt>
                  <dd>{d.inactiveReason || '—'}</dd>
                </>
              )}
              {d.status === 'ARCHIVED' && (
                <>
                  <dt>Lưu trữ lúc</dt>
                  <dd>{d.archivedAt ? formatDateTime(d.archivedAt) : '—'}</dd>
                  <dt>Lý do lưu trữ</dt>
                  <dd>{d.archivedReason || '—'}</dd>
                </>
              )}
              <dt>Số điện thoại</dt>
              <dd className="num">{d.phone ?? '—'}</dd>
              <dt>Địa chỉ</dt>
              <dd>{d.address ?? '—'}</dd>
              <dt>Ngày tạo</dt>
              <dd>{formatDateTime(d.createdAt)}</dd>
              <dt>Cập nhật</dt>
              <dd>{formatDateTime(d.updatedAt)}</dd>
            </dl>

            {d.owner && (
              <>
                <h3 className="section-title">Chủ tiệm</h3>
                <button type="button" className="list-item" style={{ padding: '8px 0', borderBottom: 0 }} onClick={() => onOpenOwner(d.owner!.id)}>
                  <Avatar name={nameOf(d.owner.displayName)} size={36} />
                  <div style={{ flex: 1, textAlign: 'left' }}>
                    <strong>{nameOf(d.owner.displayName)}</strong>
                    <span className="sub" style={{ display: 'block' }}>
                      {[d.owner.email, d.owner.phone].filter(Boolean).join(' · ') || 'Không có liên hệ'}
                    </span>
                  </div>
                  <UserStatusPill status={d.owner.status} />
                </button>
              </>
            )}

            <h3 className="section-title">Lịch sử trạng thái</h3>
            {history.error ? (
              <ErrorState compact error={history.error} onRetry={history.reload} title="Không tải được lịch sử" />
            ) : !history.data ? (
              <LoadingState variant="list" rows={2} label="Đang tải lịch sử…" />
            ) : history.data.items.length === 0 ? (
              <p className="muted">Chưa đổi trạng thái lần nào.</p>
            ) : (
              <ol className="tl">
                {history.data.items.map((e) => (
                  <li key={e.id}>
                    <span className={`tl-dot${e.afterStatus === 'INACTIVE' ? ' tone-danger' : ''}`}>
                      <i style={{ width: 6, height: 6, borderRadius: 9, background: 'currentColor' }} />
                    </span>
                    <div>
                      <p>
                        {e.beforeStatus ? SHOP_STATUS_LABEL[e.beforeStatus] : '—'} → {e.afterStatus ? SHOP_STATUS_LABEL[e.afterStatus] : '—'}
                        {e.reason ? ` · ${e.reason}` : ''}
                      </p>
                      <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </>
        )}
      </DetailDrawer>

      {d && action && (
        <StatusModal
          shop={d}
          target={action}
          onClose={() => setAction(null)}
          onDone={() => {
            setAction(null)
            setVersion((v) => v + 1)
            onChanged()
          }}
        />
      )}
    </>
  )
}

function StatusModal({
  shop,
  target,
  onClose,
  onDone,
}: {
  shop: ShopDetail
  target: 'INACTIVE' | 'ACTIVE'
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pausing = target === 'INACTIVE'
  const reasonErr = pausing && reason.trim().length < 3 ? 'Nhập lý do (ít nhất 3 ký tự) để ghi vào nhật ký.' : null

  async function submit() {
    if (reasonErr || saving) return
    setSaving(true)
    setError(null)
    try {
      await updateShopStatus(shop.id, target, pausing ? reason.trim() : undefined)
      toast.success(pausing ? `Đã tạm ngưng ${shop.name}` : `Đã mở lại ${shop.name}`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không đổi được trạng thái. Vui lòng thử lại.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={() => !saving && onClose()}
      title={pausing ? `Tạm ngưng “${shop.name}”?` : `Mở lại “${shop.name}”?`}
      description={
        pausing
          ? 'Chủ tiệm sẽ không bán hàng được trên cửa hàng này cho tới khi mở lại. Thao tác được ghi vào nhật ký.'
          : 'Cửa hàng hoạt động lại bình thường. Thao tác được ghi vào nhật ký.'
      }
      size="sm"
      tone={pausing ? 'danger' : 'default'}
      icon={pausing ? <PauseCircle size={20} /> : <PlayCircle size={20} />}
      footer={
        <>
          <button type="button" className="btn btn-outline" onClick={onClose} disabled={saving}>
            Huỷ
          </button>
          <button type="button" className={`btn ${pausing ? 'btn-danger' : 'btn-primary'}`} onClick={submit} disabled={saving || Boolean(reasonErr)} data-autofocus={!pausing || undefined}>
            {saving && <span className="spinner" />} {pausing ? 'Tạm ngưng' : 'Mở lại'}
          </button>
        </>
      }
    >
      {pausing && (
        <div className="field">
          <label htmlFor="inactive-reason">Lý do tạm ngưng</label>
          <textarea
            id="inactive-reason"
            className="textarea"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Ví dụ: chủ tiệm yêu cầu tạm dừng"
            data-autofocus
          />
          {reasonErr && reason.length > 0 && <span className="field-hint">{reasonErr}</span>}
        </div>
      )}
      {error && <div className="notice notice-danger">{error}</div>}
    </Modal>
  )
}
