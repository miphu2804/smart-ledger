import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const titles: Record<string, string> = {
  '/': 'Monday, April 20',
  '/customers': 'Customers',
  '/ai': 'AI Support',
  '/tasks': 'Tasks',
  '/settings': 'Settings',
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const { pathname } = useLocation()
  const title = titles[pathname] ?? 'SmartLedger'

  return (
    <div className="h-svh bg-canvas p-3">
      <div className="flex h-full overflow-hidden rounded-[28px] bg-frame shadow-[0_24px_60px_-28px_rgba(40,36,28,0.45)]">
        <Sidebar collapsed={collapsed} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar title={title} onToggle={() => setCollapsed((c) => !c)} />
          <main className="min-h-0 flex-1 overflow-hidden">
            <Outlet />
          </main>
        </div>
        <div id="shell-rail" className="flex h-full" />
      </div>
    </div>
  )
}
