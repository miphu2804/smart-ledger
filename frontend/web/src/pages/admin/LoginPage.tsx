import { AlertCircle, ArrowLeft, Eye, EyeOff, Lock, Mail, Wand2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Logo from '../../components/Logo'
import { USE_MOCK } from '../../config'
import { DEMO_ADMIN, isAuthenticated, login } from '../../services/authService'
import { EMAIL_RE } from '../../utils/format'
import '../../styles/admin.css'

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/admin'

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)

  useEffect(() => {
    document.title = 'Đăng nhập quản trị · Sổ Nghe Lời'
  }, [])

  if (isAuthenticated()) return <Navigate to="/admin" replace />

  const emailErr = touched && !EMAIL_RE.test(email.trim()) ? 'Vui lòng nhập email hợp lệ.' : null
  const pwErr = touched && password.length < 6 ? 'Mật khẩu tối thiểu 6 ký tự.' : null

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setError(null)
    if (!EMAIL_RE.test(email.trim()) || password.length < 6) return
    setLoading(true)
    try {
      await login(email, password, remember)
      navigate(from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại, vui lòng thử lại.')
      setLoading(false)
    }
  }

  function quickFill() {
    setEmail(DEMO_ADMIN.email)
    setPassword(DEMO_ADMIN.password)
    setError(null)
    setTouched(false)
  }

  return (
    <div className="auth-page">
      <div className="auth-side" aria-hidden="true">
        <div className="auth-side-inner">
          <Logo inverted tagline />
          <div className="auth-side-copy">
            <h2>Trang quản trị</h2>
            <p>Theo dõi tài khoản cửa hàng, gói dịch vụ và mức độ sử dụng của Sổ Nghe Lời.</p>
          </div>
          <div className="auth-side-card">
            <div className="asc-row">
              <span>Lượt tạo đơn tháng này</span>
              <b>142/200</b>
            </div>
            <i>
              <b style={{ width: '71%' }} />
            </i>
            <div className="asc-tags">
              <span>Đọc đơn AI</span>
              <span>POS</span>
            </div>
          </div>
        </div>
      </div>

      <main className="auth-main">
        <Link to="/" className="auth-back">
          <ArrowLeft size={16} /> Về trang chủ
        </Link>

        <div className="auth-card">
          <div className="auth-card-logo">
            <Logo />
          </div>
          <h1>Đăng nhập quản trị</h1>
          <p className="auth-sub">Dành cho đội ngũ vận hành Sổ Nghe Lời.</p>

          {error && (
            <div className="alert alert-error" role="alert">
              <AlertCircle size={18} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={onSubmit} noValidate className="auth-form">
            <div className="field">
              <label htmlFor="email">Email</label>
              <div className="input-wrap">
                <Mail size={18} />
                <input
                  id="email"
                  type="email"
                  className={`input${emailErr ? ' has-error' : ''}`}
                  placeholder="ten@songhloi.vn"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(emailErr)}
                  aria-describedby={emailErr ? 'email-err' : undefined}
                />
              </div>
              {emailErr && (
                <span className="field-error" id="email-err">
                  {emailErr}
                </span>
              )}
            </div>

            <div className="field">
              <label htmlFor="password">Mật khẩu</label>
              <div className="input-wrap">
                <Lock size={18} />
                <input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  className={`input${pwErr ? ' has-error' : ''}`}
                  placeholder="Nhập mật khẩu"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  aria-invalid={Boolean(pwErr)}
                  aria-describedby={pwErr ? 'pw-err' : undefined}
                  style={{ paddingRight: 46 }}
                />
                <button
                  type="button"
                  className="icon-btn input-action"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-pressed={showPw}
                >
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {pwErr && (
                <span className="field-error" id="pw-err">
                  {pwErr}
                </span>
              )}
            </div>

            <div className="auth-row">
              <label className="checkbox">
                <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                Ghi nhớ đăng nhập
              </label>
              <button
                type="button"
                className="link-btn"
                onClick={() => setError('Tính năng khôi phục mật khẩu quản trị chưa được hỗ trợ. Vui lòng liên hệ trưởng nhóm.')}
              >
                Quên mật khẩu?
              </button>
            </div>

            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={loading}>
              {loading ? (
                <>
                  <span className="spinner" /> Đang đăng nhập…
                </>
              ) : (
                'Đăng nhập'
              )}
            </button>
          </form>

          {USE_MOCK && (
            <div className="demo-box">
              <div>
                <strong>Tài khoản demo</strong>
                <code>{DEMO_ADMIN.email}</code>
                <code>{DEMO_ADMIN.password}</code>
              </div>
              <button type="button" className="btn btn-soft btn-sm" onClick={quickFill}>
                <Wand2 size={15} /> Điền nhanh
              </button>
            </div>
          )}
        </div>
        <p className="auth-foot">© 2026 Team HEXA · EXE201 · FPT University</p>
      </main>
    </div>
  )
}
