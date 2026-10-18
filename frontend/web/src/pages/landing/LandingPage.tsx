import { Check, ChevronDown, ChevronRight, Download, Menu, Mic, ShieldCheck, X } from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
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
  { href: '#giao-dien', label: 'Giao diện' },
  { href: '#hoi-dap', label: 'Hỏi đáp' },
]

/** Độ trễ hiện dần (giây) cho phần tử thứ i trong một nhóm */
const delay = (i: number): CSSProperties => ({ ['--d' as string]: `${i * 0.07}s` })

/* ------------------------------------------------------------------ */

function Nav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const onResize = () => window.innerWidth > 960 && setOpen(false)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <header className={`lp-nav${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}`}>
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
      {open && (
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
      )}
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
  eager = false,
  lightStatus = false,
  children,
}: {
  src?: string
  alt?: string
  eager?: boolean
  lightStatus?: boolean
  children?: ReactNode
}) {
  return (
    <div className="phone">
      <div className="phone-body">
        <div className="phone-screen">
          {children ?? <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width={660} height={1434} decoding="async" />}
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
        <span className="lp-eyebrow">Sổ bán hàng cho quán nhỏ</span>
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
        <div className="hero-side is-left">
          <PhoneFrame src="/screens/voice.webp" alt="Màn Đọc đơn: câu nói được tách thành ba món có số lượng và giá" eager />
        </div>
        <div className="hero-main">
          <PhoneFrame src="/screens/home.webp" alt="Màn Tổng quan: doanh thu tuần, lối vào đọc đơn, chọn hàng, quét mã, trợ lý AI" eager lightStatus />
          <span className="hero-bubble">
            <Mic size={16} /> “Hai bánh mì thịt, một cà phê sữa đá”
          </span>
          <span className="hero-result">
            <span>Đơn nháp · 2 món</span>
            <b>55.000đ</b>
          </span>
        </div>
        <div className="hero-side is-right">
          <PhoneFrame src="/screens/reports.webp" alt="Màn Báo cáo: doanh thu tuần, biểu đồ theo ngày, lãi gộp ước tính" eager />
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const STATEMENT =
  'Phần lớn quán nước, xe trái cây, sạp chợ vẫn ghi sổ tay, hoặc không ghi gì cả. Không phải vì lười, mà vì chưa có cách nào đủ nhanh.'

const PAINS = [
  { title: 'Ghi sổ tay', text: 'Đông khách thì ghi vội. Tối cộng lại mới thấy lệch tiền.', fix: 'Mỗi đơn lưu kèm giờ bán, tổng tiền tự cộng.' },
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
          {PAINS.map((p, i) => (
            <li key={p.title} data-reveal style={delay(i)}>
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

const FLOW: { src: string; alt: string; title: string; text: string; tap?: { x: string; y: string } }[] = [
  {
    src: '/screens/home.webp',
    alt: 'Màn Tổng quan: doanh thu tuần và bốn lối vào đọc đơn, chọn hàng, quét mã, trợ lý AI',
    title: 'Mở app, chạm Đọc đơn.',
    text: 'Màn Tổng quan có sẵn doanh thu kỳ này và bốn cách lên đơn: đọc đơn, chọn hàng, quét mã, hỏi trợ lý AI.',
    tap: { x: '24%', y: '43%' },
  },
  {
    src: '/screens/voice.webp',
    alt: 'Màn Đọc đơn: câu nói được tách thành ba món có số lượng và giá, tổng 80.000đ',
    title: 'Nói như nói chuyện.',
    text: 'Nhấn giữ nút ghi âm và đọc đơn, hoặc gõ khi quán ồn. Ứng dụng tách món, số lượng và giá.',
    tap: { x: '47%', y: '72%' },
  },
  {
    src: '/screens/checkout.webp',
    alt: 'Màn Thanh toán: danh sách món, hình thức tiền mặt, chuyển khoản hoặc ghi nợ',
    title: 'Kiểm tra, rồi thanh toán.',
    text: 'Sửa số lượng nếu cần, chọn tiền mặt, chuyển khoản (chỉ ghi nhận) hoặc ghi nợ. Đơn vào sổ khi bạn bấm Hoàn tất.',
    tap: { x: '77%', y: '93.6%' },
  },
  {
    src: '/screens/orders.webp',
    alt: 'Màn Đơn hàng: các đơn theo ngày, lọc hôm nay, hôm qua, 7 ngày',
    title: 'Đơn đã vào sổ.',
    text: 'Mỗi đơn lưu kèm giờ bán trong Đơn hàng, lọc nhanh theo hôm nay, hôm qua hoặc 7 ngày.',
  },
  {
    src: '/screens/reports.webp',
    alt: 'Màn Báo cáo: doanh thu tuần, biểu đồ theo ngày, thu chi và lãi gộp ước tính',
    title: 'Xem số liệu.',
    text: 'Doanh thu, số đơn, lãi gộp ước tính và món bán chạy theo ngày, tuần, tháng.',
  },
]

/** Phần quãng cuộn đầu mục dành cho cảnh máy lùi từ cận cảnh ra toàn thân; phải khớp với 0.14 trong landing.css. */
const FLOW_INTRO = 0.14

/**
 * Mục ghim kể luồng dùng app theo vị trí cuộn: mở đầu cận cảnh màn hình rồi lùi ra như trang iPhone,
 * sau đó mỗi đoạn cuộn là một màn trong luồng Tổng quan → Đọc đơn → Thanh toán → Đơn hàng → Báo cáo.
 * Màn mới trượt vào từ phải như chuyển trang trên iOS; ngón tay ảo chạm nút dẫn sang màn kế, lần cuối là vuốt.
 */
function Story() {
  return (
    <section
      className="lp-story"
      id="cach-hoat-dong"
      data-scroll="pin"
      data-steps={FLOW.length}
      data-steps-start={FLOW_INTRO}
      data-step="0"
      style={{ ['--n' as string]: FLOW.length }}
    >
      <div className="story-sticky">
        <div className="lp-container story-copy">
          <span className="lp-eyebrow is-dark">Cách hoạt động</span>
          <ol className="story-steps">
            {FLOW.map((s, i) => (
              <li key={s.src} className="story-step" data-i={i}>
                <span className="story-num">0{i + 1}</span>
                <h2>{s.title}</h2>
                <p>{s.text}</p>
              </li>
            ))}
          </ol>
          <div className="story-dots" aria-hidden="true">
            {FLOW.map((s, i) => (
              <i key={s.src} data-i={i} />
            ))}
          </div>
        </div>

        <div className="story-device">
          <span className="story-voice" aria-hidden="true">
            <Mic size={15} /> “Hai bánh mì thịt, một cà phê sữa đá, một bạc xỉu”
          </span>
          <PhoneFrame>
            {FLOW.map((s, i) => (
              <div key={s.src} className="flow-screen" style={{ ['--k' as string]: i }}>
                <img src={s.src} alt={s.alt} width={660} height={1434} loading={i ? 'lazy' : 'eager'} decoding="async" />
                {s.tap && <span className="flow-tap" style={{ left: s.tap.x, top: s.tap.y }} aria-hidden="true" />}
              </div>
            ))}
            <span className="flow-swipe" aria-hidden="true" />
          </PhoneFrame>
        </div>
        <p className="story-note">
          <ShieldCheck size={18} /> Không có đơn nào vào sổ nếu bạn chưa xác nhận.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; text: string; size?: 'wide' }[] = [
  { icon: 'chon-hang', title: 'Chọn hàng nhanh', text: 'Lưới hàng có ảnh, chạm là thêm vào đơn.' },
  { icon: 'quet-ma', title: 'Quét mã vạch', text: 'Quét mã vạch hoặc QR bằng camera.' },
  { icon: 'products', title: 'Hàng hoá, tồn kho', text: 'Giá bán, số tồn, cảnh báo sắp hết.' },
  { icon: 'debts', title: 'Công nợ', text: 'Ai còn nợ bao nhiêu, ghi từng lần thu.' },
  { icon: 'expenses', title: 'Chi phí', text: 'Tiền nhập hàng, điện nước, mặt bằng để tính lãi gộp ước tính.', size: 'wide' },
  { icon: 'reports', title: 'Báo cáo', text: 'Doanh thu, số đơn, giờ bán đông và món bán chạy theo ngày, tuần, tháng.', size: 'wide' },
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
            <article key={f.title} className={`bento-tile${f.size ? ` is-${f.size}` : ''}`} data-reveal style={delay(i % 4)}>
              <img src={`/brand/icons/${f.icon}.webp`} alt="" width={56} height={56} loading="lazy" />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const SCREENS = [
  { src: '/screens/home.webp', title: 'Tổng quan', text: 'Doanh thu theo kỳ, việc cần xử lý', light: true },
  { src: '/screens/pos.webp', title: 'Bán hàng', text: 'Chọn hàng có ảnh, lọc và sắp xếp' },
  { src: '/screens/checkout.webp', title: 'Thanh toán', text: 'Tiền mặt, chuyển khoản hoặc ghi nợ' },
  { src: '/screens/orders.webp', title: 'Đơn hàng', text: 'Lịch sử theo ngày, lọc nhanh' },
  { src: '/screens/products.webp', title: 'Hàng hoá', text: 'Giá bán, tồn kho, hàng sắp hết' },
  { src: '/screens/reports.webp', title: 'Báo cáo', text: 'Doanh thu, lãi gộp ước tính' },
]

/** Mục ghim: cuộn dọc kéo dải điện thoại chạy ngang, như phần "Xem điểm nổi bật" trên trang iPhone. */
function Gallery() {
  return (
    <section className="lp-gallery" id="giao-dien" data-scroll="pin">
      <div className="gallery-sticky">
        <div className="lp-container">
          <h2 className="lp-display">
            Gọn trong một chiếc điện thoại.
            <br />
            <span className="is-muted">Chữ to, nút lớn, cho người đang bận tay.</span>
          </h2>
        </div>
        <div className="gallery-viewport" tabIndex={0} aria-label="Các màn hình của ứng dụng">
          <div className="gallery-track" data-track>
            {SCREENS.map((s) => (
              <figure key={s.src} className="gallery-item">
                <PhoneFrame src={s.src} alt={`Màn hình ${s.title}`} lightStatus={s.light} />
                <figcaption>
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </figcaption>
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
  { label: 'Phù hợp nhất với', us: { text: 'Quán nước, xe đẩy, sạp chợ, tạp hoá nhỏ' }, pos: { text: 'Cửa hàng vừa và lớn, chuỗi, doanh nghiệp' } },
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
        <div className="lp-sec-head" data-reveal>
          <h2 className="lp-display">
            Một việc nhỏ.
            <br />
            <span className="is-muted">Làm cho thật dễ.</span>
          </h2>
          <p>Sổ Nghe Lời không thay thế phần mềm quản lý bán hàng lớn. Đây là cách so với POS truyền thống.</p>
        </div>
        <div className="cmp" role="table" aria-label="Bảng so sánh" data-reveal>
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
    q: 'Dữ liệu bán hàng của tôi có an toàn không?',
    a: (
      <>
        Sổ gắn với tài khoản của bạn, đăng nhập bằng Facebook hoặc email; nhân viên quản trị chỉ xem được thông tin hỗ trợ ở mức tối thiểu và mọi lần
        xem đều được ghi lại. Chi tiết nằm ở <Link to="/privacy">Chính sách quyền riêng tư</Link>.
      </>
    ),
  },
  {
    q: 'Làm sao để xoá tài khoản và dữ liệu của tôi?',
    a: (
      <>
        Bạn gửi yêu cầu theo hướng dẫn tại trang <Link to="/data-deletion">Xoá dữ liệu người dùng</Link>. Trang đó cũng chỉ cách gỡ quyền của ứng
        dụng khỏi tài khoản Facebook.
      </>
    ),
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
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="lp-section lp-faq" id="hoi-dap">
      <div className="lp-container lp-faq-grid">
        <div className="lp-sec-head" data-reveal>
          <h2 className="lp-display">Hỏi đáp.</h2>
          <p>
            {CONTACT_EMAIL
              ? 'Chưa thấy câu trả lời bạn cần? Hãy nhắn cho chúng tôi qua mục Liên hệ ở cuối trang.'
              : 'Những điều người bán hay hỏi trước khi dùng thử.'}
          </p>
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
        <PhoneFrame src="/screens/voice.webp" alt="Màn Đọc đơn của Sổ Nghe Lời" />
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
        <Story />
        <Features />
        <Gallery />
        <Compare />
        <Faq />
        <Closing />
      </main>
      <SiteFooter onHome />
    </div>
  )
}
