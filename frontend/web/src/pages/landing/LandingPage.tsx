import { Check, ChevronDown, ChevronRight, Download, Menu, Mic, X } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ADMIN_ENABLED, ANDROID_APK_URL } from '../../config'
import Logo, { LogoMark } from '../../components/Logo'
import { useReveal } from '../../hooks/useReveal'
import { useScrollProgress } from '../../hooks/useScrollProgress'
import '../../styles/landing.css'
import { CONTACT_EMAIL } from '../legal/legalConfig'
import SiteFooter from './SiteFooter'
import SocialLinks from './SocialLinks'

const NAV = [
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#hoi-dap', label: 'Hỏi đáp' },
  { href: '#doi-ngu', label: 'Đội ngũ' },
]

/** Độ trễ hiện dần (giây) cho phần tử thứ i trong một nhóm */
const delay = (i: number): CSSProperties => ({ ['--d' as string]: `${i * 0.07}s` })

/** `video`: đoạn quay màn hình thật của app, `src` là khung hình hiện trước khi video tải xong */
type Shot = { src: string; alt: string; lightStatus?: boolean; video?: string }

/** Ảnh chụp app, khai báo một lần; Hero, luồng cuộn, thư viện và cuối trang cùng dùng. */
const SHOT = {
  home: {
    src: '/screens/home.webp',
    alt: 'Màn Tổng quan: doanh thu tuần và bốn lối vào đọc đơn, chọn hàng, quét mã, trợ lý AI',
    lightStatus: true,
  },
  voice: { src: '/screens/voice.webp', alt: 'Màn Đọc đơn: câu nói được tách thành ba món có số lượng và giá, tổng 80.000đ' },
  pos: { src: '/screens/pos.webp', alt: 'Màn Bán hàng: chọn hàng có ảnh, lọc và sắp xếp' },
  scan: { src: '/screens/scan.webp', alt: 'Màn Quét mã vạch: đưa mã sản phẩm vào khung camera để thêm vào đơn', lightStatus: true },
  checkout: { src: '/screens/checkout.webp', alt: 'Màn Thanh toán: danh sách món, hình thức tiền mặt, chuyển khoản hoặc ghi nợ' },
  debts: { src: '/screens/debts.webp', alt: 'Màn Công nợ: tổng còn nợ, khách đang nợ và từng đơn chưa trả' },
  orders: { src: '/screens/orders.webp', alt: 'Màn Đơn hàng: các đơn theo ngày, lọc hôm nay, hôm qua, 7 ngày' },
  products: { src: '/screens/products.webp', alt: 'Màn Hàng hoá: giá bán, tồn kho, hàng sắp hết' },
  reports: { src: '/screens/reports.webp', alt: 'Màn Báo cáo: doanh thu tuần, biểu đồ theo ngày, thu chi và lãi gộp ước tính' },
  /* Ảnh chụp Bobi từ app bản staging với dữ liệu tiệm thử. */
  bobiRecall: { src: '/screens/ai-recall.webp', video: '/screens/ai-recall.mp4', alt: 'Ở hội thoại mới, câu trả lời có nhãn 2 ghi nhớ, liệt kê từng điều đã nhớ và liên kết mở hội thoại gốc' },
}

/** Câu nói mẫu dùng xuyên trang; khớp với ảnh màn Đọc đơn để không lệch số liệu. */
const VOICE_SAMPLE = 'Hai bánh mì thịt, một cà phê sữa đá, một bạc xỉu'

/* ------------------------------------------------------------------ */

function Nav() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onResize = () => window.innerWidth > 960 && setOpen(false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <header className="lp-nav">
      <div className="lp-container lp-nav-inner">
        <a href="#top" className="lp-brand" aria-label="Sổ Nghe Lời — về đầu trang">
          <Logo />
        </a>
        <nav className="lp-nav-links" aria-label="Điều hướng chính">
          {NAV.map((n) => (
            <a key={n.href} href={n.href}>
              {n.label}
            </a>
          ))}
        </nav>
        <div className="lp-nav-actions">
          <SocialLinks />
          {ADMIN_ENABLED && (
            <Link to="/admin/login" className="lp-admin-link">
              Quản trị
            </Link>
          )}
          {ANDROID_APK_URL && (
            <a href={ANDROID_APK_URL} className="lp-pill lp-pill-sm lp-nav-cta">
              Tải ứng dụng
            </a>
          )}
          <button
            type="button"
            className="icon-btn lp-burger"
            aria-label={open ? 'Đóng menu' : 'Mở menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>
      <div className="lp-mobile-menu-wrap" data-open={open} inert={!open}>
        <div className="lp-mobile-menu">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} onClick={() => setOpen(false)}>
              {n.label}
            </a>
          ))}
          <div className="lp-mobile-menu-foot">
            {ANDROID_APK_URL && (
              <a href={ANDROID_APK_URL} className="lp-pill" onClick={() => setOpen(false)}>
                <Download size={16} /> Tải ứng dụng
              </a>
            )}
            {ADMIN_ENABLED && (
              <Link to="/admin/login" className="btn btn-ghost btn-block">
                Quản trị
              </Link>
            )}
            <SocialLinks />
          </div>
        </div>
      </div>
    </header>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Khung iPhone. Mặc định hiện một ảnh chụp màn hình; truyền `children` để tự dựng nội dung màn hình.
 * `lightStatus`: thanh trạng thái chữ trắng, dùng cho ảnh có đầu màn hình màu tối.
 */
function PhoneFrame({
  src,
  alt = '',
  video,
  eager = false,
  lightStatus = false,
  children,
}: {
  src?: string
  alt?: string
  video?: string
  eager?: boolean
  lightStatus?: boolean
  children?: ReactNode
}) {
  return (
    <div className="phone">
      <div className="phone-body">
        <div className="phone-screen">
          {children ??
            (video ? (
              <video src={video} poster={src} aria-label={alt} autoPlay muted loop playsInline preload="none" width={660} height={1434} />
            ) : (
              <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width={660} height={1434} decoding="async" />
            ))}
          <div className={`phone-status${lightStatus ? ' is-light' : ''}`} aria-hidden="true">
            <svg className="phone-time" viewBox="0 0 40 13" fill="currentColor">
              <text y="12.5" fontSize="17" fontWeight="600">
                9:41
              </text>
            </svg>
            <span>
              <svg viewBox="0 0 18 12" fill="currentColor">
                <rect y="8" width="3" height="4" rx="0.8" />
                <rect x="5" y="5.5" width="3" height="6.5" rx="0.8" />
                <rect x="10" y="3" width="3" height="9" rx="0.8" />
                <rect x="15" width="3" height="12" rx="0.8" />
              </svg>
              <svg viewBox="0 0 16 12" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M1.3 4.4a9.5 9.5 0 0 1 13.4 0" />
                <path d="M4 7.1a5.7 5.7 0 0 1 8 0" />
                <circle cx="8" cy="10.2" r="1.4" fill="currentColor" stroke="none" />
              </svg>
              <svg viewBox="0 0 27 12" fill="currentColor">
                <rect x="0.5" y="0.5" width="22" height="11" rx="3.4" fill="none" stroke="currentColor" opacity="0.4" />
                <rect x="2" y="2" width="19" height="8" rx="2" />
                <rect x="24" y="4" width="1.6" height="4" rx="0.8" opacity="0.45" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function DownloadCta({ label = 'Tải cho Android' }: { label?: string }) {
  return ANDROID_APK_URL ? (
    <a href={ANDROID_APK_URL} className="lp-pill">
      <Download size={17} /> {label}
    </a>
  ) : (
    <button type="button" className="lp-pill" disabled>
      <Download size={17} /> {label} · Sắp ra mắt
    </button>
  )
}

/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="lp-hero" id="top" data-scroll="exit">
      <div className="lp-container lp-hero-copy">
        <span className="lp-eyebrow">Sổ bán hàng cho tiểu thương</span>
        <h1>
          Nói một câu.
          <br />
          <span className="lp-gradient-text">Có ngay đơn.</span>
        </h1>
        <p className="lp-lead">Sổ Nghe Lời biến câu nói hoặc nội dung bạn gõ thành bản nháp đơn bán. Bạn xem lại, sửa nếu cần rồi mới ghi vào sổ.</p>
        <div className="lp-hero-cta">
          <DownloadCta />
          <a href="#cach-hoat-dong" className="lp-link">
            Xem cách hoạt động <ChevronRight size={18} />
          </a>
        </div>
      </div>

      <div className="hero-stage" aria-label="Ảnh ứng dụng Sổ Nghe Lời">
        {/* Mỗi thẻ nổi nằm trên máy có nội dung khớp: câu nói trên màn Đọc đơn, doanh thu trên màn Báo cáo */}
        <div className="hero-side is-left">
          <PhoneFrame {...SHOT.voice} eager />
          <span className="hero-bubble">
            <Mic size={16} /> “{VOICE_SAMPLE}”
          </span>
        </div>
        <div className="hero-main">
          <PhoneFrame {...SHOT.home} eager />
          <img className="hero-bobi" src="/brand/bobi-notebook.webp" alt="" width={360} height={345} />
        </div>
        <div className="hero-side is-right">
          <PhoneFrame {...SHOT.reports} eager />
          <span className="hero-result">
            <span>Doanh thu tuần này</span>
            <b>772.000đ</b>
          </span>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const STATEMENT =
  'Từ quán cà phê mang đi, tiệm trà sữa đến xe trái cây, sạp chợ, nhiều nơi vẫn ghi sổ tay, ghi chú điện thoại, hoặc không ghi gì cả. Không phải vì lười, mà vì chưa có cách nào đủ nhanh.'

const PAINS = [
  { title: 'Ghi sổ tay, ghi chú rời', text: 'Đông khách thì ghi vội vào sổ hay ghi chú điện thoại. Tối cộng lại mới thấy lệch tiền.', fix: 'Mỗi đơn lưu kèm giờ bán, tổng tiền tự cộng.' },
  { title: 'Nhớ bằng đầu', text: 'Bán lẻ từng món nhỏ, “để lát nhớ”, hết ngày quên phân nửa.', fix: 'Nói một câu, không cần dừng tay.' },
  { title: 'Nhập hàng cảm tính', text: 'Món đắt hết sớm, món ế tồn lại, tiền nằm chết trong kho.', fix: 'Món bán chạy và hàng sắp hết hiện ngay ở Tổng quan.' },
]

/** Đoạn văn sáng dần từng chữ theo vị trí cuộn, kiểu trang giới thiệu sản phẩm của Apple. */
function Statement() {
  const words = STATEMENT.split(' ')
  return (
    <section className="lp-section lp-statement">
      <div className="lp-container">
        <p className="statement-text" data-scroll="view" style={{ ['--n' as string]: words.length }}>
          {words.map((w, i) => (
            <span key={i} style={{ ['--i' as string]: i }}>
              {w}{' '}
            </span>
          ))}
        </p>
        <ul className="pain-list">
          {PAINS.map((p) => (
            <li key={p.title}>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <p className="pain-fix">{p.fix}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; text: string }[] = [
  { icon: 'chon-hang', title: 'Chọn hàng nhanh', text: 'Lưới hàng có ảnh, chạm là thêm vào đơn.' },
  { icon: 'quet-ma', title: 'Quét mã vạch', text: 'Quét mã vạch hoặc QR bằng camera.' },
  { icon: 'products', title: 'Hàng hoá, tồn kho', text: 'Giá bán, số tồn, cảnh báo sắp hết.' },
  { icon: 'debts', title: 'Công nợ', text: 'Ai còn nợ bao nhiêu, ghi từng lần thu.' },
  { icon: 'expenses', title: 'Chi phí', text: 'Nhập hàng, điện nước, mặt bằng để tính lãi gộp.' },
  { icon: 'reports', title: 'Báo cáo', text: 'Doanh thu, lãi gộp, món bán chạy theo kỳ.' },
]

function Features() {
  return (
    <section className="lp-section lp-features" id="tinh-nang">
      <div className="lp-container">
        <h2 className="lp-display" data-reveal>
          Đủ dùng cho quán nhỏ.
          <br />
          <span className="is-muted">Không thừa một nút.</span>
        </h2>
        {/* Cột trái: tính năng AI (đọc đơn, Bobi); cột phải: các tính năng sổ sách */}
        <div className="bento">
          <article className="bento-tile is-hero" data-reveal>
            <img src="/brand/icons/doc-don.webp" alt="" width={96} height={96} loading="lazy" />
            <h3>Đọc đơn bằng giọng nói</h3>
            <p>Giọng nói được nhận dạng ngay trên điện thoại. Bạn xem lại danh sách món trước khi lưu.</p>
            <div className="bento-chips">
              <span>“hai bánh mì thịt”</span>
              <span>“cà phê hai mươi lăm nghìn”</span>
            </div>
          </article>
          {FEATURES.map((f, i) => (
            <article key={f.title} className="bento-tile" data-reveal style={delay(i % 4)}>
              <img src={`/brand/icons/${f.icon}.webp`} alt="" width={56} height={56} loading="lazy" />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
          <article className="bento-tile is-ai" data-reveal>
            <img src="/brand/bobi-idea.webp" alt="" width={110} height={116} loading="lazy" />
            <div>
              <h3>Trợ lý Bobi</h3>
              <p>Hỏi số liệu của tiệm; Bobi chỉ đọc, không sửa đơn.</p>
              <p className="bobi-memory">
                <BobiMark />
                <span>
                  <b>Ghi nhớ dài hạn:</b> dặn một lần là Bobi nhớ.
                </span>
              </p>
              <div className="bento-chips">
                <span>“Doanh thu tuần này?”</span>
                <span>“Thứ Hai nhắc nhập hàng”</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

/** Biểu tượng ghi nhớ dài hạn của Bobi, cùng nét vẽ với BusinessIcon (trạng thái bật) trong app: lục giác đặc, ngôi sao khoét rỗng. */
function BobiMark() {
  return (
    <svg className="bobi-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M10.09 2.60Q12.00 1.50 13.91 2.60L19.19 5.65Q21.09 6.75 21.09 8.95L21.09 15.05Q21.09 17.25 19.19 18.35L13.91 21.40Q12.00 22.50 10.09 21.40L4.81 18.35Q2.91 17.25 2.91 15.05L2.91 8.95Q2.91 6.75 4.81 5.65ZM12 7.4Q12.7 11.3 16.6 12Q12.7 12.7 12 16.6Q11.3 12.7 7.4 12Q11.3 11.3 12 7.4Z"
      />
    </svg>
  )
}

/** Mỗi màn là một tính năng; màn nằm giữa dòng chữ tiêu đề khi cuộn thì phần giới thiệu bên dưới đổi theo. */
const SCREENS: { shot: Shot; title: string; text: string; bobi?: boolean }[] = [
  { shot: SHOT.voice, title: 'Đọc đơn bằng giọng nói', text: 'Nhấn giữ nút ghi âm và đọc đơn, hoặc gõ khi quán ồn. Ứng dụng tách món, số lượng và giá.' },
  { shot: SHOT.orders, title: 'Đơn hàng', text: 'Mỗi đơn lưu kèm giờ bán; lọc nhanh theo hôm nay, hôm qua hoặc 7 ngày.' },
  { shot: SHOT.pos, title: 'Bán hàng', text: 'Chọn hàng có ảnh, lọc theo nhóm, sắp xếp theo tên hoặc tồn kho; chạm là thêm vào đơn.' },
  { shot: SHOT.debts, title: 'Công nợ', text: 'Ghi nợ khi thanh toán; xem ai còn nợ bao nhiêu, từ hôm nào và ghi từng lần thu.' },
  { shot: SHOT.reports, title: 'Báo cáo', text: 'Doanh thu, số đơn, lãi gộp ước tính và món bán chạy theo ngày, tuần, tháng.' },
  { shot: SHOT.bobiRecall, bobi: true, title: 'Bobi nhớ cách bạn làm', text: 'Bạn dặn một lần, lần sau Bobi vẫn nhớ. Mở "ghi nhớ" để xem nhớ từ hôm nào.' },
]

/**
 * Mục ghim: cuộn dọc kéo dải điện thoại chạy ngang; màn nằm giữa dòng chữ tiêu đề là màn đang giới thiệu
 * (`data-active` do useScrollProgress đặt theo vị trí các `.gallery-item`).
 */
function Gallery() {
  const sectionRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const section = sectionRef.current
    const viewport = section?.querySelector<HTMLElement>('.gallery-viewport')
    if (!section || !viewport) return

    // Vuốt ngang trên dải máy sang màn trước hoặc sau: cuộn trang tới mốc tiến độ của màn đó, nên dải chạy như khi cuộn
    let startX = 0
    let startY = 0
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    }
    // Sang màn trước hoặc sau: cuộn trang tới mốc tiến độ ở giữa màn đó, khớp với cách useScrollProgress tính `data-active`
    const step = (dir: 1 | -1) => {
      const last = SCREENS.length - 1
      const next = Math.min(last, Math.max(0, Number(section.dataset.active) + dir))
      const p = 0.06 + (0.88 * next) / last
      const top = section.getBoundingClientRect().top + window.scrollY
      window.scrollTo({ top: top + p * (section.offsetHeight - (section.firstElementChild?.clientHeight ?? window.innerHeight)), behavior: 'smooth' })
    }
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX
      const dy = e.changedTouches[0].clientY - startY
      if (Math.abs(dx) < 40 || Math.abs(dx) < 1.5 * Math.abs(dy)) return
      step(dx < 0 ? 1 : -1)
    }
    // Vuốt ngang hai ngón trên trackpad: mỗi cú vuốt sang đúng một màn. Cú vuốt kết thúc khi ngừng nhận sự kiện 200ms,
    // nên đuôi quán tính của macOS (vẫn bắn deltaX cùng chiều thêm ~1s) không cộng vào cú vuốt ngược sau đó
    let wheelX = 0
    let fired = false
    let idle = 0
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      window.clearTimeout(idle)
      idle = window.setTimeout(() => {
        wheelX = 0
        fired = false
      }, 200)
      // Quán tính không bao giờ đổi chiều, nên deltaX ngược dấu là cú vuốt mới
      if (wheelX !== 0 && Math.sign(e.deltaX) !== Math.sign(wheelX)) {
        wheelX = 0
        fired = false
      }
      if (fired) return
      wheelX += e.deltaX
      if (Math.abs(wheelX) < 40) return
      step(wheelX > 0 ? 1 : -1)
      fired = true
    }
    viewport.addEventListener('touchstart', onTouchStart, { passive: true })
    viewport.addEventListener('touchend', onTouchEnd, { passive: true })
    viewport.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      viewport.removeEventListener('touchstart', onTouchStart)
      viewport.removeEventListener('touchend', onTouchEnd)
      viewport.removeEventListener('wheel', onWheel)
      window.clearTimeout(idle)
    }
  }, [])

  return (
    <section ref={sectionRef} className="lp-gallery" id="cach-hoat-dong" data-scroll="pin" data-active="0">
      <div className="gallery-sticky">
        <div className="lp-container">
          <h2 className="lp-display">
            Gọn trong một chiếc điện thoại.
            <br />
            <span className="is-muted">Ít bước, dễ nhìn, dùng được cả khi đang bận tay.</span>
          </h2>
          <ol className="gallery-intro" aria-live="polite">
            {SCREENS.map((s, i) => (
              <li key={s.title} data-i={i}>
                <strong>
                  {s.bobi && <BobiMark />}
                  {s.title}
                </strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="gallery-viewport" tabIndex={0} aria-label="Các màn hình của ứng dụng">
          <div className="gallery-track" data-track>
            {SCREENS.map((s, i) => (
              <figure key={s.title} className="gallery-item" data-i={i}>
                <PhoneFrame {...s.shot} />
              </figure>
            ))}
          </div>
        </div>
        <div className="gallery-progress" aria-hidden="true">
          <i />
        </div>
        <p className="lp-fineprint">Số liệu trong ảnh là dữ liệu mẫu.</p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

type Cell = { text: string; mark?: 'yes' | 'no' }
const COMPARE: { label: string; us: Cell; pos: Cell }[] = [
  { label: 'Cách ghi đơn', us: { text: 'Nói hoặc gõ một câu tự nhiên', mark: 'yes' }, pos: { text: 'Chọn món, nhập số trên màn hình hoặc máy quét' } },
  { label: 'Thời gian làm quen', us: { text: 'Vài phút, nói như nói chuyện', mark: 'yes' }, pos: { text: 'Cần thời gian thiết lập danh mục, học nghiệp vụ' } },
  { label: 'Thiết bị cần có', us: { text: 'Điện thoại sẵn có', mark: 'yes' }, pos: { text: 'Thường kèm máy POS, máy quét, máy in' } },
  { label: 'Báo cáo', us: { text: 'Ngắn gọn: doanh thu, lãi gộp ước tính, bán chạy' }, pos: { text: 'Rất nhiều báo cáo chuyên sâu', mark: 'yes' } },
  { label: 'Kế toán, hoá đơn điện tử, chuỗi cửa hàng', us: { text: 'Chưa hỗ trợ', mark: 'no' }, pos: { text: 'Hỗ trợ đầy đủ', mark: 'yes' } },
  { label: 'Phù hợp nhất với', us: { text: 'Quán nước, tiệm trà sữa, xe đẩy, sạp chợ, tạp hoá nhỏ' }, pos: { text: 'Cửa hàng vừa và lớn, chuỗi, doanh nghiệp' } },
]

function Mark({ m }: { m?: Cell['mark'] }) {
  if (!m) return null
  if (m === 'yes')
    return (
      <span className="cmp-mark yes" aria-label="Có">
        <Check size={13} strokeWidth={3} />
      </span>
    )
  return (
    <span className="cmp-mark no" aria-label="Không">
      <X size={13} strokeWidth={3} />
    </span>
  )
}

function Compare() {
  return (
    <section className="lp-section lp-compare" id="so-sanh">
      <div className="lp-container">
        <div className="lp-sec-head">
          <h2 className="lp-display">
            Một việc nhỏ.
            <br />
            <span className="is-muted">Làm cho thật dễ.</span>
          </h2>
          <p>Sổ Nghe Lời không thay thế phần mềm quản lý bán hàng lớn. Đây là cách so với POS truyền thống.</p>
        </div>
        <div className="cmp" role="table" aria-label="Bảng so sánh">
          <div className="cmp-row cmp-head" role="row">
            <span role="columnheader" className="cmp-label">
              Tiêu chí
            </span>
            <span role="columnheader" className="cmp-us">
              <LogoMark size={26} /> Sổ Nghe Lời
            </span>
            <span role="columnheader" className="cmp-pos">
              POS truyền thống
            </span>
          </div>
          {COMPARE.map((r) => (
            <div className="cmp-row" role="row" key={r.label}>
              <span role="rowheader" className="cmp-label">
                {r.label}
              </span>
              <span role="cell" className="cmp-us">
                <Mark m={r.us.mark} />
                <span>{r.us.text}</span>
              </span>
              <span role="cell" className="cmp-pos">
                <Mark m={r.pos.mark} />
                <span>{r.pos.text}</span>
              </span>
            </div>
          ))}
        </div>
        <p className="lp-fineprint">
          So sánh mang tính định tính, dựa trên đặc điểm chung của các phần mềm quản lý bán hàng phổ biến như Sapo, KiotViet, MISA AMIS. Mỗi sản
          phẩm có thể khác nhau; nếu bạn cần kế toán hay quản lý chuỗi, đó vẫn là lựa chọn phù hợp hơn.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

/**
 * Đội ngũ làm sản phẩm (Team HEXA, môn EXE201, Trường Đại học FPT): poster Đội ngũ của từng thành viên, giữ nguyên khổ
 * (`public/team/<slug>.webp`, 940×788). Tên và vai trò đã in trên poster; `alt` lặp lại cho trình đọc màn hình.
 */
const TEAM: { slug: string; name: string; role: string }[] = [
  { slug: 'minh-tho', name: 'Minh Thọ', role: 'Leader' },
  { slug: 'minh-phu', name: 'Minh Phú', role: 'AI Engineer' },
  { slug: 'thuong-hiep', name: 'Thượng Hiệp', role: 'Frontend Developer' },
  { slug: 'thu-thao', name: 'Thu Thảo', role: 'Backend Developer' },
  { slug: 'quynh-nhu', name: 'Quỳnh Như', role: 'Business Analyst' },
  { slug: 'kieu-chinh', name: 'Kiều Chinh', role: 'Marketing' },
]

function Team() {
  return (
    <section className="lp-section lp-team" id="doi-ngu">
      <div className="lp-container">
        <div className="lp-sec-head team-head">
          <div>
            <h2 className="lp-display" data-reveal>
              Đội ngũ.
              <br />
              <span className="is-muted">Sáu người, một cuốn sổ.</span>
            </h2>
            <p>Nhóm sinh viên Team HEXA, môn EXE201 tại Trường Đại học FPT, làm Sổ Nghe Lời từ ý tưởng tới ứng dụng.</p>
          </div>
          <img src="/brand/agent-happy.webp" alt="" width={150} height={150} loading="lazy" />
        </div>
        <ul className="team-grid">
          {TEAM.map((m, i) => (
            <li key={m.slug} className="team-card" data-reveal style={delay(i % 3)}>
              <img src={`/team/${m.slug}.webp`} alt={`${m.name}, ${m.role}`} width={940} height={788} loading="lazy" />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: 'Tôi nói giọng miền Tây, miền Trung, ứng dụng có hiểu không?',
    a: 'Ứng dụng nhận dạng tiếng Việt nói hằng ngày và hiểu cách nói số quen thuộc như “hai bánh mì”, “cà phê hai mươi lăm nghìn”. Với giọng địa phương đậm hoặc chỗ quá ồn, kết quả có thể chưa đúng, vì vậy mỗi đơn đều hiện ra để bạn xem lại và sửa trước khi lưu. Bạn cũng có thể gõ thay vì nói.',
  },
  {
    q: 'Có cần Internet không?',
    a: 'Giọng nói được nhận dạng ngay trên điện thoại, không cần gửi âm thanh đi. Nhưng để lưu sổ lên tài khoản, ứng dụng cần kết nối Internet (Wi‑Fi hoặc 4G).',
  },
  {
    q: 'Đăng nhập bằng gì và sổ được lưu ở đâu?',
    a: 'Bạn đăng nhập bằng email và mật khẩu hoặc tài khoản Google. Sổ được lưu gắn với tài khoản đó; lưu lên tài khoản cần kết nối Internet.',
  },
  {
    q: 'Muốn ngừng dùng thì làm thế nào?',
    a: 'Nếu bạn muốn ngừng dùng hoặc xoá sổ, hãy nhắn cho chúng tôi qua các kênh liên hệ trên trang này.',
  },
  {
    q: 'Sổ Nghe Lời khác gì KiotViet, Sapo?',
    a: 'KiotViet, Sapo hay MISA AMIS là phần mềm quản lý bán hàng đầy đủ, mạnh cho cửa hàng vừa và lớn. Sổ Nghe Lời chọn hướng khác: thật gọn cho quán nhỏ chưa dùng máy POS, nói một câu là có đơn, cuối ngày xem doanh thu và món bán chạy. Nếu bạn cần kế toán, hoá đơn điện tử hay quản lý chuỗi, các phần mềm kia sẽ phù hợp hơn.',
  },
  {
    q: 'AI ghi sai thì sửa thế nào?',
    a: 'Sau khi ứng dụng tách món, bạn thấy ngay danh sách món, số lượng, giá. Chạm vào dòng bất kỳ để sửa, thêm hoặc bớt món rồi mới bấm thanh toán. Đơn chỉ được lưu khi bạn xác nhận.',
  },
  {
    q: 'Dùng có mất phí không?',
    a: 'Ứng dụng đang ở giai đoạn thử nghiệm: chưa thu phí và chưa công bố gói trả phí nào.',
  },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(null)
  return (
    <section className="lp-section lp-faq" id="hoi-dap">
      <div className="lp-container lp-faq-grid">
        <div className="lp-faq-aside">
          <div className="lp-sec-head">
            <h2 className="lp-display">Hỏi đáp.</h2>
            <p>
              {CONTACT_EMAIL
                ? 'Chưa thấy câu trả lời bạn cần? Hãy nhắn cho chúng tôi qua mục Liên hệ ở cuối trang.'
                : 'Những điều người bán hay hỏi trước khi dùng thử.'}
            </p>
          </div>
          <img src="/brand/agent-question.webp" alt="" width={194} height={237} loading="lazy" />
        </div>
        <div className="faq-list">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.q} className="faq" data-open={isOpen}>
                <h3>
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={`faq-${i}`}
                    id={`faq-btn-${i}`}
                    onClick={() => setOpen(isOpen ? null : i)}
                  >
                    <span>{f.q}</span>
                    <ChevronDown size={20} />
                  </button>
                </h3>
                <div className="faq-panel" id={`faq-${i}`} role="region" aria-labelledby={`faq-btn-${i}`}>
                  <div>
                    <p>{f.a}</p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

/** Lời mời cuối trang: điện thoại nâng dần lên theo cuộn cho tới khi chạm footer. */
function Closing() {
  return (
    <section className="lp-closing" data-scroll="view">
      <div className="lp-container closing-copy">
        <h2>
          Miệng nói.
          <br />
          <span className="lp-gradient-text is-light">Sổ ghi.</span>
        </h2>
        <p>Bán tới đâu, nói tới đó. Chỉ cần chiếc điện thoại bạn đang có.</p>
        <div className="lp-hero-cta">
          <DownloadCta label="Tải ứng dụng" />
        </div>
      </div>
      <div className="closing-phone">
        <PhoneFrame>
          <div className="splash">
            <img src="/brand/bobi-notebook.webp" alt="" width={120} height={115} />
            <strong>
              Sổ Nghe <b>Lời</b>
            </strong>
            <span>AI VOICE POS</span>
          </div>
        </PhoneFrame>
      </div>
    </section>
  )
}

export default function LandingPage() {
  useReveal()
  useScrollProgress()
  useEffect(() => {
    document.title = 'Sổ Nghe Lời — Miệng nói, sổ ghi.'
  }, [])
  return (
    <div className="lp">
      <Nav />
      <main>
        <Hero />
        <Statement />
        <Gallery />
        <Features />
        <Compare />
        <Team />
        <Faq />
        <Closing />
      </main>
      <SiteFooter onHome />
    </div>
  )
}
