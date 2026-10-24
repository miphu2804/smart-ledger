/** Thành phần dùng chung cho các trang quản trị đọc dữ liệu thật từ Core (chế độ USE_MOCK = false). */
import { Archive, CheckCircle, LockSimple, PauseCircle } from '@phosphor-icons/react'
import { Pill } from '../../../components/admin/ui'
import Pagination from '../../../components/Pagination'
import { SHOP_STATUS_LABEL, USER_STATUS_LABEL, type AdminPage, type ShopStatus, type UserStatus } from '../../../services/adminApi'

export function UserStatusPill({ status }: { status: UserStatus }) {
  return status === 'ACTIVE' ? (
    <Pill tone="success" icon={CheckCircle}>
      {USER_STATUS_LABEL.ACTIVE}
    </Pill>
  ) : (
    <Pill tone="danger" icon={LockSimple}>
      {USER_STATUS_LABEL.DISABLED}
    </Pill>
  )
}

const SHOP_TONE: Record<ShopStatus, ['success' | 'warning' | 'outline', typeof CheckCircle]> = {
  ACTIVE: ['success', CheckCircle],
  INACTIVE: ['warning', PauseCircle],
  ARCHIVED: ['outline', Archive],
}

export function ShopStatusPill({ status }: { status: ShopStatus }) {
  const [tone, icon] = SHOP_TONE[status]
  return (
    <Pill tone={tone} icon={icon}>
      {SHOP_STATUS_LABEL[status]}
    </Pill>
  )
}

/** Phân trang theo trang của Core (đếm từ 0); thanh phân trang hiển thị từ 1 */
export function CorePager({
  data,
  unit,
  onPage,
  onPageSize,
}: {
  data: AdminPage<unknown>
  unit: string
  onPage: (page: number) => void
  onPageSize?: (size: number) => void
}) {
  return (
    <Pagination
      page={data.page + 1}
      pageSize={data.size}
      total={data.totalElements}
      totalPages={Math.max(1, data.totalPages)}
      unit={unit}
      onPage={(p) => onPage(p - 1)}
      onPageSize={onPageSize}
    />
  )
}
