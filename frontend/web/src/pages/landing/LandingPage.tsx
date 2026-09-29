import {
  ArrowRight,
  BarChart3,
  Brain,
  Check,
  CheckCircle2,
  ChevronDown,
  Crown,
  Download,
  HandCoins,
  LayoutGrid,
  Menu,
  MessageSquareText,
  Mic,
  NotebookPen,
  Package,
  PencilLine,
  PlayCircle,
  Printer,
  Receipt,
  SearchX,
  ShieldCheck,
  Smartphone,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AppleIcon, GooglePlayIcon } from '../../components/BrandIcons'
import Logo, { LogoMark } from '../../components/Logo'
import '../../styles/landing.css'

const NAV = [
  { href: '#tinh-nang', label: 'Tính năng' },
  { href: '#cach-hoat-dong', label: 'Cách hoạt động' },
  { href: '#so-sanh', label: 'So sánh' },
  { href: '#bang-gia', label: 'Bảng giá' },
  { href: '#hoi-dap', label: 'Hỏi đáp' },
]

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
        <a href="#top" className="lp-nav-logo" aria-label="Sổ Nghe Lời — về đầu trang">
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
          <a href="#download" className="btn btn-primary btn-sm lp-nav-cta">
            <Download size={16} /> Tải ứng dụng
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
            <a href="#download" className="btn btn-primary btn-block" onClick={() => setOpen(false)}>
              <Download size={16} /> Tải ứng dụng
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

function PhoneFrame({ src, alt, className = '', eager = false }: { src: string; alt: string; className?: string; eager?: boolean }) {
  return (
    <div className={`phone ${className}`}>
      <div className="phone-screen">
        <img src={src} alt={alt} loading={eager ? 'eager' : 'lazy'} width={390} height={844} />
        <span className="phone-island" />
      </div>
    </div>
  )
}

function VoiceCard() {
  return (
    <div className="voice-card" aria-label="Ví dụ: câu nói được AI tách thành món hàng">
      <div className="vc-head">
        <span className="vc-mic">
          <Mic size={16} strokeWidth={2.5} />
        </span>
        <span className="vc-listening">Đang nghe…</span>
        <span className="vc-wave" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <i key={i} style={{ animationDelay: `${(i * 0.11) % 0.9}s` }} />
          ))}
        </span>
      </div>
      <p className="vc-transcript">“bán 2 ly cà phê sữa, 1 bánh mì thịt”</p>
      <div className="vc-divider">
        <span>
          <Sparkles size={13} /> AI nhận diện
        </span>
      </div>
      <ul className="vc-lines">
        <li style={{ animationDelay: '0.5s' }}>
          <span className="vc-item">Cà phê sữa</span>
          <span className="vc-qty">× 2</span>
          <span className="vc-price">40.000đ</span>
        </li>
        <li style={{ animationDelay: '0.8s' }}>
          <span className="vc-item">Bánh mì thịt</span>
          <span className="vc-qty">× 1</span>
          <span className="vc-price">15.000đ</span>
        </li>
      </ul>
      <div className="vc-total" style={{ animationDelay: '1.1s' }}>
        <div>
          <small>Tổng cộng</small>
          <strong>55.000đ</strong>
        </div>
        <span className="vc-save">
          <Check size={15} strokeWidth={3} /> Lưu đơn
        </span>
      </div>
    </div>
  )
}

function Hero() {
  return (
    <section className="lp-hero" id="top">
      <div className="lp-hero-bg" aria-hidden="true" />
      <div className="lp-container lp-hero-grid">
        <div className="lp-hero-copy">
          <span className="lp-eyebrow">
            <i className="pulse-dot" /> Sổ bán hàng AI cho quán nhỏ
          </span>
          <h1>
            Nói là <span className="hl">ghi sổ</span>.
            <br />
            <span className="lp-hero-sub">Khỏi cần máy POS.</span>
          </h1>
          <p className="lp-lead">
            Bán xong, nói một câu như <em>“bán 1 ký ổi 30 nghìn”</em> — Sổ Nghe Lời tự tách món, số lượng, giá và giờ bán. Bạn chỉ
            cần xem lại rồi bấm lưu. Cuối ngày biết ngay bán được bao nhiêu, món nào đắt hàng.
          </p>
          <div className="lp-hero-cta">
            <a href="#download" className="btn btn-primary btn-lg">
              <Download size={18} /> Tải ứng dụng
            </a>
            <a href="#cach-hoat-dong" className="btn btn-outline btn-lg">
              <PlayCircle size={18} /> Xem cách hoạt động
            </a>
          </div>
          <ul className="lp-hero-points">
            <li>
              <CheckCircle2 size={16} /> Miễn phí 200 đơn mỗi tháng
            </li>
            <li>
              <CheckCircle2 size={16} /> Hiểu tiếng Việt đời thường
            </li>
            <li>
              <CheckCircle2 size={16} /> Chỉ cần điện thoại
            </li>
          </ul>
        </div>

        <div className="lp-hero-visual">
          <div className="lp-hero-ring" aria-hidden="true" />
          <PhoneFrame src="/screens/overview.png" alt="Màn hình Tổng quan của ứng dụng Sổ Nghe Lời" className="phone-hero" eager />
          <VoiceCard />
          <div className="saved-chip" aria-hidden="true">
            <span className="saved-icon">
              <Check size={14} strokeWidth={3} />
            </span>
            <div>
              <strong>Đã lưu vào sổ</strong>
              <small>
                <span className="tag-ai">Đọc đơn AI</span> 10:24
              </small>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function SectionHead({ kicker, title, children, center = true }: { kicker: string; title: ReactNode; children?: ReactNode; center?: boolean }) {
  return (
    <div className={`lp-sec-head${center ? ' is-center' : ''}`}>
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
    fix: 'Mỗi đơn được lưu kèm giờ bán, cộng tổng tự động.',
  },
  {
    icon: Brain,
    tone: 'gold',
    title: 'Nhớ bằng đầu',
    text: 'Bán lẻ từng món nhỏ, không kịp ghi nên “để lát nhớ”. Hết ngày thì quên mất phân nửa.',
    fix: 'Nói một câu trong 3 giây, không cần dừng tay.',
  },
  {
    icon: SearchX,
    tone: 'purple',
    title: 'Không biết món nào bán chạy',
    text: 'Nhập hàng theo cảm tính: món đắt thì hết sớm, món ế thì tồn lại, tiền nằm chết trong kho.',
    fix: 'Biểu đồ bán chạy / bán chậm và gợi ý nên nhập gì.',
  },
]

function Pains() {
  return (
    <section className="lp-section lp-pains">
      <div className="lp-container">
        <SectionHead kicker="Vấn đề quen thuộc" title="Bán thì đắt, mà sổ sách thì rối">
          Phần lớn quán nước, xe trái cây, sạp chợ vẫn ghi sổ tay hoặc không ghi gì cả. Không phải vì lười — mà vì chưa có cách nào đủ nhanh.
        </SectionHead>
        <div className="pain-grid">
          {PAINS.map((p) => (
            <article key={p.title} className={`pain-card tone-${p.tone}`}>
              <span className="pain-icon">
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
        <SectionHead kicker="Cách hoạt động" title="4 bước, từ câu nói đến báo cáo">
          Không cần cài đặt danh mục phức tạp. Bạn bán tới đâu, nói tới đó.
        </SectionHead>
        <ol className="step-grid">
          <li className="step">
            <span className="step-num">1</span>
            <h3>Nói hoặc nhập</h3>
            <p>Bấm nút micro rồi nói như bình thường. Không tiện nói thì gõ.</p>
            <div className="step-visual sv-say">
              <span className="say-chip">
                <Mic size={13} /> bán 1 ký ổi 30 nghìn
              </span>
              <span className="say-chip alt">
                <MessageSquareText size={13} /> 2 ly cà phê sữa 40 nghìn
              </span>
            </div>
          </li>
          <li className="step">
            <span className="step-num">2</span>
            <h3>AI nhận diện</h3>
            <p>AI tách câu nói thành món, số lượng, giá và giờ bán.</p>
            <div className="step-visual sv-parse">
              <dl>
                <div>
                  <dt>Món</dt>
                  <dd>Ổi</dd>
                </div>
                <div>
                  <dt>SL</dt>
                  <dd>1 ký</dd>
                </div>
                <div>
                  <dt>Giá</dt>
                  <dd>30.000đ</dd>
                </div>
                <div>
                  <dt>Giờ</dt>
                  <dd>10:24</dd>
                </div>
              </dl>
            </div>
          </li>
          <li className="step">
            <span className="step-num">3</span>
            <h3>Xác nhận &amp; lưu</h3>
            <p>Xem lại, sửa nếu cần, bấm lưu. Đơn vào thẳng lịch sử bán hàng.</p>
            <div className="step-visual sv-confirm">
              <span className="mini-btn ghost">
                <PencilLine size={13} /> Sửa
              </span>
              <span className="mini-btn solid">
                <Check size={13} strokeWidth={3} /> Lưu đơn
              </span>
            </div>
          </li>
          <li className="step">
            <span className="step-num">4</span>
            <h3>Báo cáo &amp; gợi ý</h3>
            <p>Cuối ngày xem tổng doanh thu, món bán chạy và gợi ý nên nhập thêm.</p>
            <div className="step-visual sv-report">
              <div className="mini-bars" aria-hidden="true">
                {[40, 72, 55, 90, 64, 82, 100].map((h, i) => (
                  <i key={i} style={{ height: `${h}%` }} />
                ))}
              </div>
              <span className="suggest">
                <Sparkles size={12} /> Nên nhập thêm: ổi, trà đá
              </span>
            </div>
          </li>
        </ol>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const FEATURES: { icon: LucideIcon; tone: string; title: string; text: string }[] = [
  { icon: LayoutGrid, tone: 'blue', title: 'Chọn hàng nhanh', text: 'Lưới món như máy POS — chạm là thêm vào đơn, hợp lúc quán ồn.' },
  { icon: Receipt, tone: 'blue', title: 'Hoá đơn', text: 'Lọc hôm nay, hôm qua, tháng này. Phân biệt rõ đơn “Đọc đơn AI” và “POS”.' },
  { icon: Package, tone: 'green', title: 'Hàng hoá & tồn kho', text: 'Biết món nào sắp hết, còn bao nhiêu và giá trị tồn kho.' },
  { icon: Wallet, tone: 'gold', title: 'Chi phí', text: 'Ghi tiền nhập hàng, điện nước, mặt bằng — xem theo từng tháng.' },
  { icon: HandCoins, tone: 'purple', title: 'Quản lý nợ', text: 'Theo dõi khách mua chịu: ai đã trả, ai còn nợ, nợ bao nhiêu.' },
  { icon: TrendingUp, tone: 'green', title: 'Hàng bán chạy', text: 'Xếp hạng món bán chạy và bán chậm theo số lượng, theo tháng.' },
  { icon: Sparkles, tone: 'purple', title: 'Trợ lý AI', text: 'Hỏi “hôm nay bán được bao nhiêu?” và nhận gợi ý nên nhập thêm gì.' },
]

function Features() {
  return (
    <section className="lp-section lp-features" id="tinh-nang">
      <div className="lp-container">
        <SectionHead kicker="Tính năng" title="Đủ dùng cho quán nhỏ, không thừa một nút">
          Những thứ người bán thật sự cần mỗi ngày — gói gọn trong một ứng dụng.
        </SectionHead>
        <div className="feat-grid">
          <article className="feat feat-hero">
            <span className="feat-icon tone-red">
              <Mic size={24} />
            </span>
            <h3>Nói để lên đơn</h3>
            <p>Bạn nói, AI tự ghi đơn. Hiểu cách nói quen thuộc như “ba chục”, “một ký”, “hai ly”.</p>
            <div className="feat-say">
              <div className="bubble">
                <Mic size={14} /> “3 trà đá, 1 bánh mì trứng 15 nghìn”
              </div>
              <div className="bubble-out">
                <span>
                  Trà đá <b>× 3</b>
                </span>
                <span>
                  Bánh mì trứng <b>× 1</b>
                </span>
                <span className="tag-ai">Đọc đơn AI</span>
              </div>
            </div>
          </article>
          {FEATURES.map((f) => (
            <article key={f.title} className="feat">
              <span className={`feat-icon tone-${f.tone}`}>
                <f.icon size={22} />
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
          <article className="feat feat-more">
            <h3>Và còn nữa</h3>
            <ul>
              <li>
                <Users size={16} /> Nhân viên &amp; phân quyền
              </li>
              <li>
                <Printer size={16} /> In hoá đơn máy in K80
              </li>
              <li>
                <Smartphone size={16} /> Đăng nhập SĐT, Google, Facebook, Apple
              </li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const SCREENS = [
  { src: '/screens/overview.png', title: 'Tổng quan', text: 'Doanh thu hôm nay, lối tắt tạo đơn' },
  { src: '/screens/voice.png', title: 'Nói để lên đơn', text: 'Nói hoặc gõ — AI tách món' },
  { src: '/screens/invoices.png', title: 'Hoá đơn', text: 'Lịch sử bán hàng theo ngày' },
  { src: '/screens/products.png', title: 'Hàng hoá & tồn kho', text: 'Món sắp hết, giá trị tồn' },
]

function Showcase() {
  return (
    <section className="lp-section lp-showcase">
      <div className="lp-container">
        <SectionHead kicker="Giao diện" title="Gọn trong một chiếc điện thoại">
          Chữ to, nút lớn, màu dễ nhìn — thiết kế cho người bán đang bận tay.
        </SectionHead>
      </div>
      <div className="showcase-scroller">
        <div className="showcase-row">
          {SCREENS.map((s, i) => (
            <figure key={s.src} className={`showcase-item s-${i}`}>
              <PhoneFrame src={s.src} alt={`Màn hình ${s.title}`} eager />
              <figcaption>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

type Cell = { text: string; mark?: 'yes' | 'no' | 'mid' }
const COMPARE: { label: string; us: Cell; pos: Cell }[] = [
  { label: 'Cách ghi đơn', us: { text: 'Nói hoặc gõ một câu tự nhiên', mark: 'yes' }, pos: { text: 'Chọn món, nhập số trên màn hình hoặc máy quét' } },
  { label: 'Thời gian làm quen', us: { text: 'Vài phút — nói như nói chuyện', mark: 'yes' }, pos: { text: 'Cần thời gian thiết lập danh mục, học nghiệp vụ' } },
  { label: 'Thiết bị cần có', us: { text: 'Điện thoại sẵn có', mark: 'yes' }, pos: { text: 'Thường kèm máy POS, máy quét, máy in' } },
  { label: 'Chi phí bắt đầu', us: { text: 'Miễn phí 200 đơn/tháng', mark: 'yes' }, pos: { text: 'Thường là gói thuê bao theo tháng/năm' } },
  { label: 'Gợi ý nhập hàng bằng AI', us: { text: 'Có, dựa trên món bán chạy/chậm', mark: 'yes' }, pos: { text: 'Tuỳ sản phẩm', mark: 'mid' } },
  { label: 'Báo cáo', us: { text: 'Ngắn gọn: doanh thu ngày, món bán chạy' }, pos: { text: 'Rất nhiều báo cáo chuyên sâu', mark: 'yes' } },
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
        <SectionHead kicker="So sánh" title="Sổ Nghe Lời vs phần mềm POS truyền thống">
          Chúng tôi không thay thế phần mềm quản lý bán hàng lớn. Chúng tôi làm một việc nhỏ hơn — và làm cho thật dễ.
        </SectionHead>
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
        <p className="cmp-note">
          So sánh mang tính định tính, dựa trên đặc điểm chung của các phần mềm quản lý bán hàng phổ biến như Sapo, KiotViet, MISA
          AMIS. Mỗi sản phẩm có thể khác nhau — nếu bạn cần kế toán hay quản lý chuỗi, đó vẫn là lựa chọn phù hợp hơn.
        </p>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

function Pricing() {
  return (
    <section className="lp-section lp-pricing" id="bang-gia">
      <div className="lp-container">
        <SectionHead kicker="Bảng giá" title="Bắt đầu miễn phí, nâng cấp khi quán đông">
          Không cần thẻ ngân hàng. Không ràng buộc.
        </SectionHead>
        <div className="price-grid">
          <article className="price-card">
            <div className="price-top">
              <span className="price-name">Gói Cơ bản</span>
              <span className="chip">Đang áp dụng</span>
            </div>
            <div className="price-amount">
              <strong>Miễn phí</strong>
            </div>
            <p className="price-desc">Cho quán mới bắt đầu ghi sổ bằng giọng nói.</p>
            <div className="price-quota" aria-label="Ví dụ hạn mức trong ứng dụng">
              <div>
                <span>Lượt tạo đơn tháng này</span>
                <b>142/200</b>
              </div>
              <i>
                <b style={{ width: '71%' }} />
              </i>
              <small>Ví dụ hiển thị trong ứng dụng</small>
            </div>
            <ul className="price-list">
              <li>
                <Check size={16} /> 200 lượt tạo đơn mỗi tháng
              </li>
              <li>
                <Check size={16} /> Nói hoặc gõ để lên đơn, chọn hàng nhanh
              </li>
              <li>
                <Check size={16} /> Hoá đơn &amp; lịch sử bán hàng
              </li>
              <li>
                <Check size={16} /> Doanh thu cuối ngày, hàng bán chạy
              </li>
              <li>
                <Check size={16} /> Hàng hoá, tồn kho, chi phí, sổ nợ
              </li>
            </ul>
            <a href="#download" className="btn btn-primary btn-lg btn-block">
              Tải ứng dụng miễn phí
            </a>
          </article>

          <article className="price-card price-pro">
            <div className="price-top">
              <span className="price-name">
                <Crown size={18} /> Gói Pro
              </span>
              <span className="soon-pill">Chưa công bố giá</span>
            </div>
            <div className="price-amount">
              <strong>Sắp ra mắt</strong>
            </div>
            <p className="price-desc">Giá sẽ được công bố khi gói ra mắt. Dành cho quán đông khách, nhiều người cùng bán.</p>
            <p className="price-planned">Dự kiến (có thể thay đổi):</p>
            <ul className="price-list">
              <li>
                <Check size={16} /> Nhiều lượt tạo đơn hơn mỗi tháng
              </li>
              <li>
                <Check size={16} /> Thêm nhân viên, phân quyền chi tiết
              </li>
              <li>
                <Check size={16} /> Trợ lý AI gợi ý nhập hàng sâu hơn
              </li>
              <li>
                <Check size={16} /> Ưu tiên hỗ trợ
              </li>
            </ul>
            <a href="#download" className="btn btn-gold btn-lg btn-block">
              Nhận tin khi ra mắt
            </a>
          </article>
        </div>
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ */

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Tôi nói giọng miền Tây, miền Trung — AI có hiểu không?',
    a: 'Sổ Nghe Lời được xây dựng cho tiếng Việt nói hằng ngày, kể cả cách nói tắt như “ba chục”, “một ký”, “hai ly”. Với giọng địa phương đậm hoặc chỗ quá ồn, AI có thể nghe chưa đúng — vì vậy mỗi đơn đều hiện ra để bạn xem lại và sửa trước khi lưu. Bạn cũng có thể gõ thay vì nói.',
  },
  {
    q: 'Có cần Internet không?',
    a: 'Có. Ứng dụng cần kết nối Internet (Wi‑Fi hoặc 3G/4G) để AI nhận diện giọng nói và lưu sổ lên tài khoản của bạn.',
  },
  {
    q: 'Dữ liệu bán hàng của tôi có an toàn không?',
    a: 'Sổ gắn với tài khoản của bạn, đăng nhập bằng mã OTP gửi về số điện thoại hoặc qua Google, Facebook, Apple. Nhân viên chỉ thấy phần bạn cho phép. Chúng tôi không bán dữ liệu bán hàng của bạn cho bên thứ ba.',
  },
  {
    q: 'Sổ Nghe Lời khác gì KiotViet, Sapo?',
    a: 'KiotViet, Sapo hay MISA AMIS là phần mềm quản lý bán hàng đầy đủ, mạnh cho cửa hàng vừa và lớn. Sổ Nghe Lời chọn hướng khác: thật gọn cho quán nhỏ chưa dùng máy POS — nói một câu là có đơn, cuối ngày xem doanh thu và món bán chạy. Nếu bạn cần kế toán, hoá đơn điện tử hay quản lý chuỗi, các phần mềm kia sẽ phù hợp hơn.',
  },
  {
    q: 'Hết 200 lượt tạo đơn trong tháng thì sao?',
    a: 'Ứng dụng luôn hiển thị số lượt đã dùng (ví dụ 142/200) để bạn chủ động. Lượt được tính theo tháng. Nếu quán bán nhiều hơn, Gói Pro với hạn mức cao hơn đang được chuẩn bị.',
  },
  {
    q: 'AI ghi sai thì sửa thế nào?',
    a: 'Sau khi AI tách món, bạn thấy ngay danh sách món, số lượng, giá. Chạm vào dòng bất kỳ để sửa, thêm hoặc bớt món rồi mới bấm Lưu. Đơn chỉ được lưu khi bạn xác nhận.',
  },
]

function Faq() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <section className="lp-section lp-faq" id="hoi-dap">
      <div className="lp-container lp-faq-grid">
        <SectionHead kicker="Hỏi đáp" title="Câu hỏi thường gặp" center={false}>
          Chưa thấy câu trả lời bạn cần? Hãy nhắn cho Team HEXA qua trang tải ứng dụng.
        </SectionHead>
        <div className="faq-list">
          {FAQS.map((f, i) => {
            const isOpen = open === i
            return (
              <div key={f.q} className={`faq${isOpen ? ' is-open' : ''}`}>
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
    <section className="lp-download" id="download">
      <div className="lp-container">
        <div className="dl-card">
          <div className="dl-deco" aria-hidden="true">
            <Mic size={120} strokeWidth={1.4} />
          </div>
          <div className="dl-copy">
            <h2>Thử ghi sổ bằng giọng nói ngay hôm nay</h2>
            <p>Tải Sổ Nghe Lời về điện thoại, đăng nhập bằng số điện thoại và nói đơn đầu tiên — không cần cài đặt gì thêm.</p>
            <div className="store-btns">
              <a href="#download" className="store-btn" aria-label="Tải trên App Store">
                <AppleIcon size={26} />
                <span>
                  <small>Tải về trên</small>
                  <strong>App Store</strong>
                </span>
              </a>
              <a href="#download" className="store-btn" aria-label="Tải trên Google Play">
                <GooglePlayIcon size={24} />
                <span>
                  <small>Tải về trên</small>
                  <strong>Google Play</strong>
                </span>
              </a>
            </div>
            <p className="dl-note">
              <ShieldCheck size={15} /> Ứng dụng đang trong giai đoạn thử nghiệm — liên kết tải sẽ được cập nhật tại đây.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function Footer() {
  return (
    <footer className="lp-footer">
      <div className="lp-container lp-footer-grid">
        <div className="lp-footer-brand">
          <Logo tagline />
          <p>Sổ bán hàng AI cho quán nhỏ Việt Nam. Nói là ghi sổ.</p>
        </div>
        <nav className="lp-footer-col" aria-label="Sản phẩm">
          <h4>Sản phẩm</h4>
          <a href="#tinh-nang">Tính năng</a>
          <a href="#cach-hoat-dong">Cách hoạt động</a>
          <a href="#bang-gia">Bảng giá</a>
        </nav>
        <nav className="lp-footer-col" aria-label="Hỗ trợ">
          <h4>Hỗ trợ</h4>
          <a href="#hoi-dap">Hỏi đáp</a>
          <a href="#download">Tải ứng dụng</a>
          <Link to="/admin/login">
            <UserRound size={14} /> Quản trị
          </Link>
        </nav>
      </div>
      <div className="lp-container lp-footer-bottom">
        <span>© 2026 Team HEXA · EXE201 · FPT University</span>
        <span className="lp-footer-made">
          <BarChart3 size={14} /> Dự án khởi nghiệp sinh viên
        </span>
      </div>
    </footer>
  )
}

export default function LandingPage() {
  useEffect(() => {
    document.title = 'Sổ Nghe Lời — Nói là ghi sổ'
  }, [])
  return (
    <div className="lp">
      <Nav />
      <main>
        <Hero />
        <Pains />
        <Steps />
        <Features />
        <Showcase />
        <Compare />
        <Pricing />
        <Faq />
        <DownloadBand />
      </main>
      <Footer />
    </div>
  )
}
