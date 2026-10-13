import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router-dom'
import NotFound from './pages/NotFound'
import LandingPage from './pages/landing/LandingPage'
import DataDeletionPage from './pages/legal/DataDeletionPage'
import PrivacyPage from './pages/legal/PrivacyPage'

// Off by default. The admin chunk (mock accounts included) is emitted only when VITE_ADMIN_ENABLED=true at build time.
// Compare the env value here, not through config.ts: vite.config.ts inlines it as a literal, and only a comparison
// in this expression lets the bundler drop the lazy import when the flag is off.
const AdminRoutes = import.meta.env.VITE_ADMIN_ENABLED === 'true' ? lazy(() => import('./AdminRoutes')) : null

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/data-deletion" element={<DataDeletionPage />} />
      {AdminRoutes && <Route path="/admin/*" element={<Suspense fallback={null}><AdminRoutes /></Suspense>} />}
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
