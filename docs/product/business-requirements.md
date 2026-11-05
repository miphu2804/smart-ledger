# Yêu cầu kinh doanh

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | Phạm vi MVP và quy tắc đã duyệt; đối chiếu code staging, chưa thay nghiệm thu tích hợp |
| Chủ sở hữu | Chủ kinh doanh/sản phẩm |
| Người phê duyệt | Chủ sản phẩm; chủ thuế cho `BR-INV-*` |
| Cập nhật lần cuối | 2026-11-06 (rà Core, AI, mobile, web tại staging `494fa6c`; không rà soát lại căn cứ pháp lý) |

## Tài liệu liên quan

- [Mô tả sản phẩm](project-overview.md): định vị sản phẩm và ranh giới.
- [Yêu cầu sản phẩm](product-requirements.md): hành vi và tiêu chí nghiệm thu.
- [Thiết kế kỹ thuật §1](../architecture/technical-design.md#1-phạm-vi) và [hợp đồng API](../contracts/api-contracts.md): nguồn trạng thái triển khai và boundary từng endpoint.
- [Bản đồ luồng mobile](userflow/README.md): đường đi giữa màn hình, source code và giới hạn ảnh chụp staging.
- Nguồn lịch sử luồng Core/FE: [orei1i/EXE201/frontend](https://github.com/orei1i/EXE201/tree/main/frontend), kiểm tra 2026-09-15.

## 0. Thuật ngữ và mã quy ước

| Viết tắt | Nghĩa |
|---|---|
| `AI` | Artificial Intelligence — trí tuệ nhân tạo. |
| `API` | Application Programming Interface — giao diện để các hệ thống trao đổi dữ liệu. |
| `BO-*` | Business Outcome — kết quả kinh doanh; dấu `*` là số thứ tự. |
| `BR-*` | Business Requirement/Rule — yêu cầu hoặc quy tắc kinh doanh. |
| `BR-INV-*` | Business Requirement/Rule về Invoice — yêu cầu hoặc quy tắc kinh doanh cho hóa đơn. |
| `BRD` | Business Requirements Document — tài liệu yêu cầu kinh doanh. |
| `CRM` | Customer Relationship Management — quản lý quan hệ khách hàng. |
| `MVP` | Minimum Viable Product — phiên bản tối thiểu để kiểm chứng giá trị sản phẩm. |
| `OQ-*` | Open Question — câu hỏi còn mở cần người phụ trách chốt. |
| `POS` | Point of Sale — hệ thống ghi nhận và quản lý bán hàng tại điểm bán. |
| `PRD` | Product Requirements Document — tài liệu yêu cầu sản phẩm. |
| `STT` | Speech-to-Text — chuyển giọng nói thành văn bản. |
| `XML` | Extensible Markup Language — định dạng dữ liệu có cấu trúc. |

## 1. Bối cảnh và mục tiêu

Sổ Nghe Lời giúp người bán rất nhỏ ghi nhận bán hàng, chi phí và công nợ với ít thao tác, rồi dùng sổ đó để xem báo cáo và gợi ý vận hành. Phạm vi được đối chiếu với Core, AI, mobile và web trên `staging`; mục tiêu MVP vẫn bao gồm voice, ảnh, recommendation và insight chat, kể cả phần chưa có API tích hợp. Mở rộng hóa đơn điện tử chỉ được triển khai khi quy tắc tuân thủ đã được phê duyệt.

| ID | Kết quả kinh doanh | Cách đo dự kiến |
|---|---|---|
| `BO-001` | Tăng tỷ lệ giao dịch được người bán ghi nhận | Tỷ lệ giao dịch được ghi nhận trong pilot; mục tiêu chốt sau baseline |
| `BO-002` | Tạo dữ liệu bán hàng đủ tin cậy để xem báo cáo | Tỷ lệ giỏ phải sửa trước khi chốt; tỷ lệ bản ghi thiếu trường bắt buộc |
| `BO-003` | Giúp người bán hiểu số liệu vận hành | Tỷ lệ cửa hàng xem báo cáo/gợi ý; tỷ lệ gợi ý được người dùng mở hoặc sử dụng |
| `BO-004` | Nếu mở rộng hóa đơn: hỗ trợ cửa hàng tuân thủ mà không phải nhập lại giao dịch | Tỷ lệ giao dịch thuộc diện lập hóa đơn được xử lý đúng hạn; số sai lệch khi đối soát |
| `BO-005` | Giảm thất thoát công nợ và chi phí không ghi | Số khoản nợ còn mở được theo dõi; tỷ lệ chi phí được ghi so với ước tính chủ tiệm |

Chủ sở hữu sản phẩm phải chốt target định lượng sau pilot; tài liệu nguồn hiện chưa có baseline đủ để đặt con số có căn cứ.

## 2. Các bên liên quan

- Chủ hộ/cá nhân kinh doanh và người trực tiếp bán hàng.
- Quản trị viên nội bộ hỗ trợ cơ sở khách hàng.
- Product owner và nhóm triển khai Sổ Nghe Lời.
- Kế toán/cố vấn thuế chịu trách nhiệm xác nhận business rules hóa đơn.
- Nhà cung cấp dịch vụ hóa đơn điện tử và cơ quan thuế, nếu mở rộng được duyệt.

## 3. Phạm vi kinh doanh

### Trong phạm vi MVP đã chấp nhận

- Hai role: `OWNER` vận hành cửa hàng trên mobile; `ADMIN` hỗ trợ nhiều cơ sở trên web dashboard.
- Thiết lập và chuyển giữa nhiều tiệm của cùng OWNER; danh mục nhóm hàng/mặt hàng, giá, barcode, ảnh và tồn kho đơn giản theo từng tiệm.
- Ghi nhận bán hàng bằng câu tiếng Việt (gõ hoặc giọng nói), chọn hàng POS hoặc quét barcode, rồi kiểm tra giỏ và xác nhận khi thanh toán; nhận diện từ ảnh vẫn là đích MVP.
- Ghi nhận cách thu: tiền mặt, chuyển khoản, ghi nợ / trả một phần — là trạng thái thu, không phải cổng thanh toán.
- Lịch sử bản ghi bán hàng, hủy toàn bộ có dấu vết; sổ chi phí; hồ sơ khách, sổ nợ và thu nợ.
- Nhập tăng tồn, giảm tồn độc lập có lý do, ngưỡng cảnh báo theo mặt hàng và hộp thông báo trong app.
- Ảnh Product, logo tiệm, avatar; hướng dẫn lần đầu, menu chuyển nhanh, mascot và lịch sử hội thoại Bobi.
- Hỗ trợ ADMIN đọc hồ sơ, tổng quan tạo mới và lịch sử truy cập cá nhân; đo ngày hoạt động và quota thao tác theo các quyết định đã duyệt.
- Lịch sử audit chỉ đọc cho OWNER để truy vết các thao tác ghi Core đã chốt của tiệm; không thay thế sổ tiền, nợ hoặc tồn kho.
- Báo cáo doanh thu, số đơn, bán chạy, chi phí và lãi ước tính theo kỳ.
- STT/parser AI, đề xuất từ ảnh, gợi ý nhập hàng và hỏi đáp insight có căn cứ.

### Ngoài phạm vi MVP đã chấp nhận

- Kế toán, kê khai thuế hoặc tư vấn thuế chính thức.
- Cổng thanh toán, máy in, gói dịch vụ trả phí.
- Tồn kho đầy đủ theo lô/kho, sổ kiểm kê/ledger kho riêng; CRM, vai trò nhân viên hoặc phân quyền thành viên tiệm.
- Hoàn tiền/trả hàng từng phần; tự động thu tiền, gửi SMS/email/push nhắc nợ hoặc tự ghi sổ từ gợi ý AI.
- Tasks/AI Support ADMIN và các số liệu kinh doanh toàn hệ thống chỉ có trong bản mock không trở thành phạm vi thật.
- Phát hành hoặc truyền hóa đơn điện tử thật.

Hóa đơn điện tử là initiative kế tiếp, không mặc nhiên thuộc MVP chỉ vì UI có màn “hóa đơn”.

### 3.1. Đối chiếu phạm vi với codebase — 2026-11-06

**Verified:** đã rà tĩnh controller/service Core, route/tool AI, màn hình và API client mobile/web tại `staging` commit `494fa6c`. Bảng dưới là bản đồ tính năng và bằng chứng để rà yêu cầu, không phải một nguồn trạng thái endpoint thứ hai. “Có code” không có nghĩa đã chạy provider thật, bật cờ môi trường, triển khai hoặc đạt AC; các giới hạn triển khai chính thức vẫn ở [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-phạm-vi) và [API contracts](../contracts/api-contracts.md). **Inferred:** giá trị kinh doanh và các khoảng trống nghiệm thu nêu dưới đây được suy từ đường code và PRD, chưa đo bằng pilot.

| Nhóm tính năng | Giá trị / ranh giới kinh doanh | Bằng chứng code trong repo | Bàn giao sản phẩm |
|---|---|---|---|
| Đăng nhập và hồ sơ OWNER | Email/mật khẩu có xác minh ở app, đặt lại/đổi mật khẩu; Google. Không có role nhân viên hay OTP điện thoại trong luồng hiện tại | [Màn email](../../frontend/mobile/app/(auth)/email.tsx), [đổi mật khẩu](../../frontend/mobile/app/change-password.tsx), [Core session](../../backend/core/src/main/java/com/smartledger/core/controller/AuthController.java) | `BR-009` → `FR-010`; `AC-079`–`AC-080`, `AC-093`, `AC-117` |
| Zalo LOGIN/LINK | LOGIN web/Android có cấu hình; iOS chưa có luồng. Core có LINK chủ động, app chưa có UI LINK; không tự gộp tài khoản | [Màn chào](../../frontend/mobile/app/(auth)/welcome.tsx), [Android](../../frontend/mobile/src/lib/zaloLogin.ts), [web](../../frontend/mobile/src/lib/zaloLogin.web.ts), [Core Zalo](../../backend/core/src/main/java/com/smartledger/core/controller/ZaloAuthController.java) | `BR-022` → `FR-010`; `AC-081`–`AC-092`; cờ build không chứng minh provider/UAT |
| Nhiều tiệm, onboarding và hồ sơ | Tạo/chọn/đổi tiệm của chính OWNER; đổi tiệm bỏ giỏ/draft trên thiết bị, tải lại dữ liệu và tài khoản chuyển khoản theo tiệm; INACTIVE không tự mở lại | [Tạo tiệm](../../frontend/mobile/app/shop-new.tsx), [AppStore](../../frontend/mobile/src/store/AppStore.tsx), [ShopController](../../backend/core/src/main/java/com/smartledger/core/controller/ShopController.java) | `BR-009`, `BR-015` → `FR-011`; `AC-025`, `AC-109` |
| Nhóm hàng và mặt hàng | Tạo/sửa/archive, đơn vị, giá bán/giá vốn, theo dõi tồn; archive giữ lịch sử, nhóm có hàng ACTIVE không được archive | [Product UI](../../frontend/mobile/app/products.tsx), [catalog client](../../frontend/mobile/src/lib/catalogApi.ts), [ProductServiceImpl](../../backend/core/src/main/java/com/smartledger/core/service/impl/ProductServiceImpl.java) | `BR-007` → `FR-009`, `FR-013` |
| Barcode và quét mã | Tra chính xác mã ACTIVE của đúng tiệm; camera/lookup là đường chọn hàng, không tạo sản phẩm giả khi lỗi hoặc không tìm thấy | [Màn Bán hàng](../../frontend/mobile/app/(tabs)/sales.tsx), [lookup](../../frontend/mobile/src/lib/catalogApi.ts), [ProductController](../../backend/core/src/main/java/com/smartledger/core/controller/ProductController.java) | `BR-021` → `FR-034`; `AC-064`–`AC-067`; camera thật cần nghiệm thu riêng |
| Nhập tăng tồn và giảm tồn | Nhập lượng dương để cộng; giảm độc lập bắt buộc lý do, không âm tồn, không tạo chi/nợ/giá vốn. Mobile có stock-in; client catalog chưa có stock-adjustments | [Nhập hàng](../../frontend/mobile/app/products.tsx), [catalog client](../../frontend/mobile/src/lib/catalogApi.ts), [Core stock service](../../backend/core/src/main/java/com/smartledger/core/service/impl/ProductServiceImpl.java) | `BR-018`, `BR-025` → `FR-030`, `FR-038`; `AC-044`–`AC-048`, `AC-111`–`AC-115` |
| Ảnh danh mục, logo và avatar | Media do Core kiểm tra/lưu, URL chỉ đọc; cả ba upload chống ghi trùng, xóa ảnh không xóa đối tượng nghiệp vụ | [Product UI](../../frontend/mobile/app/products.tsx), [media service](../../backend/core/src/main/java/com/smartledger/core/service/impl/MediaServiceImpl.java) | `BR-019` → `FR-031`, `NFR-010`; `AC-053`–`AC-054`; không coi mọi UI upload đã nghiệm thu |
| POS, món lẻ và giỏ | Chọn hàng, chỉnh lượng/giá, thêm món tùy ý; người bán kiểm tra trước khi chốt. Món lẻ không tự tạo tồn | [POS](../../frontend/mobile/app/pos.tsx), [checkout](../../frontend/mobile/app/checkout.tsx), [draft service](../../backend/core/src/main/java/com/smartledger/core/service/impl/SaleDraftServiceImpl.java) | `BR-002`, `BR-003` → `FR-002`–`FR-004`, `FR-013` |
| Đọc đơn / nhập câu | Android có nhận dạng trên thiết bị, web dùng Web Speech API khi hỗ trợ; transcript vẫn qua parser FE, có nhập tay và hỏi lại khi tên món mơ hồ | [Voice](../../frontend/mobile/app/voice.tsx), [speech](../../frontend/mobile/src/lib/speech/core.ts), [parser](../../frontend/mobile/src/lib/parseOrder.ts) | `BR-002`, `BR-003` → `FR-001`, `FR-008`, `FR-021`; `AC-008`, `AC-011`, `AC-074`; không đồng nghĩa API audio AI đã có |
| Parse AI và nhận diện ảnh | AI có `DraftService` text không ghi nghiệp vụ; contract draft/audio/image còn là đích, chưa có tuyến tích hợp tương ứng từ Core | [AI draft service](../../backend/ai/src/drafts/service.py), [AI app](../../backend/ai/src/main.py), [contract AI qua Core](../contracts/api-contracts.md#5-ai-qua-core) | `FR-017`–`FR-018`, `NFR-006`; `AC-010`; không quảng cáo như luồng đầu-cuối đã hoàn thành |
| Chốt và trạng thái thu | Tiền mặt/chuyển khoản, thu đủ/một phần/ghi nợ; chốt mới sinh sale/payment/debt và tác động tồn, replay không ghi thêm | [Checkout](../../frontend/mobile/app/checkout.tsx), [confirm service](../../backend/core/src/main/java/com/smartledger/core/service/impl/SaleDraftServiceImpl.java) | `BR-003`, `BR-010`, `BR-016` → `FR-004`, `FR-014`; `AC-006`, `AC-024` |
| Lịch sử đơn, hủy và hoàn tiền | Draft sửa/hủy được khi hợp lệ; sale chỉ hủy toàn bộ có lý do, giữ payment, hoàn tiền đã thu và hủy số dư nợ; chọn hoàn tồn rõ ràng | [Đơn hàng](../../frontend/mobile/app/(tabs)/invoices.tsx), [chi tiết](../../frontend/mobile/app/invoice/[id].tsx), [void service](../../backend/core/src/main/java/com/smartledger/core/service/impl/SaleVoidServiceImpl.java) | `BR-006` → `FR-005`; `AC-026`–`AC-030` |
| Khách và công nợ | Customer ID là identity nghiệp vụ; thu nợ append-only theo khoản, không sửa số dư/xóa nợ độc lập. UI đang nhóm theo phone khi có, cần phân biệt nhóm hiển thị với gộp identity | [Công nợ](../../frontend/mobile/app/debts.tsx), [nhóm nợ](../../frontend/mobile/src/lib/debtGroups.ts), [Core debt](../../backend/core/src/main/java/com/smartledger/core/service/impl/DebtServiceImpl.java) | `BR-008`, `BR-009` → `FR-016`; `AC-006`, `AC-075`; quyết định còn mở `OQ-005` |
| Chi phí | Tạo/sửa/archive khoản chi theo nhóm, phương thức và thời điểm; retry tạo không ghi hai lần; không phải sổ kế toán | [Chi phí](../../frontend/mobile/app/expenses.tsx), [Core expense](../../backend/core/src/main/java/com/smartledger/core/service/impl/ExpenseServiceImpl.java) | `BR-005`, `BR-008`, `BR-016` → `FR-015`; `AC-007`, `AC-024` |
| Báo cáo và tổng đơn theo bộ lọc | Tách doanh thu, thu/hoàn tiền, nợ hiện tại; bán chạy, chuỗi ngày và lãi ước tính dùng giá vốn snapshot. Tổng danh sách không phải tiền thực thu; dòng “Hủy đơn” bên chi của mobile không tạo expense | [Phân tích](../../frontend/mobile/app/analytics.tsx), [home totals](../../frontend/mobile/src/lib/homeOverview.ts), [report service](../../backend/core/src/main/java/com/smartledger/core/service/impl/ReportServiceImpl.java) | `BR-004`, `BR-005` → `FR-006`, `FR-033`; `AC-031`–`AC-032`, `AC-049`–`AC-052`, `AC-069`–`AC-073`, `AC-078` |
| Danh sách lớn | Tìm/lọc/sắp xếp trước phân trang; không lấy một trang để suy tổng sổ. Đơn hàng tải thêm và Bán hàng chia trang là hai cách hiển thị | [Paged list](../../frontend/mobile/src/lib/usePagedList.ts), [paged page](../../frontend/mobile/src/lib/usePagedPage.ts), [contract list](../contracts/api-contracts.md#phân-trang-danh-sách-owner) | `FR-033`; `AC-059`–`AC-063`, `AC-068` |
| Thông báo trong app | Inbox, chưa đọc, đánh dấu đọc; tồn thấp/hết hàng theo chu kỳ, hủy sale, trạng thái tiệm. Không cam kết push hoặc tự gửi SMS nhắc nợ | [Thông báo](../../frontend/mobile/app/notifications.tsx), [client](../../frontend/mobile/src/lib/notificationApi.ts), [Core events](../../backend/core/src/main/java/com/smartledger/core/service/impl/NotificationEventServiceImpl.java) | `BR-020` → `FR-032`; `AC-055`–`AC-058` |
| Audit OWNER và chống ghi trùng | Truy vết thao tác đã commit trong đúng tiệm; lỗi rollback không để audit thành công, replay không lặp tiền/tồn/audit; không dùng audit thay sổ | [Audit controller](../../backend/core/src/main/java/com/smartledger/core/controller/AuditLogController.java), [audit writer](../../backend/core/src/main/java/com/smartledger/core/service/impl/AuditLogServiceImpl.java) | `BR-016`, `BR-017` → `FR-028`–`FR-029`; `AC-033`–`AC-039`; có API không chứng minh có màn lịch sử OWNER |
| Hướng dẫn, menu và mascot | Tour lần đầu theo tài khoản/thiết bị, xem lại được; chuyển nhanh, kéo/chạm/giữ Bobi để mở chức năng; không mở thêm role | [Guide](../../frontend/mobile/src/components/GuideTour.tsx), [tab layout](../../frontend/mobile/app/(tabs)/_layout.tsx), [Quản lý](../../frontend/mobile/app/(tabs)/more.tsx) | `BR-001`, `BR-002` → `FR-025`, `FR-026`, `FR-035`; `AC-018`–`AC-019`, `AC-096` |
| Bobi và lịch sử chat | Chat/stream, tạo/xem/đổi tên/xóa hội thoại, tiếp tục đúng user/tiệm; hỏi nhanh từ Đơn hàng, dòng chờ/tool và gợi ý hỏi tiếp; chat không tự tạo giao dịch | [Mobile AI](../../frontend/mobile/app/ai.tsx), [Core proxy](../../backend/core/src/main/java/com/smartledger/core/controller/AgentController.java), [AI router](../../backend/ai/src/agent/router.py) | `BR-011`, `BR-012` → `FR-020`, `FR-021`, `FR-027`; `AC-014`, `AC-020`–`AC-023`, `AC-116`, `AC-118` |
| Hỏi số liệu và gợi ý nhập hàng | Tool chỉ đọc theo shop; không lộ liên hệ khách/mô tả chi. Gợi ý dựa đơn CONFIRMED, nêu kỳ/căn cứ, không tự nhập kho; mặc định kỳ/cover days chưa là chính sách đã duyệt | [Agent tools](../../backend/ai/src/agent/tools.py), [SQL reader](../../backend/ai/src/sql/repository.py), [restock](../../backend/ai/src/restock/service.py) | `BR-004`, `BR-005`, `BR-011`, `BR-012` → `FR-007`, `FR-019`, `FR-020`; `AC-012`–`AC-014`, `AC-076`–`AC-077` |
| Tính toán, biểu đồ và hướng dẫn từ chat | Code có tool tính toán/sandbox giới hạn, hiển thị bảng/biểu đồ và nút mở màn hình theo allowlist; không cấp quyền ghi sổ cho model | [Tools](../../backend/ai/src/agent/tools.py), [sandbox](../../backend/ai/src/sandbox/wrapper.py), [chat renderer](../../frontend/mobile/src/lib/chatMarkdown.ts) | Liên quan `BR-011`/`FR-020`; thiếu FR/AC riêng đầy đủ, theo `OQ-004` |
| Bảo vệ dữ liệu và lỗi AI | Core quyết định user/shop, AI nội bộ kiểm token; guardrail giới hạn input/tool và lọc secret/email trong câu hỏi trước model/trace. Không hứa che mọi dữ liệu cá nhân từ một bộ lọc | [Internal auth](../../backend/ai/src/security.py), [redaction](../../backend/ai/src/agent/guardrails/input_redaction.py), [guardrail service](../../backend/ai/src/agent/guardrails/service.py) | `BR-003`, `BR-012` → `NFR-006`–`NFR-008`; cần nghiệm thu chéo shop, lỗi model/tool và cấu hình provider |
| Ghi nhớ dài hạn | Code có cài đặt bật/tắt, danh sách/xóa memory và nguồn hội thoại; sau cờ mặc định tắt. Vector memory không phải RAG toàn bộ sổ | [Memory service](../../backend/ai/src/memory/service.py), [AI UI](../../frontend/mobile/app/ai.tsx), [ADR-0002](../architecture/adr/0002-agent-long-term-memory.md) | `BR-012`; đề xuất chờ PO theo `OQ-006`, chưa có FR/AC được duyệt riêng |
| ADMIN: đăng nhập, tra cứu và hỗ trợ | Firebase + role ADMIN ACTIVE; hồ sơ OWNER/tiệm, tìm/lọc/phân trang, trạng thái tiệm và audit cá nhân. Không giả danh OWNER hoặc mở sổ | [Admin API](../../frontend/web/src/services/adminApi.ts), [Core customers UI](../../frontend/web/src/pages/admin/core/CoreCustomersPage.tsx), [Core dashboard service](../../backend/core/src/main/java/com/smartledger/core/service/impl/AdminDashboardServiceImpl.java) | `BR-013`–`BR-015` → `FR-022`–`FR-024`, `NFR-009`; `AC-015`–`AC-017`, `AC-040`–`AC-043` |
| ADMIN: tổng quan và growth | Có số lượng/trạng thái hiện tại và API tạo mới từng ngày; web thật chưa gọi growth. Tasks/AI Support của mock không thành nghiệp vụ thật | [Dashboard thật](../../frontend/web/src/pages/admin/core/CoreDashboardPage.tsx), [Core dashboard controller](../../backend/core/src/main/java/com/smartledger/core/controller/AdminDashboardController.java), [web modes](../../frontend/web/README.md#trang-quản-trị) | `BR-013`, `BR-014` → `FR-024`; `AC-097`–`AC-100`; không dùng mock làm nghiệm thu chart |
| Đo hoạt động và quota | Ngày request thành công khác số user tạo mới; telemetry lỗi không chặn sổ. Quota thao tác thành công theo tài khoản khác giới hạn tổng số tiệm/gói trả phí | [Activity guide](../../backend/core/docs/user-daily-activity.md), [quota service](../../backend/core/src/main/java/com/smartledger/core/ratelimit/UserRateLimitService.java) | `BR-023`, `BR-024` → `FR-036`–`FR-037`; `AC-101`–`AC-108`; mặc định tắt, không xác nhận bật shared DB |
| Trang công khai và yêu cầu xóa tài khoản | Landing, chính sách/điều khoản và hướng dẫn yêu cầu xóa; app mở link công khai. Không có API tự xóa tài khoản chỉ từ nút “Xóa tài khoản” | [Quản lý](../../frontend/mobile/app/(tabs)/more.tsx), [web legal](../../frontend/web/src/pages/legal), [web README](../../frontend/web/README.md#trang-giới-thiệu-và-trang-pháp-lý) | `BR-009` → `FR-010`; `AC-110`; không bổ sung cam kết pháp lý/thời hạn xử lý từ đợt rà này |
| Phát hành/cập nhật Android | Code kiểm version manifest và tải/cài APK khi cấu hình; đây là khả năng vận hành quan sát được, không phải gói dịch vụ hoặc cam kết phát hành | [Version check](../../frontend/mobile/src/lib/appUpdate.ts), [native install](../../frontend/mobile/src/lib/appUpdateInstall.native.ts) | Chưa có FR/AC riêng, theo `OQ-004`; không suy ra production đã phát hành |
| Cài đặt và nhắc trên thiết bị | Bật/tắt rung và nhóm thông báo lưu trên máy; nhóm trạng thái tiệm luôn bật. Xóa toàn bộ thông báo chỉ ẩn cục bộ; đơn mới/công nợ/tổng kết thu chi có thông báo tính trên máy, không phải event hoặc push Core | [Cài đặt](../../frontend/mobile/app/settings.tsx), [nhóm thông báo](../../frontend/mobile/app/notification-settings.tsx), [thông báo cục bộ](../../frontend/mobile/src/lib/notifications.ts) | Liên quan `BR-020`/`FR-032`; không cam kết đồng bộ cài đặt hay xóa event Core; nhắc nợ chỉ mở SMS soạn sẵn theo `AC-075` |

Các màn `staff`, `printer`, cài đặt chỉ lưu cục bộ và QR minh họa không chứng minh quản lý nhân viên, kết nối máy in, đồng bộ cấu hình hoặc xử lý thanh toán thật. Nguồn dữ liệu mock, ảnh marketing và sơ đồ đích không thay contract đã triển khai. Các con số về thời gian phản hồi, độ chính xác AI và giá trị pilot vẫn phải được chủ sản phẩm chốt bằng đo lường.

## 4. Yêu cầu kinh doanh cốt lõi

Các mục quyết định có ngày bên dưới giữ bối cảnh phê duyệt tại thời điểm đó; nhánh/PR và các bước rollout ghi trong chúng là lịch sử, không phải xác nhận trạng thái runtime ngày rà này. Dùng mục 3.1 để đối chiếu code, thiết kế kỹ thuật/API contract để tra triển khai và PRD để nghiệm thu.

| ID | Yêu cầu / quy tắc kinh doanh |
|---|---|
| `BR-001` | Sản phẩm ưu tiên cửa hàng rất nhỏ có quy trình bán hàng đơn giản và không bắt người dùng học nghiệp vụ POS/kế toán phức tạp. |
| `BR-002` | Người bán phải có thể ghi nhận giao dịch bằng ngôn ngữ tự nhiên hoặc nhập/chọn tay. |
| `BR-003` | Dữ liệu do hệ thống hoặc AI đề xuất không được trở thành giao dịch chính thức trước khi người bán kiểm tra và chốt thanh toán. |
| `BR-004` | Báo cáo không dùng draft chưa xác nhận; tách doanh thu bán hàng, doanh thu bị hủy và doanh thu ròng. Thu tiền và hoàn tiền ghi nhận theo thời điểm phát sinh, không loại khoản thu cũ khi sale bị hủy. |
| `BR-005` | Mọi ước tính về chi phí, lợi nhuận hoặc thuế phải được phân biệt rõ với số liệu kế toán/kê khai chính thức. Lãi ước tính dùng giá vốn được snapshot khi confirm sale; không dùng giá vốn Product hiện tại để viết lại lịch sử và không tự đoán giá vốn thiếu. Báo cáo phải chỉ rõ khi dữ liệu giá vốn chưa đầy đủ. |
| `BR-006` | Sale đã chốt và payment không được xóa cứng hoặc sửa trực tiếp; sai sót xử lý bằng hủy sale có dấu vết, hoàn toàn bộ số đã thu và hủy nghĩa vụ nợ còn lại. Không coi khoản nợ bị hủy là tiền hoàn. |
| `BR-007` | Cửa hàng có danh mục mặt hàng và giá làm cơ sở lên đơn nhanh và khớp câu bán hàng. |
| `BR-008` | Sổ chi phí và công nợ là ghi nhận vận hành, không phải sổ kế toán. |
| `BR-009` | Dữ liệu bán hàng, chi phí, nợ, danh mục và hội thoại gắn với cửa hàng và OWNER đã đăng nhập. Một OWNER có thể có nhiều tiệm; đổi tiệm phải đổi phạm vi dữ liệu, bỏ giỏ/draft trên thiết bị của tiệm cũ và không trộn sổ giữa các tiệm. |
| `BR-010` | Tiền mặt, chuyển khoản và ghi nợ là cách ghi nhận trạng thái thu; sản phẩm không thu hộ hay quyết toán ngân hàng. |
| `BR-011` | Gợi ý và câu trả lời AI phải nêu căn cứ đủ để người bán hiểu; không được trình bày như quyết định kế toán hoặc thuế. |
| `BR-012` | Input, dữ liệu vector nếu có sử dụng, truy xuất dữ liệu, trace và output AI phải được cô lập theo cửa hàng và không làm lộ dữ liệu nhạy cảm sang nhà cung cấp ngoài cấu hình đã duyệt. |
| `BR-013` | ADMIN chỉ dùng web dashboard để hỗ trợ cơ sở khách hàng; không dùng mobile như OWNER và không trực tiếp sửa sổ bán hàng trong MVP. |
| `BR-014` | ADMIN chỉ đọc thông tin tối thiểu để hỗ trợ: danh sách che thông tin liên hệ, chi tiết hồ sơ có liên hệ đầy đủ khi được phân quyền, tổng quan số lượng, số OWNER/tiệm tạo mới theo ngày và lịch sử trạng thái tiệm. Số tạo mới không đại diện cho đăng nhập, mức sử dụng hay doanh thu; trạng thái hiện tại không phải trạng thái lịch sử. Không mở sổ tiền/nợ/tồn hoặc audit nghiệp vụ OWNER. Mọi truy cập thành công và hành động hỗ trợ phải lưu audit; không trả dữ liệu được bảo vệ khi không lưu được audit. ADMIN chỉ xem lịch sử truy cập của chính mình, không dùng quyền hỗ trợ để xem lịch sử ADMIN khác. |
| `BR-015` | OWNER không thể lưu trữ một tiệm đang bị ADMIN tạm ngưng; lý do tạm ngưng phải còn để OWNER biết cách liên hệ hỗ trợ. |
| `BR-016` | Gửi lại cùng một yêu cầu trả nợ, tạo chi phí, hủy sale, nhập kho hoặc giảm tồn độc lập do mạng lỗi không được ghi thu/chi, hoàn tiền hoặc đổi tồn lần nữa. Xác nhận lại cùng draft không được tạo sale/payment hoặc trừ tồn lần nữa. |
| `BR-017` | Các thao tác ghi Core đã chốt về sale, thu/hoàn tiền, nợ, tồn, chi phí, danh mục và hồ sơ/trạng thái tiệm phải có audit thành công cùng giao dịch nghiệp vụ: đúng người thực hiện, tiệm, hành động, đối tượng và thời điểm. Audit chỉ bổ sung, không sửa/xóa lịch sử; lỗi/rollback hoặc replay các luồng được chống ghi trùng theo BR-016 không tạo audit thành công mới. OWNER chỉ tra cứu lịch sử của tiệm ACTIVE mình sở hữu; dữ liệu phụ được giới hạn, không ghi token hoặc thông tin liên hệ khách. Audit không thay thế các bản ghi nghiệp vụ làm nguồn số liệu. |
| `BR-018` | OWNER nhập kho bằng lượng tăng thêm dương cho sản phẩm ACTIVE có theo dõi tồn trong tiệm ACTIVE mình sở hữu. Sửa thông tin sản phẩm không ghi đè số tồn tuyệt đối; nhập kho không tự tạo nghĩa vụ tiền/nợ hay đổi giá vốn. |
| `BR-019` | OWNER có thể lưu một ảnh chính cho Product, logo cho Shop và avatar hồ sơ. Core là bên duy nhất gọi kho media có credential; client không nhận secret hoặc provider public ID. Cả ba upload dùng khóa chống ghi trùng theo contract, retry không tạo thêm thay đổi/audit. Thay/xóa ảnh commit dữ liệu và job dọn asset cũ cùng nhau; cleanup retry sau commit và không xóa asset còn được sử dụng. Avatar là authenticated media; Product/logo có URL công khai. Avatar tùy chỉnh ưu tiên hiển thị nhưng giữ fallback Firebase, bỏ avatar tùy chỉnh trở về fallback. |
| `BR-020` | OWNER có hộp thông báo trong app cho tồn thấp/hết hàng, hủy sale và ADMIN tạm ngưng/kích hoạt tiệm. Ngưỡng tồn thấp tùy từng Product; không tự đặt ngưỡng cho dữ liệu cũ. Thông báo và người nhận commit/rollback cùng nghiệp vụ, retry không tạo trùng; trạng thái đã đọc riêng và giữ lần đọc đầu tiên. Chỉ OWNER hoạt động đọc dữ liệu của mình và tiệm mình sở hữu; tiệm INACTIVE chỉ lộ thông báo trạng thái, ARCHIVED không hiển thị. Notification không thay audit/sổ nghiệp vụ và chưa bao gồm push, email/SMS hay AI reminder. |
| `BR-021` | Barcode là mã định danh tùy chọn của mặt hàng trong tiệm: khớp chính xác, phân biệt hoa thường, giữ chữ/dấu/số 0 đầu. Chỉ sản phẩm ACTIVE giữ quyền dùng mã; archive giải phóng mã cho sản phẩm khác nhưng giữ nguyên sản phẩm và tham chiếu lịch sử sale/draft. OWNER chỉ tra mã trong tiệm ACTIVE mình sở hữu; không dùng danh mục tiệm khác hoặc sản phẩm giả để thay thế kết quả không tìm thấy/lỗi. |
| `BR-022` | OWNER có thể đăng nhập Zalo hoặc chủ động liên kết Zalo vào tài khoản đang sở hữu. Liên kết phải chứng minh quyền sở hữu cả Zalo và tài khoản hiện tại; không tự gộp theo tên/email/ảnh, không chuyển identity đang thuộc tài khoản khác. Đăng nhập lại giữ một tài khoản chuẩn và dữ liệu tiệm; không khôi phục tài khoản bị khóa hoặc nâng quyền. Core tiếp tục chỉ nhận Firebase ID token cho API nghiệp vụ. |
| `BR-023` | Nhóm vận hành đo mức sử dụng bằng ngày có request API nghiệp vụ đã xác thực và thành công, kể cả chỉ đọc. Phân biệt OWNER/ADMIN và tài khoản load test; chỉ lưu mã user/ngày, giữ 90 ngày theo quyết định sản phẩm. Lỗi thống kê không cản nghiệp vụ; không coi số tạo mới, số request, DAU/MAU hoặc dữ liệu thống kê có thể mất khi lỗi là cùng một chỉ số hay sổ audit. |
| `BR-024` | Giới hạn upload ảnh và tạo tiệm theo tài khoản phải dùng chung giữa các instance và giữ qua restart. Chỉ thao tác đã commit tiêu lượt; lỗi/rollback và replay hợp lệ không tiêu thêm. Cửa sổ tạo tiệm là 24 giờ từ request đầu, không theo ngày lịch. Lượt giữ chỗ tạm thời ngăn vượt ngưỡng khi đồng thời; đây không phải giới hạn tổng số tiệm hoặc quota chat AI. |

Truy vết CORE-019 đã được chủ dự án chốt ngày 2026-10-31: `BR-024` → `FR-037` → `AC-104`–`AC-108`; ngưỡng và lỗi API được định nghĩa tại [contract](../contracts/api-contracts.md#giới-hạn-thao-tác-core-019).

`BR-003` giữ nguyên ý: người bán quyết định số liệu được ghi.

### Zalo CORE-015 đã chốt — 2026-10-16

- `BR-009`/`BR-022` bổ sung đăng nhập và liên kết Zalo có xác nhận, không mở thêm role hay tự gộp tiệm. Một Zalo đã LOGIN riêng không tự chuyển sang tài khoản Email/Google/Facebook đã có; cần LINK trước nếu muốn giữ tài khoản đó.
- Đợt này là backend web-popup; người dùng xác nhận LOGIN trên bộ thử local thành công. Không suy ra đã nghiệm thu LINK với provider thật, FE staging hoặc Android/iOS. Chi tiết trạng thái và rollout nằm trong [thiết kế kỹ thuật](../architecture/technical-design.md#zalo-core-015).

### Zalo Android CORE-016 đã chốt — 2026-10-16

- Theo `BR-009`/`BR-022`, Android dùng trình duyệt ngoài/Custom Tabs rồi quay về APK qua HTTPS App Link đã xác minh. Không tích hợp Zalo Android SDK hoặc WebView trong đợt này; LOGIN và LINK giữ cùng tài khoản chuẩn và quy tắc sở hữu của CORE-015.
- Tiếp nối duyệt schema/API, đã duyệt tạo V18 và chuẩn bị cấu hình bật native **staging sau khi merge** trên `feat/zalo-android` (#276). V18 có trong nhánh, chưa áp dụng DB dùng chung hoặc bật trên VPS; runtime mặc định vẫn tắt, production cần phê duyệt riêng. Chưa nghiệm thu APK/provider thật; FE/AI không thuộc thay đổi này. Không suy ra đã hoàn thành rollout chỉ từ việc cấu hình package/chứng chỉ/domain trên Zalo Developer. Ranh giới triển khai tại [thiết kế kỹ thuật](../architecture/technical-design.md#zalo-android-core-016).

### Điều chỉnh giảm tồn CORE-021 — đã duyệt ngày 2026-11-02

| ID | Yêu cầu / quy tắc kinh doanh |
|---|---|
| `BR-025` | OWNER được giảm tồn của sản phẩm ACTIVE có theo dõi tồn trong tiệm ACTIVE mình sở hữu do hàng hỏng, thất thoát hoặc kiểm kho thiếu; nhập số lượng giảm dương và lý do bắt buộc, không nhập số tồn tuyệt đối hoặc để tồn âm. Thao tác không tạo sale/expense/payment/debt/refund hay đổi giá vốn; tồn, audit, cảnh báo và kết quả chống ghi trùng cùng commit/rollback. |

Truy vết: `BO-002`, `BR-009`, `BR-016`, `BR-017`, `BR-025` → `FR-038` → `AC-111`–`AC-115`. CORE-021 #457 mở rộng phạm vi giảm tồn đơn lẻ; không bổ sung sổ kiểm kê, ledger kho riêng, điều chỉnh tăng hoặc hoàn tiền từng phần.

### Barcode Core đã chốt — 2026-10-12

- CORE-012 #159 chọn D1b: unique barcode chỉ trên ACTIVE; không thêm API restore. D4 dùng chi tiết lỗi tùy chọn `productId`/`status`; lỗi tranh chấp ở DB vẫn có thể không có chi tiết. Quy ước cụ thể nằm trong [contract Product](../contracts/api-contracts.md#barcode-core-012).
- `BR-021` không chốt hành vi quét lại giỏ hàng hay nhiều barcode/Product, không nghiệm thu scanner mobile. #162/#165 và quyết định D2/D3 còn do team kiểm tra; test Core và migration V16 trên DB tạm không chứng minh rollout FE/staging đã thành công.

### Nhập kho đơn giản đã chốt — 2026-10-06

- Theo `BR-018`, tồn mới bằng tồn hiện tại cộng số lượng nhập dương. Bật theo dõi từ không theo dõi khởi tạo 0, sau đó nhập kho riêng; tắt theo dõi giữ hành vi xóa số tồn. Tồn ban đầu khi tạo sản phẩm vẫn được phép nhập.
- Nhập kho và bán/hủy đơn phải nhất quán khi đồng thời; cộng tồn, audit và kết quả chống ghi trùng cùng commit/rollback. Không suy ra mua hàng, chi tiền, công nợ nhà cung cấp hoặc cập nhật giá vốn từ thao tác này.
- Gợi ý AI không tự nhập kho. Stock-in không nhận số lượng âm và không bổ sung sổ phiếu nhập, ledger kho riêng hoặc hoàn tiền/trả hàng từng phần; giảm tồn đơn lẻ theo CORE-021 dùng thao tác riêng ở `BR-025`. Cần phối hợp FE theo contract mới, chưa coi kiểm thử Core là nghiệm thu mobile/staging.

### Media hồ sơ và danh mục — đối chiếu lại 2026-11-06

- Core nhận multipart JPEG/PNG tối đa 5 MiB, kích thước 1–2048 px; không tin MIME hoặc tên file do client gửi. `imageUrl`, `logoUrl`, `avatarUrl` chỉ là giá trị đọc; không PATCH URL tự do.
- Cả Product image, Shop logo và avatar đều yêu cầu `Idempotency-Key` khi upload. Avatar có scope USER, hai loại còn lại có scope SHOP; mô tả cũ “avatar chưa có idempotency” không còn đúng với code staging. Reservation, lease/replay và cleanup theo [contract media](../contracts/api-contracts.md#22-product); không suy ra đã nghiệm thu provider thật hoặc tích hợp FE từ code chống ghi trùng.
- `imagePublicId`, `logoPublicId`, `avatarPublicId` chỉ lưu nội bộ. Xóa/thay tạo `media_cleanup_jobs` trong cùng transaction; worker chỉ chạy khi media được bật. Khi Cloudinary tắt/không sẵn sàng, thao tác ghi media trả `503 media_unavailable`; đăng nhập/`GET /me` vẫn thành công và avatar trả null thay vì chặn session.
- Không archive Product/Shop để xóa media; archive giữ lịch sử và URL hiện có. Core không hứa dọn asset mới upload nếu transaction DB thất bại trước khi tạo bản ghi; đó là rủi ro vận hành cần quan sát/dọn provider riêng cho đến khi có outbox upload hoàn chỉnh.
- Core khóa lại và kiểm tra Product/Shop/User vẫn ACTIVE trong transaction ghi sau upload. Nếu tiệm bị INACTIVE/ARCHIVED hoặc user bị DISABLED trong lúc provider đang xử lý, Core rollback cập nhật tham chiếu/audit; asset mới có thể cần dọn vận hành như rủi ro upload nêu trên.

### Quyết định Core đã chốt — 2026-10-02

- Hủy **toàn bộ** sale đã confirm, không xóa lịch sử. Đơn 100.000đ đã thu 40.000đ: ghi hoàn 40.000đ, hủy 60.000đ còn nợ; không ghi 60.000đ vào khoản hoàn tiền. Chưa thu tiền thì không tạo bản ghi refund.
- Nợ còn mở chuyển `VOIDED`, lưu thời điểm và số dư bị hủy. Nợ đã `SETTLED` giữ nguyên trạng thái và thời điểm trả đủ, kể cả khi sale bị hủy sau đó.
- OWNER phải chọn rõ có hoàn tồn hay không. Chỉ hoàn lượng thực sự đã trừ theo snapshot lúc chốt; món tùy ý không có product không tạo tồn. Không tự suy đoán tồn cho lịch sử chưa có snapshot.
- Sale/payment/refund/nợ/tồn và kết quả chống ghi trùng phải nhất quán trong một transaction; lỗi ở bất kỳ bước nào không được để lại thay đổi một phần.
- Khách được định danh bằng `customerId`, không bằng tên/số điện thoại. Tên/số điện thoại có thể trùng; không tự gộp khách. Confirm bán thiếu phải chọn khách hợp lệ hoặc có tên khách để tạo mới; số điện thoại không bắt buộc. Draft và đơn thu đủ có thể không có khách.
- Hủy sale kỳ trước có thể làm doanh thu ròng kỳ hiện tại âm. Nợ còn lại trên tổng quan là số dư hiện tại của toàn shop, không phải số dư cuối kỳ.
- Audit thành công cho các thao tác ghi Core đã có và lịch sử chỉ đọc của OWNER thuộc `BR-017`; nhóm hành động cụ thể nằm trong [API contract](../contracts/api-contracts.md#lịch-sử-audit-của-tiệm). Không yêu cầu log mọi GET của OWNER. Lịch sử OWNER không thay thế audit truy cập hỗ trợ của ADMIN theo `BR-014`; audit lỗi/bảo mật là phạm vi riêng, chưa được nghiệm thu.
- Hoàn tiền/trả hàng từng phần vẫn ngoài phạm vi; nhập tăng tồn theo `BR-018` và giảm tồn độc lập theo `BR-025` là các thao tác riêng, không suy ra từ hủy sale. Chi tiết hành vi/AC nằm trong [PRD](product-requirements.md), không coi kết quả kiểm thử Core là nghiệm thu FE hoặc production.

### Đồng bộ phạm vi hỗ trợ ADMIN — 2026-10-06

- `BR-013`/`BR-014` giới hạn dashboard ở hồ sơ OWNER/tiệm, số lượng hỗ trợ và lịch sử tạm ngưng/kích hoạt. Không bổ sung doanh thu hệ thống, sổ nghiệp vụ, giả danh OWNER, gói dịch vụ hoặc quản lý tác vụ hỗ trợ từ dữ liệu mock của web.
- Audit ADMIN và OWNER dùng chung lưu trữ append-only nhưng khác phạm vi đọc: OWNER không thấy event đọc `ADMIN_*`; ADMIN không thấy event tiền/nợ/tồn của OWNER. Event ADMIN đổi trạng thái tiệm có thể xuất hiện ở cả hai góc nhìn đúng quyền, không tạo hai event cho cùng thao tác.
- Quy ước API/nhóm event nằm trong [hợp đồng dashboard](../contracts/api-contracts.md#7-dashboard-quản-trị--đã-có-trong-core). Hiện trạng và phần tích hợp web còn thiếu nằm trong [thiết kế kỹ thuật](../architecture/technical-design.md#1-phạm-vi); đồng bộ tài liệu không phải nghiệm thu dashboard hoặc môi trường thật.

### Bổ sung tổng quan ADMIN theo ngày — 2026-10-26

Phạm vi ADMIN đã được chủ sản phẩm duyệt bổ sung cho `feat/admin-dashboard-growth`:
giữ bốn thẻ tổng quan, thêm biểu đồ tạo mới OWNER/tiệm theo ngày và biểu đồ trạng thái
tiệm hiện tại, bảng tiệm mới nhất và nhật ký cá nhân. Truy vết `BR-013`/`BR-014` →
`FR-024` → `AC-097`–`AC-100`. Ngành nghề, OWNER chưa có tiệm, doanh thu, tác vụ hỗ trợ
và đo mức sử dụng nằm ngoài đợt này; không suy ra quyền đọc dữ liệu kinh doanh từ
quyền xem biểu đồ. Đây là duyệt phạm vi, không phải nghiệm thu FE/staging.

## 5. Quy tắc kinh doanh cho sáng kiến hóa đơn điện tử

Các mục dưới đây là **provisional** cho đến khi owner pháp lý/thuế phê duyệt.

| ID | Yêu cầu / quy tắc kinh doanh |
|---|---|
| `BR-INV-001` | Chỉ bật nghiệp vụ hóa đơn sau khi xác định hồ sơ người bán: loại chủ thể, ngành nghề, phương pháp thuế, mức doanh thu và trạng thái đăng ký hóa đơn. |
| `BR-INV-002` | Khi pháp luật yêu cầu lập hóa đơn cho một giao dịch, việc người mua chưa thanh toán hoặc không yêu cầu nhận hóa đơn không được tự động loại bỏ nghĩa vụ lập hóa đơn. |
| `BR-INV-003` | Nếu người mua yêu cầu thông tin phục vụ hạch toán/kê khai, hóa đơn phải gắn với đúng giao dịch và chứa thông tin người mua theo quy định đã được duyệt. |
| `BR-INV-004` | “Lập hóa đơn” và “truyền dữ liệu hóa đơn” là hai nghĩa vụ riêng. Không gộp nhiều giao dịch thành một chứng từ thay thế nếu chưa có căn cứ pháp lý hiện hành áp dụng đúng cho nhóm người bán đó. |
| `BR-INV-005` | Hệ thống phải có khả năng đối soát để phát hiện giao dịch phải lập hóa đơn nhưng chưa có kết quả hợp lệ, bị từ chối hoặc truyền thất bại. |
| `BR-INV-006` | Quy trình sai sót phải bao phủ điều chỉnh/thay thế/hủy theo loại hóa đơn và quy định được phê duyệt; không chỉ có luồng tạo mới. |
| `BR-INV-007` | Chi phí gói hóa đơn, chữ ký số và trách nhiệm hợp đồng với nhà cung cấp phải được công bố rõ cho cửa hàng trước khi kích hoạt. |
| `BR-INV-008` | MISA, Viettel hoặc tên API/XML cụ thể là lựa chọn nhà cung cấp/giải pháp, không phải business rule và không được khóa ở BRD. |

## 6. Căn cứ pháp lý cần xác nhận

Các tham chiếu dưới đây giữ mốc pháp lý lịch sử khi soạn tài liệu; đợt rà code ngày 2026-11-06 không xác minh hiệu lực hoặc nội dung của các nguồn này. Chủ thuế phải kiểm tra lại nguồn chính thức và phê duyệt trước khi đưa thành yêu cầu triển khai:

- [Nghị định 254/2026/NĐ-CP](https://vanban.chinhphu.vn/?docid=218689&pageid=27160) được bản soạn trước ghi nhận có hiệu lực từ 2026-07-01; cần chủ thuế xác nhận lại phạm vi áp dụng và quan hệ với Nghị định 70/2025/NĐ-CP.
- Điều 4 và Điều 9 của nghị định này được Bộ Tài chính dẫn lại: người bán phải lập hóa đơn điện tử khi bán hàng hóa/cung cấp dịch vụ; thời điểm bán hàng hóa là khi chuyển giao quyền sở hữu/quyền sử dụng, không phụ thuộc đã thu tiền hay chưa. Tham khảo [Hỏi đáp Bộ Tài chính](https://ttcg.mof.gov.vn/hoidapcstc/home/cthoidap/163784).
- Đối tượng hộ/cá nhân kinh doanh bắt buộc áp dụng còn phụ thuộc điều kiện doanh thu và quy định thuế liên quan; tham khảo thông tin Bộ Tài chính về [ngưỡng doanh thu năm 2026](https://www.mof.gov.vn/tin-tuc-tai-chinh/tin-tuc-su-kien-8/ho-ca-nhan-kinh-doanh-co-muc-doanh-thu-nam-tu-1-ty-dong-tro-xuong-khong-phai-nop-thue).

Chưa có bằng chứng pháp lý đủ trong brief để phê duyệt nhận định “khách lẻ không lấy hóa đơn thì được gom các giao dịch thành một bảng tổng hợp thay cho từng hóa đơn”. Chủ thuế phải xác nhận chính xác: loại hóa đơn, đối tượng, thời điểm lập và phương thức truyền dữ liệu.

Copy UI viện dẫn nghị định trên màn bản ghi bán hàng **không** biến thành quy tắc đã duyệt.

## 7. Rủi ro và phụ thuộc

- Quy định có thể thay đổi; phải version hóa bộ quy tắc theo ngày hiệu lực.
- Phân loại sai đối tượng/nghiệp vụ có thể dẫn đến lập thiếu, lập trễ hoặc lập sai hóa đơn.
- Sự cố mạng/nhà cung cấp không được làm mất dấu nghĩa vụ cần xử lý.
- Dữ liệu người mua, số điện thoại và doanh thu là dữ liệu nhạy cảm cần chính sách truy cập, lưu giữ và audit.
- Xác minh email hiện chặn ở app; Core chưa kiểm `email_verified` theo giới hạn trong PRD. Không mô tả auth hoặc khả năng cô lập dữ liệu là production-ready chỉ từ đường UI, code hay test local.
- FE cần bỏ luồng xóa cứng sale/nợ độc lập và tích hợp hủy có dấu vết theo `BR-006`; chưa có bằng chứng nghiệm thu FE hoặc production cho thay đổi này.
- Hóa đơn điện tử phụ thuộc nhà cung cấp dịch vụ, đăng ký của người bán và quy trình vận hành ngoài ứng dụng.

## 8. Quyết định còn mở

| ID | Câu hỏi | Chủ đề xuất | Trạng thái |
|---|---|---|---|
| `OQ-001` | Voice/STT có phải điều kiện bắt buộc để MVP kiểm chứng giá trị khác biệt không? | Chủ sản phẩm | Đã chốt: có trong đích MVP. Code mobile có STT trên Android và Web Speech API; parse câu vẫn ở FE, không đồng nghĩa API audio/AI proposal đã tích hợp. Nghiệm thu theo nền tảng tại `AC-008`, `AC-074`. |
| `OQ-002` | Xóa cứng hay hủy có dấu vết? | Chủ sản phẩm + chủ kỹ thuật | Đã chốt Core ngày 2026-10-02: sale void + hoàn toàn bộ số đã thu, payment append-only; expense archive. Hoàn từng phần và tích hợp FE chưa nghiệm thu. |
| `OQ-003` | Khi nào chuyển khớp câu bán hàng từ ứng dụng sang dịch vụ AI? | Chủ kỹ thuật | Đã chốt: trong MVP; hiện mobile vẫn gọi parser FE. `DraftService` AI có trong code nhưng route draft/audio còn là đích trong contract; giữ nhập tay/POS và theo dõi `AC-010`–`AC-011`. |
| `OQ-004` | Chuẩn hóa nghiệm thu bảng/biểu đồ, nút mở màn hình, tool tính toán và cập nhật APK đã có code như thế nào? | Chủ sản phẩm + chủ AI/FE | Mở: xem mục 3.1; chưa có bộ FR/AC riêng đầy đủ, không tự nâng thành cam kết MVP. |
| `OQ-005` | Gộp nợ trên UI theo số điện thoại có thể làm hai customerId khác nhau hiện như một khách; có chấp nhận cách trình bày này không? | Chủ sản phẩm + chủ FE/Core | Mở: `FR-016` ghi cách gộp mobile, Core vẫn không tự gộp identity; cần chốt nhãn/nhóm hiển thị và AC, không thay ID hoặc chuyển nghĩa vụ giữa khách. |
| `OQ-006` | Có duyệt ghi nhớ dài hạn thành hành vi sản phẩm, gồm dữ liệu lưu, thời hạn và quyền xóa không? | Chủ sản phẩm | Mở theo ADR-0002; có code sau cờ không thay phê duyệt hoặc nghiệm thu. |
| `OQ-INV-001` | Hóa đơn điện tử thuộc MVP, thí điểm riêng hay giai đoạn sau? | Chủ sản phẩm | Mở |
| `OQ-INV-002` | Nhóm người bán đầu tiên có hồ sơ pháp lý và ngưỡng doanh thu nào? | Chủ kinh doanh + chủ thuế | Mở |
| `OQ-INV-003` | Với từng nhóm giao dịch, chứng từ nào phải lập và thời hạn truyền dữ liệu là gì? | Chủ thuế | Mở |
| `OQ-INV-004` | Chọn nhà cung cấp nào và ai mua/quản lý gói hóa đơn, chữ ký số, hợp đồng? | Chủ kinh doanh | Mở |
| `OQ-INV-005` | Xử lý bán hàng khi nhà cung cấp/cơ quan thuế gián đoạn như thế nào? | Chủ sản phẩm + chủ thuế | Mở |

## 9. Bàn giao sang PRD

Bảng này nối từng FR/NFR với nguồn BRD và AC đang liên kết trực tiếp trong [PRD](product-requirements.md), không chứng nhận AC đã đạt. Trạng thái triển khai giữ tại [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-phạm-vi) và [API contracts](../contracts/api-contracts.md); bằng chứng rà code ở mục 3.1 chỉ có giá trị tại commit đã ghi. Không tái sử dụng mã đã loại khỏi MVP.

| Nguồn BRD theo PRD | FR/NFR | AC liên kết trực tiếp trong PRD |
|---|---|---|
| `BO-001`, `BR-002` | `FR-001` | `AC-001` |
| `BO-001`, `BO-002`, `BR-002`, `BR-007` | `FR-002` | `AC-001`, `AC-003` |
| `BR-003` | `FR-003` | `AC-002`, `AC-008`, `AC-032` |
| `BR-003`, `BR-006` | `FR-004` | `AC-002`, `AC-024`, `AC-030`, `AC-032`, `AC-049` |
| `BR-006`, `BR-016` | `FR-005` | `AC-002`, `AC-024`, `AC-026`, `AC-027`, `AC-028`, `AC-029`, `AC-030`, `AC-034`, `AC-061` |
| `BO-003`, `BO-005`, `BR-004`, `BR-005` | `FR-006` | `AC-004`, `AC-007`, `AC-031`, `AC-049`, `AC-050`, `AC-051`, `AC-052`, `AC-063`, `AC-070`, `AC-073`, `AC-078`, `AC-095` |
| `BO-003`, `BR-004`, `BR-005`, `BR-011` | `FR-007` | `AC-013` |
| `BR-002`, `OQ-001` | `FR-008` | `AC-008`, `AC-074` |
| `BO-002`, `BR-007`, `BR-018` | `FR-009` | `AC-001`, `AC-005`, `AC-029`, `AC-048`, `AC-055`, `AC-060`, `AC-064`, `AC-066`, `AC-095` |
| `BR-009`, `BR-022` | `FR-010` | `AC-079`, `AC-080`, `AC-085`, `AC-086`, `AC-081`, `AC-082`, `AC-083`, `AC-084`, `AC-087`, `AC-088`, `AC-089`, `AC-090`, `AC-091`, `AC-092`, `AC-093`, `AC-110`, `AC-117` |
| `BR-009`, `BR-015` | `FR-011` | `AC-025`, `AC-036`, `AC-043`, `AC-094`, `AC-109` |
| `BR-009` | `FR-012` | `AC-009` (đã loại khỏi MVP) |
| `BO-001`, `BR-001`, `BR-007` | `FR-013` | `AC-005`, `AC-032` |
| `BR-010` | `FR-014` | `AC-006`, `AC-032` |
| `BO-005`, `BR-005`, `BR-008`, `BR-016` | `FR-015` | `AC-007`, `AC-024`, `AC-052`, `AC-061`, `AC-063`, `AC-073` |
| `BO-005`, `BR-006`, `BR-008`, `BR-016` | `FR-016` | `AC-006`, `AC-024`, `AC-027`, `AC-028`, `AC-030`, `AC-032`, `AC-034`, `AC-060`, `AC-063`, `AC-075`, `AC-078` |
| `BR-003`, `BR-011` | `FR-017` | `AC-010` |
| `BR-003`, `BR-012` | `FR-018` | `AC-010` |
| `BO-003`, `BR-011`, `BR-012` | `FR-019` | `AC-012`, `AC-013` |
| `BO-003`, `BR-011`, `BR-012` | `FR-020` | `AC-014`, `AC-076`, `AC-077`, `AC-116`, `AC-118` |
| `BR-002`, `BR-003` | `FR-021` | `AC-011`, `AC-116`, `AC-118` |
| `BR-013`, `BR-014` | `FR-022` | `AC-015`, `AC-040`, `AC-100` |
| `BR-013`, `BR-014` | `FR-023` | `AC-016`, `AC-017`, `AC-040`, `AC-041`, `AC-042`, `AC-043` |
| `BO-003`, `BR-013`, `BR-014` | `FR-024` | `AC-017`, `AC-041`, `AC-043`, `AC-097`, `AC-098`, `AC-099`, `AC-100` |
| `BR-001`, `BR-002` | `FR-025` | `AC-018` |
| `BO-003`, `BR-002`, `BR-004` | `FR-026` | `AC-019` |
| `BO-003`, `BR-012` | `FR-027` | `AC-020`, `AC-021`, `AC-022`, `AC-023`, `AC-116` |
| `BO-002`, `BO-005`, `BR-016`, `BR-017` | `FR-028` | `AC-033`, `AC-034`, `AC-035`, `AC-038`, `AC-039`, `AC-047`, `AC-114` |
| `BR-009`, `BR-017` | `FR-029` | `AC-036`, `AC-037`, `AC-038`, `AC-039`, `AC-042` |
| `BO-002`, `BR-007`, `BR-009`, `BR-016`, `BR-017`, `BR-018` | `FR-030` | `AC-024`, `AC-035`, `AC-044`, `AC-045`, `AC-046`, `AC-047`, `AC-048` |
| `BR-007`, `BR-009`, `BR-017`, `BR-019` | `FR-031` | `AC-053`, `AC-054` |
| `BO-003`, `BR-009`, `BR-020` | `FR-032` | `AC-055`, `AC-056`, `AC-057`, `AC-058`, `AC-114`, `AC-115` |
| `BR-004`, `BR-005`, `BR-006`, `BR-007`, `BR-008`, `BR-009` | `FR-033` | `AC-059`, `AC-060`, `AC-061`, `AC-062`, `AC-063`, `AC-068`, `AC-069`, `AC-070`, `AC-071`, `AC-072` |
| `BO-002`, `BR-007`, `BR-009`, `BR-021` | `FR-034` | `AC-064`, `AC-065`, `AC-066`, `AC-067` |
| `BR-001` | `FR-035` | `AC-096` |
| `BO-003`, `BR-023` | `FR-036` | `AC-101`, `AC-102`, `AC-103` |
| `BR-024` | `FR-037` | `AC-104`, `AC-105`, `AC-106`, `AC-107`, `AC-108` |
| `BO-002`, `BR-009`, `BR-016`, `BR-017`, `BR-025` | `FR-038` | `AC-111`, `AC-112`, `AC-113`, `AC-114`, `AC-115` |
| `BR-INV-001` | `FR-INV-001` | `AC-INV-001` |
| `BR-INV-002`, `BR-INV-003` | `FR-INV-002` | Chưa có AC liên kết trực tiếp; cần chủ sản phẩm chốt |
| `BR-INV-002` | `FR-INV-003` | `AC-INV-002` |
| `BR-INV-004` | `FR-INV-004` | Chưa có AC liên kết trực tiếp; cần chủ sản phẩm chốt |
| `BR-INV-005` | `FR-INV-005` | `AC-INV-002` |
| `BR-INV-006` | `FR-INV-006` | Chưa có AC liên kết trực tiếp; cần chủ sản phẩm chốt |
| `BR-INV-007` | `FR-INV-007` | Chưa có AC liên kết trực tiếp; cần chủ sản phẩm chốt |
| `BR-003` | `NFR-001` | `AC-003` |
| `BO-001` | `NFR-002` | Chưa có AC liên kết trực tiếp; cần chủ sản phẩm chốt |
| `BR-006`, `BR-009`, `BR-014` | `NFR-003` | `AC-015`, `AC-016`, `AC-025`, `AC-030`, `AC-036`, `AC-040`, `AC-041`, `AC-042`, `AC-045`, `AC-050`, `AC-052`, `AC-053`, `AC-057`, `AC-060`, `AC-062`, `AC-065`, `AC-067`, `AC-071`, `AC-072`, `AC-085`, `AC-086`, `AC-081`, `AC-082`, `AC-083`, `AC-084`, `AC-087`, `AC-088`, `AC-089`, `AC-090`, `AC-091`, `AC-092`, `AC-098`, `AC-099`, `AC-100`, `AC-101`, `AC-106`, `AC-107`, `AC-112` |
| `BR-INV-005` | `NFR-004` | `AC-INV-002` |
| `BR-005` | `NFR-005` | `AC-004`, `AC-014`, `AC-031`, `AC-049`, `AC-052`, `AC-063`, `AC-070`, `AC-076` |
| `BR-003` | `NFR-006` | `AC-010` |
| `BR-012` | `NFR-007` | `AC-012`, `AC-021`, `AC-076`, `AC-077` |
| `BR-012` | `NFR-008` | `AC-102` |
| `BR-014` | `NFR-009` | `AC-017`, `AC-040`, `AC-042`, `AC-043`, `AC-099`, `AC-100` |
| `BR-019` | `NFR-010` | `AC-053`, `AC-054` |

Các ô chưa có AC liên kết trực tiếp là khoảng trống truy vết cần chủ sản phẩm bổ sung; không tự tạo AC hoặc tuyên bố nghiệm thu từ code. Hành vi quan sát ở `OQ-004` và ghi nhớ dài hạn ở `OQ-006` vẫn cần duyệt riêng. `AC-012` là tiêu chí cô lập dữ liệu của đích RAG; không dùng nó để tuyên bố RAG danh mục/giao dịch đã được triển khai từ bảng vector ghi nhớ. Các AC hóa đơn hiện có vẫn là đích provisional, chỉ dùng sau khi chủ thuế phê duyệt sáng kiến.
