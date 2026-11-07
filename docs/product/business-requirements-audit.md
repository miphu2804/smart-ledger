# Kiểm định business requirements — 2026-11-06

Phụ lục này là bằng chứng rà tĩnh và các phát hiện, không phải nguồn duyệt phạm vi hay chứng nhận UAT. Nền code là staging `494fa6c`; bản tài liệu được kiểm định ban đầu là PR #550 tại `2aeeae1`. Nguồn gồm repo hiện tại, ADR/contract, nội dung chat có trong phiên làm việc và kết quả ba sub-agent chuyên trách.

[BRD](business-requirements.md) sở hữu mục tiêu/quy tắc và quyết định kinh doanh; [PRD](product-requirements.md) sở hữu hành vi/AC. Phụ lục này ghi bằng chứng và giới hạn của lần kiểm định, không thay nguồn trạng thái triển khai ở [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-scope) hoặc [API contracts](../contracts/api-contracts.md).

**Cách dùng trong EXE201:** đây là phụ lục rà soát và backlog, không phải cổng bắt nhóm giải quyết mọi gap trước demo. Ưu tiên phát hiện làm sai dữ liệu/quyền, chặn luồng hoặc gây hiểu nhầm trong kịch bản thực tế. Giữ findings và code đã có, hoãn mở rộng chưa cần theo [BRD](business-requirements.md#3-phạm-vi-kinh-doanh) và [kế hoạch demo](mvp-demo-validation.md).

## 1. Phương pháp và giới hạn

- Ba người rà độc lập theo vai trò Core/nghiệp vụ, AI/chat/privacy và mobile/web; agent chỉ đọc, người tổng hợp kiểm lại phát hiện trước khi sửa tài liệu.
- Đã đọc yêu cầu, controller/service, API client, màn hình, tool/guardrail và quyết định ADR liên quan; kiểm tra cấu trúc/ID/link bằng script. Đây là rà tĩnh, không chạy lại runtime, provider thật, migration hoặc UAT.
- Chỉ có nội dung chat hiện diện trong phiên này và các quyết định đã lưu ở repo; không tìm thấy file xuất lịch sử hội thoại riêng trong danh sách file đã tra. Đã đọc discussion của PR #550 qua GitHub connector: chưa có comment/review. Không suy đoán đã đọc các chat ngoài phạm vi đó.
- Verified áp dụng cho nội dung/file đã đối chiếu; Inferred áp dụng cho tác động hoặc giá trị cần pilot. Sự tồn tại của một file, test hoặc ảnh chụp không tự chứng minh AC đạt.

## 2. Thiếu sót và cách xử lý

Các dòng sau là kết quả review bằng tiếng Việt. “Đã sửa docs” không có nghĩa đã sửa hoặc nghiệm thu code; các gap vận hành/phạm vi chưa duyệt vẫn được giữ để người phụ trách quyết định.

| Mã / mức | Vấn đề và tình huống cụ thể | Bằng chứng | Xử lý trong đợt này / phần còn lại |
|---|---|---|---|
| A01 / P1 | AC-078 yêu cầu mọi dòng không âm, làm mất trường hợp lỗ: bán 100.000đ, vốn 120.000đ, chi 10.000đ phải ra −20.000đ/−30.000đ | [Core lãi](../../backend/core/src/main/java/com/smartledger/core/service/impl/ReportServiceImpl.java), [mobile lãi có dấu](../../frontend/mobile/app/analytics.tsx) | Sửa BR-005/AC-078, giữ số âm cho lãi và tổng ròng; không sửa code hoặc ép về 0 |
| A02 / P1 | Câu NFR-008 “chỉ gửi HoneyHive” lẫn giữa trace và xử lý model; tên/phone người bán gõ vẫn tới model, lịch sử và trace vì bộ lọc không che hai loại này | [InputRedaction](../../backend/ai/src/agent/guardrails/input_redaction.py), [guardrail](../../backend/ai/src/agent/guardrails/service.py), [ADR-0009](../architecture/adr/0009-end-to-end-tracing.md) | Làm rõ NFR-008 và BR-012; không tự cho phép thêm đích xử lý. Gap hiện trạng phải theo OQ-008, chưa chứng minh đáp ứng hạn chế dữ liệu cá nhân |
| A03 / P2 | Lịch sử vẫn xem được không có nghĩa model nhớ mọi tin: ở lượt 40, fact chỉ nói đầu chat có thể ngoài cửa sổ context. Nhánh memory lại nạp fact từ chat khác cùng user/shop | [ADR-0005](../architecture/adr/0005-chat-history-window-without-summary.md), [AI service](../../backend/ai/src/agent/service.py), [contract context](../contracts/api-contracts.md#chat-context) | Đã sửa FR-027/AC-020/AC-021 để tách lưu trữ/context; ngày 2026-11-07 PO duyệt cross-chat memory, thêm FR-040/AC-122–AC-126, chưa nghiệm thu |
| A04 / P1–P2 | Xóa chat không tự xóa trace/provider; tắt memory không xóa fact; khi bật system flag, tài khoản chưa có setting mặc định bật memory | [Xóa chat](../../backend/ai/src/agent/repository.py), [memory settings](../../backend/ai/src/memory/repository.py), [FK cascade](../../supabase/migrations/20261014000000_agent_memories.sql), [Data safety](google-play-data-safety.md) | OQ-006 đã chốt ngày 2026-11-07 (mặc định bật, tắt không xóa fact, xóa từng fact); retention và xóa bên thứ ba còn ở OQ-008. Chỉ xác nhận cascade fact có nguồn trực tiếp và cache chat, không cam kết xóa bên thứ ba |
| A05 / P2 | Bản trước mở lại việc nhóm nợ theo phone dù FR-016/AC-075 đã có; đồng thời chưa nêu checkout không chọn customerId có sẵn. Hai lần bán nợ có thể tạo hai Customer ID cùng phone rồi hiện chung thẻ | [Checkout](../../frontend/mobile/app/checkout.tsx), [nhóm UI](../../frontend/mobile/src/lib/debtGroups.ts), [thu từng khoản](../../frontend/mobile/app/debts.tsx) | Làm rõ BR-008/FR-016: nhóm hiển thị khác identity, thu theo debtId. OQ-005 chỉ còn collision/nhãn, không phủ nhận AC-075; ghi customer selector/CRUD UI chưa hoàn chỉnh |
| A06 / P2 | “Lưu trên máy” chưa cho biết đổi account/tiệm/thiết bị có còn dữ liệu nào; đổi email hồ sơ có thể bị hiểu nhầm đổi tài khoản đăng nhập | [Hồ sơ](../../frontend/mobile/app/profile.tsx), [AppStore](../../frontend/mobile/src/store/AppStore.tsx), [device settings](../../frontend/mobile/src/lib/appSettings.ts) | Thêm ma trận phạm vi lưu ở mục 2.1; cần nghiệm thu đổi account/tiệm/thiết bị và nhãn đồng bộ, không tự cam kết cloud sync |
| A07 / P2 | Chỉ nói “danh mục và giá” bỏ sót giá giao dịch khác catalog, discount/làm tròn và phân biệt thực thu với tiền khách đưa; Core hỗ trợ discount không chứng minh checkout đã có UI | [Contract draft](../contracts/api-contracts.md#draft-and-confirmation), [draft service](../../backend/core/src/main/java/com/smartledger/core/service/impl/SaleDraftServiceImpl.java), [checkout](../../frontend/mobile/app/checkout.tsx) | Bổ sung BR-007/BR-010 và dẫn contract; không mở thêm UI giảm giá hoặc yêu cầu mới từ backend |
| A08 / P2 | “Lưu mặt hàng” và upload ảnh là hai request; lưu Product thành công nhưng ảnh lỗi không rollback Product. Có API avatar/logo không có nghĩa mobile đã có uploader tương ứng | [Lưu Product rồi ảnh](../../frontend/mobile/app/products.tsx), [profile](../../frontend/mobile/app/profile.tsx), [session client](../../frontend/mobile/src/lib/sessionApi.ts) | Ghi đúng mức tích hợp và gap AC frontend: báo lưu phần nào, thử lại không tạo Product trùng; AC-053/054 Core chưa đủ để kết luận UX này đạt |
| A09 / P2 | 55 dòng ID nối được không chứng minh bao phủ đủ: AC-010 không kiểm metadata của FR-018, AC-102 không kiểm privacy model/trace theo NFR-008 | [PRD](product-requirements.md), [bảng truy vết §4](#4-truy-vết-chi-tiết-frnfr-và-ac) | Giữ full mapping nhưng thêm gap ngữ nghĩa ở mục 2.2; không gọi “đầy đủ AC” chỉ từ đếm ID/link |
| A10 / P2 | AC hỏi nhanh/dòng chờ chưa đủ kiểm text dở dang, reset, hủy stream, retry và lịch sử sau lỗi | [Stream router](../../backend/ai/src/agent/router.py), [lưu lượt hoàn tất](../../backend/ai/src/agent/service.py), [contract stream](../contracts/api-contracts.md#chat-answer-stream) | Đề xuất nghiệm thu ở mục 2.2; không tự gọi chat retry là idempotent hoặc tuyên bố UAT từ đọc code |
| A11 / P2 | BRD lẫn inventory source, lease/migration và snapshot nhánh cũ nên khó thấy outcome, quyền quyết định và rule; target BO chưa có kế hoạch đo/owner rõ | Bản BRD PR #550 tại `2aeeae1`, docs/README và CONTRIBUTING | Viết lại BRD theo mục tiêu/role/phạm vi/BR/rủi ro/quyết định, chuyển bằng chứng và full trace sang phụ lục; thêm OQ-007 cho baseline/target |
| A12 / P2 | Luồng chính PRD vẫn nói Zalo luôn “Sắp có” dù FR-010 và code đã theo flag/nền tảng | [Welcome](../../frontend/mobile/app/(auth)/welcome.tsx), [native login](../../frontend/mobile/src/lib/zaloLogin.ts), [web login](../../frontend/mobile/src/lib/zaloLogin.web.ts) | Sửa bước đầu luồng chính để dẫn FR-010; không suy ra LINK/iOS/provider thật đã nghiệm thu |
| A13 / P2 | Bản trước chỉ nói nút xóa mở hướng dẫn, bỏ sót cam kết công khai 30 ngày sau xác minh và phạm vi dữ liệu hứa xóa/giữ | [DataDeletionPage](../../frontend/web/src/pages/legal/DataDeletionPage.tsx), [DELETION_DAYS](../../frontend/web/src/pages/legal/legalConfig.ts) | Ghi nhận đúng cam kết hiện có và người duyệt nội dung Minh Thọ; OQ-008 yêu cầu chỉ định người thực thi, kiểm quy trình/phạm vi/bằng chứng, không xác nhận tuân thủ pháp luật |

### 2.1. Phạm vi dữ liệu đã thấy trong mobile

Đây là snapshot code, không cấp thêm yêu cầu đồng bộ hoặc chính sách lưu dữ liệu. Các nhãn giao diện phải được nghiệm thu để người dùng không hiểu nhầm phạm vi tác động.

| Dữ liệu | Nguồn / phạm vi hiện tại | Điều không được suy ra |
|---|---|---|
| Danh mục, sale/payment/debt/expense, trạng thái tiệm, inbox/audit | Core theo quyền user/tiệm; frontend đọc API | Không lấy mock hoặc một trang list làm toàn sổ; archive không phải xóa toàn bộ dữ liệu |
| Ngân hàng/tài khoản nhận chuyển khoản | Local profile theo tài khoản và tiệm trong AppStore | Không tự đồng bộ Core, sang thiết bị khác hoặc biến thành kết nối ngân hàng |
| Tên/email/Facebook tại hồ sơ mobile | Có phần chỉnh cục bộ trong profile.tsx; trường tiệm được gửi Core khi có thay đổi | Sửa email hiển thị không đổi Firebase login hoặc xác minh email mới |
| Đã đọc/ẩn thông báo cục bộ, tiệm chọn gần nhất | Local profile theo tài khoản; event inbox Core có readAt riêng | “Xóa toàn bộ” trên máy không xóa event Core/thiết bị khác |
| Rung và bật/tắt nhóm thông báo | Settings theo thiết bị, giữ khi đổi tài khoản | Không hứa cách ly theo account hoặc cloud sync; nhóm trạng thái tiệm luôn bật |
| Ảnh Product / logo / avatar | Core có endpoint cả ba; mobile có uploader Product, chưa thấy uploader logo/avatar tương ứng | Không coi avatar chữ hoặc hồ sơ cục bộ là media upload đã tích hợp |

### 2.2. Khoảng trống AC cần chủ sản phẩm/QA hoàn thiện

Các tình huống dưới đây là đề xuất bao phủ yêu cầu hiện có, chưa cấp AC mới hoặc xác nhận đã đạt. Nếu thay đổi phạm vi/quyền xử lý dữ liệu hoặc bật memory thì cần phê duyệt trước khi chốt hành vi mong đợi.

| FR/NFR liên quan | Có AC nào / còn thiếu gì | Tình huống cần kiểm / quyết định | Chủ phụ trách |
|---|---|---|---|
| FR-018 | AC-010 kiểm không tự ghi, chưa kiểm trạng thái/model/version/kết quả proposal | Đề xuất thành công/lỗi/hủy có dữ liệu truy vết đúng; route proposal còn là đích, không đánh dấu đạt | PO + AI/Core |
| NFR-008 / BR-012 | AC-102 chỉ nói log activity, không đủ model/trace AI | Fixture secret/email không tới model/history/trace ở dạng thô; view không lộ liên hệ khách. Với tên/phone người tự gõ, phải chốt OQ-008 trước khi kết luận phạm vi xử lý được phép | PO + chủ dữ liệu + AI |
| FR-020/021/027 | AC-116/118 phủ hỏi nhanh/chờ, thiếu vòng đời stream lỗi | Lỗi trước stream vs error sau delta, reset, hủy trước save, mở lại lịch sử và retry không hiện câu dở dang như hoàn tất; không áp idempotency sale cho chat | QA + AI/FE |
| FR-027 | AC-020/021 đã sửa phân biệt lưu/context, chưa nghiệm thu hệ thống | Mở lại sau đăng nhập, vượt cửa sổ context, chéo user/shop và chat mới; memory đã bật trên production nên kiểm thêm FR-040/AC-122–AC-126 | QA + AI/FE |
| FR-031 | AC-053/054 Core không đủ UX nhiều request | Product lưu thành công nhưng ảnh lỗi: báo đúng phần đã lưu, giữ đường thử lại và không tạo mặt hàng trùng; không giả vờ rollback toàn form | QA + FE |
| FR-010/011/032 | Có AC auth/đổi tiệm/inbox, thiếu kiểm đủ scope cục bộ | Đổi account/tiệm/thiết bị với bank, tên/email, settings và thông báo; phải phân biệt local/Core và nhãn không hứa đồng bộ | PO + QA/FE |
| FR-016 | AC-075 đã chốt nhóm UI, chưa có selector khách cũ trên mobile | Hai customerId chung phone hiển thị nhóm nhưng thu đúng debtId; ghi rõ giới hạn chọn khách cũ, chốt nhãn collision nếu cần | PO + QA/FE |
| BR-012 / OQ-006/008 | Không có AC vận hành end-to-end cho xóa toàn bộ provider | Kiểm cam kết 30 ngày sau xác minh, Firebase/Core/chat/media/memory/audit/backup/trace theo chính sách được duyệt và có người chịu trách nhiệm | Minh Thọ + chủ dữ liệu/vận hành |

Giới hạn số liệu cần giữ khi nghiệm thu: `periodRevenue` trong [homeOverview.ts](../../frontend/mobile/src/lib/homeOverview.ts) đã ghi trường hợp đơn bán hôm qua bị hủy hôm nay làm aggregate “hôm qua” kết hợp trạng thái hiện tại và event kỳ cũ chưa đối soát đủ. Màn Analytics hiện chỉ cho hôm nay/tuần này/tháng này; đợt này không mở thêm màn lịch sử hoặc tự sửa phép tính. Không suy rộng công thức trình bày của AC-078 cho mọi kỳ lịch sử hoặc snapshot xuyên nhiều request.

## 3. Bản đồ bằng chứng code

### Snapshot tính năng tại staging 494fa6c

**Verified:** đã rà tĩnh controller/service Core, route/tool AI, màn hình và API client mobile/web tại `staging` commit `494fa6c`. Bảng dưới là bản đồ tính năng và bằng chứng để rà yêu cầu, không phải một nguồn trạng thái endpoint thứ hai. “Có code” không có nghĩa đã chạy provider thật, bật cờ môi trường, triển khai hoặc đạt AC; các giới hạn triển khai chính thức vẫn ở [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-scope) và [API contracts](../contracts/api-contracts.md). **Inferred:** giá trị kinh doanh và các khoảng trống nghiệm thu nêu dưới đây được suy từ đường code và PRD, chưa đo bằng pilot.

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
| Parse AI và nhận diện ảnh | AI có `DraftService` text không ghi nghiệp vụ; contract draft/audio/image còn là đích, chưa có tuyến tích hợp tương ứng từ Core | [AI draft service](../../backend/ai/src/drafts/service.py), [AI app](../../backend/ai/src/main.py), [contract AI qua Core](../contracts/api-contracts.md#5-ai-through-core) | `FR-017`–`FR-018`, `NFR-006`; `AC-010`; không quảng cáo như luồng đầu-cuối đã hoàn thành |
| Chốt và trạng thái thu | Tiền mặt/chuyển khoản, thu đủ/một phần/ghi nợ; chốt mới sinh sale/payment/debt và tác động tồn, replay không ghi thêm | [Checkout](../../frontend/mobile/app/checkout.tsx), [confirm service](../../backend/core/src/main/java/com/smartledger/core/service/impl/SaleDraftServiceImpl.java) | `BR-003`, `BR-010`, `BR-016` → `FR-004`, `FR-014`; `AC-006`, `AC-024` |
| Lịch sử đơn, hủy và hoàn tiền | Draft sửa/hủy được khi hợp lệ; sale chỉ hủy toàn bộ có lý do, giữ payment, hoàn tiền đã thu và hủy số dư nợ; chọn hoàn tồn rõ ràng | [Đơn hàng](../../frontend/mobile/app/(tabs)/invoices.tsx), [chi tiết](../../frontend/mobile/app/invoice/[id].tsx), [void service](../../backend/core/src/main/java/com/smartledger/core/service/impl/SaleVoidServiceImpl.java) | `BR-006` → `FR-005`; `AC-026`–`AC-030` |
| Khách và công nợ | Customer ID là identity nghiệp vụ; thu nợ append-only theo khoản, không sửa số dư/xóa nợ độc lập. UI đang nhóm theo phone khi có, cần phân biệt nhóm hiển thị với gộp identity | [Công nợ](../../frontend/mobile/app/debts.tsx), [nhóm nợ](../../frontend/mobile/src/lib/debtGroups.ts), [Core debt](../../backend/core/src/main/java/com/smartledger/core/service/impl/DebtServiceImpl.java) | `BR-008`, `BR-009` → `FR-016`; `AC-006`, `AC-075`; quyết định còn mở `OQ-005` |
| Chi phí | Tạo/sửa/archive khoản chi theo nhóm, phương thức và thời điểm; retry tạo không ghi hai lần; không phải sổ kế toán | [Chi phí](../../frontend/mobile/app/expenses.tsx), [Core expense](../../backend/core/src/main/java/com/smartledger/core/service/impl/ExpenseServiceImpl.java) | `BR-005`, `BR-008`, `BR-016` → `FR-015`; `AC-007`, `AC-024` |
| Báo cáo và tổng đơn theo bộ lọc | Tách doanh thu, thu/hoàn tiền, nợ hiện tại; bán chạy, chuỗi ngày và lãi ước tính dùng giá vốn snapshot. Tổng danh sách không phải tiền thực thu; dòng “Hủy đơn” bên chi của mobile không tạo expense | [Phân tích](../../frontend/mobile/app/analytics.tsx), [home totals](../../frontend/mobile/src/lib/homeOverview.ts), [report service](../../backend/core/src/main/java/com/smartledger/core/service/impl/ReportServiceImpl.java) | `BR-004`, `BR-005` → `FR-006`, `FR-033`; `AC-031`–`AC-032`, `AC-049`–`AC-052`, `AC-069`–`AC-073`, `AC-078` |
| Danh sách lớn | Tìm/lọc/sắp xếp trước phân trang; không lấy một trang để suy tổng sổ. Đơn hàng tải thêm và Bán hàng chia trang là hai cách hiển thị | [Paged list](../../frontend/mobile/src/lib/usePagedList.ts), [paged page](../../frontend/mobile/src/lib/usePagedPage.ts), [contract list](../contracts/api-contracts.md#pagination-of-owner-lists) | `FR-033`; `AC-059`–`AC-063`, `AC-068` |
| Thông báo trong app | Inbox, chưa đọc, đánh dấu đọc; tồn thấp/hết hàng theo chu kỳ, hủy sale, trạng thái tiệm. Không cam kết push hoặc tự gửi SMS nhắc nợ | [Thông báo](../../frontend/mobile/app/notifications.tsx), [client](../../frontend/mobile/src/lib/notificationApi.ts), [Core events](../../backend/core/src/main/java/com/smartledger/core/service/impl/NotificationEventServiceImpl.java) | `BR-020` → `FR-032`; `AC-055`–`AC-058` |
| Audit OWNER và chống ghi trùng | Truy vết thao tác đã commit trong đúng tiệm; lỗi rollback không để audit thành công, replay không lặp tiền/tồn/audit; không dùng audit thay sổ | [Audit controller](../../backend/core/src/main/java/com/smartledger/core/controller/AuditLogController.java), [audit writer](../../backend/core/src/main/java/com/smartledger/core/service/impl/AuditLogServiceImpl.java) | `BR-016`, `BR-017` → `FR-028`–`FR-029`; `AC-033`–`AC-039`; có API không chứng minh có màn lịch sử OWNER |
| Hướng dẫn, menu và mascot | Tour lần đầu theo tài khoản/thiết bị, xem lại được; chuyển nhanh, kéo/chạm/giữ Bobi để mở chức năng; không mở thêm role | [Guide](../../frontend/mobile/src/components/GuideTour.tsx), [tab layout](../../frontend/mobile/app/(tabs)/_layout.tsx), [Quản lý](../../frontend/mobile/app/(tabs)/more.tsx) | `BR-001`, `BR-002` → `FR-025`, `FR-026`, `FR-035`; `AC-018`–`AC-019`, `AC-096` |
| Bobi và lịch sử chat | Chat/stream, tạo/xem/đổi tên/xóa hội thoại, tiếp tục đúng user/tiệm; hỏi nhanh từ Đơn hàng, dòng chờ/tool và gợi ý hỏi tiếp; chat không tự tạo giao dịch | [Mobile AI](../../frontend/mobile/app/ai.tsx), [Core proxy](../../backend/core/src/main/java/com/smartledger/core/controller/AgentController.java), [AI router](../../backend/ai/src/agent/router.py) | `BR-011`, `BR-012` → `FR-020`, `FR-021`, `FR-027`; `AC-014`, `AC-020`–`AC-023`, `AC-116`, `AC-118` |
| Hỏi số liệu và gợi ý nhập hàng | Tool chỉ đọc theo shop; không lộ liên hệ khách/mô tả chi. Gợi ý dựa đơn CONFIRMED, nêu kỳ/căn cứ, không tự nhập kho; mặc định kỳ/cover days chưa là chính sách đã duyệt | [Agent tools](../../backend/ai/src/agent/tools.py), [SQL reader](../../backend/ai/src/sql/repository.py), [restock](../../backend/ai/src/restock/service.py) | `BR-004`, `BR-005`, `BR-011`, `BR-012` → `FR-007`, `FR-019`, `FR-020`; `AC-012`–`AC-014`, `AC-076`–`AC-077` |
| Tính toán, biểu đồ và hướng dẫn từ chat | Code có tool tính toán/sandbox giới hạn, hiển thị bảng/biểu đồ và nút mở màn hình theo allowlist; không cấp quyền ghi sổ cho model | [Tools](../../backend/ai/src/agent/tools.py), [sandbox](../../backend/ai/src/sandbox/wrapper.py), [chat renderer](../../frontend/mobile/src/lib/chatMarkdown.ts) | Liên quan `BR-011`/`FR-020`; thiếu FR/AC riêng đầy đủ, theo `OQ-004` |
| Bảo vệ dữ liệu và lỗi AI | Core quyết định user/shop, AI nội bộ kiểm token; guardrail giới hạn input/tool và lọc secret/email trong câu hỏi trước model/trace. Không hứa che mọi dữ liệu cá nhân từ một bộ lọc | [Internal auth](../../backend/ai/src/security.py), [redaction](../../backend/ai/src/agent/guardrails/input_redaction.py), [guardrail service](../../backend/ai/src/agent/guardrails/service.py) | `BR-003`, `BR-012` → `NFR-006`–`NFR-008`; cần nghiệm thu chéo shop, lỗi model/tool và cấu hình provider |
| Ghi nhớ dài hạn | Code có cài đặt bật/tắt, danh sách/xóa memory và nguồn hội thoại; cờ hệ thống mặc định tắt trong code nhưng đã bật trên production. Vector memory không phải RAG toàn bộ sổ | [Memory service](../../backend/ai/src/memory/service.py), [AI UI](../../frontend/mobile/app/ai.tsx), [ADR-0002](../architecture/adr/0002-agent-long-term-memory.md) | `BR-012`; PO duyệt ngày 2026-11-07 theo `OQ-006`, có `FR-040`/`AC-122`–`AC-126`, chưa nghiệm thu |
| ADMIN: đăng nhập, tra cứu và hỗ trợ | Firebase + role ADMIN ACTIVE; hồ sơ OWNER/tiệm, tìm/lọc/phân trang, trạng thái tiệm và audit cá nhân. Không giả danh OWNER hoặc mở sổ | [Admin API](../../frontend/web/src/services/adminApi.ts), [Core customers UI](../../frontend/web/src/pages/admin/core/CoreCustomersPage.tsx), [Core dashboard service](../../backend/core/src/main/java/com/smartledger/core/service/impl/AdminDashboardServiceImpl.java) | `BR-013`–`BR-015` → `FR-022`–`FR-024`, `NFR-009`; `AC-015`–`AC-017`, `AC-040`–`AC-043` |
| ADMIN: tổng quan và growth | Có số lượng/trạng thái hiện tại và API tạo mới từng ngày; web thật chưa gọi growth. Tasks/AI Support của mock không thành nghiệp vụ thật | [Dashboard thật](../../frontend/web/src/pages/admin/core/CoreDashboardPage.tsx), [Core dashboard controller](../../backend/core/src/main/java/com/smartledger/core/controller/AdminDashboardController.java), [web modes](../../frontend/web/README.md#admin-pages) | `BR-013`, `BR-014` → `FR-024`; `AC-097`–`AC-100`; không dùng mock làm nghiệm thu chart |
| Đo hoạt động và quota | Ngày request thành công khác số user tạo mới; telemetry lỗi không chặn sổ. Quota thao tác thành công theo tài khoản khác giới hạn tổng số tiệm/gói trả phí | [Activity guide](../../backend/core/docs/user-daily-activity.md), [quota service](../../backend/core/src/main/java/com/smartledger/core/ratelimit/UserRateLimitService.java) | `BR-023`, `BR-024` → `FR-036`–`FR-037`; `AC-101`–`AC-108`; mặc định tắt, không xác nhận bật shared DB |
| Trang công khai và yêu cầu xóa tài khoản | Landing, chính sách/điều khoản và hướng dẫn yêu cầu xóa; app mở link công khai. Trang hiện cam kết 30 ngày sau xác minh; nút “Xóa tài khoản” không tự gọi API xóa toàn bộ | [Quản lý](../../frontend/mobile/app/(tabs)/more.tsx), [web legal](../../frontend/web/src/pages/legal), [web README](../../frontend/web/README.md#landing-and-legal-pages) | `BR-009` → `FR-010`; `AC-110`; cam kết công khai cần đối chiếu vận hành ở A13/OQ-008, không xác nhận tuân thủ pháp luật |
| Phát hành/cập nhật Android | Code kiểm version manifest và tải/cài APK khi cấu hình; đây là khả năng vận hành quan sát được, không phải gói dịch vụ hoặc cam kết phát hành | [Version check](../../frontend/mobile/src/lib/appUpdate.ts), [native install](../../frontend/mobile/src/lib/appUpdateInstall.native.ts) | Chưa có FR/AC riêng, theo `OQ-004`; không suy ra production đã phát hành |
| Cài đặt và nhắc trên thiết bị | Bật/tắt rung và nhóm thông báo lưu trên máy; nhóm trạng thái tiệm luôn bật. Xóa toàn bộ thông báo chỉ ẩn cục bộ; đơn mới/công nợ/tổng kết thu chi có thông báo tính trên máy, không phải event hoặc push Core | [Cài đặt](../../frontend/mobile/app/settings.tsx), [nhóm thông báo](../../frontend/mobile/app/notification-settings.tsx), [thông báo cục bộ](../../frontend/mobile/src/lib/notifications.ts) | Liên quan `BR-020`/`FR-032`; không cam kết đồng bộ cài đặt hay xóa event Core; nhắc nợ chỉ mở SMS soạn sẵn theo `AC-075` |

Các màn `staff`, `printer`, cài đặt chỉ lưu cục bộ và QR minh họa không chứng minh quản lý nhân viên, kết nối máy in, đồng bộ cấu hình hoặc xử lý thanh toán thật. Nguồn dữ liệu mock, ảnh marketing và sơ đồ đích không thay contract đã triển khai. Các con số về thời gian phản hồi, độ chính xác AI và giá trị pilot vẫn phải được chủ sản phẩm chốt bằng đo lường.


## 4. Truy vết chi tiết FR/NFR và AC

Bảng này nối từng FR/NFR với nguồn BRD và AC đang liên kết trực tiếp trong [PRD](product-requirements.md), không chứng nhận AC đã đạt hoặc bao phủ đủ từng mệnh đề. Trạng thái triển khai giữ tại [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-scope) và [API contracts](../contracts/api-contracts.md); bằng chứng rà code ở mục 3 chỉ có giá trị tại commit đã ghi. Không tái sử dụng mã đã loại khỏi MVP.

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
| `BO-003`, `BR-012` | `FR-027`, `FR-040` | `AC-020`, `AC-021`, `AC-022`, `AC-023`, `AC-116`, `AC-122`–`AC-126` |
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
| `BR-012` | `NFR-007` | `AC-012`, `AC-021`, `AC-122`, `AC-125`, `AC-076`, `AC-077` |
| `BR-012` | `NFR-008` | `AC-102` |
| `BR-014` | `NFR-009` | `AC-017`, `AC-040`, `AC-042`, `AC-043`, `AC-099`, `AC-100` |
| `BR-019` | `NFR-010` | `AC-053`, `AC-054` |

Các ô chưa có AC liên kết trực tiếp là khoảng trống truy vết cần chủ sản phẩm bổ sung; không tự tạo AC hoặc tuyên bố nghiệm thu từ code. Hành vi quan sát ở `OQ-004` và ghi nhớ dài hạn đã được duyệt ở `OQ-006` (2026-11-07, `FR-040`) nhưng chưa nghiệm thu. `AC-012` là tiêu chí cô lập dữ liệu của đích RAG; không dùng nó để tuyên bố RAG danh mục/giao dịch đã được triển khai từ bảng vector ghi nhớ. Các AC hóa đơn hiện có vẫn là đích provisional, chỉ dùng sau khi chủ thuế phê duyệt sáng kiến.
