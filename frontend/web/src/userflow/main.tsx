// Trang sơ đồ userflow trong docs: `npm run userflow` build nó thành docs/product/userflow/index.html, không vào bản deploy của web.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import UserflowPage from './UserflowPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserflowPage />
  </StrictMode>,
)
