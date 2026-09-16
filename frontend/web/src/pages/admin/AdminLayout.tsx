import {
  ChevronDown,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Package2,
  RotateCcw,
  ScrollText,
  Search,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/Badges'
import Logo from '../../components/Logo'
import Modal from '../../components/Modal'
import { useToast } from '../../components/Toast'
import { USE_MOCK } from '../../config'
import { resetMockData } from '../../services/accountService'
import { getSession, logout } from '../../services/authService'
import '../../styles/admin.css'

export interface AdminOutletContext {
  /** Tăng lên mỗi khi dữ liệu mẫu được khôi phục để các trang tải lại. */
  dataVersion: number
}

export default function AdminLayout() {
  const session = getSession()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const toast = useToast()

  const [navOpen, setNavOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [dataVersion, setDataVersion] = useState(0)
  const [q, setQ] = useState(location.pathname === '/admin/accounts' ? (params.get('q') ?? '') : '')
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setNavOpen(false)
    setMenuOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (location.pathname === '/admin/accounts') setQ(params.get('q') ?? '')
  }, [location.pathname, params])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  function onSearch(e: FormEvent) {
    e.preventDefault()
    const term = q.trim()
    navigate(term ? `/admin/accounts?q=${encodeURIComponent(term)}` : '/admin/accounts')
  }

  async function onLogout() {
    await logout()
    navigate('/admin/login', { replace: true })
  }

  async function onReset() {
    setResetting(true)
    await resetMockData()
    setResetting(false)
    setResetOpen(false)
    setDataVersion((v) => v + 1)
    toast.success('Đã khôi phục dữ liệu mẫu', 'Mọi thay đổi trước đó đã được xoá.')
  }

  const user = session?.user

  return (
    <div className={`admin${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Điều hướng quản trị">
        <div className="sidebar-head">
          <Link to="/admin" className="sidebar-logo">
            <Logo size="sm" />
          </Link>
          <span className="sidebar-badge">Admin</span>
          <button type="button" className="icon-btn sidebar-close" onClick={() => setNavOpen(false)} aria-label="Đóng menu">
            <X size={20} />
          </button>
        </div>
        <nav className="sidebar-nav">
          <span className="sidebar-section">Quản lý</span>
          <NavLink to="/admin" end className="side-link">
            <LayoutDashboard size={19} /> Tổng quan
          </NavLink>
          <NavLink to="/admin/accounts" className="side-link">
            <Users size={19} /> Tài khoản
          </NavLink>
          <span className="side-link is-disabled" aria-disabled="true" title="Tính năng đang phát triển">
            <Package2 size={19} /> Gói dịch vụ <span className="tag-soon">Sắp có</span>
          </span>
          <NavLink to="/admin/logs" className="side-link">
            <ScrollText size={19} /> Nhật ký
          </NavLink>
        </nav>
        <div className="sidebar-foot">
          {USE_MOCK && (
            <div className="mock-note">
              <strong>Chế độ dữ liệu mẫu</strong>
              <span>Thay đổi được lưu trên trình duyệt này.</span>
              <button type="button" className="btn btn-outline btn-sm btn-block" onClick={() => setResetOpen(true)}>
                <RotateCcw size={15} /> Khôi phục dữ liệu mẫu
              </button>
            </div>
          )}
          <Link to="/" className="side-link side-link-muted">
            <ExternalLink size={17} /> Xem trang giới thiệu
          </Link>
        </div>
      </aside>
      <div className="sidebar-backdrop" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="admin-main">
        <header className="topbar">
          <button type="button" className="icon-btn topbar-burger" onClick={() => setNavOpen(true)} aria-label="Mở menu">
            <Menu size={22} />
          </button>
          <form className="topbar-search" role="search" onSubmit={onSearch}>
            <Search size={18} />
            <input
              className="input"
              type="search"
              placeholder="Tìm cửa hàng, chủ quán, SĐT…"
              aria-label="Tìm tài khoản"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </form>
          <div className="topbar-actions">
            {USE_MOCK && (
              <button type="button" className="btn btn-ghost btn-sm topbar-reset" onClick={() => setResetOpen(true)} title="Khôi phục dữ liệu mẫu">
                <RotateCcw size={16} /> <span>Khôi phục dữ liệu mẫu</span>
              </button>
            )}
            <div className="user-menu" ref={menuRef}>
              <button
                type="button"
                className="user-btn"
                onClick={() => setMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
              >
                <Avatar name={user?.name ?? 'Admin'} seed="admin" size={34} />
                <span className="user-meta">
                  <strong>{user?.name ?? 'Quản trị viên'}</strong>
                  <small>{user?.role === 'super_admin' ? 'Quản trị cấp cao' : 'Quản trị viên'}</small>
                </span>
                <ChevronDown size={16} />
              </button>
              {menuOpen && (
                <div className="menu user-dropdown" role="menu">
                  <div className="menu-head">
                    <strong>{user?.name}</strong>
                    <span>{user?.email}</span>
                  </div>
                  <button type="button" role="menuitem" className="menu-item" onClick={() => navigate('/admin/logs')}>
                    <ScrollText size={16} /> Nhật ký thao tác
                  </button>
                  {USE_MOCK && (
                    <button type="button" role="menuitem" className="menu-item" onClick={() => { setMenuOpen(false); setResetOpen(true) }}>
                      <RotateCcw size={16} /> Khôi phục dữ liệu mẫu
                    </button>
                  )}
                  <div className="menu-sep" />
                  <button type="button" role="menuitem" className="menu-item danger" onClick={onLogout}>
                    <LogOut size={16} /> Đăng xuất
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="admin-content">
          <Outlet context={{ dataVersion } satisfies AdminOutletContext} />
        </main>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => !resetting && setResetOpen(false)}
        title="Khôi phục dữ liệu mẫu?"
        description="Toàn bộ tài khoản bạn đã thêm, sửa, khoá hoặc xoá sẽ trở về trạng thái ban đầu. Nhật ký thao tác cũng được làm mới."
        size="sm"
        icon={<RotateCcw size={20} />}
        footer={
          <>
            <button type="button" className="btn btn-outline" onClick={() => setResetOpen(false)} disabled={resetting}>
              Huỷ
            </button>
            <button type="button" className="btn btn-primary" onClick={onReset} disabled={resetting} data-autofocus>
              {resetting && <span className="spinner" />} Khôi phục
            </button>
          </>
        }
      />
    </div>
  )
}
