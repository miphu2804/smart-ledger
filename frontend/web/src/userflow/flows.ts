/**
 * Các luồng người dùng của app mobile, vẽ trên trang `docs/product/userflow/index.html` (build bằng `npm run userflow`).
 *
 * Nguồn: điều hướng thật trong `frontend/mobile/app` (các lệnh router.push/replace và Redirect) và mã yêu cầu trong
 * `docs/product/product-requirements.md`. Ảnh chụp từ bản web staging (app-staging.songheloi.id.vn) với tài khoản thử
 * trên tiệm "Tiệm Test Team", khung 390×844. Màn không chụp được trên staging (quét mã cần camera, tài khoản thử đã
 * xác minh và đã có tiệm, tiệm thử không theo dõi tồn kho) là nút bước kèm ghi chú, không có ảnh.
 *
 * Toạ độ tính bằng px trên canvas, gốc ở góc trên trái của nút. Màn cao SCREEN.h, ảnh bắt đầu sau phần tiêu đề, nên
 * cổng trái/phải của màn nằm giữa ảnh (y + SCREEN.head + SCREEN.img / 2). Các hàng màn cách nhau 620px để chừa một lối
 * ngang cho đường nối giữa hai hàng.
 */

export const SCREEN = { w: 180, head: 64, img: 390, h: 454 } as const
export const DECISION = { w: 168, h: 96 } as const
export const STEP = { w: 180, h: 72 } as const

interface NodeBase {
  id: string
  x: number
  y: number
  title: string
  /** Mã yêu cầu trong PRD (FR-*). */
  refs?: string[]
  /** Ghi chú cho người đọc bảng chi tiết. */
  notes?: string[]
}

export interface ScreenNode extends NodeBase {
  kind: 'screen'
  caption: string
  /** Tên tệp trong `./screens`, không có đuôi. */
  image: string
  /** Tệp màn trong `frontend/mobile`. */
  file: string
}

export interface DecisionNode extends NodeBase {
  kind: 'decision'
}

export interface StepNode extends NodeBase {
  kind: 'step'
  caption: string
  file?: string
  /** Bước dẫn sang luồng khác: bấm để mở luồng đó và chọn nút `node`. */
  link?: { flow: string; node: string }
}

export type FlowNode = ScreenNode | DecisionNode | StepNode

export type Side = 'l' | 'r' | 't' | 'b'

export interface Edge {
  from: string
  to: string
  label?: string
  /** Nhánh lỗi, vẽ màu đỏ. */
  fail?: boolean
  /** Cạnh ra và cạnh vào, mặc định 'rl'. */
  sides?: `${Side}${Side}`
  /** Điểm gấp tự đặt, thay cho đường gấp tự tính. */
  via?: [number, number][]
  /** Vị trí đoạn gấp giữa (x khi đi ngang, y khi đi dọc). */
  mid?: number
  /** Dời cổng vào dọc theo cạnh, để hai đường không chồng nhau. */
  toShift?: number
  /** Đoạn đặt nhãn; mặc định đoạn dài nhất. */
  labelSeg?: number
}

export interface Flow {
  id: string
  title: string
  summary: string
  nodes: FlowNode[]
  edges: Edge[]
}

/** Ảnh nằm cạnh trang đã build, trong `docs/product/userflow/screens`. */
export function screenUrl(image: string): string {
  return `screens/${image}.webp`
}

export const FLOWS: Flow[] = [
  {
    id: 'onboarding',
    title: 'Đăng nhập và tạo tiệm',
    summary: 'Từ lúc mở app tới Tổng quan: phiên đã lưu, đăng nhập bằng email hoặc Google, xác minh email, tên và tiệm.',
    nodes: [
      { kind: 'step', id: 'open', x: 0, y: 244, title: 'Mở app', caption: 'Logo trong lúc đọc phiên đã lưu', file: 'app/index.tsx' },
      { kind: 'decision', id: 'd-session', x: 260, y: 232, title: 'Đã có phiên Core?' },
      { kind: 'decision', id: 'd-verify', x: 260, y: 520, title: 'Email chưa xác minh?' },
      {
        kind: 'screen', id: 'welcome', x: 520, y: 309, title: 'Đăng nhập', caption: 'Chọn cách vào sổ', image: 'welcome',
        file: 'app/(auth)/welcome.tsx', refs: ['FR-010'],
        notes: ['Email và Google dùng được; Facebook hiện “Tạm khoá”; Zalo bật theo cấu hình của bản build.', 'Bản dev có thêm nút “Vào app”.'],
      },
      {
        kind: 'screen', id: 'email-login', x: 820, y: 0, title: 'Đăng nhập bằng email', caption: 'Email và mật khẩu', image: 'email-login',
        file: 'app/(auth)/email.tsx', refs: ['FR-010'], notes: ['Sai mật khẩu thì hiện gợi ý Quên mật khẩu hoặc Tạo tài khoản.'],
      },
      { kind: 'screen', id: 'email-reset', x: 1120, y: 0, title: 'Quên mật khẩu', caption: 'Gửi liên kết đặt lại', image: 'email-reset', file: 'app/(auth)/email.tsx', refs: ['FR-010'] },
      {
        kind: 'screen', id: 'email-register', x: 820, y: 620, title: 'Tạo tài khoản', caption: 'Nhập lại mật khẩu, gửi thư', image: 'email-register',
        file: 'app/(auth)/email.tsx', refs: ['FR-010'],
      },
      {
        kind: 'step', id: 'verify-email', x: 1120, y: 843, title: 'Xác minh email', caption: 'Chờ bấm liên kết trong thư',
        file: 'app/(auth)/verify-email.tsx', refs: ['FR-010'],
        notes: ['“Dùng email khác” đăng xuất và quay về màn Đăng nhập.', 'Chưa có ảnh: tài khoản thử trên staging đã xác minh email.'],
      },
      {
        kind: 'step', id: 'session', x: 1440, y: 532, title: 'Tạo phiên Core', caption: 'POST /auth/session', refs: ['FR-010'],
        notes: ['Firebase ID token được gửi xuống Core. Lỗi đăng nhập hiện thông báo và giữ người dùng ở màn đang đứng.'],
      },
      { kind: 'decision', id: 'd-name', x: 1700, y: 520, title: 'Core cần tên?' },
      {
        kind: 'step', id: 'name', x: 1694, y: 760, title: 'Bạn tên gì?', caption: 'Tài khoản mới chưa có tên', file: 'app/(auth)/profile.tsx',
        notes: ['Màn này chưa có ảnh chụp.'],
      },
      { kind: 'decision', id: 'd-shop', x: 1960, y: 520, title: 'Đã có tiệm?' },
      {
        kind: 'step', id: 'setup', x: 2240, y: 532, title: 'Tạo tiệm', caption: 'Tên tiệm và ngành hàng', file: 'app/(auth)/setup.tsx', refs: ['FR-011'],
        notes: ['Chưa có ảnh: tài khoản thử trên staging đã có tiệm. Tạo thêm tiệm sau này đi qua màn Tạo cửa hàng mới (luồng Menu nhanh).'],
      },
      {
        kind: 'screen', id: 'home', x: 2580, y: 309, title: 'Tổng quan', caption: 'Lần đầu có hướng dẫn lớp phủ', image: 'dashboard-tong-quan',
        file: 'app/(tabs)/index.tsx', refs: ['FR-006', 'FR-025'],
        notes: [
          'Hướng dẫn có 7 thẻ (src/lib/guideSteps.ts): lời chào, Tạo đơn, Đơn hàng, Trợ lý Bobi, chuông thông báo, menu nhanh, tab Quản lý.',
          'Xem lại được từ tab Quản lý, mục Xem lại hướng dẫn.',
        ],
      },
    ],
    edges: [
      { from: 'open', to: 'd-session' },
      { from: 'd-session', to: 'd-shop', label: 'Có', sides: 'tt', via: [[344, -100], [2044, -100]], labelSeg: 0 },
      { from: 'd-session', to: 'd-verify', label: 'Chưa', sides: 'bt' },
      { from: 'd-verify', to: 'welcome', label: 'Không' },
      { from: 'd-verify', to: 'verify-email', label: 'Có', sides: 'bb', via: [[344, 1130], [1210, 1130]], labelSeg: 0 },
      { from: 'welcome', to: 'email-login', label: 'Đăng nhập bằng email', sides: 'tl' },
      { from: 'welcome', to: 'email-register', label: 'Tạo tài khoản', sides: 'bl' },
      { from: 'welcome', to: 'session', label: 'Google hoặc Zalo' },
      { from: 'email-login', to: 'email-reset', label: 'Quên mật khẩu?' },
      { from: 'email-reset', to: 'email-login', label: 'Quay lại', sides: 'tt', via: [[1210, -40], [910, -40]] },
      { from: 'email-login', to: 'session', label: 'Đăng nhập', sides: 'bt', mid: 500 },
      { from: 'email-register', to: 'verify-email', label: 'Gửi thư' },
      { from: 'verify-email', to: 'session', label: 'Tôi đã xác minh', sides: 'rb' },
      { from: 'session', to: 'd-name' },
      { from: 'd-name', to: 'name', label: 'Có', sides: 'bt' },
      { from: 'd-name', to: 'd-shop', label: 'Không' },
      { from: 'name', to: 'd-shop', label: 'Tiếp tục', mid: 1920, labelSeg: 0 },
      { from: 'd-shop', to: 'setup', label: 'Chưa' },
      { from: 'd-shop', to: 'home', label: 'Có', sides: 'bb', via: [[2044, 860], [2670, 860]], labelSeg: 1 },
      { from: 'setup', to: 'home', label: 'Bắt đầu bán hàng' },
    ],
  },
  {
    id: 'sales',
    title: 'Lên đơn và thanh toán',
    summary: 'Ba cách lên đơn (đọc đơn, chọn món, quét mã) cùng về màn Thanh toán; chỉ bước chốt mới tạo bản ghi bán hàng.',
    nodes: [
      { kind: 'screen', id: 'home', x: 0, y: 620, title: 'Tổng quan', caption: 'Tab Tạo đơn giữa thanh tab', image: 'dashboard-tong-quan', file: 'app/(tabs)/index.tsx', refs: ['FR-006'] },
      {
        kind: 'screen', id: 'create', x: 300, y: 620, title: 'Tạo đơn', caption: 'Đọc đơn, Quét mã, lưới hàng', image: 'dashboard-ban-hang', file: 'app/pos.tsx', refs: ['FR-013'],
        notes: ['Tab Tạo đơn (app/(tabs)/sales.tsx) hiển thị chính màn này.'],
      },
      { kind: 'decision', id: 'd-input', x: 580, y: 831, title: 'Lên đơn bằng cách nào?' },
      {
        kind: 'screen', id: 'voice', x: 860, y: 0, title: 'Đọc đơn', caption: 'Nói, hoặc bấm Nhập tay', image: 'voice-doc-don', file: 'app/voice.tsx', refs: ['FR-008'],
        notes: ['Ảnh chụp bằng Nhập tay thay cho giọng nói; phần tách món chạy như khi nói.'],
      },
      { kind: 'screen', id: 'voice-heard', x: 1160, y: 0, title: 'Nghe và ghi đơn', caption: 'Tách món, số lượng, giá', image: 'voice-nghe-va-ghi-don', file: 'app/voice.tsx', refs: ['FR-002', 'FR-008'] },
      { kind: 'decision', id: 'd-voice', x: 1440, y: 211, title: 'Có món chưa trong danh mục?' },
      { kind: 'screen', id: 'voice-new', x: 1700, y: 0, title: 'Món mới', caption: 'Nhập giá, số lượng, đơn vị', image: 'voice-mon-moi-nhap-so-luong', file: 'app/voice.tsx', refs: ['FR-002', 'FR-009'] },
      { kind: 'screen', id: 'voice-done', x: 2040, y: 0, title: 'Đơn đã ghi', caption: 'Kiểm tra trước khi thanh toán', image: 'voice-don-da-ghi', file: 'app/voice.tsx', refs: ['FR-003'] },
      { kind: 'screen', id: 'cart', x: 860, y: 620, title: 'Chọn món', caption: 'Tăng giảm trên thẻ, thanh giỏ', image: 'dashboard-ban-hang-co-gio-hang', file: 'app/pos.tsx', refs: ['FR-003', 'FR-013'] },
      {
        kind: 'step', id: 'scan', x: 860, y: 1463, title: 'Quét mã', caption: 'Khung ngắm camera', file: 'app/pos.tsx', refs: ['FR-034'],
        notes: ['Các bước quét mã chưa có ảnh: cần camera thật, trình duyệt dùng để chụp staging không có.'],
      },
      { kind: 'decision', id: 'd-scan', x: 1140, y: 1451, title: 'Mã có trong danh mục?' },
      { kind: 'step', id: 'scan-hit', x: 1420, y: 1463, title: 'Nhận diện món', caption: 'Thẻ món, tồn kho, số lượng', file: 'app/pos.tsx', refs: ['FR-034'] },
      { kind: 'step', id: 'scan-cart', x: 1720, y: 1463, title: 'Đơn tạm', caption: 'Ngay trong màn quét', file: 'app/pos.tsx', refs: ['FR-003'] },
      { kind: 'step', id: 'scan-miss', x: 1420, y: 1683, title: 'Mã chưa có', caption: 'Mời thêm mặt hàng', file: 'app/pos.tsx', refs: ['FR-034'] },
      { kind: 'step', id: 'scan-add', x: 1720, y: 1683, title: 'Thêm mặt hàng', caption: 'Tên và giá, lưu danh mục', file: 'app/pos.tsx', refs: ['FR-009', 'FR-034'] },
      {
        kind: 'screen', id: 'checkout', x: 2340, y: 620, title: 'Thanh toán', caption: 'Tiền mặt, chuyển khoản, ghi nợ', image: 'checkout', file: 'app/checkout.tsx', refs: ['FR-003', 'FR-014'],
        notes: ['Chuyển khoản chỉ là ghi nhận, không phải cổng thanh toán.'],
      },
      { kind: 'decision', id: 'd-pay', x: 2600, y: 831, title: 'Khách trả đủ?' },
      { kind: 'screen', id: 'checkout-debt', x: 2860, y: 1240, title: 'Ghi nợ', caption: 'Trả trước một phần, tên khách', image: 'checkout-debt', file: 'app/checkout.tsx', refs: ['FR-014', 'FR-016'] },
      {
        kind: 'step', id: 'save', x: 2860, y: 843, title: 'Chốt đơn trên Core', caption: 'POST /sale-drafts rồi /confirm', refs: ['FR-004', 'FR-028'],
        notes: ['Chỉ bước chốt tạo bản ghi bán hàng; giỏ chưa chốt không vào báo cáo.', 'Lưu lỗi thì không có bản ghi mới và người bán thấy thông báo.'],
      },
      { kind: 'screen', id: 'done', x: 3140, y: 620, title: 'Đã lưu đơn', caption: 'Tổng tiền và cách thu', image: 'checkout-done', file: 'app/checkout.tsx', refs: ['FR-004'] },
      { kind: 'screen', id: 'invoice', x: 3440, y: 620, title: 'Chi tiết đơn', caption: 'Món, cách thu, huỷ đơn', image: 'invoice', file: 'app/invoice/[id].tsx', refs: ['FR-005'] },
      {
        kind: 'screen', id: 'invoice-cancel', x: 3740, y: 620, title: 'Huỷ đơn', caption: 'Lý do, trả kho, hoàn tiền', image: 'invoice-cancel', file: 'app/invoice/[id].tsx', refs: ['FR-005'],
        notes: ['Phải chọn lý do trước khi bấm Xác nhận huỷ đơn; có thể trả hàng về kho và chọn cách hoàn tiền.'],
      },
    ],
    edges: [
      { from: 'home', to: 'create', label: 'Tạo đơn' },
      { from: 'create', to: 'd-input' },
      { from: 'd-input', to: 'voice', label: 'Đọc đơn', sides: 'tl' },
      { from: 'd-input', to: 'cart', label: 'Chọn món' },
      { from: 'd-input', to: 'scan', label: 'Quét mã', sides: 'bl' },
      { from: 'voice', to: 'voice-heard', label: 'Nói xong' },
      { from: 'voice-heard', to: 'd-voice' },
      { from: 'd-voice', to: 'voice-new', label: 'Có' },
      { from: 'd-voice', to: 'voice-done', label: 'Không', sides: 'tt', via: [[1524, -60], [2130, -60]], labelSeg: 0 },
      { from: 'voice-new', to: 'voice-done', label: 'Thêm vào danh mục' },
      { from: 'voice-heard', to: 'cart', label: 'AI lỗi: bán tay', fail: true, sides: 'bt', mid: 540 },
      { from: 'cart', to: 'checkout', label: 'Thanh toán' },
      { from: 'voice-done', to: 'checkout', label: 'Thanh toán', sides: 'bt', mid: 560 },
      { from: 'scan', to: 'd-scan' },
      { from: 'd-scan', to: 'scan-hit', label: 'Có' },
      { from: 'd-scan', to: 'scan-miss', label: 'Chưa', sides: 'bl' },
      { from: 'scan-hit', to: 'scan-cart', label: 'Thêm' },
      { from: 'scan-miss', to: 'scan-add', label: 'Thêm' },
      { from: 'scan-add', to: 'scan-cart', label: 'Lưu vào danh mục', sides: 'tb' },
      { from: 'scan-cart', to: 'checkout', label: 'Thanh toán', sides: 'rb' },
      { from: 'checkout', to: 'd-pay' },
      { from: 'd-pay', to: 'save', label: 'Đủ' },
      { from: 'd-pay', to: 'checkout-debt', label: 'Ghi nợ', sides: 'bl' },
      { from: 'checkout-debt', to: 'save', label: 'Hoàn tất', sides: 'tb' },
      { from: 'save', to: 'done', label: 'Đã lưu' },
      { from: 'save', to: 'checkout', label: 'Lưu lỗi: không tạo bản ghi', fail: true, sides: 'tt', via: [[2950, 584], [2470, 584]], toShift: 40 },
      { from: 'done', to: 'invoice', label: 'Xem đơn' },
      { from: 'invoice', to: 'invoice-cancel', label: 'Huỷ đơn' },
    ],
  },
  {
    id: 'orders',
    title: 'Đơn hàng, báo cáo và thông báo',
    summary: 'Từ Tổng quan: tab Đơn hàng tới chi tiết và huỷ đơn, thẻ doanh thu tới Báo cáo, danh sách bán chạy, chuông thông báo.',
    nodes: [
      { kind: 'screen', id: 'home', x: 0, y: 930, title: 'Tổng quan', caption: 'Thẻ doanh thu, bán chạy, chuông', image: 'dashboard-tong-quan-uu-tien-va-ban-chay', file: 'app/(tabs)/index.tsx', refs: ['FR-006'] },
      {
        kind: 'screen', id: 'invoices', x: 500, y: 0, title: 'Đơn hàng', caption: 'Tìm, lọc theo ngày, nhóm theo ngày', image: 'invoices', file: 'app/(tabs)/invoices.tsx', refs: ['FR-005'],
        notes: ['Các nút ngày: Tất cả, Hôm nay, Hôm qua, 7 ngày; nút lọc mở thêm điều kiện.'],
      },
      { kind: 'screen', id: 'invoice', x: 800, y: 0, title: 'Chi tiết đơn', caption: 'Món, cách thu, huỷ đơn', image: 'invoice', file: 'app/invoice/[id].tsx', refs: ['FR-005'] },
      {
        kind: 'screen', id: 'invoice-cancel', x: 1100, y: 0, title: 'Huỷ đơn', caption: 'Lý do, trả kho, hoàn tiền', image: 'invoice-cancel', file: 'app/invoice/[id].tsx', refs: ['FR-005'],
        notes: ['Phải chọn lý do trước khi bấm Xác nhận huỷ đơn; có thể trả hàng về kho và chọn cách hoàn tiền.'],
      },
      {
        kind: 'screen', id: 'analytics', x: 500, y: 620, title: 'Báo cáo', caption: 'Doanh thu, thu chi, lãi gộp', image: 'dashboard-bao-cao-doanh-thu', file: 'app/analytics.tsx', refs: ['FR-006'],
        notes: ['Báo cáo còn dẫn sang Hàng hoá (luồng Quản lý tiệm).'],
      },
      { kind: 'screen', id: 'debts', x: 800, y: 620, title: 'Công nợ', caption: 'Tổng còn nợ, từng khách', image: 'dashboard-cong-no', file: 'app/debts.tsx', refs: ['FR-016'] },
      { kind: 'screen', id: 'bestsellers', x: 500, y: 1240, title: 'Bán chạy', caption: 'Theo số lượng hoặc doanh thu', image: 'bestsellers', file: 'app/bestsellers.tsx', refs: ['FR-006'] },
      { kind: 'screen', id: 'notifications', x: 500, y: 1860, title: 'Thông báo', caption: 'Đơn hàng, công nợ, kho hàng', image: 'notifications', file: 'app/notifications.tsx' },
      {
        kind: 'screen', id: 'notification-settings', x: 800, y: 1860, title: 'Cài đặt thông báo', caption: 'Bật tắt từng loại', image: 'notification-settings', file: 'app/notification-settings.tsx',
        notes: ['Cũng mở được từ Cài đặt trong tab Quản lý.'],
      },
    ],
    edges: [
      { from: 'home', to: 'invoices', label: 'Tab Đơn hàng', mid: 240, labelSeg: 2 },
      { from: 'home', to: 'analytics', label: 'Thẻ doanh thu', mid: 240, labelSeg: 2 },
      { from: 'home', to: 'bestsellers', label: 'Xem tất cả', mid: 240, labelSeg: 2 },
      { from: 'home', to: 'notifications', label: 'Chuông', mid: 240, labelSeg: 2 },
      { from: 'invoices', to: 'invoice', label: 'Chạm một đơn' },
      { from: 'invoice', to: 'invoice-cancel', label: 'Huỷ đơn' },
      { from: 'invoices', to: 'analytics', label: 'Báo cáo', sides: 'bt' },
      { from: 'analytics', to: 'debts', label: 'Công nợ' },
      { from: 'notifications', to: 'notification-settings', label: 'Tuỳ chọn' },
    ],
  },
  {
    id: 'assistant',
    title: 'Trợ lý Bobi',
    summary: 'Tab Trợ lý Bobi mở màn chat: gõ hoặc chạm câu gợi ý, xem lịch sử, chỉnh ghi nhớ; câu trả lời dẫn sang màn có dữ liệu.',
    nodes: [
      { kind: 'screen', id: 'home', x: 0, y: 620, title: 'Tổng quan', caption: 'Tab Trợ lý Bobi ở thanh tab', image: 'dashboard-tong-quan', file: 'app/(tabs)/_layout.tsx', refs: ['FR-006'] },
      {
        kind: 'screen', id: 'chat', x: 300, y: 620, title: 'Trợ lý Bobi', caption: 'Lời chào, chip gợi ý trên ô nhập', image: 'chat-tro-ly-ai', file: 'app/ai.tsx', refs: ['FR-020', 'FR-027'],
        notes: [
          'Tab Trợ lý Bobi chuyển thẳng sang màn này bằng router.replace.',
          'Đầu màn có Cuộc trò chuyện mới, Lịch sử trò chuyện và Cài đặt trợ lý; ô nhập có nút nói và nút gửi.',
          'Hai chip “Gợi ý nhập hàng 7 ngày qua” và “Doanh thu 7 ngày qua?” gửi thẳng câu hỏi; ẩn đi khi đang gõ.',
        ],
      },
      { kind: 'screen', id: 'ai-history', x: 300, y: 0, title: 'Lịch sử trò chuyện', caption: 'Mở lại cuộc trò chuyện cũ', image: 'ai-history', file: 'app/ai.tsx', refs: ['FR-020'] },
      {
        kind: 'screen', id: 'ai-settings', x: 300, y: 1240, title: 'Cài đặt trợ lý', caption: 'Ghi nhớ dài hạn', image: 'ai-settings', file: 'app/ai.tsx',
        notes: ['Bật tắt Ghi nhớ dài hạn và xem những gì trợ lý đã nhớ.'],
      },
      { kind: 'screen', id: 'chat-ask', x: 600, y: 620, title: 'Đặt câu hỏi', caption: 'Gõ câu hỏi về tiệm', image: 'chat-dat-cau-hoi', file: 'app/ai.tsx', refs: ['FR-020'] },
      {
        kind: 'step', id: 'agent', x: 900, y: 843, title: 'Agent trả lời', caption: 'POST /agent/chat/stream', refs: ['FR-018', 'FR-019', 'FR-020'],
        notes: ['Core chuyển câu hỏi sang dịch vụ AI; câu trả lời chỉ dùng dữ liệu của tiệm đang chọn.'],
      },
      {
        kind: 'screen', id: 'chat-answer', x: 1200, y: 620, title: 'Câu trả lời', caption: 'Kèm kỳ và phạm vi dữ liệu', image: 'chat-tra-loi', file: 'app/ai.tsx', refs: ['FR-020'],
        notes: ['Câu trả lời trong ảnh là câu trả lời thật của Agent trên staging, dựa trên đơn của tiệm thử.'],
      },
      { kind: 'screen', id: 'products', x: 1520, y: 0, title: 'Hàng hoá', caption: 'Món sắp hết, nhập hàng', image: 'dashboard-hang-hoa', file: 'app/products.tsx', refs: ['FR-009', 'FR-030'] },
      { kind: 'screen', id: 'analytics', x: 1520, y: 1240, title: 'Báo cáo', caption: 'Doanh thu, thu chi, lãi gộp', image: 'dashboard-bao-cao-doanh-thu', file: 'app/analytics.tsx', refs: ['FR-006'] },
    ],
    edges: [
      { from: 'home', to: 'chat', label: 'Trợ lý Bobi' },
      { from: 'chat', to: 'ai-history', label: 'Lịch sử', sides: 'tb' },
      { from: 'chat', to: 'ai-settings', label: 'Cài đặt trợ lý', sides: 'bt' },
      { from: 'chat', to: 'chat-ask', label: 'Gõ câu hỏi' },
      { from: 'chat', to: 'agent', label: 'Chạm chip gợi ý', sides: 'bb', via: [[390, 1160], [990, 1160]], labelSeg: 1 },
      { from: 'chat-ask', to: 'agent', label: 'Gửi' },
      { from: 'agent', to: 'chat-answer', label: 'Trả lời' },
      { from: 'agent', to: 'chat-ask', label: 'AI lỗi: thông báo, hỏi lại', fail: true, sides: 'tt', via: [[990, 560], [690, 560]], labelSeg: 1 },
      { from: 'chat-answer', to: 'products', label: 'Mở Hàng hoá', sides: 'tl' },
      { from: 'chat-answer', to: 'analytics', label: 'Mở Báo cáo', sides: 'bl' },
    ],
  },
  {
    id: 'manage',
    title: 'Quản lý tiệm',
    summary: 'Tab Quản lý mở thông tin tiệm, báo cáo, hàng hoá, công nợ, chi phí, cài đặt và các mục tài khoản; đăng xuất về màn Đăng nhập.',
    nodes: [
      { kind: 'screen', id: 'home', x: 0, y: 0, title: 'Tổng quan', caption: 'Thanh tab dưới cùng', image: 'dashboard-tong-quan', file: 'app/(tabs)/index.tsx', refs: ['FR-006'] },
      {
        kind: 'screen', id: 'manage', x: 300, y: 0, title: 'Quản lý', caption: 'Kinh doanh, tài khoản và ứng dụng', image: 'manage', file: 'app/(tabs)/more.tsx', refs: ['FR-035'],
        notes: ['Cuộn xuống là nhóm Tài khoản và ứng dụng.'],
      },
      { kind: 'screen', id: 'profile', x: 600, y: 620, title: 'Thông tin tiệm', caption: 'Hồ sơ chủ tiệm và tiệm', image: 'profile', file: 'app/profile.tsx', refs: ['FR-011'] },
      { kind: 'screen', id: 'analytics', x: 900, y: 620, title: 'Báo cáo', caption: 'Doanh thu, chi phí, bán chạy', image: 'dashboard-bao-cao-doanh-thu', file: 'app/analytics.tsx', refs: ['FR-006'] },
      { kind: 'screen', id: 'products', x: 1200, y: 620, title: 'Hàng hoá', caption: 'Giá trị tồn, món sắp hết', image: 'dashboard-hang-hoa', file: 'app/products.tsx', refs: ['FR-009', 'FR-030', 'FR-032'] },
      { kind: 'screen', id: 'product-add', x: 1200, y: 1240, title: 'Thêm mặt hàng', caption: 'Tên, mã vạch, giá, nhóm hàng', image: 'product-add', file: 'app/products.tsx', refs: ['FR-009'] },
      {
        kind: 'step', id: 'stock-in', x: 1200, y: 2083, title: 'Nhập hàng', caption: 'Số lượng nhập, lý do', file: 'app/products.tsx', refs: ['FR-030'],
        notes: ['Nút Nhập hàng chỉ hiện ở mặt hàng có theo dõi tồn kho; tiệm thử trên staging chưa có mặt hàng nào như vậy nên chưa có ảnh.'],
      },
      { kind: 'screen', id: 'debts', x: 1500, y: 620, title: 'Công nợ', caption: 'Tổng còn nợ, từng khách', image: 'dashboard-cong-no', file: 'app/debts.tsx', refs: ['FR-016'] },
      { kind: 'screen', id: 'debt-detail', x: 1500, y: 1240, title: 'Khoản nợ', caption: 'Trả một phần hoặc trả đủ', image: 'debt-detail', file: 'app/debts.tsx', refs: ['FR-016'] },
      { kind: 'screen', id: 'invoice', x: 1500, y: 1860, title: 'Chi tiết đơn nợ', caption: 'Món, cách thu, huỷ đơn', image: 'invoice', file: 'app/invoice/[id].tsx', refs: ['FR-005', 'FR-016'] },
      { kind: 'screen', id: 'expenses', x: 1800, y: 620, title: 'Chi phí', caption: 'Khoản chi theo tháng', image: 'expenses', file: 'app/expenses.tsx', refs: ['FR-015'] },
      { kind: 'screen', id: 'expense-add', x: 1800, y: 1240, title: 'Thêm chi phí', caption: 'Mô tả, số tiền, nhóm chi', image: 'expense-add', file: 'app/expenses.tsx', refs: ['FR-015'] },
      { kind: 'screen', id: 'settings', x: 2100, y: 620, title: 'Cài đặt', caption: 'Rung, cảnh báo hết hàng, máy in', image: 'settings', file: 'app/settings.tsx', refs: ['FR-032'] },
      { kind: 'screen', id: 'notification-settings', x: 2100, y: 1240, title: 'Cài đặt thông báo', caption: 'Bật tắt từng loại', image: 'notification-settings', file: 'app/notification-settings.tsx' },
      {
        kind: 'screen', id: 'change-password', x: 2400, y: 620, title: 'Đổi mật khẩu', caption: 'Không cần đăng xuất', image: 'change-password', file: 'app/change-password.tsx', refs: ['FR-010'],
        notes: ['Chỉ hiện khi tài khoản có mật khẩu; tài khoản Google đổi mật khẩu ở Google.', 'Quên mật khẩu hiện tại thì gửi thư đặt lại ngay từ màn này.'],
      },
      { kind: 'step', id: 'guide', x: 0, y: 620, title: 'Xem lại hướng dẫn', caption: 'Mở lại 7 thẻ ở Tổng quan', link: { flow: 'onboarding', node: 'home' } },
      { kind: 'step', id: 'policy', x: 0, y: 740, title: 'Chính sách và điều khoản', caption: 'Mở trang /chinh-sach', file: 'app/(tabs)/more.tsx', notes: ['Mở trang web bằng trình duyệt, không phải màn trong app.'] },
      { kind: 'step', id: 'delete-account', x: 0, y: 860, title: 'Xoá tài khoản', caption: 'Mở trang /delete-account', file: 'app/(tabs)/more.tsx', notes: ['Mở trang web bằng trình duyệt, không phải màn trong app.'] },
      { kind: 'step', id: 'logout', x: 0, y: 980, title: 'Đăng xuất', caption: 'Về màn Đăng nhập', link: { flow: 'onboarding', node: 'welcome' } },
    ],
    edges: [
      { from: 'home', to: 'manage', label: 'Quản lý' },
      { from: 'manage', to: 'profile', label: 'Thẻ tiệm', sides: 'rt', labelSeg: 1 },
      { from: 'manage', to: 'analytics', label: 'Báo cáo', sides: 'rt', labelSeg: 1 },
      { from: 'manage', to: 'products', label: 'Hàng hoá', sides: 'rt', labelSeg: 1 },
      { from: 'manage', to: 'debts', label: 'Công nợ', sides: 'rt', labelSeg: 1 },
      { from: 'manage', to: 'expenses', label: 'Chi phí', sides: 'rt', labelSeg: 1 },
      { from: 'manage', to: 'settings', label: 'Cài đặt', sides: 'rt', labelSeg: 1 },
      { from: 'products', to: 'product-add', label: 'Thêm', sides: 'bt' },
      { from: 'products', to: 'stock-in', label: 'Nhập hàng', sides: 'rr', via: [[1440, 879], [1440, 2119]], labelSeg: 1 },
      { from: 'debts', to: 'debt-detail', label: 'Chạm khoản nợ', sides: 'bt' },
      { from: 'debt-detail', to: 'invoice', label: 'Xem đơn', sides: 'bt' },
      { from: 'expenses', to: 'expense-add', label: 'Thêm chi phí', sides: 'bt' },
      { from: 'settings', to: 'notification-settings', label: 'Thông báo', sides: 'bt' },
      { from: 'manage', to: 'change-password', label: 'Đổi mật khẩu', sides: 'rt', labelSeg: 1 },
      { from: 'manage', to: 'guide', sides: 'br' },
      { from: 'manage', to: 'policy', sides: 'br' },
      { from: 'manage', to: 'delete-account', sides: 'br' },
      { from: 'manage', to: 'logout', sides: 'br' },
    ],
  },
  {
    id: 'shortcuts',
    title: 'Menu nhanh và đổi cửa hàng',
    summary: 'Nút menu ở đầu các tab mở ngăn chuyển nhanh: đổi hoặc tạo cửa hàng, và lối tắt tới mọi mục chính.',
    nodes: [
      { kind: 'screen', id: 'home', x: 0, y: 620, title: 'Tổng quan', caption: 'Nút menu góc trên trái', image: 'dashboard-tong-quan', file: 'app/(tabs)/index.tsx' },
      {
        kind: 'screen', id: 'quicknav', x: 300, y: 620, title: 'Menu nhanh', caption: 'Bán hàng, Quản lý, Khác', image: 'quicknav', file: 'src/components/QuickNav.tsx',
        notes: ['Danh sách mục nằm ở src/lib/quickNav.ts.'],
      },
      { kind: 'screen', id: 'shop-switcher', x: 640, y: 0, title: 'Đổi cửa hàng', caption: 'Danh sách tiệm, tạo tiệm mới', image: 'shop-switcher', file: 'src/components/ShopSwitcher.tsx' },
      { kind: 'screen', id: 'shop-new', x: 940, y: 0, title: 'Tạo cửa hàng mới', caption: 'Mỗi cửa hàng có sổ riêng', image: 'shop-new', file: 'app/shop-new.tsx', refs: ['FR-011'] },
      {
        kind: 'step', id: 'shop-save', x: 1240, y: 223, title: 'Tạo cửa hàng', caption: 'Báo “Đã tạo …” rồi quay lại', file: 'app/shop-new.tsx', refs: ['FR-011'],
        notes: ['Lỗi thì hiện thông báo và giữ người dùng ở màn Tạo cửa hàng mới.'],
      },
      { kind: 'step', id: 'nav-sales', x: 640, y: 723, title: 'Bán hàng', caption: 'Tổng quan, Tạo đơn, Đơn hàng', link: { flow: 'sales', node: 'create' } },
      { kind: 'step', id: 'nav-manage', x: 640, y: 843, title: 'Quản lý', caption: 'Công nợ, Hàng hoá, Báo cáo, Chi phí', link: { flow: 'manage', node: 'manage' } },
      { kind: 'step', id: 'nav-other', x: 640, y: 963, title: 'Khác', caption: 'Trợ lý Bobi, Cài đặt', link: { flow: 'assistant', node: 'chat' } },
    ],
    edges: [
      { from: 'home', to: 'quicknav', label: 'Mở menu' },
      { from: 'quicknav', to: 'shop-switcher', label: 'Đổi hoặc tạo cửa hàng', sides: 'tl' },
      { from: 'shop-switcher', to: 'shop-new', label: 'Tạo cửa hàng mới' },
      { from: 'shop-new', to: 'shop-save', label: 'Tạo cửa hàng' },
      { from: 'quicknav', to: 'nav-sales', mid: 560 },
      { from: 'quicknav', to: 'nav-manage' },
      { from: 'quicknav', to: 'nav-other', mid: 560 },
    ],
  },
]
