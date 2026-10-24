import { ArrowUp, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ADMIN_ENABLED } from '../../config'
import Logo from '../../components/Logo'
import { CONTACT_EMAIL } from '../legal/legalConfig'
import SocialLinks from './SocialLinks'

/** `onHome`: đang ở trang chủ thì dùng neo trong trang (#x), nơi khác thì quay về trang chủ rồi tới neo (/#x). */
export default function SiteFooter({ onHome = false }: { onHome?: boolean }) {
  const h = (id: string) => (onHome ? `#${id}` : `/#${id}`)
  return (
    <footer className="lp-footer">
      <div className="lp-container">
        <div className="lp-footer-card">
          <div className="lp-footer-grid">
            <div className="lp-footer-brand">
              <Link to="/" className="lp-brand" aria-label="Sổ Nghe Lời — về trang chủ">
                <Logo />
              </Link>
              <p>Sổ bán hàng AI cho quán nhỏ Việt Nam. Miệng nói, sổ ghi.</p>
              <SocialLinks />
            </div>
            <nav className="lp-footer-col" aria-label="Sản phẩm">
              <h4>Sản phẩm</h4>
              <a href={h('tinh-nang')}>Tính năng</a>
              <a href={h('cach-hoat-dong')}>Cách hoạt động</a>
              <a href={h('so-sanh')}>So sánh với POS</a>
              <a href={h('doi-ngu')}>Đội ngũ</a>
            </nav>
            <nav className="lp-footer-col" aria-label="Hỗ trợ">
              <h4>Hỗ trợ</h4>
              <a href={h('hoi-dap')}>Hỏi đáp</a>
              {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`}>Liên hệ</a>}
            </nav>
            <nav className="lp-footer-col" aria-label="Pháp lý" hidden={onHome}>
              <h4>Pháp lý</h4>
              <Link to="/privacy">Chính sách quyền riêng tư</Link>
              <Link to="/data-deletion">Xoá dữ liệu người dùng</Link>
              {ADMIN_ENABLED && (
                <Link to="/admin/login">
                  <UserRound size={14} /> Quản trị
                </Link>
              )}
            </nav>
          </div>
          <div className="lp-footer-bottom">
            <p>© {new Date().getFullYear()} Sổ Nghe Lời. Bảo lưu mọi quyền.</p>
            {onHome && (
              <a href="#top">
                Về đầu trang <ArrowUp size={15} />
              </a>
            )}
          </div>
        </div>
      </div>
    </footer>
  )
}
