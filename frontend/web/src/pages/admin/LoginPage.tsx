import { ArrowLeft, CheckCircle, Envelope, Eye, EyeSlash, LockSimple, MagicWand, WarningCircle } from '@phosphor-icons/react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { BrandMark } from '../../components/admin/ui'
import { USE_MOCK } from '../../config'
import { DEMO_ACCOUNTS, getSession, login } from '../../services/authService'
import { resetPreferencesCache } from '../../services/preferences'
import { EMAIL_RE } from '../../utils/format'
import '@fontsource-variable/geist'
import '../../styles/admin.css'

const POINTS = [
  'Tìm OWNER và cơ sở theo tên, email, số điện thoại',
  'Theo dõi support task trên Kanban',
  'AI Support trả lời kèm bằng chứng, bạn xác nhận trước khi tạo task',
  'Chỉ đọc dữ liệu hỗ trợ — mọi lượt xem đều được ghi nhật ký',
]

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

  // Đã đăng nhập: chuyển tới /admin (OWNER sẽ nhận trang 403 ở đó)
  if (getSession()) return <Navigate to="/admin" replace />

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
      resetPreferencesCache()
      navigate(from.startsWith('/admin') && from !== '/admin/login' ? from : '/admin', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại, vui lòng thử lại.')
      setLoading(false)
    }
  }

  function quickFill(i: number) {
    setEmail(DEMO_ACCOUNTS[i].email)
    setPassword(DEMO_ACCOUNTS[i].password)
    setError(null)
    setTouched(false)
  }

  return (
    <div className="adm">
      <div className="auth">
        <aside className="auth-aside" aria-hidden="true">
          <div className="brand-inline">
            <BrandMark size={36} />
            <strong>Sổ Nghe Lời</strong>
          </div>
          <div>
            <h2>Vận hành và hỗ trợ chủ cơ sở, gọn trong một nơi.</h2>
            <p>Trang quản trị dành cho đội vận hành Team HEXA.</p>
          </div>
          <ul className="auth-points">
            {POINTS.map((p) => (
              <li key={p}>
                <CheckCircle size={18} weight="fill" /> {p}
              </li>
            ))}
          </ul>
        </aside>

        <main className="auth-main" id="main">
          <Link to="/" className="auth-back">
            <ArrowLeft size={16} /> Về trang chủ
          </Link>

          <div className="panel auth-card">
            <div className="brand-inline" style={{ marginBottom: 20 }}>
              <BrandMark size={32} />
              <strong>Sổ Nghe Lời</strong>
            </div>
            <h1>Đăng nhập quản trị</h1>
            <p className="sub">Chỉ dành cho tài khoản ADMIN của đội vận hành.</p>

            {error && (
              <div className="notice notice-danger" role="alert" style={{ marginBottom: 14 }}>
                <WarningCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={onSubmit} noValidate className="auth-form">
              <div className="field">
                <label htmlFor="email">Email</label>
                <div className="input-wrap">
                  <Envelope size={18} aria-hidden="true" />
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
                  <LockSimple size={18} aria-hidden="true" />
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
                    {showPw ? <EyeSlash size={18} /> : <Eye size={18} />}
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
                  onClick={() => setError('Khôi phục mật khẩu quản trị chưa được hỗ trợ. Vui lòng liên hệ trưởng nhóm.')}
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
              <div className="demo">
                <strong>Tài khoản demo</strong>
                {DEMO_ACCOUNTS.map((d, i) => (
                  <div key={d.email} className="demo-row">
                    <span className={`pill ${d.role === 'ADMIN' ? 'pill-accent' : 'pill-outline'}`}>{d.role}</span>
                    <div>
                      <code>
                        {d.email} / {d.password}
                      </code>
                      <small>{d.note}</small>
                    </div>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => quickFill(i)} aria-label={`Điền tài khoản ${d.role}`}>
                      <MagicWand size={15} /> Điền
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="auth-foot">© 2026 Team HEXA · EXE201 · FPT University</p>
        </main>
      </div>
    </div>
  )
}
