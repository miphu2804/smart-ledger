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
    id: 'p_sting_1',
    name: 'Nước Tăng Lực Sting Dâu Ít Đường Lon 320ml',
    price: 10000,
    cost: 7500,
    stock: 48,
    tracked: true,
    category: 'drink',
    aliases: ['sting dâu ít đường', 'sting dau it duong'],
  },
  {
    id: 'p_sting_2',
    name: 'Nước Tăng Lực Sting Gold Lon 320ml',
    price: 10000,
    cost: 7500,
    stock: 36,
    tracked: true,
    category: 'drink',
    aliases: ['sting vàng', 'sting gold'],
  },
  {
    id: 'p_sting_3',
    name: 'Thùng 24 Nước Tăng Lực Sting Việt Quất Lon 320ml',
    price: 235000,
    cost: 210000,
    stock: 8,
    tracked: true,
    category: 'drink',
    aliases: ['thung sting viet quat', 'thùng sting việt quất'],
  },
  {
    id: 'p_sting_4',
    name: 'Nước Tăng Lực Sting Gold Lốc 6 Lon 320ml',
    price: 58000,
    cost: 50000,
    stock: 12,
    tracked: true,
    category: 'drink',
    aliases: ['loc sting vang', 'lốc sting vàng'],
  },
  {
    id: 'p_sting_5',
    name: 'Sting Strawberry Energy Drink 320ml x 6 cans',
    price: 60000,
    cost: 51000,
    stock: 15,
    tracked: true,
    category: 'drink',
    aliases: ['sting strawberry', 'sting 6 lon'],
  },
  {
    id: 'p_sting_6',
    name: 'Lốc 6 Nước Tăng Lực Sting Dâu Ít Đường Lon 320ml',
    price: 58000,
    cost: 50000,
    stock: 10,
    tracked: true,
    category: 'drink',
    aliases: ['lốc sting dâu ít đường'],
  },
  {
    id: 'p_sting_7',
    name: 'Nước Tăng Lực Sting Vị Dâu Lon 320ml',
    price: 10000,
    cost: 7500,
    stock: 50,
    tracked: true,
    category: 'drink',
    aliases: ['sting dâu', 'sting do'],
  },
  {
    id: 'p_sting_8',
    name: 'Nước Tăng Lực Sting Hương Dâu Thùng 24 Lon 320ml',
    price: 235000,
    cost: 210000,
    stock: 6,
    tracked: true,
    category: 'drink',
    aliases: ['thung sting dau', 'thùng sting dâu'],
  },
  {
    id: 'p_sting_9',
    name: 'Nước tăng lực Sting việt quất lon 320ml',
    price: 10000,
    cost: 7500,
    stock: 24,
    tracked: true,
    category: 'drink',
    aliases: ['sting xanh', 'sting viet quat'],
  },
  {
    id: 'p_sting_10',
    name: 'Sting Nước Tăng Lực Hương Dâu 330ml',
    price: 10500,
    cost: 7800,
    stock: 30,
    tracked: true,
    category: 'drink',
    aliases: ['sting chai dâu', 'sting 330ml'],
  },
  {
    id: 'p_perfume',
    name: 'Nước Hoa Hương Bách Xanh và Mộc Lan dành cho Phụ Nữ',
    price: 350000,
    cost: 260000,
    stock: 5,
    tracked: true,
    category: 'other',
    aliases: ['nuoc hoa', 'nước hoa nữ'],
  },
  {
    id: 'p_me',
    name: 'Nước me ép A*Nuta lon 330ml',
    price: 12000,
    cost: 8500,
    stock: 18,
    tracked: true,
    category: 'drink',
    aliases: ['nuoc me', 'me anuta'],
  },
  {
    id: 'p_coca',
    name: 'CocaCola / Nước ngọt CocaCola',
    price: 10000,
    cost: 7500,
    stock: 60,
    tracked: true,
    category: 'drink',
    aliases: ['coca', 'cocacola', 'nước ngọt'],
    barcode: '8935049500544',
  },
  {
    id: 'p_cookie_1',
    name: 'Bánh quy bơ GO! xanh hộp thiếc 454g',
    price: 85000,
    cost: 65000,
    stock: 14,
    tracked: true,
    category: 'food',
    aliases: ['banh quy bo go', 'bánh quy go'],
  },
  {
    id: 'p_cookie_2',
    name: 'Bánh Quy 9 Loại Rau Củ Quả HMC Giòn Thơm Không Quá Ngọt Gói 328G',
    price: 42000,
    cost: 31000,
    stock: 20,
    tracked: true,
    category: 'food',
    aliases: ['banh quy rau cu', 'bánh quy rau củ'],
  },
  {
    id: 'p_cookie_3',
    name: 'bánh quy bí đỏ hiệu thg - giá sỉ dailybanh 500g / 1kg',
    price: 65000,
    cost: 48000,
    stock: 15,
    tracked: true,
    category: 'food',
    aliases: ['banh quy bi do', 'bánh quy bí đỏ'],
  },
  {
    id: 'p_sauce_1',
    name: 'Gia Vị Khử Tanh Nấu Ăn Hải Thiên 450ml',
    price: 38000,
    cost: 28000,
    stock: 12,
    tracked: true,
    category: 'grocery',
    aliases: ['gia vi khu tanh', 'hải thiên'],
  },
  {
    id: 'p_sauce_2',
    name: 'Gia Vị Nấu Ăn Hoa Tiêu Cổ Nguyệt - THIỆU HƯNG - Chai 600ml',
    price: 45000,
    cost: 33000,
    stock: 10,
    tracked: true,
    category: 'grocery',
    aliases: ['hoa tieu co nguyet', 'thiệu hưng'],
  },
  {
    id: 'p_seasoning',
    name: 'Gia vị nấu thịt hộp Việt Nam - 1 gói tiện dụng, HSD 12 tháng',
    price: 15000,
    cost: 9500,
    stock: 25,
    tracked: true,
    category: 'grocery',
    aliases: ['gia vi nau thit', 'gia vị nấu thịt'],
  },
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
    barcode: '8934588012112',
  },
  {
    id: 'p3',
    name: 'Bánh mì thịt',
    price: 15000,
    cost: 9000,
    stock: 0,
    tracked: false,
    category: 'food',
    aliases: ['banh mi thit', 'bánh mì thịt', 'bánh mì chả'],
  },
  {
    id: 'p3_opla',
    name: 'Bánh mì ốp la',
    price: 15000,
    cost: 8000,
    stock: 0,
    tracked: false,
    category: 'food',
    aliases: ['banh mi op la', 'bánh mì ốp la', 'bánh mì trứng'],
  },
  {
    id: 'p4',
    name: 'Cà phê sữa đá',
    price: 25000,
    cost: 9000,
    stock: 0,
    tracked: false,
    category: 'drink',
    aliases: ['ca phe sua', 'cf sữa', 'cà phê sữa', 'nâu đá'],
  },
  {
    id: 'p4_bx_da',
    name: 'Bạc xỉu đá',
    price: 25000,
    cost: 9000,
    stock: 0,
    tracked: false,
    category: 'drink',
    aliases: ['bac xiu da', 'bạc xỉu đá', 'bạc sỉu đá'],
  },
  {
    id: 'p4_bx_nong',
    name: 'Bạc xỉu nóng',
    price: 25000,
    cost: 9000,
    stock: 0,
    tracked: false,
    category: 'drink',
    aliases: ['bac xiu nong', 'bạc xỉu nóng', 'bạc sỉu nóng'],
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
    barcode: '8934563138165',
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
    barcode: '8935049500544',
  },
  {
    id: 'p_sting',
    name: 'Sting',
    price: 12000,
    cost: 8000,
    stock: 30,
    tracked: true,
    category: 'drink',
    aliases: ['sting', 'xì tin', 'xi tin', 'xiting', 'siting', 'sting dâu', 'sting vàng'],
    barcode: '8934588193057',
  },
  {
    id: 'p_tiger',
    name: 'Bia Tiger',
    price: 18000,
    cost: 13000,
    stock: 48,
    tracked: true,
    category: 'drink',
    aliases: ['bia tiger', 'tiger', 'bia', 'lon tiger', 'chai tiger', 'bia tai gơ'],
    barcode: '8888010101014',
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
    barcode: '8935001700012',
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
    barcode: '8934822201012',
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
    barcode: '8934561000013',
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
    barcode: '8934602001016',
  },
  {
    id: 'p_sting_gold',
    name: 'Nước Tăng Lực Sting Gold Lon 320ml',
    price: 12000,
    cost: 8000,
    stock: 24,
    tracked: true,
    category: 'drink',
    aliases: ['sting vang', 'sting gold', 'nước tăng lực sting'],
    barcode: '8934588012228',
  },
  {
    id: 'p_coca',
    name: 'CocaCola Lon 320ml',
    price: 12000,
    cost: 8500,
    stock: 50,
    tracked: true,
    category: 'drink',
    aliases: ['coca', 'cocacola', 'coke'],
    barcode: '8935049500544',
  },
  {
    id: 'p_vinamilk',
    name: 'Sữa Tươi Vinamilk Có Đường 180ml',
    price: 9000,
    cost: 6800,
    stock: 40,
    tracked: true,
    category: 'drink',
    aliases: ['sua tuoi', 'vinamilk', 'sua bich'],
    barcode: '8934673120142',
  },
  {
    id: 'p_redbull',
    name: 'Nước Tăng Lực Redbull Lon 250ml',
    price: 15000,
    cost: 11000,
    stock: 35,
    tracked: true,
    category: 'drink',
    aliases: ['bo huc', 'bò húc', 'redbull'],
    barcode: '8851123212014',
  },
  {
    id: 'p_c2',
    name: 'Trà Xanh C2 Hương Chanh 455ml',
    price: 10000,
    cost: 7000,
    stock: 30,
    tracked: true,
    category: 'drink',
    aliases: ['c2', 'tra c2', 'trà c2'],
    barcode: '8934588043017',
  },
  {
    id: 'p_banh_quy',
    name: 'Bánh Quy Bơ GO! Xanh Hộp Thiếc 454g',
    price: 85000,
    cost: 65000,
    stock: 12,
    tracked: true,
    category: 'grocery',
    aliases: ['banh quy', 'banh go', 'bánh quy bơ'],
    barcode: '8936036020014',
  },
  {
    id: 'p_oishi',
    name: 'Bánh Quy 9 Loại Rau Củ Quả HMC Gói',
    price: 32000,
    cost: 24000,
    stock: 18,
    tracked: true,
    category: 'grocery',
    aliases: ['banh rau cu', 'banh quy rau cu', 'hmc'],
    barcode: '8934684120018',
  },
  {
    id: 'p_nuoc_me',
    name: 'Nước Me Ép A*Nuta Lon 330ml',
    price: 11000,
    cost: 7500,
    stock: 20,
    tracked: true,
    category: 'drink',
    aliases: ['nuoc me', 'me ep', 'anuta'],
    barcode: '8934752010210',
  },
  {
    id: 'p_nuoc_hoa',
    name: 'Nước Hoa Hương Bách Xanh và Mộc Lan',
    price: 350000,
    cost: 260000,
    stock: 5,
    tracked: true,
    category: 'other',
    aliases: ['nuoc hoa', 'bach xanh moc lan'],
    barcode: '8935212304917',
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
  nguyenlieu: { label: 'Nguyên liệu', color: '#B7791F', bg: '#F8E9C8' },
  dien: { label: 'Điện nước', color: '#2F6FDB', bg: '#E7EFFF' },
  matbang: { label: 'Mặt bằng', color: '#C45A37', bg: '#FBE6DD' },
  luong: { label: 'Lương', color: '#482AAC', bg: '#EFEAFF' },
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
