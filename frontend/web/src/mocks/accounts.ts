/**
 * Bộ sinh dữ liệu mẫu cho trang quản trị (seed cố định → lần nào cũng giống nhau).
 *
 * Mô hình mock "database": OWNER (chủ cơ sở) và BUSINESS (cơ sở). Một OWNER có thể
 * có nhiều cơ sở. Dữ liệu CHỈ gồm thông tin phục vụ hỗ trợ — không sinh hoá đơn,
 * chi phí, công nợ, tồn kho hay doanh thu.
 */
import { BASIC_MONTHLY_QUOTA, MOCK_TODAY } from '../config'
import type { AccountStatus, DeviceInfo, Industry, LoginMethod, PlanId, Platform, SupportEvent } from '../types'

export interface MockOwner {
  id: string
  fullName: string
  phone: string
  email?: string
  status: AccountStatus
  lockReason?: string
  loginMethod: LoginMethod
  phoneVerified: boolean
  emailVerified: boolean
  plan: PlanId
  createdAt: string
  lastLoginAt: string
  devices: DeviceInfo[]
}

export interface MockBusiness {
  id: string
  ownerId: string
  name: string
  industry: Industry
  address: string
  area: string
  createdAt: string
  lastActiveAt: string
  ordersThisMonth: number
  voiceOrderRatio: number
  staffCount: number
  lastSyncAt: string | null
  syncErrors7d: number
  events: SupportEvent[]
}

export interface MockDb {
  owners: MockOwner[]
  businesses: MockBusiness[]
}

/* ---------- PRNG có seed (mulberry32) ---------- */
export function createRng(seed: number) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    int: (min: number, max: number) => Math.floor(next() * (max - min + 1)) + min,
    pick: <T,>(arr: readonly T[]): T => arr[Math.floor(next() * arr.length)],
    chance: (p: number) => next() < p,
  }
}

/* ---------- Mốc thời gian mẫu ---------- */
const DAY = 86_400_000
const TODAY_START = new Date(`${MOCK_TODAY}T00:00:00`)
const RANGE_START = new Date('2026-03-01T00:00:00')
const SEED_CLOCK_MS = 10 * 3_600_000

/**
 * "Bây giờ" theo đồng hồ mẫu: luôn là ngày MOCK_TODAY, giờ lấy theo giờ thật
 * (không sớm hơn 10:00 để không có mốc thời gian "ở tương lai").
 */
export function mockNow(): Date {
  const real = new Date()
  const ms = ((real.getHours() * 60 + real.getMinutes()) * 60 + real.getSeconds()) * 1000
  return new Date(TODAY_START.getTime() + Math.max(ms, SEED_CLOCK_MS))
}

/* ---------- Danh sách cơ sở mẫu ---------- */
type Seed = [business: string, owner: string, industry: Industry]

const STORES: Seed[] = [
  ['Tiệm tạp hoá cô Thỏ', 'Nguyễn Thị Lan', 'Tạp hóa'],
  ['Xe trái cây chú Tư', 'Trần Văn Tư', 'Nông sản & Thực phẩm'],
  ['Quán cà phê Mộc', 'Lê Minh Khoa', 'Đồ uống'],
  ['Bánh mì Hoà Hưng', 'Phạm Văn Hoà', 'Đồ ăn'],
  ['Trà sữa Mây', 'Võ Ngọc Mai', 'Đồ uống'],
  ['Cơm tấm Bà Sáu', 'Huỳnh Thị Sáu', 'Đồ ăn'],
  ['Tạp hoá Minh Phát', 'Đặng Minh Phát', 'Tạp hóa'],
  ['Nước mía Út Hiền', 'Bùi Thị Hiền', 'Đồ uống'],
  ['Sạp rau cô Ba chợ Bà Chiểu', 'Ngô Thị Ba', 'Nông sản & Thực phẩm'],
  ['Tiệm tóc Anh Tuấn', 'Đỗ Anh Tuấn', 'Cắt tóc & làm móng'],
  ['Nail Xinh', 'Trương Thuỳ Linh', 'Cắt tóc & làm móng'],
  ['Shop quần áo Gạo', 'Phan Ngọc Hân', 'Thời trang'],
  ['Mỹ phẩm Hà Vy', 'Lý Hà Vy', 'Mỹ phẩm'],
  ['Tiệm Mẹ Bắp', 'Nguyễn Thu Trang', 'Mẹ & Bé'],
  ['Hoa tươi Cúc Hoạ Mi', 'Hồ Thị Cúc', 'Hoa - Quà tặng'],
  ['Bún bò cô Hằng', 'Nguyễn Thị Hằng', 'Đồ ăn'],
  ['Phở gia truyền Nam Định', 'Vũ Văn Nam', 'Đồ ăn'],
  ['Nước ép Tươi Mát', 'Trần Quốc Bảo', 'Đồ uống'],
  ['Tạp hoá Hai Lúa', 'Lê Văn Hai', 'Tạp hóa'],
  ['Sạp cá chợ Hoà Bình', 'Mai Văn Lộc', 'Nông sản & Thực phẩm'],
  ['Xôi gà Bà Năm', 'Đinh Thị Năm', 'Đồ ăn'],
  ['Cà phê Góc Phố', 'Hoàng Gia Huy', 'Đồ uống'],
  ['Bánh tráng trộn chị Bé', 'Lâm Thị Bé', 'Đồ ăn'],
  ['Giày dép Phúc An', 'Châu Phúc An', 'Thời trang'],
  ['Kiốt nước giải khát chú Bảy', 'Tạ Văn Bảy', 'Đồ uống'],
  ['Trái cây sấy Kim Ngân', 'Nguyễn Kim Ngân', 'Nông sản & Thực phẩm'],
  ['Tiệm bánh Bơ Sữa', 'Phạm Thảo Vy', 'Đồ ăn'],
  ['Hớt tóc ông Tám', 'Trịnh Văn Tám', 'Cắt tóc & làm móng'],
  ['Son handmade Cherry', 'Đoàn Khánh Linh', 'Mỹ phẩm'],
  ['Đồ sơ sinh Bé Na', 'Nguyễn Ngọc Anh', 'Mẹ & Bé'],
  ['Quà lưu niệm Gấu Nhỏ', 'Lê Bảo Trâm', 'Hoa - Quà tặng'],
  ['Sửa xe Tân Tiến', 'Dương Văn Tiến', 'Khác'],
  ['Giặt ủi Sạch Thơm', 'Kiều Thị Thơm', 'Khác'],
  ['Chè cô Út', 'Tôn Nữ Thanh Út', 'Đồ ăn'],
  ['Trà chanh giã tay 88', 'Phùng Đức Anh', 'Đồ uống'],
  ['Tạp hoá Thanh Bình', 'Lưu Thanh Bình', 'Tạp hóa'],
  ['Thịt heo sạch cô Diệu', 'Quách Thị Diệu', 'Nông sản & Thực phẩm'],
  ['Bánh cuốn Thanh Trì', 'Nguyễn Văn Thanh', 'Đồ ăn'],
  ['Áo dài may sẵn Hương Xưa', 'Trần Thị Hương', 'Thời trang'],
  ['Tiệm nail Tiên', 'Võ Cẩm Tiên', 'Cắt tóc & làm móng'],
  ['Hủ tiếu gõ chú Lâm', 'Lâm Văn Phước', 'Đồ ăn'],
  ['Sữa đậu nành cô Mười', 'Huỳnh Thị Mười', 'Đồ uống'],
  ['Tạp hoá Kim Liên', 'Đào Kim Liên', 'Tạp hóa'],
  ['Mỹ phẩm thiên nhiên Mộc An', 'Cao Thị An', 'Mỹ phẩm'],
  ['Văn phòng phẩm Bút Chì', 'Hà Minh Quân', 'Khác'],
  ['Hoa cưới Tường Vi', 'Mạc Tường Vi', 'Hoa - Quà tặng'],
  ['Bỉm sữa Mẹ Kem', 'Tăng Kim Yến', 'Mẹ & Bé'],
  ['Rau củ Đà Lạt anh Khôi', 'Nguyễn Đăng Khôi', 'Nông sản & Thực phẩm'],
  // OWNER có nhiều cơ sở
  ['Quầy nước cô Thỏ (chợ Hoà Hưng)', 'Nguyễn Thị Lan', 'Đồ uống'],
  ['Cà phê Mộc — chi nhánh 2', 'Lê Minh Khoa', 'Đồ uống'],
  ['Bánh mì Hoà Hưng — xe đẩy', 'Phạm Văn Hoà', 'Đồ ăn'],
  ['Trà sữa Mây Gò Vấp', 'Võ Ngọc Mai', 'Đồ uống'],
  ['Nail Xinh 2', 'Trương Thuỳ Linh', 'Cắt tóc & làm móng'],
]

const ADDRESSES = [
  'Chợ Bà Chiểu, Bình Thạnh, TP.HCM',
  'Hoà Hưng, Quận 10, TP.HCM',
  'Lê Văn Việt, TP. Thủ Đức, TP.HCM',
  'Chợ Tân Định, Quận 1, TP.HCM',
  'Phan Xích Long, Phú Nhuận, TP.HCM',
  'Chợ Hoà Bình, Quận 5, TP.HCM',
  'Nguyễn Oanh, Gò Vấp, TP.HCM',
  'Chợ Hôm, Hai Bà Trưng, Hà Nội',
  'Tạ Quang Bửu, Hai Bà Trưng, Hà Nội',
  'Xuân Thuỷ, Cầu Giấy, Hà Nội',
  'Chợ Hàn, Hải Châu, Đà Nẵng',
  'Ninh Kiều, Cần Thơ',
  'Dĩ An, Bình Dương',
  'Biên Hoà, Đồng Nai',
  'Phường 1, Đà Lạt, Lâm Đồng',
]

const PHONE_PREFIXES = ['032', '033', '034', '035', '036', '037', '038', '039', '056', '070', '076', '077', '078', '079', '081', '083', '084', '085', '086', '088', '089', '090', '091', '093', '094', '096', '097', '098']

const LOCK_REASONS = [
  'Nghi ngờ tạo đơn ảo hàng loạt',
  'Chủ cơ sở yêu cầu tạm khoá',
  'Vi phạm điều khoản sử dụng',
  'Đăng nhập bất thường từ nhiều thiết bị',
]

const ANDROID_MODELS = ['Samsung Galaxy A15', 'Xiaomi Redmi Note 13', 'OPPO A58', 'Vivo Y36', 'Realme C67']
const IOS_MODELS = ['iPhone 11', 'iPhone 13', 'iPhone 15', 'iPad (thế hệ 10)']
const APP_VERSIONS = ['1.4.2', '1.4.2', '1.4.1', '1.3.8']

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.|\.$/g, '')
}

const iso = (t: number) => new Date(t).toISOString()

export function generateMockDb(seed = 20260916): MockDb {
  const rng = createRng(seed)
  const now = TODAY_START.getTime() + SEED_CLOCK_MS
  const span = TODAY_START.getTime() - RANGE_START.getTime()
  const usedPhones = new Set<string>()
  const owners = new Map<string, MockOwner>()
  const businesses: MockBusiness[] = []

  STORES.forEach(([name, ownerName, industry], i) => {
    let owner = owners.get(ownerName)
    const isNewOwner = !owner
    if (!owner) {
      // 16 OWNER đầu rải trong 14 ngày gần nhất để biểu đồ đăng ký có số liệu
      let created =
        i < 16
          ? TODAY_START.getTime() - rng.int(0, 13) * DAY + rng.int(6, 21) * 3_600_000 + rng.int(0, 59) * 60_000
          : RANGE_START.getTime() + rng.next() * (span - 14 * DAY)
      if (created > now) created = now - rng.int(10, 120) * 60_000

      const roll = rng.next()
      const status: AccountStatus = i < 16 && roll < 0.3 ? 'pending' : roll < 0.1 ? 'locked' : roll < 0.16 ? 'pending' : 'active'
      const loginMethod = rng.pick<LoginMethod>(['phone', 'phone', 'phone', 'google', 'google', 'facebook', 'apple'])

      let phone = ''
      do phone = rng.pick(PHONE_PREFIXES) + String(rng.int(0, 9_999_999)).padStart(7, '0')
      while (usedPhones.has(phone))
      usedPhones.add(phone)

      const slug = slugify(ownerName)
      const email =
        loginMethod === 'google'
          ? `${slug}${rng.int(1, 99)}@gmail.com`
          : loginMethod === 'apple'
            ? `${slug.split('.').pop()}${rng.int(100, 999)}@icloud.com`
            : rng.chance(0.45)
              ? `${slug}@gmail.com`
              : undefined

      let lastLogin: number
      if (status === 'pending') lastLogin = created + rng.int(1, 15) * 60_000
      else if (status === 'locked') lastLogin = now - rng.int(3, 20) * DAY
      else lastLogin = now - (rng.chance(0.7) ? rng.int(5, 600) * 60_000 : rng.int(1, 9) * DAY)
      lastLogin = Math.min(Math.max(lastLogin, created + 5 * 60_000), now - 3 * 60_000)

      const platform = rng.pick<Platform>(['android', 'android', 'android', 'ios', 'ios', 'web'])
      const devices: DeviceInfo[] =
        status === 'pending'
          ? []
          : Array.from({ length: rng.chance(0.25) ? 2 : 1 }, (_, k) => {
              const p: Platform = k === 0 ? platform : rng.pick<Platform>(['android', 'ios', 'web'])
              return {
                id: `dev_${String(i + 1).padStart(3, '0')}_${k}`,
                platform: p,
                model: p === 'android' ? rng.pick(ANDROID_MODELS) : p === 'ios' ? rng.pick(IOS_MODELS) : 'Chrome trên Windows',
                appVersion: p === 'web' ? 'web' : rng.pick(APP_VERSIONS),
                lastSeenAt: iso(k === 0 ? lastLogin : lastLogin - rng.int(1, 6) * DAY),
              }
            })

      owner = {
        id: `own_${String(owners.size + 1).padStart(3, '0')}`,
        fullName: ownerName,
        phone,
        email,
        status,
        lockReason: status === 'locked' ? rng.pick(LOCK_REASONS) : undefined,
        loginMethod,
        phoneVerified: status !== 'pending',
        emailVerified: Boolean(email) && (loginMethod === 'google' || loginMethod === 'apple' || rng.chance(0.5)),
        plan: status !== 'pending' && rng.chance(0.22) ? 'pro' : 'basic',
        createdAt: iso(created),
        lastLoginAt: iso(lastLogin),
        devices,
      }
      owners.set(ownerName, owner)
    }

    const ownerCreated = new Date(owner.createdAt).getTime()
    const bCreated = isNewOwner ? ownerCreated + 2 * 60_000 : Math.min(now - DAY, ownerCreated + rng.int(10, 60) * DAY)
    const lastLogin = new Date(owner.lastLoginAt).getTime()
    const lastActive = owner.status === 'pending' ? bCreated + 60_000 : Math.max(bCreated + 60_000, lastLogin - rng.int(0, 90) * 60_000)
    const active = owner.status === 'active'
    const monthStart = new Date(TODAY_START.getFullYear(), TODAY_START.getMonth(), 1).getTime()
    const activeDays = Math.max(0, Math.ceil((now - Math.max(bCreated, monthStart)) / DAY))
    let orders = 0
    if (active) orders = Math.round((owner.plan === 'pro' ? rng.int(12, 34) : rng.int(2, 7)) * activeDays * (0.8 + rng.next() * 0.4))
    else if (owner.status === 'locked') orders = rng.int(0, 40)
    if (i === 0) orders = 142 // "Lượt tạo đơn tháng này 142/200" như prototype

    const address = rng.pick(ADDRESSES)
    const id = `biz_${String(i + 1).padStart(3, '0')}`
    const syncErrors = active && rng.chance(0.2) ? rng.int(1, 6) : 0
    const events: SupportEvent[] = []
    const ev = (type: SupportEvent['type'], label: string, at: number) =>
      events.push({ id: `${id}_ev_${events.length}`, type, label, at: iso(at) })
    if (owner.status !== 'pending') {
      ev('sync', 'Đồng bộ dữ liệu thành công', lastActive)
      if (syncErrors) ev('sync_error', `Đồng bộ thất bại ${syncErrors} lần (mất kết nối mạng)`, lastActive - rng.int(2, 30) * 3_600_000)
      ev('login', `Đăng nhập trên ${owner.devices[0] ? PLATFORM_NAME[owner.devices[0].platform] : 'thiết bị'}`, lastLogin)
      if (rng.chance(0.3)) ev('login_failed', 'Nhập sai mã OTP 3 lần', lastLogin - rng.int(1, 3) * 3_600_000)
      if (rng.chance(0.4)) ev('app_update', `Cập nhật ứng dụng lên ${owner.devices[0]?.appVersion ?? '1.4.2'}`, lastLogin - rng.int(1, 8) * DAY)
      if (owner.plan === 'pro') ev('plan', 'Chuyển sang gói Pro (dùng thử)', bCreated + rng.int(1, 5) * DAY)
      if (owner.status === 'locked') ev('status', `Tài khoản bị khoá: ${owner.lockReason}`, lastLogin + rng.int(1, 3) * 3_600_000)
    } else {
      ev('otp', 'Đã gửi mã OTP, chưa xác minh', bCreated + 30_000)
    }
    ev('signup', isNewOwner ? 'Đăng ký tài khoản & tạo cơ sở' : 'Tạo thêm cơ sở', bCreated)
    events.sort((a, b) => b.at.localeCompare(a.at))

    businesses.push({
      id,
      ownerId: owner.id,
      name,
      industry,
      address,
      area: address.split(',').pop()!.trim(),
      createdAt: iso(bCreated),
      lastActiveAt: iso(Math.min(lastActive, now - 60_000)),
      ordersThisMonth: owner.plan === 'basic' ? Math.min(orders, BASIC_MONTHLY_QUOTA) : orders,
      voiceOrderRatio: owner.status === 'pending' ? 0 : Math.round((0.35 + rng.next() * 0.55) * 100) / 100,
      staffCount: owner.plan === 'pro' ? rng.int(2, 6) : rng.int(0, 2),
      lastSyncAt: owner.status === 'pending' ? null : iso(lastActive),
      syncErrors7d: syncErrors,
      events,
    })
  })

  return { owners: [...owners.values()], businesses }
}

const PLATFORM_NAME: Record<Platform, string> = { android: 'Android', ios: 'iOS', web: 'trình duyệt' }
