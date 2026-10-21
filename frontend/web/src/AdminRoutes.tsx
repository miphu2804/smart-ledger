import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import { LoadingState } from './components/States'
import { USE_MOCK } from './config'
import AdminLayout from './pages/admin/AdminLayout'
import AiSupportPage from './pages/admin/AiSupportPage'
import CoreAccessLogsPage from './pages/admin/core/CoreAccessLogsPage'
import CoreCustomersPage from './pages/admin/core/CoreCustomersPage'
import CoreDashboardPage from './pages/admin/core/CoreDashboardPage'
import CustomersPage from './pages/admin/CustomersPage'
import DashboardPage from './pages/admin/DashboardPage'
import LoginPage from './pages/admin/LoginPage'
import SettingsPage from './pages/admin/SettingsPage'
import TasksPage from './pages/admin/TasksPage'
import NotFound from './pages/NotFound'
import { restoreSession } from './services/authService'
import './styles/admin.css'

/** URL cũ /admin/customers/:id → mở drawer chi tiết cơ sở */
function LegacyCustomerRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/admin/customers?tab=shops&shop=${encodeURIComponent(id)}`} replace />
}

/**
 * Mounted under `/admin/*` by App; loaded only when ADMIN_ENABLED is set.
 * Chế độ thật dùng các trang đọc API quản trị của Core (`pages/admin/core`); Tasks và AI Support chưa có API ở Core nên
 * chỉ có ở chế độ mock. Trước khi vào, khôi phục phiên đã lưu (tải lại trang không phải đăng nhập lại).
 */
export default function AdminRoutes() {
  const [ready, setReady] = useState(USE_MOCK)
  useEffect(() => {
    if (USE_MOCK) return
    let alive = true
    void restoreSession().finally(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  if (!ready) return <LoadingState variant="detail" label="Đang khôi phục phiên đăng nhập…" />

  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth role="ADMIN">
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={USE_MOCK ? <DashboardPage /> : <CoreDashboardPage />} />
        <Route path="customers" element={USE_MOCK ? <CustomersPage /> : <CoreCustomersPage />} />
        <Route path="customers/:id" element={<LegacyCustomerRedirect />} />
        <Route path="access-logs" element={USE_MOCK ? <Navigate to="/admin/settings/audit" replace /> : <CoreAccessLogsPage />} />
        <Route path="ai" element={USE_MOCK ? <AiSupportPage /> : <Navigate to="/admin" replace />} />
        <Route path="tasks" element={USE_MOCK ? <TasksPage /> : <Navigate to="/admin" replace />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:tab" element={<SettingsPage />} />
        <Route path="accounts" element={<Navigate to="/admin/customers" replace />} />
        <Route path="logs" element={<Navigate to={USE_MOCK ? '/admin/settings/audit' : '/admin/access-logs'} replace />} />
        <Route path="*" element={<NotFound inAdmin />} />
      </Route>
    </Routes>
  )
}
