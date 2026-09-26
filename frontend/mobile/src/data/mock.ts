/**
 * DỮ LIỆU MẪU (mock) — toàn bộ app đọc từ đây qua AppStore.
 * Hoá đơn / chi phí được sinh theo ngày hiện tại (seed cố định) để màn hình
 * "Hôm nay / Hôm qua / Tuần này / Tháng này" lúc nào cũng có số liệu khi demo.
 * Khi nối API thật: xem src/config.ts — thay action trong AppStore, giữ nguyên kiểu dữ liệu.
 */
import type { Debt, Expense, Invoice, LineItem, Product, Staff } from './types';

export const MOCK_OTP = '123456';

export const mockUser = {
  name: 'Nguyễn Thị Lan',
  phone: '0901234567',
  email: 'lan.nguyen@gmail.com',
  facebook: 'facebook.com/tiemcotho',
};

export const mockStore = {
  name: 'Tiệm tạp hoá cô Thỏ',
  address: '12 Hoà Hưng, Q.10, TP.HCM',
  industries: ['grocery', 'drink'] as string[],
  bankName: 'Vietcombank',
  bankAccount: '0123456789',
  plan: 'basic' as 'basic' | 'pro',
  quota: 200,
};

export const industryList = [
  { id: 'food', name: 'Đồ ăn', icon: 'package' as const },
  { id: 'drink', name: 'Đồ uống', icon: 'coffee' as const },
  { id: 'grocery', name: 'Tạp hóa', icon: 'shopping-cart' as const },
  { id: 'nongsan', name: 'Nông sản & Thực phẩm', icon: 'feather' as const },
  { id: 'thoitrang', name: 'Thời trang', icon: 'tag' as const },
  { id: 'cattoc', name: 'Cắt tóc & làm móng', icon: 'scissors' as const },
  { id: 'mypham', name: 'Mỹ phẩm', icon: 'heart' as const },
  { id: 'mebe', name: 'Mẹ & Bé', icon: 'smile' as const },
  { id: 'hoaqua', name: 'Hoa - Quà tặng', icon: 'gift' as const },
  { id: 'other', name: 'Khác', icon: 'bookmark' as const },
];

export const mockProducts: Product[] = [
  {
    id: 'p1',
    name: 'Trà đá',
    price: 3000,
    cost: 500,
    stock: 0,
    tracked: false,
    category: 'drink',
    aliases: ['tra da', 'trà đá'],
  },
  {
    id: 'p2',
    name: 'Nước suối',
    price: 5000,
    cost: 2800,
    stock: 48,
    tracked: true,
    category: 'drink',
    aliases: ['nuoc suoi', 'lavie', 'aquafina'],
  },
  {
    id: 'p3',
    name: 'Bánh mì thịt',
    price: 15000,
    cost: 9000,
    stock: 0,
    tracked: false,
    category: 'food',
    aliases: ['banh mi', 'bánh mì'],
  },
  {
    id: 'p4',
    name: 'Cà phê sữa đá',
    price: 25000,
    cost: 9000,
    stock: 0,
    tracked: false,
    category: 'drink',
    aliases: ['ca phe sua', 'cf sữa', 'cà phê sữa', 'bạc xỉu'],
  },
  {
    id: 'p5',
    name: 'Cà phê đen',
    price: 20000,
    cost: 7000,
    stock: 0,
    tracked: false,
    category: 'drink',
    aliases: ['ca phe den', 'cà phê đen', 'đen đá'],
  },
  {
    id: 'p6',
    name: 'Mì gói',
    price: 5000,
    cost: 3800,
    stock: 80,
    tracked: true,
    category: 'grocery',
    aliases: ['mi goi', 'mì', 'mì tôm', 'hảo hảo'],
  },
  {
    id: 'p7',
    name: 'Trứng (chục)',
    price: 35000,
    cost: 29000,
    stock: 9,
    tracked: true,
    category: 'fresh',
    aliases: ['trung', 'trứng', 'chục trứng'],
  },
  {
    id: 'p8',
    name: 'Nước ngọt',
    price: 12000,
    cost: 8500,
    stock: 36,
    tracked: true,
    category: 'drink',
    aliases: ['coca', 'pepsi', '7up', 'nuoc ngot'],
  },
  {
    id: 'p9',
    name: 'Rau muống (bó)',
    price: 8000,
    cost: 5000,
    stock: 6,
    tracked: true,
    category: 'fresh',
    aliases: ['rau muong', 'rau'],
  },
  {
    id: 'p10',
    name: 'Đường 1kg',
    price: 28000,
    cost: 23000,
    stock: 22,
    tracked: true,
    category: 'grocery',
    aliases: ['duong', 'đường'],
  },
  {
    id: 'p11',
    name: 'Bia lon',
    price: 18000,
    cost: 14000,
    stock: 15,
    tracked: true,
    category: 'drink',
    aliases: ['bia', 'tiger', 'sài gòn'],
  },
  {
    id: 'p12',
    name: 'Ổi (ký)',
    price: 30000,
    cost: 20000,
    stock: 12,
    tracked: true,
    category: 'fresh',
    aliases: ['oi', 'ổi', 'ký ổi'],
  },
  {
    id: 'p13',
    name: 'Dầu ăn 1L',
    price: 52000,
    cost: 45000,
    stock: 3,
    tracked: true,
    category: 'grocery',
    aliases: ['dau an', 'dầu ăn'],
  },
  {
    id: 'p14',
    name: 'Thuốc lá (gói)',
    price: 30000,
    cost: 26000,
    stock: 20,
    tracked: true,
    category: 'other',
    aliases: ['thuoc la', 'thuốc'],
  },
];

export const mockStaff: Staff[] = [
  { id: 's1', name: 'Nguyễn Thị Lan', role: 'Chủ tiệm', phone: '0901234567', active: true },
  { id: 's2', name: 'Trần Văn Nam', role: 'Bán hàng', phone: '0912345678', active: true },
  { id: 's3', name: 'Lê Thị Mai', role: 'Quản lý kho', phone: '0987654321', active: true },
];

export const mockDebts: Debt[] = [
  {
    id: 'd1',
    name: 'Chị Ba',
    phone: '0901234567',
    total: 156000,
    paid: 0,
    lastDate: daysAgoISO(0, 9),
    history: [
      { at: daysAgoISO(0, 9), amount: 96000, note: 'Mua 2 chục trứng, 1 bánh mì' },
      { at: daysAgoISO(4, 17), amount: 60000, note: 'Mua 5 bịch mì gói, 7 nước suối' },
    ],
  },
  {
    id: 'd2',
    name: 'Anh Sáu',
    phone: '0912345678',
    total: 84000,
    paid: 30000,
    lastDate: daysAgoISO(1, 18),
    history: [{ at: daysAgoISO(1, 18), amount: 84000, note: 'Mua 4 lon bia, 1 gói thuốc' }],
  },
  {
    id: 'd3',
    name: 'Cô Năm',
    phone: '0923456789',
    total: 210000,
    paid: 0,
    lastDate: daysAgoISO(3, 7),
    history: [{ at: daysAgoISO(3, 7), amount: 210000, note: 'Mua 4 chai dầu ăn, 1 ký đường' }],
  },
];

/** Câu nói mẫu dùng cho màn "Nói để lên đơn" (giả lập nhận diện giọng nói). */
export const voiceSamples = [
  'Cho cô 2 ổ bánh mì thịt, 1 ly cà phê sữa đá với 3 chai nước suối nha',
  'Bán 1 ký ổi 30 nghìn',
  '2 ly cà phê sữa 50 nghìn, thêm 1 trà đá',
  'Lấy 1 chục trứng với 2 gói mì',
  'Bán 1 hộp sữa chua nếp cẩm 12 nghìn',
];

export const expenseVoiceSamples = [
  'Nhập bánh mì với nguyên liệu hết 850 nghìn',
  'Trả tiền điện tháng này 420 nghìn',
  'Mua đá cây 60 nghìn',
];

export const aiSuggestions = [
  {
    id: 'a1',
    icon: 'trending-up',
    title: 'Trà đá bán chạy buổi sáng',
    body: '6h–9h chiếm 58% lượng trà đá. Nên pha sẵn nhiều hơn khoảng 20% trước 6h.',
  },
  {
    id: 'a2',
    icon: 'package',
    title: 'Sắp hết Dầu ăn 1L',
    body: 'Còn 3 chai, trung bình bán 1 chai/ngày. Nên nhập thêm 6–8 chai trong 2 ngày tới.',
  },
  {
    id: 'a3',
    icon: 'moon',
    title: 'Bia lon bán mạnh cuối tuần',
    body: 'Thứ 7 – CN bán gấp 2,4 lần ngày thường. Chuẩn bị thêm 1 thùng trước thứ 6.',
  },
];

// ---------------------------------------------------------------------------
// Sinh hoá đơn & chi phí giả lập theo ngày hiện tại
// ---------------------------------------------------------------------------

function daysAgoISO(days: number, hour: number, minute = 5) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CUSTOMERS = ['Khách lẻ', 'Khách lẻ', 'Khách lẻ', 'Cô Tám', 'Anh Nam', 'Chị Hoa', 'Chú Tư', 'Bé Na', 'Anh Hùng'];
// Trọng số bán (món bán chạy xuất hiện nhiều hơn)
const WEIGHTS: Record<string, number> = {
  p1: 10,
  p2: 8,
  p3: 7,
  p4: 6,
  p5: 3,
  p6: 5,
  p7: 2,
  p8: 4,
  p9: 2,
  p10: 1,
  p11: 3,
  p12: 2,
  p13: 1,
  p14: 2,
};

function pickProduct(r: () => number) {
  const total = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  let x = r() * total;
  for (const p of mockProducts) {
    x -= WEIGHTS[p.id] ?? 1;
    if (x <= 0) return p;
  }
  return mockProducts[0];
}

export function generateInvoices(days = 45): Invoice[] {
  const r = rng(20260916);
  const now = new Date();
  const out: Invoice[] = [];
  let seq = 1;
  for (let d = days; d >= 0; d--) {
    const day = new Date(now);
    day.setDate(now.getDate() - d);
    const weekend = day.getDay() === 0 || day.getDay() === 6;
    const count = Math.round((weekend ? 11 : 7) + r() * 5);
    for (let i = 0; i < count; i++) {
      // giờ bán tập trung buổi sáng và chiều tối
      const peak = r();
      const hour = peak < 0.45 ? 6 + Math.floor(r() * 4) : peak < 0.7 ? 11 + Math.floor(r() * 3) : 16 + Math.floor(r() * 5);
      const at = new Date(day);
      at.setHours(hour, Math.floor(r() * 60), 0, 0);
      // không tạo đơn ở tương lai: dồn về trước thời điểm hiện tại
      if (d === 0 && at > now) at.setTime(now.getTime() - (i + 1) * 9 * 60000);
      const n = 1 + Math.floor(r() * 3);
      const items: LineItem[] = [];
      for (let k = 0; k < n; k++) {
        const p = pickProduct(r);
        const ex = items.find((x) => x.productId === p.id);
        const q = p.id === 'p1' ? 1 + Math.floor(r() * 3) : 1 + Math.floor(r() * 2);
        if (ex) ex.qty += q;
        else items.push({ productId: p.id, name: p.name, price: p.price, qty: q });
      }
      const src = r();
      const method = r() < 0.08 ? 'debt' : r() < 0.4 ? 'transfer' : 'cash';
      out.push({
        id: `inv${seq}`,
        code: `HD${String(1000 + seq)}`,
        createdAt: at.toISOString(),
        items,
        customer: CUSTOMERS[Math.floor(r() * CUSTOMERS.length)],
        method,
        source: src < 0.55 ? 'voice' : src < 0.9 ? 'pos' : 'manual',
        staffId: mockStaff[Math.floor(r() * mockStaff.length)].id,
        status: method === 'debt' ? 'debt' : r() < 0.02 ? 'cancelled' : 'paid',
      });
      seq++;
    }
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function generateExpenses(): Expense[] {
  const base: Omit<Expense, 'id' | 'createdAt'>[] = [
    { title: 'Nhập bánh mì, nguyên liệu', amount: 850000, category: 'nguyenlieu', source: 'voice' },
    { title: 'Tiền điện', amount: 420000, category: 'dien', source: 'manual' },
    { title: 'Mặt bằng', amount: 1850000, category: 'matbang', source: 'manual' },
    { title: 'Nhập nước suối, nước ngọt', amount: 640000, category: 'nguyenlieu', source: 'voice' },
    { title: 'Đá cây', amount: 60000, category: 'nguyenlieu', source: 'voice' },
    { title: 'Lương phụ bán', amount: 1500000, category: 'luong', source: 'manual' },
  ];
  const r = rng(99);
  const out: Expense[] = [];
  let id = 1;
  for (let m = 0; m < 4; m++) {
    base.forEach((b, i) => {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - m);
      const today = new Date();
      const maxDay = m === 0 ? today.getDate() : 28;
      d.setDate(Math.max(1, Math.min(maxDay, 1 + ((i * 5 + m) % 28))));
      d.setHours(7 + i, 10, 0, 0);
      const scale = m === 0 ? 1 : 0.85 + r() * 0.35;
      out.push({ ...b, id: `e${id++}`, amount: Math.round((b.amount * scale) / 1000) * 1000, createdAt: d.toISOString() });
    });
  }
  return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export const expenseCategoryMeta: Record<string, { label: string; color: string; bg: string }> = {
  nguyenlieu: { label: 'Nguyên liệu', color: '#355A25', bg: '#E7F6DC' },
  dien: { label: 'Điện nước', color: '#4E6745', bg: '#E8F0E4' },
  matbang: { label: 'Mặt bằng', color: '#5F6858', bg: '#E7EAE4' },
  luong: { label: 'Lương', color: '#497055', bg: '#E9F1E8' },
  khac: { label: 'Khác', color: '#6B675E', bg: '#EEEBE4' },
};

export const categoryMeta: Record<string, string> = {
  all: 'Tất cả',
  drink: 'Đồ uống',
  food: 'Đồ ăn',
  grocery: 'Tạp hoá',
  fresh: 'Thực phẩm tươi',
  other: 'Khác',
};
