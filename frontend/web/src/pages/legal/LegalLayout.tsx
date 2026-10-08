import { ArrowLeft, TriangleAlert } from 'lucide-react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo from '../../components/Logo'
import SiteFooter from '../landing/SiteFooter'
import '../../styles/landing.css'
import { CONTACT_EMAIL, LEGAL_DRAFT, LEGAL_UPDATED } from './legalConfig'

/** Email liên hệ; chưa cấu hình thì hiện chỗ trống rõ ràng thay vì bịa địa chỉ. */
export function ContactEmail() {
  if (CONTACT_EMAIL) return <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
  return <strong>[email liên hệ — chưa cấu hình]</strong>
}

export type TocItem = { id: string; label: string }

type Props = {
  title: string
  lead: ReactNode
  toc?: TocItem[]
  children: ReactNode
}

export default function LegalLayout({ title, lead, toc, children }: Props) {
  useEffect(() => {
    document.title = `${title} — Sổ Nghe Lời`
    window.scrollTo(0, 0)
  }, [title])

  return (
    <div className="lp">
      <header className="lp-legal-head">
        <div className="lp-container">
          <Link to="/" className="lp-brand" aria-label="Sổ Nghe Lời — về trang chủ">
            <Logo />
          </Link>
          <Link to="/" className="lp-legal-back">
            <ArrowLeft size={16} /> Về trang chủ
          </Link>
        </div>
      </header>

      <main className="lp-legal-main">
        <article className="lp-legal-doc">
          <h1>{title}</h1>
          <p className="lp-legal-meta">Cập nhật lần cuối: {LEGAL_UPDATED}</p>

          {LEGAL_DRAFT && (
            <div className="lp-draft" role="note">
              <TriangleAlert size={18} />
              <div>
                <strong>Bản nháp, đang chờ chủ sản phẩm xét duyệt.</strong> Nội dung chưa được đối chiếu với quy định pháp luật nên chưa dùng
                làm văn bản chính thức.
                {!CONTACT_EMAIL && (
                  <ul>
                    <li>
                      Chưa có email liên hệ: đặt <code>VITE_CONTACT_EMAIL</code> lúc build.
                    </li>
                  </ul>
                )}
              </div>
            </div>
          )}

          <p className="lp-legal-lead">{lead}</p>

          {toc && (
            <nav className="lp-legal-toc" aria-label="Mục lục">
              <h2>Nội dung</h2>
              <ol>
                {toc.map((t) => (
                  <li key={t.id}>
                    <a href={`#${t.id}`}>{t.label}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}

          {children}
        </article>
      </main>

      <SiteFooter />
    </div>
  )
}
