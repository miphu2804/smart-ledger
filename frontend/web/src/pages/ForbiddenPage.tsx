import { SignIn, SignOut } from '@phosphor-icons/react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { BrandMark } from '../components/admin/ui'
import { ForbiddenState } from '../components/States'
import { logout } from '../services/authService'
import type { SessionUser } from '../types'
import '@fontsource-variable/geist'
import '../styles/admin.css'

/** Trang 403 — tài khoản không phải ADMIN mở URL quản trị. Không render layout/menu quản trị. */
export default function ForbiddenPage({ user }: { user: SessionUser }) {
  const navigate = useNavigate()
  useEffect(() => {
    document.title = '403 · Không có quyền truy cập'
  }, [])

  async function switchAccount() {
    await logout()
    navigate('/admin/login', { replace: true })
  }

  return (
    <div className="adm" data-status="403">
      <main className="forbidden" id="main">
        <Link to="/" className="brand-inline" style={{ color: 'var(--text-primary)' }}>
          <BrandMark size={32} />
          <strong>Sổ Nghe Lời</strong>
        </Link>
        <div className="panel">
          <span className="pill pill-danger code-tag">403</span>
          <ForbiddenState
            description={
              <>
                Bạn đang đăng nhập bằng <strong>{user.email}</strong> với vai trò <strong>{user.role}</strong>. Trang quản trị chỉ dành cho tài khoản
                ADMIN. Chủ cơ sở vui lòng dùng ứng dụng Sổ Nghe Lời trên điện thoại.
              </>
            }
            action={
              <>
                <button type="button" className="btn btn-primary" onClick={switchAccount}>
                  <SignIn size={16} /> Đăng nhập bằng tài khoản khác
                </button>
                <button type="button" className="btn btn-outline" onClick={() => logout().then(() => navigate('/', { replace: true }))}>
                  <SignOut size={16} /> Đăng xuất
                </button>
              </>
            }
          />
        </div>
      </main>
    </div>
  )
}
