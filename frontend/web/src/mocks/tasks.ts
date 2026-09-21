/**
 * Support task mẫu — sinh từ dữ liệu cơ sở để Kanban có nội dung khi demo.
 * Task chỉ mô tả công việc hỗ trợ, không chứa dữ liệu sổ nghiệp vụ.
 */
import type { SupportTask, TaskSeverity, TaskSource, TaskStatus } from '../types'
import type { MockDb } from './accounts'

type Seed = {
  title: string
  description: string
  status: TaskStatus
  severity: TaskSeverity
  source: TaskSource
  pick: (db: MockDb) => string | undefined
  assignee?: string
  /** giờ tính từ "bây giờ"; âm = đã quá hạn */
  dueInHours?: number
  ageHours: number
}

const firstWhere = (db: MockDb, fn: (b: MockDb['businesses'][number], i: number) => boolean, skip = 0) => db.businesses.filter(fn)[skip]?.id

const SEEDS: Seed[] = [
  {
    title: 'Đồng bộ thất bại liên tục',
    description: 'Cơ sở báo đơn tạo trên điện thoại không lên máy chủ. Kiểm tra log đồng bộ và phiên bản app.',
    status: 'inbox',
    severity: 'high',
    source: 'system',
    pick: (db) => firstWhere(db, (b) => b.syncErrors7d > 0),
    dueInHours: 4,
    ageHours: 2,
  },
  {
    title: 'Khách không nhận được mã OTP',
    description: 'Chủ cơ sở gọi hotline báo không nhận được SMS OTP khi đăng ký.',
    status: 'inbox',
    severity: 'medium',
    source: 'manual',
    pick: (db) => firstWhere(db, (b) => db.owners.find((o) => o.id === b.ownerId)?.status === 'pending'),
    dueInHours: 20,
    ageHours: 5,
  },
  {
    title: 'Sắp hết lượt tạo đơn gói Cơ bản',
    description: 'Cơ sở đã dùng trên 80% hạn mức tháng. Liên hệ giải thích hạn mức, không tự đổi gói.',
    status: 'inbox',
    severity: 'low',
    source: 'ai',
    pick: (db) => firstWhere(db, (b) => b.ordersThisMonth >= 160),
    dueInHours: 48,
    ageHours: 1,
  },
  {
    title: 'Nhận diện giọng nói sai tên món',
    description: 'Khách phản ánh AI ghi nhầm “trà đá” thành “trà đào”. Thu thập ví dụ câu nói (không lấy nội dung hoá đơn).',
    status: 'investigating',
    severity: 'medium',
    source: 'manual',
    pick: (db) => firstWhere(db, (b) => b.industry === 'Đồ uống'),
    assignee: 'usr_admin_002',
    dueInHours: 10,
    ageHours: 26,
  },
  {
    title: 'Đăng nhập bất thường từ nhiều thiết bị',
    description: 'Tài khoản bị khoá tự động. Xác minh danh tính chủ cơ sở trước khi hướng dẫn mở khoá.',
    status: 'investigating',
    severity: 'high',
    source: 'system',
    pick: (db) => firstWhere(db, (b) => db.owners.find((o) => o.id === b.ownerId)?.status === 'locked'),
    assignee: 'usr_admin_001',
    dueInHours: -3,
    ageHours: 30,
  },
  {
    title: 'App bản cũ không đồng bộ được',
    description: 'Thiết bị còn dùng app 1.3.8. Hướng dẫn khách cập nhật lên bản mới.',
    status: 'investigating',
    severity: 'low',
    source: 'ai',
    pick: (db) => firstWhere(db, (b) => b.syncErrors7d > 0, 1),
    assignee: 'usr_admin_003',
    dueInHours: 30,
    ageHours: 8,
  },
  {
    title: 'Chờ khách gửi ảnh màn hình lỗi',
    description: 'Đã nhắn Zalo cho chủ cơ sở, đang chờ ảnh chụp màn hình khi app bị treo.',
    status: 'waiting',
    severity: 'medium',
    source: 'manual',
    pick: (db) => firstWhere(db, (b) => b.industry === 'Đồ ăn'),
    assignee: 'usr_admin_002',
    dueInHours: 26,
    ageHours: 50,
  },
  {
    title: 'Xác nhận thông tin chủ cơ sở thứ 2',
    description: 'OWNER tạo thêm cơ sở mới, cần xác nhận đúng người (qua SĐT đã xác minh).',
    status: 'waiting',
    severity: 'low',
    source: 'system',
    pick: (db) => db.businesses[48]?.id,
    assignee: 'usr_admin_001',
    dueInHours: -20,
    ageHours: 70,
  },
  {
    title: 'Hướng dẫn thêm nhân viên bán hàng',
    description: 'Khách hỏi cách mời nhân viên vào cơ sở. Đã gửi video hướng dẫn.',
    status: 'resolved',
    severity: 'low',
    source: 'manual',
    pick: (db) => firstWhere(db, (b) => b.staffCount >= 3),
    assignee: 'usr_admin_003',
    ageHours: 90,
  },
  {
    title: 'Khôi phục phiên đăng nhập sau đổi máy',
    description: 'Khách đổi điện thoại, đăng nhập lại bằng OTP thành công.',
    status: 'resolved',
    severity: 'medium',
    source: 'manual',
    pick: (db) => firstWhere(db, (b) => b.industry === 'Tạp hóa', 1),
    assignee: 'usr_admin_001',
    ageHours: 120,
  },
  {
    title: 'Lỗi đồng bộ do mất mạng kéo dài',
    description: 'Đồng bộ lại thành công sau khi khách có Wi-Fi. Theo dõi thêm 3 ngày.',
    status: 'resolved',
    severity: 'medium',
    source: 'ai',
    pick: (db) => firstWhere(db, (b) => b.syncErrors7d > 0, 2),
    assignee: 'usr_admin_002',
    ageHours: 140,
  },
]

export function generateTasks(db: MockDb, now: Date): SupportTask[] {
  const H = 3_600_000
  return SEEDS.map((s, i) => {
    const shopId = s.pick(db)
    const shop = db.businesses.find((b) => b.id === shopId)
    const owner = shop && db.owners.find((o) => o.id === shop.ownerId)
    const created = new Date(now.getTime() - s.ageHours * H).toISOString()
    const updated = new Date(now.getTime() - Math.min(s.ageHours, (i % 5) + 0.5) * H).toISOString()
    return {
      id: `tsk_${String(i + 1).padStart(3, '0')}`,
      code: `T-${String(101 + i)}`,
      title: s.title,
      description: s.description,
      status: s.status,
      severity: s.severity,
      source: s.source,
      shopId: shop?.id,
      shopName: shop?.name,
      ownerName: owner?.fullName,
      assigneeId: s.assignee,
      dueAt: s.dueInHours !== undefined ? new Date(now.getTime() + s.dueInHours * H).toISOString() : undefined,
      createdAt: created,
      updatedAt: updated,
      version: 1,
      history: [
        {
          id: `tsk_${i}_h0`,
          at: created,
          actor: s.source === 'system' ? 'Hệ thống' : s.source === 'ai' ? 'admin@songhloi.vn (xác nhận đề xuất AI)' : 'admin@songhloi.vn',
          action: 'Tạo task',
        },
      ],
    }
  })
}
