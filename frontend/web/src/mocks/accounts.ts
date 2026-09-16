/**
 * Bộ sinh dữ liệu tài khoản mẫu — có seed cố định nên mỗi lần sinh ra đều giống nhau.
 * Dùng cho chế độ USE_MOCK (xem src/config.ts).
 */
import { BASIC_MONTHLY_QUOTA, MOCK_TODAY } from '../config'
import type { Account, AccountStatus, ActivityItem, Industry, LoginMethod, PlanId } from '../types'

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

/** Dữ liệu seed được sinh với mốc 10:00 ngày MOCK_TODAY. */
const SEED_CLOCK_MS = 10 * 3_600_000

/**
 * "Bây giờ" theo đồng hồ mẫu: luôn là ngày MOCK_TODAY, giờ lấy theo giờ thật
 * (nhưng không sớm hơn 10:00 để không có mốc thời gian "ở tương lai").
 */
export function mockNow(): Date {
  const real = new Date()
  const d = new Date(TODAY_START)
  const ms = ((real.getHours() * 60 + real.getMinutes()) * 60 + real.getSeconds()) * 1000
  d.setTime(TODAY_START.getTime() + Math.max(ms, SEED_CLOCK_MS))
  return d
}

/* ---------- Danh sách cửa hàng mẫu ---------- */
type Seed = [store: string, owner: string, industry: Industry]

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

const PHONE_PREFIXES = ['032', '033', '034', '035', '036', '037', '038', '039', '056', '058', '070', '076', '077', '078', '079', '081', '083', '084', '085', '086', '088', '089', '090', '091', '093', '094', '096', '097', '098']

const LOCK_REASONS = [
  'Nghi ngờ tạo đơn ảo hàng loạt',
  'Chủ cửa hàng yêu cầu tạm khoá',
  'Vi phạm điều khoản sử dụng',
  'Đăng nhập bất thường từ nhiều thiết bị',
]

/** Món mẫu theo ngành để tạo nhật ký hoạt động. [tên, giá] */
const SAMPLE_ITEMS: Record<Industry, [string, number][]> = {
  'Đồ ăn': [['bánh mì thịt', 15000], ['cơm tấm sườn', 35000], ['bún bò', 40000], ['xôi gà', 25000]],
  'Đồ uống': [['cà phê sữa', 20000], ['trà đá', 3000], ['trà sữa trân châu', 25000], ['nước mía', 12000]],
  'Tạp hóa': [['mì gói', 5000], ['nước suối', 5000], ['trứng (chục)', 35000], ['đường 1kg', 28000]],
  'Nông sản & Thực phẩm': [['ổi', 30000], ['xoài cát', 45000], ['rau muống', 8000], ['thịt ba chỉ', 150000]],
  'Thời trang': [['áo thun', 120000], ['dép lê', 60000], ['quần short', 150000]],
  'Cắt tóc & làm móng': [['cắt tóc nam', 60000], ['sơn gel', 120000], ['gội đầu', 40000]],
  'Mỹ phẩm': [['son dưỡng', 85000], ['sữa rửa mặt', 150000], ['kem chống nắng', 220000]],
  'Mẹ & Bé': [['bỉm size M', 240000], ['sữa bột', 450000], ['khăn sữa', 45000]],
  'Hoa - Quà tặng': [['bó hoa hồng', 250000], ['gấu bông', 180000], ['thiếp chúc mừng', 20000]],
  'Khác': [['vá xe', 30000], ['giặt ủi 1kg', 20000], ['bút bi', 5000]],
}

/** Doanh thu/ngày tham khảo theo ngành (VND). */
const REVENUE_SCALE: Record<Industry, [number, number]> = {
  'Đồ ăn': [900_000, 3_200_000],
  'Đồ uống': [500_000, 2_400_000],
  'Tạp hóa': [800_000, 3_500_000],
  'Nông sản & Thực phẩm': [600_000, 2_800_000],
  'Thời trang': [300_000, 2_500_000],
  'Cắt tóc & làm móng': [400_000, 1_800_000],
  'Mỹ phẩm': [300_000, 2_000_000],
  'Mẹ & Bé': [500_000, 2_600_000],
  'Hoa - Quà tặng': [300_000, 2_200_000],
  'Khác': [200_000, 1_200_000],
}

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

const round1000 = (n: number) => Math.round(n / 1000) * 1000

function buildActivity(
  rng: ReturnType<typeof createRng>,
  id: string,
  industry: Industry,
  createdAt: Date,
  lastActive: Date,
  status: AccountStatus,
  voiceRatio: number,
): ActivityItem[] {
  const items: ActivityItem[] = []
  const add = (type: ActivityItem['type'], label: string, at: Date) =>
    items.push({ id: `${id}-act-${items.length}`, type, label, at: at.toISOString() })

  if (status !== 'pending') {
    let t = lastActive.getTime()
    const n = rng.int(4, 6)
    for (let i = 0; i < n && t > createdAt.getTime(); i++) {
      const roll = rng.next()
      const [name, price] = rng.pick(SAMPLE_ITEMS[industry])
      const qty = rng.int(1, 3)
      if (roll < 0.6) {
        const voice = rng.chance(voiceRatio)
        add(
          voice ? 'order_voice' : 'order_pos',
          voice
            ? `Tạo đơn bằng giọng nói: “bán ${qty} ${name}” · ${(qty * price).toLocaleString('vi-VN')}đ`
            : `Tạo đơn bằng Chọn hàng nhanh: ${qty} × ${name}`,
          new Date(t),
        )
      } else if (roll < 0.72) {
        add('product', `Cập nhật tồn kho: ${name}`, new Date(t))
      } else if (roll < 0.82) {
        add('expense', `Thêm chi phí nhập hàng ${(round1000(price * rng.int(8, 30))).toLocaleString('vi-VN')}đ`, new Date(t))
      } else if (roll < 0.9) {
        add('debt', `Ghi nợ cho khách quen ${(qty * price).toLocaleString('vi-VN')}đ`, new Date(t))
      } else {
        add('login', 'Đăng nhập trên thiết bị di động', new Date(t))
      }
      t -= rng.int(20, 60 * 26) * 60_000
    }
  }
  add('signup', 'Tạo tài khoản', createdAt)
  return items
}

export function generateMockAccounts(seed = 20260916): Account[] {
  const rng = createRng(seed)
  const now = new Date(TODAY_START.getTime() + SEED_CLOCK_MS)
  const monthStart = new Date(TODAY_START.getFullYear(), TODAY_START.getMonth(), 1)
  const span = TODAY_START.getTime() - RANGE_START.getTime()
  const usedPhones = new Set<string>()

  return STORES.map(([storeName, ownerName, industry], i): Account => {
    const id = `acc_${String(i + 1).padStart(3, '0')}`

    // 16 tài khoản đầu rải đều trong 14 ngày gần nhất để biểu đồ có số liệu,
    // phần còn lại rải ngẫu nhiên từ 01/03/2026.
    const createdAt =
      i < 16
        ? new Date(TODAY_START.getTime() - rng.int(0, 13) * DAY + rng.int(6, 21) * 3_600_000 + rng.int(0, 59) * 60_000)
        : new Date(RANGE_START.getTime() + rng.next() * (span - 14 * DAY))
    if (createdAt > now) createdAt.setTime(now.getTime() - rng.int(10, 120) * 60_000)

    const statusRoll = rng.next()
    const status: AccountStatus =
      i < 16 && statusRoll < 0.3 ? 'pending' : statusRoll < 0.1 ? 'locked' : statusRoll < 0.16 ? 'pending' : 'active'

    const plan: PlanId = status !== 'pending' && rng.chance(0.22) ? 'pro' : 'basic'

    const loginMethod: LoginMethod = rng.pick<LoginMethod>(['phone', 'phone', 'phone', 'google', 'google', 'facebook', 'apple'])

    let phone = ''
    do {
      phone = rng.pick(PHONE_PREFIXES) + String(rng.int(0, 9_999_999)).padStart(7, '0')
    } while (usedPhones.has(phone))
    usedPhones.add(phone)

    const slug = slugify(ownerName)
    const email =
      loginMethod === 'google'
        ? `${slug}${rng.int(1, 99)}@gmail.com`
        : loginMethod === 'apple'
          ? `${slug.split('.').pop()}${rng.int(100, 999)}@icloud.com`
          : rng.chance(0.4)
            ? `${slug}@gmail.com`
            : undefined

    // Hoạt động gần nhất
    let lastActiveAt: Date
    if (status === 'pending') lastActiveAt = new Date(createdAt.getTime() + rng.int(1, 15) * 60_000)
    else if (status === 'locked') lastActiveAt = new Date(now.getTime() - rng.int(3, 20) * DAY)
    else lastActiveAt = new Date(now.getTime() - (rng.chance(0.7) ? rng.int(5, 600) * 60_000 : rng.int(1, 9) * DAY))
    if (lastActiveAt < createdAt) lastActiveAt = new Date(createdAt.getTime() + 5 * 60_000)
    if (lastActiveAt > now) lastActiveAt = new Date(now.getTime() - 3 * 60_000)

    // Số đơn tháng này (tính theo số ngày hoạt động trong tháng)
    const activeFrom = createdAt > monthStart ? createdAt : monthStart
    const activeDays = Math.max(0, Math.ceil((now.getTime() - activeFrom.getTime()) / DAY))
    let ordersThisMonth = 0
    if (status === 'active') {
      const perDay = plan === 'pro' ? rng.int(12, 34) : rng.int(3, 15)
      ordersThisMonth = Math.round(perDay * activeDays * (0.8 + rng.next() * 0.4))
      if (plan === 'basic') ordersThisMonth = Math.min(ordersThisMonth, BASIC_MONTHLY_QUOTA)
    } else if (status === 'locked') {
      ordersThisMonth = rng.int(0, 40)
    }
    // Mẫu "chủ quán đang dùng": Lượt tạo đơn tháng này 142/200
    if (i === 0) ordersThisMonth = 142

    const voiceOrderRatio = status === 'pending' ? 0 : Math.round((0.35 + rng.next() * 0.55) * 100) / 100

    const [lo, hi] = REVENUE_SCALE[industry]
    const base = lo + rng.next() * (hi - lo)
    const revenue7d =
      status === 'pending'
        ? [0, 0, 0, 0, 0, 0, 0]
        : Array.from({ length: 7 }, (_, d) => {
            const daysAgo = 6 - d
            const day = new Date(TODAY_START.getTime() - daysAgo * DAY)
            if (day < new Date(createdAt.toDateString())) return 0
            if (status === 'locked' && daysAgo < 3) return 0
            const weekend = day.getDay() === 0 || day.getDay() === 6 ? 1.25 : 1
            const partial = daysAgo === 0 ? 0.45 : 1 // hôm nay mới tới 10h
            return round1000(base * weekend * partial * (0.7 + rng.next() * 0.6))
          })

    const account: Account = {
      id,
      storeName,
      ownerName,
      phone,
      email,
      industry,
      address: rng.pick(ADDRESSES),
      plan,
      status,
      lockReason: status === 'locked' ? rng.pick(LOCK_REASONS) : undefined,
      loginMethod,
      createdAt: createdAt.toISOString(),
      lastActiveAt: lastActiveAt.toISOString(),
      ordersThisMonth,
      orderQuota: plan === 'basic' ? BASIC_MONTHLY_QUOTA : null,
      voiceOrderRatio,
      revenue7d,
      staffCount: plan === 'pro' ? rng.int(2, 6) : rng.int(0, 2),
      productCount: status === 'pending' ? 0 : rng.int(8, 120),
      activity: buildActivity(rng, id, industry, createdAt, lastActiveAt, status, voiceOrderRatio),
    }
    return account
  })
}
