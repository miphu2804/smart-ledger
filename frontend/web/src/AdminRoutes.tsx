import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import AdminLayout from './pages/admin/AdminLayout'
import AiSupportPage from './pages/admin/AiSupportPage'
import CustomersPage from './pages/admin/CustomersPage'
import DashboardPage from './pages/admin/DashboardPage'
import LoginPage from './pages/admin/LoginPage'
import SettingsPage from './pages/admin/SettingsPage'
import TasksPage from './pages/admin/TasksPage'
import NotFound from './pages/NotFound'

/** URL cũ /admin/customers/:id → mở drawer chi tiết cơ sở */
function LegacyCustomerRedirect() {
  const { id = '' } = useParams()
  return <Navigate to={`/admin/customers?tab=shops&shop=${encodeURIComponent(id)}`} replace />
}

/** Mounted under `/admin/*` by App; loaded only when ADMIN_ENABLED is set. */
export default function AdminRoutes() {
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
        <Route index element={<DashboardPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="customers/:id" element={<LegacyCustomerRedirect />} />
        <Route path="ai" element={<AiSupportPage />} />
        <Route path="tasks" element={<TasksPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="settings/:tab" element={<SettingsPage />} />
        <Route path="accounts" element={<Navigate to="/admin/customers" replace />} />
        <Route path="logs" element={<Navigate to="/admin/settings/audit" replace />} />
        <Route path="*" element={<NotFound inAdmin />} />
      </Route>
    </Routes>
  )
}
