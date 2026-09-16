import { Route, Routes } from 'react-router-dom'
import RequireAuth from './components/RequireAuth'
import AccountsPage from './pages/admin/AccountsPage'
import AdminLayout from './pages/admin/AdminLayout'
import AuditLogPage from './pages/admin/AuditLogPage'
import DashboardPage from './pages/admin/DashboardPage'
import LoginPage from './pages/admin/LoginPage'
import NotFound from './pages/NotFound'
import LandingPage from './pages/landing/LandingPage'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/admin/login" element={<LoginPage />} />
      <Route
        path="/admin"
        element={
          <RequireAuth>
            <AdminLayout />
          </RequireAuth>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="accounts" element={<AccountsPage />} />
        <Route path="logs" element={<AuditLogPage />} />
        <Route path="*" element={<NotFound inAdmin />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
