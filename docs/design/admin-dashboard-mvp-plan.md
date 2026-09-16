# Kế hoạch thiết kế Admin Dashboard MVP

Trạng thái: design plan. Tài liệu này không thay thế BRD, PRD hoặc API contract.

## 1. Mục tiêu và ranh giới

### Yêu cầu thiết kế từ người dùng

- Xây dựng dashboard web cho ADMIN theo tinh thần của bộ reference đã cung cấp.
- Làm panel trái ở mức cơ bản trước, có thể bổ sung mục sau.
- Tập trung vào Dashboard, AI Support, phân tích task, Kanban board và Settings.
- Phân tích rõ bố cục, phong cách, bảng màu và vị trí icon trước khi triển khai.

### Phạm vi đã xác minh trong tài liệu sản phẩm

- `FR-022`: ADMIN đăng nhập và chỉ vào khu vực quản trị; OWNER không truy cập được.
- `FR-023`: ADMIN tìm, xem danh sách và chi tiết OWNER/cơ sở; không sửa trực tiếp sổ nghiệp vụ.
- `FR-024`: ADMIN xem số liệu tổng hợp tối thiểu phục vụ hỗ trợ.
- `FR-025`-`FR-028`: AI Support, task draft có xác nhận, Kanban và preference cá nhân thuộc P1 MVP.
- `NFR-003`, `NFR-009`-`NFR-011`: API quản trị phải giới hạn quyền, audit hành động nhạy cảm, cô lập AI context và chống tạo/ghi đè task trùng.
- API contract bao phủ overview, users/shops, AI Support, support tasks và preferences.
- MVP không có giả danh OWNER và không có endpoint ADMIN sửa hóa đơn, chi phí, công nợ hoặc tồn kho.

### Ranh giới chức năng đã chấp nhận

- AI Support chỉ phân tích context ADMIN được phép xem và trả task draft có căn cứ.
- ADMIN xác nhận trước khi tạo task; AI không tự gán, tạo hoặc thay đổi trạng thái task.
- Kanban chỉ quản lý support task, không thay đổi sổ nghiệp vụ của OWNER.
- Settings chỉ thay đổi preference cá nhân; role/quyền là chỉ đọc và audit luôn bật.

Các phần trên đã được trace từ `BO/BR -> FR/NFR -> AC` và có API contract mục tiêu. Runtime vẫn chưa được triển khai hoặc nghiệm thu.

## 2. Design read

Admin dashboard B2B cho nhân sự hỗ trợ nội bộ, dùng ngôn ngữ thị giác calm operations: sáng, trung tính, mật độ vừa-cao, ít chuyển động, ưu tiên nhận biết vấn đề và ra quyết định nhanh.

- `DESIGN_VARIANCE: 3/10`: grid ổn định, ít bất đối xứng.
- `MOTION_INTENSITY: 2/10`: chỉ hover, focus, loading và transition trạng thái.
- `VISUAL_DENSITY: 7/10`: nhiều dữ liệu nhưng giữ khoảng thở và hierarchy rõ.

Reference là nguồn cảm hứng hình ảnh, không phải yêu cầu nghiệp vụ. Nội dung y tế, bệnh nhân, billing và hành động trong ảnh không được đưa vào SmartLedger.

## 3. Phân tích reference

### Shell và bố cục

- Khung ứng dụng desktop sáng, bo góc lớn, đặt trên nền xám ấm. Khi triển khai thực tế nên dùng toàn viewport, không cần mô phỏng một cửa sổ nổi.
- Sidebar cố định bên trái chiếm khoảng 15-18% chiều rộng. Logo ở đầu, navigation chia nhóm ở giữa, utility navigation ghim đáy.
- Header cao khoảng 68-76 px. Tiêu đề trang nằm trái; search, quick action, notification, nút primary và avatar nằm phải.
- Nội dung chính dùng grid 12 cột, gap 16 px, page padding 24 px. Card lớn chiếm 7-9 cột; rail phụ chiếm 3-4 cột.
- Dashboard đặt KPI strip ở đầu, sau đó là khu vực công việc chính và rail ưu tiên bên phải.
- Màn AI cố ý giảm mật độ: nội dung trung tâm, shortcut ở giữa, composer lớn ghim gần đáy.
- Màn Kanban dùng filter theo hai hàng phía trên, cột trạng thái nền xám và card trắng nổi nhẹ.
- Drawer chi tiết mở từ phải, giữ context của danh sách thay vì chuyển trang.

### Phong cách

- Nền off-white và neutral ấm; card trắng; text charcoal, không dùng đen tuyệt đối.
- Radius mềm và nhất quán: card 16 px, control 10 px, pill full radius.
- Shadow rất nhẹ, chỉ dùng để phân tầng card, drawer và popover.
- Màu xanh lá là màu điều hướng/positive state. Xanh dương, vàng và đỏ chỉ dùng cho semantic state.
- Typography sans trung tính, số liệu có weight cao hơn nhãn, không dùng serif.
- Icon outline mảnh, cùng một family, kích thước ổn định và luôn đi kèm label khi icon có thể mơ hồ.

### Vị trí và quy tắc icon

| Vị trí | Kích thước | Quy tắc |
|---|---:|---|
| Logo sidebar | 28-32 px | Mark bên trái, wordmark và chevron workspace bên phải |
| Sidebar item | 20 px | Icon trái, cách label 12 px; badge đếm ghim phải |
| Header action | 18-20 px trong nút 40 px | Search tách riêng; action nhanh, chuông, avatar theo thứ tự từ trái sang phải |
| Card heading | 20 px trong tile 40 px | Tile charcoal cho module cấp cao; không lặp ở mọi card nhỏ |
| Inline action | 16 px | Đặt trước label hoặc ở mép phải row; có tooltip khi chỉ có icon |
| Status | 12-14 px | Chỉ dùng khi icon mang nghĩa thật; không dùng dot trang trí |

Khuyến nghị dùng một family duy nhất: Phosphor Icons, weight `regular`, stroke cảm nhận tương đương 1.5-1.75 px.

## 4. Design tokens đề xuất

Các màu được suy ra từ reference, cần kiểm tra lại với brand SmartLedger trước khi khóa.

| Token | Giá trị | Mục đích |
|---|---|---|
| `canvas` | `#E1E0DC` | Nền ngoài hoặc loading shell |
| `app-bg` | `#F6F5F4` | Nền ứng dụng |
| `surface` | `#FFFFFF` | Card, drawer, popover |
| `surface-subtle` | `#ECECE9` | Filter group, Kanban column, hover nhẹ |
| `border` | `#E1E2DE` | Divider và border |
| `text-primary` | `#30312F` | Tiêu đề và nội dung chính |
| `text-secondary` | `#777B75` | Nhãn, metadata, helper text |
| `accent-soft` | `#8FD17D` | Active nav, selected state |
| `accent-strong` | `#2F7A43` | Primary action, focus, biểu đồ chính |
| `info` | `#3478F6` | Thông tin và in-progress |
| `warning` | `#C47A16` | Chờ xử lý, cần chú ý |
| `danger` | `#C84337` | Lỗi, quá hạn, rủi ro |

Quy tắc contrast:

- Dùng text charcoal trên `accent-soft`.
- Dùng text trắng trên `accent-strong` sau khi kiểm tra WCAG AA.
- Badge semantic dùng nền tint nhạt và text đậm; không dùng màu đơn lẻ để truyền đạt trạng thái.

### Type, spacing và shape

- Font: Geist hoặc system sans; 14 px cho body desktop, 12 px cho metadata, 28-32 px cho page title, 24-28 px cho KPI.
- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- Sidebar: 248 px expanded, 72 px collapsed.
- Header: 72 px; content padding: 24 px; grid gap: 16 px.
- Radius: 16 px card/drawer, 10 px input/button, 999 px badge/pill.
- Shadow card: `0 8px 24px rgb(45 48 43 / 0.08)`; không dùng shadow cho mọi row.

## 5. Information architecture MVP

### Sidebar v1

Nhóm Workspace:

1. Dashboard - `SquaresFour`
2. Customers - `Storefront` hoặc `UsersThree`
3. AI Support - `ChatCircleDots`
4. Tasks - `Kanban`

Nhóm System, ghim đáy:

5. Settings - `GearSix`
6. Profile/Sign out - avatar menu

`Customers` là mục cần có để đáp ứng `FR-023`, dù không phải màn được nhấn mạnh trong brief. Không thêm Reports, Billing, Staff hoặc các mục từ reference nếu chưa có yêu cầu SmartLedger.

## 6. Kế hoạch từng màn hình

### Dashboard

Mục tiêu: ADMIN nhận biết nhanh hệ thống hoặc cơ sở nào cần hỗ trợ, sau đó đi vào đúng context.

Layout desktop:

```text
[Page title + date/filter]              [Search] [Notifications] [Avatar]
[KPI 1] [KPI 2] [KPI 3] [KPI 4]
[Support overview / trend        8 col] [Needs attention      4 col]
[Recent shops / owners           8 col] [Recent admin access  4 col]
```

- KPI chỉ dùng field thực sự có trong `AdminOverviewView`; tên và công thức cần khóa với API trước khi code.
- `Needs attention` là aggregation read-only. Không suy diễn thành task nếu task model chưa được duyệt.
- Search toàn cục ưu tiên OWNER và cơ sở; kết quả mở drawer hoặc trang detail.
- Mỗi lần mở chi tiết dữ liệu khách hàng phải tạo audit theo `AC-017`.

### Customers

- Tab `Owners` và `Shops`, hoặc một search hợp nhất nếu API hỗ trợ.
- Table/list với search, pagination, loading, empty và error state.
- Chọn row mở detail drawer bên phải.
- Detail hiển thị thông tin hỗ trợ được cấp; không có edit, impersonate hay ledger actions.

### AI Support

Thuộc P1 MVP theo `FR-025`:

```text
[Conversation list 240] [Chat and evidence              flexible] [Context 320]
                        [suggested prompts]
                        [messages]
                        [composer + scope indicator]
```

- AI chỉ phân tích và đề xuất. Không tự ghi sổ, đổi trạng thái task hoặc tác động cửa hàng.
- Mỗi câu trả lời phải cho biết scope dữ liệu, nguồn/evidence và giới hạn nếu thiếu dữ liệu.
- Context drawer chỉ hiện OWNER/cơ sở ADMIN đã được cấp quyền xem.
- Composer có loading, retry và lỗi không làm mất prompt.
- FE chỉ gọi Core; Core lọc context và điều phối AI. Task draft không có side effect cho đến khi ADMIN xác nhận.

### Tasks và Kanban

Thuộc P1 MVP theo `FR-026`, `FR-027`.

- Cột khuyến nghị: `Inbox`, `Investigating`, `Waiting`, `Resolved`.
- Card: title, shop/owner, severity, assignee, due time, source và last updated.
- Filter: assignee, severity, source, due; search theo title/cơ sở.
- Click card mở drawer; drag and drop chỉ bật khi transition được backend kiểm soát và audit.
- AI suggestion phải hiển thị như đề xuất có nút review, không tự tạo hoặc tự di chuyển task.
- Task dùng version để phát hiện conflict; tạo task yêu cầu idempotency key và mọi chuyển trạng thái được audit.

### Settings

MVP an toàn:

- `Profile`: tên hiển thị, avatar, locale nếu đã có API.
- `Appearance`: light/system, mật độ comfortable/compact lưu local nếu backend chưa hỗ trợ.
- `Security & Access`: read-only session/role summary; không cho tự cấp ADMIN.
- `Audit`: hiển thị trạng thái luôn bật, không có toggle tắt audit.

Không đưa cấu hình thuế/hóa đơn điện tử vào màn này khi các yêu cầu pháp lý còn provisional.

## 7. Component inventory

### P0 dùng chung

- `AppShell`, `Sidebar`, `Topbar`, `PageHeader`.
- `SearchInput`, `FilterBar`, `Button`, `IconButton`, `Badge`.
- `MetricStrip`, `Panel`, `DataTable`, `Pagination`.
- `DetailDrawer`, `EmptyState`, `ErrorState`, `Skeleton`.
- `Toast` chỉ cho phản hồi transient; lỗi dữ liệu đặt inline trong panel.

### P1 theo chức năng được duyệt

- `ChatThread`, `MessageBubble`, `EvidenceList`, `PromptComposer`.
- `KanbanBoard`, `KanbanColumn`, `TaskCard`, `TaskDrawer`.
- `AuditTimeline`.

Foundation đề xuất khi bắt đầu frontend: Next.js/React, Tailwind CSS v4, shadcn/ui được tùy biến theo tokens trên, Phosphor Icons. Chỉ thêm TanStack Table và thư viện drag/drop khi use case thật sự cần.

## 8. Responsive và accessibility

- Desktop từ 1280 px: sidebar expanded, grid 12 cột, rail phụ 4 cột.
- Tablet 768-1279 px: sidebar collapsed 72 px, rail phụ chuyển xuống dưới main.
- Mobile dưới 768 px: sidebar thành drawer; KPI scroll ngang hoặc grid 2 cột; table đổi sang list; Kanban scroll ngang có snap.
- Keyboard: skip link, focus visible, sidebar/filters/drawer/chat dùng được hoàn toàn bằng bàn phím.
- Touch target tối thiểu 40 x 40 px; contrast WCAG AA; trạng thái không phụ thuộc màu.
- Motion tôn trọng `prefers-reduced-motion`; không animation scroll hoặc auto-loop trong MVP.

## 9. Trình tự triển khai

### Khóa nền tảng

- Xác nhận brand, stack frontend và schema `AdminOverviewView`.
- Chốt tokens, icon family, shell responsive và trạng thái loading/error/empty.
- Verify: visual review ở 1440, 1024 và 390 px; keyboard navigation qua toàn shell.

### Hoàn thành scope đã có hợp đồng

- Dashboard dùng `/admin/overview`.
- Customers search/list/detail dùng `/admin/users`, `/admin/shops`, `/admin/shops/{id}`.
- Role guard, 403 handling và audit khi mở shop detail.
- Verify: `AC-015`, `AC-016`, `AC-017` chạy qua UI thật với Core.

### Hoàn thành AI Support, Tasks và Settings

- Kết nối AI Support, support tasks và preferences qua Core API.
- User test luồng nhận vấn đề -> xem evidence -> xác nhận task -> triage trên Kanban -> theo dõi kết quả.
- Verify: `AC-018`-`AC-021` chạy end-to-end; người dùng phân biệt được dữ liệu nguồn, đề xuất AI và hành động đã xác nhận.

### Hardening trước pilot

- Thêm integration/e2e tests, conflict/idempotency tests và telemetry không chứa dữ liệu nhạy cảm.
- Verify: không có đường gọi AI trực tiếp từ FE, AI không tự ghi task và ADMIN không ghi ledger.

## 10. Definition of done cho bản thiết kế

- 5 route có wireframe desktop/mobile: Dashboard, Customers, AI Support, Tasks, Settings.
- Component, token, spacing, radius và icon rules dùng nhất quán.
- Mỗi màn có loading, empty, error, forbidden và read-only states tương ứng.
- Phân biệt rõ P0/P1 và trạng thái chưa triển khai trong backlog.
- Không có impersonation, ledger edit hoặc role self-escalation.
- Dashboard và Customers trace được đến `FR-022`-`FR-024`, `NFR-003`, `NFR-009`, `AC-015`-`AC-017`.
- AI/Tasks/Settings không được gọi là production-ready trước khi `AC-018`-`AC-021` chạy qua runtime thật.

## 11. Quyết định cần khóa trước khi code

1. Brand name/logo và accent green có phải màu chính thức của SmartLedger không.
2. Frontend nằm trong repo này hay repo riêng; framework hiện tại là gì.
3. Field thực tế của `AdminOverviewView`, `AdminUserPage`, `AdminShopPage`, `AdminShopDetailView`.
