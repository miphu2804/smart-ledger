import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import ForbiddenPage from '../pages/ForbiddenPage'
import { getSession } from '../services/authService'
import type { Role } from '../types'

/**
 * Chặn route theo đăng nhập + role.
 * - Chưa đăng nhập → chuyển về /admin/login (nhớ trang đang mở).
 * - Đã đăng nhập nhưng sai role (vd. OWNER) → trang 403, không render layout/menu quản trị.
 */
export default function RequireAuth({ children, role = 'ADMIN' }: { children: ReactNode; role?: Role }) {
  const location = useLocation()
  const session = getSession()
  if (!session) {
    return <Navigate to="/admin/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (session.user.role !== role) return <ForbiddenPage user={session.user} />
  return <>{children}</>
}
