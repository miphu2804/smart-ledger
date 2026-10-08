import {
  ArrowRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  Info,
  Menu,
  MessageSquareText,
  Mic,
  NotebookPen,
  SearchX,
  ShieldCheck,
  Smartphone,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Logo, { LogoMark } from '../../components/Logo'
import { useReveal } from '../../hooks/useReveal'
import '../../styles/landing.css'
import { CONTACT_EMAIL } from '../legal/legalConfig'
import SiteFooter from './SiteFooter'

const NAV = [
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
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

  const state = open || scrolled ? `${scrolled ? ' is-scrolled' : ''}${open ? ' is-open' : ''}` : ' is-top'

  return (
    <header className={`lp-nav${state}`}>
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
          <Link to="/admin/login" className="lp-admin-link">
            Quản trị
          </Link>
          <a href="#tai-ung-dung" className="btn btn-accent btn-sm lp-nav-cta">
            <Download size={16} /> Bản thử nghiệm
          </a>
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
            <a href="#tai-ung-dung" className="btn btn-primary btn-block" onClick={() => setOpen(false)}>
              <Download size={16} /> Bản thử nghiệm
            </a>
            <Link to="/admin/login" className="btn btn-ghost btn-block">
              Quản trị
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

/* ------------------------------------------------------------------ */

function PhoneFrame({ src, alt, eager = false }: { src: string; alt: string; eager?: boolean }) {
  return (
    <div className="phone">
      <div className="phone-screen">
        <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width={390} height={844} decoding="async" />
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">
            <i /> Sổ bán hàng cho quán nhỏ
          </span>
          <h1>
            Nói một câu,
            <br /> có ngay đơn
            <br /> <span className="hl">để kiểm tra.</span>
          </h1>
          <p className="lp-lead">
            Sổ Nghe Lời biến câu nói hoặc nội dung bạn gõ thành bản nháp đơn bán. Bạn xem lại, sửa nếu cần rồi mới xác nhận ghi vào sổ.
          </p>
          <div className="lp-hero-cta">
            <a href="#tai-ung-dung" className="btn btn-accent btn-lg">
              <Download size={18} /> Xem bản thử nghiệm
            </a>
            <a href="#cach-hoat-dong" className="btn btn-on-dark btn-lg">
              Xem cách hoạt động <ArrowRight size={18} />
            </a>
          </div>
          <ul className="lp-hero-points">
            <li>
              <CheckCircle2 size={16} /> Luôn xem lại trước khi ghi sổ
            </li>
            <li>
              <CheckCircle2 size={16} /> Nhận dạng tiếng Việt ngay trên điện thoại
            </li>
            <li>
              <CheckCircle2 size={16} /> Chỉ cần điện thoại
            </li>
          </ul>
        </div>

        <div className="lp-hero-visual">
          <div className="hero-stage">
            <PhoneFrame src="/screens/home.webp" alt="Màn hình Tổng quan của ứng dụng Sổ Nghe Lời: doanh thu tuần, lối vào đọc đơn, chọn hàng, quét mã, trợ lý AI" eager />
            <span className="hero-bubble">
              <Mic size={16} /> “Hai bánh mì thịt, một cà phê sữa đá”
            </span>
            <span className="hero-result">
              <span>Đơn nháp · 2 món</span>
              <b>55.000đ</b>
            </span>
            <img className="hero-robot" src="/brand/robot.webp" alt="" width={360} height={345} />
          </div>
        </div>
      </div>
    </section>
  )
}

const TILES = [
  { icon: '/brand/icons/doc-don.webp', title: 'Đọc đơn', sub: 'Giọng nói' },
  { icon: '/brand/icons/chon-hang.webp', title: 'Chọn hàng', sub: 'Thủ công' },
  { icon: '/brand/icons/quet-ma.webp', title: 'Quét mã', sub: 'Mã vạch / QR' },
  { icon: '/brand/icons/tro-li-ai.webp', title: 'Trợ lý AI', sub: 'Hỏi đáp về tiệm' },
]

function Tiles() {
  return (
    <div className="lp-tiles-wrap">
      <div className="lp-container">
        <ul className="lp-tiles" aria-label="Các cách lên đơn trong ứng dụng">
          {TILES.map((t, i) => (
            <li key={t.title} className="lp-tile" data-reveal style={delay(i)}>
              <img src={t.icon} alt="" width={54} height={54} loading="lazy" />
              <div>
                <strong>{t.title}</strong>
                <span>{t.sub}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */

function SectionHead({ kicker, title, children, center = true }: { kicker: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`lp-sec-head${center ? ' is-center' : ''}`} data-reveal>
      <span className="lp-kicker">{kicker}</span>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  )
}

const PAINS: { icon: LucideIcon; tone: string; title: string; text: string; fix: string }[] = [
  {
    icon: NotebookPen,
    tone: 'red',
    title: 'Ghi sổ tay',
    text: 'Đông khách thì ghi vội, chữ lem, trang rách. Tối về cộng lại mới thấy lệch tiền mà không biết lệch ở đâu.',
    fix: 'Mỗi đơn lưu kèm giờ bán, tổng tiền tự cộng.',
  },
  {
    icon: Brain,
    tone: 'gold',
    title: 'Nhớ bằng đầu',
    text: 'Bán lẻ từng món nhỏ, không kịp ghi nên “để lát nhớ”. Hết ngày thì quên mất phân nửa.',
    fix: 'Nói một câu, không cần dừng tay.',
  },
  {
    icon: SearchX,
    tone: 'purple',
    title: 'Không biết món nào bán chạy',
    text: 'Nhập hàng theo cảm tính: món đắt thì hết sớm, món ế thì tồn lại, tiền nằm chết trong kho.',
    fix: 'Món bán chạy và hàng sắp hết hiện ngay ở màn Tổng quan.',
  },
]

function Pains() {
  return (
    <section className="lp-section lp-pains">
      <div className="lp-container">
        <SectionHead kicker="Vấn đề quen thuộc" title="Bán thì đắt, mà sổ sách thì rối">
          Phần lớn quán nước, xe trái cây, sạp chợ vẫn ghi sổ tay hoặc không ghi gì cả. Không phải vì lười, mà vì chưa có cách nào đủ nhanh.
        </SectionHead>
        <div className="pain-grid">
          {PAINS.map((p, i) => (
            <article key={p.title} className="pain-card" data-reveal style={delay(i)}>
              <span className={`pain-icon tone-${p.tone}`}>
                <p.icon size={22} />
              </span>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
              <div className="pain-fix">
                <ArrowRight size={16} />
                <span>{p.fix}</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function Steps() {
  return (
    <section className="lp-section lp-steps" id="cach-hoat-dong">
      <div className="lp-container">
        <SectionHead kicker="Cách hoạt động" title="3 bước, từ câu nói đến báo cáo">
          Không cần cài đặt phức tạp. Bạn bán tới đâu, nói tới đó.
        </SectionHead>
        <ol className="step-grid">
          <li className="step" data-reveal>
            <PhoneFrame src="/screens/voice.webp" alt="Màn Đọc đơn: câu nói được tách thành ba món có số lượng và giá, tổng 80.000đ" />
            <div className="step-body">
              <span className="step-num">1</span>
              <h3>Nói hoặc gõ</h3>
              <p>Nhấn giữ nút ghi âm và đọc đơn như nói chuyện, hoặc gõ khi quán ồn. Ứng dụng tách món, số lượng và giá.</p>
              <div className="step-say">
                <span className="say-chip">
                  <Mic size={13} /> hai bánh mì thịt, một cà phê sữa đá
                </span>
                <span className="say-chip">
                  <MessageSquareText size={13} /> bánh mì 20k cà phê 25k
                </span>
              </div>
            </div>
          </li>
          <li className="step" data-reveal style={delay(1)}>
            <PhoneFrame src="/screens/checkout.webp" alt="Màn Thanh toán: danh sách món, hình thức tiền mặt, chuyển khoản hoặc ghi nợ" />
            <div className="step-body">
              <span className="step-num">2</span>
              <h3>Kiểm tra rồi thanh toán</h3>
              <p>Xem lại món, sửa số lượng nếu cần, chọn tiền mặt, chuyển khoản (chỉ ghi nhận) hoặc ghi nợ. Đơn vào sổ khi bạn bấm Hoàn tất.</p>
            </div>
          </li>
          <li className="step" data-reveal style={delay(2)}>
            <PhoneFrame src="/screens/reports.webp" alt="Màn Báo cáo: doanh thu tuần, biểu đồ theo ngày, thu chi và lãi gộp ước tính" />
            <div className="step-body">
              <span className="step-num">3</span>
              <h3>Xem số liệu</h3>
              <p>Doanh thu, số đơn, lãi gộp ước tính và món bán chạy theo ngày, tuần, tháng.</p>
            </div>
          </li>
        </ol>
        <p className="step-note" data-reveal>
          <ShieldCheck size={22} />
          <span>Kết quả từ giọng nói hay AI chỉ là bản nháp. Không có đơn nào vào sổ nếu bạn chưa xác nhận.</span>
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const FEATURES: { icon: string; title: string; text: string; tag?: string }[] = [
  { icon: 'doc-don', title: 'Đọc đơn bằng giọng nói', text: 'Nhấn giữ nút ghi âm, đọc đơn. Giọng nói được nhận dạng ngay trên điện thoại, bạn xem lại danh sách món trước khi lưu.' },
  { icon: 'chon-hang', title: 'Chọn hàng nhanh', text: 'Lưới hoặc danh sách hàng có ảnh, chạm là thêm vào đơn. Lọc theo nhóm, sắp xếp theo tên hoặc tồn kho.' },
  { icon: 'quet-ma', title: 'Quét mã vạch', text: 'Quét mã vạch hoặc mã QR bằng camera để thêm đúng mặt hàng vào đơn.' },
  { icon: 'products', title: 'Hàng hoá và tồn kho', text: 'Giá bán, số lượng tồn, cảnh báo sắp hết và giá trị tồn kho.' },
  { icon: 'debts', title: 'Công nợ', text: 'Ghi nợ khi khách chưa trả, theo dõi ai còn nợ bao nhiêu và ghi nhận từng lần thu.' },
  { icon: 'expenses', title: 'Chi phí', text: 'Ghi tiền nhập hàng, điện nước, mặt bằng để xem lãi gộp ước tính của kỳ.' },
  { icon: 'reports', title: 'Báo cáo', text: 'Doanh thu, số đơn, giờ bán đông và món bán chạy theo ngày, tuần, tháng.' },
  { icon: 'tro-li-ai', title: 'Trợ lý AI', text: 'Hỏi đáp về số liệu của chính tiệm bạn. Trợ lý chỉ đọc dữ liệu, không tự sửa sổ.', tag: 'Đang hoàn thiện' },
]

function Features() {
  return (
    <section className="lp-section lp-features" id="tinh-nang">
      <div className="lp-container">
        <SectionHead kicker="Tính năng" title="Đủ dùng cho quán nhỏ, không thừa một nút">
          Những thứ người bán thật sự cần mỗi ngày, gói gọn trong một ứng dụng.
        </SectionHead>
        <div className="feat-grid">
          {FEATURES.map((f, i) => (
            <article key={f.title} className="feat" data-reveal style={delay(i % 4)}>
              <img src={`/brand/icons/${f.icon}.webp`} alt="" width={58} height={58} loading="lazy" />
              <h3>{f.title}</h3>
              <p>{f.text}</p>
              {f.tag && <span className="feat-tag">{f.tag}</span>}
            </article>
          ))}
        </div>
        <p className="lp-feat-note">Ứng dụng đang trong giai đoạn thử nghiệm: một số tính năng còn được hoàn thiện và có thể thay đổi.</p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const SCREENS = [
  { src: '/screens/home.webp', title: 'Tổng quan', text: 'Doanh thu theo kỳ, việc cần xử lý' },
  { src: '/screens/orders.webp', title: 'Đơn hàng', text: 'Lịch sử theo ngày, lọc nhanh' },
  { src: '/screens/pos.webp', title: 'Bán hàng', text: 'Chọn hàng có ảnh, lọc và sắp xếp' },
  { src: '/screens/products.webp', title: 'Hàng hoá', text: 'Giá bán, tồn kho, hàng sắp hết' },
]

function Showcase() {
  return (
    <section className="lp-section lp-showcase" id="giao-dien">
      <div className="lp-container">
        <SectionHead kicker="Giao diện" title="Gọn trong một chiếc điện thoại">
          Chữ to, nút lớn, màu dễ nhìn, thiết kế cho người bán đang bận tay.
        </SectionHead>
      </div>
      <div className="showcase-scroller" tabIndex={0} aria-label="Các màn hình của ứng dụng, cuộn ngang để xem thêm">
        <div className="showcase-row">
          {SCREENS.map((s, i) => (
            <figure key={s.src} className="showcase-item" data-reveal style={delay(i)}>
              <PhoneFrame src={s.src} alt={`Màn hình ${s.title}`} />
              <figcaption>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
      <p className="lp-showcase-foot">Ảnh chụp từ bản thử nghiệm; số liệu trong ảnh là dữ liệu mẫu.</p>
    </section>
  )
}

/* ------------------------------------------------------------------ */

type Cell = { text: string; mark?: 'yes' | 'no' | 'mid' }
const COMPARE: { label: string; us: Cell; pos: Cell }[] = [
  { label: 'Cách ghi đơn', us: { text: 'Nói hoặc gõ một câu tự nhiên', mark: 'yes' }, pos: { text: 'Chọn món, nhập số trên màn hình hoặc máy quét' } },
  { label: 'Thời gian làm quen', us: { text: 'Vài phút, nói như nói chuyện', mark: 'yes' }, pos: { text: 'Cần thời gian thiết lập danh mục, học nghiệp vụ' } },
  { label: 'Thiết bị cần có', us: { text: 'Điện thoại sẵn có', mark: 'yes' }, pos: { text: 'Thường kèm máy POS, máy quét, máy in' } },
  { label: 'Hỏi đáp số liệu bằng AI', us: { text: 'Đang hoàn thiện', mark: 'mid' }, pos: { text: 'Tuỳ sản phẩm', mark: 'mid' } },
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
  if (m === 'no')
    return (
      <span className="cmp-mark no" aria-label="Không">
        <X size={13} strokeWidth={3} />
      </span>
    )
  return (
    <span className="cmp-mark mid" aria-label="Tuỳ trường hợp">
      ~
    </span>
  )
}

function Compare() {
  return (
    <section className="lp-section lp-compare" id="so-sanh">
      <div className="lp-container">
        <SectionHead kicker="So sánh" title="Sổ Nghe Lời so với phần mềm POS truyền thống">
          Chúng tôi không thay thế phần mềm quản lý bán hàng lớn. Chúng tôi làm một việc nhỏ hơn và làm cho thật dễ.
        </SectionHead>
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
        <p className="cmp-note">
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
    a: 'Giọng nói được nhận dạng ngay trên điện thoại, không cần gửi âm thanh đi. Nhưng để lưu sổ lên tài khoản và dùng trợ lý AI, ứng dụng cần kết nối Internet (Wi‑Fi hoặc 4G).',
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
    a: 'Ứng dụng đang là bản thử nghiệm của một dự án sinh viên: chưa thu phí và chưa công bố gói trả phí nào.',
  },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="lp-section lp-faq" id="hoi-dap">
      <div className="lp-container lp-faq-grid">
        <div className="lp-faq-aside">
          <SectionHead kicker="Hỏi đáp" title="Câu hỏi thường gặp" center={false}>
            Chưa thấy câu trả lời bạn cần? Hãy nhắn cho Team HEXA qua mục Bản thử nghiệm ở cuối trang.
          </SectionHead>
          <img src="/brand/agent-question.webp" alt="" width={194} height={237} loading="lazy" />
        </div>
        <div className="faq-list">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.q} className={`faq${isOpen ? ' is-open' : ''}`} data-reveal style={delay(i % 4)}>
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

function DownloadBand() {
  return (
    <section className="lp-dl" id="tai-ung-dung">
      <div className="lp-container">
        <div className="dl-card" data-reveal>
          <div className="dl-copy">
            <h2>Thử ghi sổ bằng giọng nói</h2>
            <p>Sổ Nghe Lời đang là bản thử nghiệm cho Android. Khi bản cài đặt sẵn sàng, liên kết tải sẽ được đăng ngay tại đây.</p>
            <div className="dl-actions">
              <span className="dl-status">
                <Smartphone size={20} /> Bản Android: sắp có liên kết tải
              </span>
              {CONTACT_EMAIL && (
                <a className="btn btn-accent btn-lg" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Nhận bản thử Sổ Nghe Lời')}`}>
                  Nhắn để nhận bản thử
                </a>
              )}
            </div>
            <p className="dl-note">
              <Info size={15} />
              <span>Đây là sản phẩm của một dự án sinh viên đang thử nghiệm: tính năng có thể thay đổi và chưa có gói trả phí.</span>
            </p>
          </div>
          <img className="dl-art" src="/brand/agent-happy.webp" alt="" width={206} height={221} loading="lazy" />
        </div>
      </div>
    </section>
  )
}

export default function LandingPage() {
  useReveal()
  useEffect(() => {
    document.title = 'Sổ Nghe Lời — Miệng nói, sổ ghi.'
  }, [])
  return (
    <div className="lp">
      <Nav />
      <main>
        <Hero />
        <Tiles />
        <Pains />
        <Steps />
        <Features />
        <Showcase />
        <Compare />
        <Faq />
        <DownloadBand />
      </main>
      <SiteFooter onHome />
    </div>
  )
}
