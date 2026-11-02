// Trang công cụ nội bộ, chỉ chạy bằng `npm run userflow`: `vite build` chỉ build index.html nên ảnh chụp màn không vào bản deploy.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import UserflowPage from './UserflowPage'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UserflowPage />
  </StrictMode>,
)
