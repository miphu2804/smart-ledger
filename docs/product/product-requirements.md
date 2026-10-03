# Yêu cầu sản phẩm

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | Core: hành vi đã chốt dưới đây; AI/dashboard và FE: cần nghiệm thu tích hợp |
| Chủ sở hữu | Chủ sản phẩm |
| Người phê duyệt | Chủ sản phẩm; người rà soát kỹ thuật |
| Cập nhật lần cuối | 2026-10-02 |

## Tài liệu liên quan

- [Yêu cầu kinh doanh](business-requirements.md): kết quả, phạm vi và quy tắc kinh doanh.
- [Mô tả sản phẩm](project-overview.md): định vị sản phẩm.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): hiện thực MVP.
- [Hợp đồng API](../contracts/api-contracts.md): FE ↔ Core và Core ↔ AI.
- [Sơ đồ kiến trúc MVP](../architecture/diagrams/src/architecture.mmd): Mobile, Core, Data, AI và AI infrastructure.
- Nguồn luồng Core/FE ban đầu: [orei1i/EXE201/frontend](https://github.com/orei1i/EXE201/tree/main/frontend), kiểm tra 2026-09-15. Hiện trạng triển khai được ghi trong [thiết kế kỹ thuật](../architecture/technical-design.md).

## 0. Tra nhanh shorthand

| Viết tắt | Nghĩa |
|---|---|
| `AC-*` | Acceptance Criteria — tiêu chí nghiệm thu; xác định yêu cầu đã đạt hay chưa. |
| `AI` | Artificial Intelligence — trí tuệ nhân tạo. |
| `API` | Application Programming Interface — giao diện để các hệ thống trao đổi dữ liệu. |
| `BO-*` | Business Outcome — kết quả kinh doanh được yêu cầu sản phẩm hỗ trợ. |
| `BR-*` | Business Requirement/Rule — yêu cầu hoặc quy tắc kinh doanh làm nguồn cho hành vi. |
| `BRD` | Business Requirements Document — tài liệu yêu cầu kinh doanh. |
| `FR-*` | Functional Requirement — yêu cầu chức năng; mô tả sản phẩm phải làm gì. |
| `FR-INV-*` | Functional Requirement về Invoice — yêu cầu chức năng liên quan đến hóa đơn điện tử. |
| `MVP` | Minimum Viable Product — phiên bản tối thiểu để kiểm chứng giá trị sản phẩm. |
| `NFR-*` | Non-Functional Requirement — yêu cầu chất lượng/phi chức năng, ví dụ an toàn hoặc khả năng truy vết. |
| `OQ-*` | Open Question — câu hỏi còn mở cần chốt trước khi cam kết. |
| `P0/P1` | Mức ưu tiên triển khai; `P0` cao hơn `P1`. |
| `POS` | Point of Sale — hệ thống ghi nhận và quản lý bán hàng tại điểm bán. |
| `PRD` | Product Requirements Document — tài liệu yêu cầu sản phẩm. |
| `STT` | Speech-to-Text — chuyển giọng nói thành văn bản. |
| `UI` | User Interface — giao diện người dùng. |

## 1. Mục tiêu sản phẩm

Cho phép người bán rất nhỏ ghi nhận bán hàng, chi phí và công nợ trên điện thoại, rồi xem báo cáo vận hành; không buộc họ dùng POS/kế toán đầy đủ và không biến đề xuất của hệ thống thành sổ trước khi họ chốt thanh toán.

## 2. Vai trò

- **OWNER — chủ tiệm:** dùng ứng dụng mobile để tạo và vận hành tiệm, ghi nhận giao dịch, quản lý danh mục, công nợ và xem báo cáo.
- **ADMIN — nhân sự hỗ trợ nội bộ:** dùng dashboard web để tra cứu tài khoản/cơ sở khách hàng và xem tổng quan hỗ trợ. ADMIN không giả danh OWNER và không sửa trực tiếp hóa đơn, chi phí, công nợ hoặc tồn kho.

## 3. Luồng MVP chính

1. Người bán đăng nhập bằng Google, số điện thoại OTP hoặc Zalo; nếu chưa có tiệm thì tạo tiệm và ngành hàng.
2. Người bán lập hoặc bổ sung danh mục mặt hàng.
3. Người bán lên đơn bằng text, voice, ảnh, POS hoặc thêm món lẻ.
4. Sản phẩm hiện bản nháp để kiểm tra, sửa số lượng/giá, thêm món chưa có trong danh mục.
5. Người bán chốt thanh toán: tiền mặt, chuyển khoản, hoặc ghi nợ / trả một phần.
6. Sản phẩm lưu bản ghi bán hàng; trừ tồn nếu hàng được theo dõi; ghi nợ nếu chưa thu đủ.
7. Người bán xem lịch sử, chi phí, sổ nợ, báo cáo, gợi ý nhập hàng và hỏi đáp insight.

Khi AI lỗi, text/POS thủ công vẫn phải dùng được. Không output AI nào được tự chốt giao dịch.

Luồng hỗ trợ: ADMIN đăng nhập dashboard web, tìm OWNER hoặc cơ sở khách hàng, xem thông tin cần thiết để hỗ trợ và tổng quan hệ thống. Mọi truy cập nhạy cảm phải được ghi audit.

## 4. Yêu cầu chức năng — MVP đã chấp nhận

| ID | Nguồn | Hành vi quan sát được | Trạng thái |
|---|---|---|---|
| `FR-001` | `BO-001`, `BR-002` | Người bán có thể nhập một câu giao dịch tiếng Việt bằng text. | P0 — MVP |
| `FR-002` | `BO-001`, `BO-002`, `BR-002`, `BR-007` | Sau khi nhập câu, sản phẩm hiện các dòng gồm tên, số lượng, đơn giá, thành tiền; khớp danh mục khi nhận ra; đánh dấu món chưa có trong danh mục. | P0 — MVP |
| `FR-003` | `BR-003` | Giỏ luôn được hiển thị để người bán kiểm tra và sửa trước khi chốt thanh toán. | P0 — MVP |
| `FR-004` | `BR-003`, `BR-006` | Chỉ thao tác chốt thanh toán mới tạo bản ghi bán hàng chính thức; giỏ chưa chốt không vào báo cáo. | P0 — MVP |
| `FR-005` | `BR-006`, `BR-016` | Người bán xem lịch sử, chỉ sửa/hủy draft còn hiệu lực. Sale đã confirm không sửa/xóa cứng; hủy toàn bộ có lý do, hoàn số đã thu, hủy nợ còn lại và chọn rõ có hoàn tồn hay không; lưu lịch sử sale/payment/refund. | P0 — MVP |
| `FR-006` | `BO-003`, `BO-005`, `BR-004`, `BR-005` | Core summary tách doanh thu bán hàng, doanh thu bị hủy, doanh thu ròng, số đơn tạo/hủy, tiền đã thu, tiền hoàn và chi phí theo kỳ; nợ còn là số dư hiện tại. Bán chạy, chuỗi số liệu và lãi ước tính vẫn là đích MVP chưa có trong summary; không coi dòng tiền ròng là lợi nhuận. | P0 — MVP |
| `FR-007` | `BO-003`, `BR-004`, `BR-005`, `BR-011` | Người bán xem gợi ý nhập hàng có giải thích từ dữ liệu đã chốt. | P1 — MVP |
| `FR-008` | `BR-002`, `OQ-001` | Người bán nói để lên đơn/ghi chi; hệ thống chuyển giọng nói thành text và bản nháp để kiểm tra. | P0 — MVP |
| `FR-009` | `BO-002`, `BR-007` | Người bán tạo, cập nhật từng trường và archive mặt hàng (tên, giá, nhóm, tồn, theo dõi tồn). Category thuộc shop dùng nhóm sản phẩm, không phân loại shop. Archive không xóa snapshot sale; không archive category khi còn product active. | P0 — MVP |
| `FR-010` | `BR-009` | OWNER đăng nhập trên mobile và ADMIN đăng nhập trên web bằng Google, số điện thoại OTP hoặc Zalo; các identity cùng người dùng không tạo dữ liệu trùng. | P0 — MVP thí điểm, chưa tuyên bố sẵn sàng sản xuất |
| `FR-011` | `BR-009`, `BR-015` | OWNER tạo/xem/sửa hồ sơ tiệm (tên, ngành, liên hệ), archive tiệm ACTIVE kèm lý do. ADMIN được tạm ngưng/kích hoạt shop; INACTIVE phải có lý do. OWNER vẫn xem được hồ sơ và lý do INACTIVE nhưng không dùng API nghiệp vụ hay archive; shop ARCHIVED không còn hiển thị cho OWNER. | P0 — MVP |
| `FR-012` | `BR-009` | Đã loại khỏi MVP: không có vai trò nhân viên hoặc quản lý thành viên trong mô hình hai vai trò. Giữ mã để không tái sử dụng ID. | Loại khỏi MVP |
| `FR-013` | `BO-001`, `BR-001`, `BR-007` | Người bán chọn hàng từ danh mục, chỉnh số lượng, thêm món nhanh để lập giỏ. | P0 — MVP |
| `FR-014` | `BR-010` | Khi chốt, người bán chọn tiền mặt, chuyển khoản, hoặc ghi nợ; có thể thu một phần. Chuyển khoản là ghi nhận, không phải cổng thanh toán. | P0 — MVP |
| `FR-015` | `BO-005`, `BR-005`, `BR-008`, `BR-016` | Người bán tạo, xem, cập nhật từng trường và archive khoản chi (mô tả, số tiền, nhóm chi, phương thức chi, thời điểm). Retry cùng một lần tạo không ghi hai lần; điền từ câu chi phí thuộc luồng AI cần tích hợp. | P0 — MVP |
| `FR-016` | `BO-005`, `BR-006`, `BR-008`, `BR-016` | Người bán quản lý khách theo ID, xem lịch sử nợ và thu thêm bằng payment append-only; không xóa nợ độc lập hoặc sửa số dư trực tiếp. Hủy sale chỉ hủy số còn nợ và giữ nợ đã trả đủ. Retry trả nợ không ghi payment hai lần. | P0 — MVP |
| `FR-017` | `BR-003`, `BR-011` | Người bán gửi ảnh; hệ thống trả dữ liệu nhận diện thành bản nháp có thể sửa hoặc hủy. | P1 — MVP; loại ảnh đầu tiên chốt trong issue |
| `FR-018` | `BR-003`, `BR-012` | Mỗi đề xuất AI lưu trạng thái, model/version và kết quả đủ để điều tra lỗi; không tự tạo bản ghi nghiệp vụ. | P0 — MVP |
| `FR-019` | `BO-003`, `BR-011`, `BR-012` | RAG chỉ truy xuất dữ liệu của shop đang chọn và trả căn cứ cho recommendation/chat. | P1 — MVP |
| `FR-020` | `BO-003`, `BR-011` | Người bán hỏi về số liệu vận hành; insight chat trả câu trả lời kèm kỳ/phạm vi dữ liệu và không tư vấn thuế. | P1 — MVP |
| `FR-021` | `BR-002`, `BR-003` | Khi AI timeout/lỗi, người bán thấy thông báo và tiếp tục bằng text/POS thủ công. | P0 — MVP |
| `FR-022` | `BR-013`, `BR-014` | ADMIN đăng nhập dashboard web và chỉ vào được khu vực quản trị; OWNER không truy cập được dashboard quản trị. | P0 — MVP |
| `FR-023` | `BR-013`, `BR-014` | ADMIN tìm kiếm, xem danh sách và chi tiết OWNER/cơ sở khách hàng để hỗ trợ; không có thao tác sửa trực tiếp dữ liệu sổ nghiệp vụ. | P0 — MVP |
| `FR-024` | `BO-003`, `BR-013`, `BR-014` | ADMIN xem tổng quan hỗ trợ cấp hệ thống bằng số liệu tổng hợp tối thiểu; không xem nội dung chi tiết ngoài phạm vi hỗ trợ được cấp. | P1 — MVP |
| `FR-025` | `BR-001`, `BR-002` | Sau khi OWNER chủ động đăng nhập trên mobile, Home có phần giới thiệu tùy chọn ba bước về trợ lý, bán hàng/đơn hàng và tổng quan/quản lý tiệm. Người dùng có thể đi tiếp, quay lại, bỏ qua/đóng hoặc mở Chatbot/Giọng nói trực tiếp ở bước đầu. Phần giới thiệu không bật lại khi chỉ khôi phục phiên; trợ lý vẫn truy cập được từ mascot nổi. | P1 — MVP |
| `FR-026` | `BO-003`, `BR-002`, `BR-004` | Trên các tab chính, OWNER có thể chạm mascot nổi để chọn Chatbot, Giọng nói hoặc Gợi ý mở phân tích Hôm nay; giữ để vào Giọng nói trực tiếp và kéo mascot trong vùng an toàn; thả tay thì mascot dính về cạnh trái hoặc phải và giữ nguyên vị trí khi đổi tab. | P1 — MVP |
| `FR-027` | `BO-003`, `BR-012` | OWNER tạo chat riêng với assistant, xem, đổi tên và tiếp tục chat qua các phiên; lịch sử chỉ dùng trong đúng hội thoại và shop, được giữ đến khi OWNER xóa. MVP không tự xóa chat theo TTL. | P1 — MVP |
| `FR-028` | `BO-002`, `BO-005`, `BR-016`, `BR-017` | Core ghi audit thành công cùng transaction cho các thao tác sale, thu/hoàn tiền, nợ, tồn, chi phí, category/product và hồ sơ/trạng thái shop đã triển khai. Mỗi event lưu actor/role, shop, action, đối tượng, thời điểm, requestId và context được phép; các event của cùng request dùng chung requestId. Không có audit thành công khi rollback hoặc ghi thêm event khi replay các luồng theo BR-016; không mở rộng idempotency sang mọi API tạo mới. | P0 — Core MVP; tích hợp FE/staging cần nghiệm thu |
| `FR-029` | `BR-009`, `BR-017` | OWNER tra cứu lịch sử audit chỉ đọc của shop ACTIVE mình sở hữu, mới nhất trước, lọc theo action/đối tượng/khoảng thời gian và phân trang. Không có API tạo/sửa/xóa audit hoặc quyền đọc shop khác. Quy ước request/response và nhóm hành động nằm trong [API contract](../contracts/api-contracts.md#lịch-sử-audit-của-tiệm). | P0 — Core MVP; tích hợp FE/staging cần nghiệm thu |

`FR-001`–`FR-009` giữ nguyên mã. `FR-007` không bị tái sử dụng cho yêu cầu khác.

## 5. Trạng thái bản ghi bán hàng

- Giỏ trên thiết bị và draft `DRAFT` chưa xác nhận không dùng cho báo cáo. Draft còn có `CONFIRMED`, `CANCELLED`, `EXPIRED`; hết hiệu lực sau một tháng từ lúc tạo.
- `saleStatus`: `CONFIRMED` hoặc `VOIDED`. Hủy không xóa sale/item/payment.
- `paymentStatus`: `PAID` đã thu đủ; `DEBT` chưa thu đồng nào; `PARTIAL` đã thu lớn hơn 0 nhưng chưa đủ. Sau void, trạng thái này và số đã thu vẫn là lịch sử, không có nghĩa khách còn nghĩa vụ trả nợ.
- Nợ `OPEN` còn dư; `SETTLED` đã trả đủ; `VOIDED` đã hủy số dư còn lại kèm thời điểm/số tiền hủy. Không đổi nợ đã `SETTLED` thành `VOIDED`.

Khách cùng tên/số điện thoại không tự gộp: chọn `customerId` để dùng cùng hồ sơ. Draft có thể thiếu khách; confirm bán thiếu phải chọn khách active cùng shop hoặc có tên để tạo khách mới, phone tùy chọn. Món tùy ý cần tên/đơn vị/giá/số lượng, không tự tạo product hay tồn kho.

Nguồn lên đơn (`AI` / `POS` / `MANUAL`) chỉ là nhãn nguồn, không thay bước chốt.

Khi nhận diện câu thất bại hoặc không khớp danh mục, sản phẩm không tự chốt. Người bán sửa giỏ, thêm món vào danh mục, hoặc hủy. Lỗi lưu sau khi bấm chốt: không có bản ghi mới và người dùng thấy thông báo hiểu được.

Bản ghi bán hàng trên UI không được mô tả như hóa đơn điện tử hay chứng từ theo nghị định. Copy viện dẫn NĐ trên FE hiện tại là sai phạm vi — phải gỡ, không nghiệm thu như năng lực.

## 6. Yêu cầu ứng viên — hóa đơn điện tử

Các mục này **chưa thuộc delivery scope**. Chỉ chuyển sang P0/P1 sau khi BRD được legal/tax owner phê duyệt.

| ID | Nguồn | Hành vi dự kiến |
|---|---|---|
| `FR-INV-001` | `BR-INV-001` | Admin khai báo hồ sơ áp dụng hóa đơn của cửa hàng; sản phẩm hiển thị trạng thái đã/chưa đủ điều kiện kích hoạt. |
| `FR-INV-002` | `BR-INV-002`, `BR-INV-003` | Với mỗi giao dịch, sản phẩm xác định nghĩa vụ hóa đơn theo bộ quy tắc đã phê duyệt và thu thập thông tin người mua khi cần. |
| `FR-INV-003` | `BR-INV-002` | Khi hóa đơn đến hạn lập, người dùng thấy kết quả rõ ràng: đang xử lý, đã hợp lệ, bị từ chối hoặc cần xử lý lại. |
| `FR-INV-004` | `BR-INV-004` | UI phân biệt thời điểm lập hóa đơn với trạng thái truyền dữ liệu; không mô tả “tổng hợp cuối ngày” như một hóa đơn thay thế nếu chưa được phê duyệt. |
| `FR-INV-005` | `BR-INV-005` | Người dùng có màn hình đối soát các giao dịch thiếu hóa đơn, thất bại hoặc lệch dữ liệu. |
| `FR-INV-006` | `BR-INV-006` | Người dùng có luồng xử lý hóa đơn sai theo nghiệp vụ điều chỉnh/thay thế/hủy đã được phê duyệt. |
| `FR-INV-007` | `BR-INV-007` | Trước khi kích hoạt, sản phẩm hiển thị nhà cung cấp, chi phí/gói sử dụng và trách nhiệm vận hành của cửa hàng. |

## 7. Yêu cầu chất lượng cấp sản phẩm

| ID | Nguồn | Yêu cầu |
|---|---|---|
| `NFR-001` | `BR-003` | Không có đường đi nào cho phép dữ liệu hệ thống đề xuất, chưa được người dùng chốt thanh toán, trở thành bản ghi bán hàng chính thức. |
| `NFR-002` | `BO-001` | Thời gian hoàn tất một giao dịch phải được đo trong pilot; target chốt sau khi có baseline người dùng thật. |
| `NFR-003` | `BR-006`, `BR-009`, `BR-014` | OWNER chỉ đọc/ghi dữ liệu của tiệm mình sở hữu; ADMIN chỉ dùng API quản trị đã cho phép. Không tuyên bố sẵn sàng sản xuất trước khi chứng minh không đọc/ghi sai phạm vi. |
| `NFR-004` | `BR-INV-005` | Nếu có hóa đơn điện tử, retry không được tạo trùng và mọi thất bại phải còn trong hàng chờ đối soát có thể quan sát. |
| `NFR-005` | `BR-005` | Báo cáo không được trình bày lãi/chi/thuế như số liệu kê khai. |
| `NFR-006` | `BR-003` | AI không được tự ghi đơn/chi phí hoặc thay đổi dữ liệu; người dùng phải xác nhận. |
| `NFR-007` | `BR-012` | Truy xuất, vector, cache và trace AI phải cô lập theo `shop_id`; test chéo shop phải trả 403 hoặc không có dữ liệu. |
| `NFR-008` | `BR-012` | Không gửi token, số điện thoại hoặc media thô vào trace; dữ liệu gửi model phải theo cấu hình đã duyệt. |
| `NFR-009` | `BR-014` | ADMIN không thể tự cấp role từ client. Mọi truy cập dữ liệu khách hàng và hành động nhạy cảm của ADMIN phải được ghi audit gồm người thực hiện, mục tiêu, hành động và thời điểm. |

## 8. Tiêu chí nghiệm thu cốt lõi

| ID | Xác minh | Liên kết |
|---|---|---|
| `AC-001` | Với câu khớp một mặt hàng trong danh mục (ví dụ tên + số lượng), sản phẩm hiện dòng tên, số lượng, đơn giá lấy từ danh mục để người dùng kiểm tra. | `FR-001`, `FR-002`, `FR-009` |
| `AC-002` | Người dùng sửa số lượng hoặc giá trên giỏ rồi chốt; lịch sử hiển thị giá trị đã sửa, không phải giá trị đề xuất ban đầu. | `FR-003`, `FR-004`, `FR-005` |
| `AC-003` | Khi không nhận ra món hoặc lưu chốt thất bại, không có bản ghi bán hàng mới và người dùng nhận thông báo hiểu được. | `FR-002`, `NFR-001` |
| `AC-004` | Báo cáo kỳ không tính giỏ chưa chốt. | `FR-006`, `NFR-005` |
| `AC-005` | Chủ tiệm thêm một mặt hàng rồi chọn được trên POS và khớp được khi gõ tên gần đúng. | `FR-009`, `FR-013` |
| `AC-006` | Chốt ghi nợ với tên khách tạo khoản nợ; thu thêm làm giảm số còn lại. | `FR-014`, `FR-016` |
| `AC-007` | Tạo khoản chi làm tăng chi phí kỳ tương ứng; archive loại chi khỏi tổng. Phần giảm lãi ước tính chỉ nghiệm thu khi có chỉ số lợi nhuận; summary Core hiện chưa trả lợi nhuận. | `FR-015`, `FR-006` |
| `AC-008` | Với audio tiếng Việt thuộc bộ test, hệ thống trả transcript và bản nháp; người dùng sửa rồi chốt qua cùng luồng text. | `FR-008`, `FR-003` |
| `AC-009` | Không áp dụng sau quyết định chỉ có OWNER và ADMIN; giữ mã để không tái sử dụng ID. | `FR-012` |
| `AC-010` | Output voice/text/image chỉ tạo bản nháp; hủy bản nháp không tạo invoice hoặc expense. | `FR-017`, `FR-018`, `NFR-006` |
| `AC-011` | AI timeout/lỗi không làm mất input; người dùng chuyển sang text/POS và hoàn tất giao dịch. | `FR-021` |
| `AC-012` | Truy vấn cùng một câu ở shop A không trả sản phẩm, giao dịch hoặc vector của shop B. | `FR-019`, `NFR-007` |
| `AC-013` | Gợi ý nhập hàng nêu mặt hàng, số lượng gợi ý, kỳ dữ liệu và lý do; không tự tạo phiếu nhập. | `FR-007`, `FR-019` |
| `AC-014` | Insight chat trả kỳ/phạm vi dữ liệu hoặc nói rõ không đủ dữ liệu; không trình bày lãi/thuế như kê khai. | `FR-020`, `NFR-005` |
| `AC-015` | OWNER mở URL dashboard quản trị nhận 403 hoặc được đưa về đăng nhập; ADMIN đăng nhập hợp lệ vào được dashboard. | `FR-022`, `NFR-003` |
| `AC-016` | ADMIN tìm và xem được OWNER/cơ sở khách hàng nhưng không có hoặc không gọi được API sửa hóa đơn, chi phí, công nợ và tồn kho. | `FR-023`, `NFR-003` |
| `AC-017` | Khi ADMIN xem chi tiết cơ sở khách hàng, hệ thống tạo bản ghi audit đúng người, cơ sở, hành động và thời điểm; số tổng quan khớp nguồn dữ liệu kiểm thử. | `FR-024`, `NFR-009` |
| `AC-018` | Sau đăng nhập chủ động, OWNER thấy bước trợ lý; “Tiếp” lần lượt hiện bán hàng/đơn hàng rồi tổng quan/quản lý tiệm, “Quay lại” về bước trước, “Bắt đầu”/“Để sau”/đóng vào Home. Chọn Chatbot/Giọng nói ở bước đầu mở đúng màn. Quay lại Home trong cùng phiên hoặc khôi phục phiên không tự mở lại phần giới thiệu. | `FR-025` |
| `AC-019` | Trên tab chính, chạm mascot hiện ba lựa chọn Chatbot, Giọng nói và Gợi ý trong khung nhìn; mỗi lựa chọn mở đúng màn, Gợi ý mở phân tích kỳ Hôm nay. Kéo mascot sang vị trí khác thì thả tay dính vào cạnh trái/phải, giữ đúng vị trí đó ở các tab chính (trừ khi phải nhích lên tránh thanh giỏ ở Bán hàng) và vẫn mở được menu; giữ khoảng 500 ms mở Giọng nói trực tiếp. | `FR-026` |
| `AC-020` | OWNER mở lại một chat sau phiên đăng nhập mới; lịch sử còn nguyên và assistant tiếp tục bằng ngữ cảnh chỉ lấy từ chat đó. | `FR-027` |
| `AC-021` | OWNER không xem, đổi tên, tiếp tục hoặc nhận lịch sử của chat thuộc user/shop khác; chat mới không nhận lịch sử từ chat cũ. | `FR-027`, `NFR-007` |
| `AC-022` | Sau khi OWNER xóa chat, chat không còn trong danh sách, không mở/tiếp tục được và tin nhắn không được đưa vào ngữ cảnh assistant. | `FR-027` |
| `AC-023` | OWNER đổi tên chat bằng tiêu đề 1–255 ký tự; tên mới hiển thị trong danh sách sau khi tải lại. Tiêu đề rỗng hoặc vượt giới hạn bị từ chối. | `FR-027` |
| `AC-024` | Retry trả nợ/tạo chi phí/void sale với cùng key, người dùng và nội dung trả kết quả ban đầu, không lặp tác động. Key khác nội dung bị từ chối; confirm lại cùng draft trả cùng saleId không trừ tồn/tạo payment lần nữa. | `FR-004`, `FR-005`, `FR-015`, `FR-016` |
| `AC-025` | OWNER không lưu trữ được shop đang `INACTIVE`; GET shop vẫn trả lý do, API nghiệp vụ bị chặn. Chỉ ADMIN đổi ACTIVE/INACTIVE; OWNER không tự mở khóa, shop ARCHIVED trả 404 cho OWNER. | `FR-011`, `NFR-003` |
| `AC-026` | Hủy đơn 100.000đ đã thu đủ: sale VOIDED, một refund 100.000đ, giữ nguyên payment/item và lịch sử số đã thu; không có PATCH/DELETE sale chính thức. | `FR-005`, `BR-006` |
| `AC-027` | Hủy đơn 100.000đ đã thu 40.000đ: refund 40.000đ, hủy nợ 60.000đ với audit, outstanding = 0. Chưa thu thì refund null, không tạo refund row. | `FR-005`, `FR-016` |
| `AC-028` | Hủy sau khi khách đã trả đủ giữ debt SETTLED/settledAt; audit hủy nợ vẫn null. Khoản hoàn gồm cả tiền thu lúc chốt và tiền trả nợ sau đó. Không nhận thêm trả nợ sau void. | `FR-005`, `FR-016` |
| `AC-029` | Thiếu/null restockItems bị từ chối. true chỉ hoàn lượng đã trừ theo snapshot; false không đổi kho; món tùy ý không có tồn. Snapshot cũ chưa biết hoặc product không còn theo dõi tồn khiến yêu cầu hoàn tồn bị từ chối toàn bộ. | `FR-005`, `FR-009` |
| `AC-030` | Lỗi confirm/repay/void không để lại sale/payment/refund/nợ/tồn hoặc reservation idempotency một phần. Trả nợ và void đồng thời không deadlock do khóa ngược thứ tự, không hoàn hoặc thu tiền hai lần; test chéo shop không lộ/ghi dữ liệu shop khác. | `FR-004`, `FR-005`, `FR-016`, `NFR-003` |
| `AC-031` | Báo cáo giữ thu tiền ở kỳ receivedAt, hoàn ở kỳ refundedAt và điều chỉnh doanh thu ở kỳ voidedAt. gross − voided = net, có thể âm khi hủy đơn kỳ trước; nợ hiện tại không bị lọc kỳ. Ranh giới kỳ theo giờ Việt Nam. | `FR-006`, `NFR-005` |
| `AC-032` | Confirm thiếu tiền mà không có customerId/tên khách bị từ chối; phone không bắt buộc/trùng không tự gộp. Custom item với productId null cần tên/đơn vị, confirm giữ snapshot và không tạo/trừ tồn product. | `FR-003`, `FR-004`, `FR-013`, `FR-014`, `FR-016` |
| `AC-033` | Với thao tác ghi thành công thuộc các nhóm action trong API contract, đọc/đối chiếu audit thấy đúng actorUserId/actorRole lấy từ ngữ cảnh đã xác thực, shopId, action, entityType/entityId, outcome SUCCESS và thời điểm. ADMIN tạm ngưng/kích hoạt shop được ghi đúng actor ADMIN, không gán cho OWNER; các event trong cùng request dùng chung requestId do server tạo. | `FR-028` |
| `AC-034` | Hủy sale 100.000đ đã thu 40.000đ có audit SALE_VOIDED ghi lý do, receivedVnd/refundedVnd = 40.000đ, cancelledDebtVnd = 60.000đ và lựa chọn restockItems; event refund/hủy nợ/hoàn tồn chỉ xuất hiện khi tác động đó thực sự xảy ra. Tiền và tồn vẫn đối chiếu từ bảng nghiệp vụ, không tính lại từ audit. | `FR-028`, `FR-005`, `FR-016` |
| `AC-035` | Confirm lại cùng draft hoặc replay trả nợ/tạo chi phí/void bằng cùng key và request không tăng số event. Lỗi nghiệp vụ hoặc lỗi ghi audit làm rollback toàn bộ thay đổi nghiệp vụ, audit và reservation idempotency của lần thử; retry sau rollback có thể thực hiện lại và chỉ ghi event cho lần thành công. | `FR-028`, `AC-024`, `AC-030` |
| `AC-036` | OWNER A đọc lịch sử shop B bị từ chối và không lộ event B; ADMIN không dùng API lịch sử OWNER. Thiếu/sai token trả 401; shop INACTIVE hoặc ARCHIVED không đọc được lịch sử qua API này. OWNER vẫn xem lý do INACTIVE qua GET shop theo FR-011, không được mở quyền đọc audit bằng cách đổi X-Shop-Id. | `FR-029`, `FR-011`, `NFR-003` |
| `AC-037` | Lịch sử được sắp createdAt rồi id giảm dần; action/entityId lọc đúng, khoảng thời gian gồm from nhưng không gồm to. Page bắt đầu 0, size mặc định 20 và trong 1–100; không có event khớp trả trang rỗng. Ràng buộc page/size/entityId/khoảng thời gian không hợp lệ trả 400 invalid_audit_query; param sai kiểu hoặc action lạ trả 400 validation_failed theo format lỗi chung. | `FR-029` |
| `AC-038` | Không có API POST/PUT/PATCH/DELETE để tạo/sửa/xóa audit. UPDATE/DELETE/TRUNCATE audit_logs bị trigger V10 từ chối và giữ nguyên lịch sử; đọc lịch sử OWNER không tạo thêm event hoặc thay đổi nghiệp vụ. Trigger không thay thế việc phân quyền DB, schema owner/superuser không được coi là application role an toàn cho production. | `FR-028`, `FR-029` |
| `AC-039` | Metadata chỉ nhận key/kiểu được phép khi ghi; không chứa token, mật khẩu, tên/SĐT khách, transferReference hoặc full request/entity snapshot. Khi đọc, metadata lịch sử có key đã ngừng dùng vẫn đọc được mà không validate lại theo whitelist mới. DB giữ thời điểm, API trả offset +07:00 theo quy ước Core; không có API đổi actor hoặc timestamp audit. | `FR-028`, `FR-029` |
| `AC-INV-001` | Không thể kích hoạt hóa đơn điện tử khi hồ sơ áp dụng hoặc quy tắc pháp lý chưa được phê duyệt/hoàn tất. | `FR-INV-001` |
| `AC-INV-002` | Mỗi giao dịch thuộc diện lập hóa đơn có một trạng thái đối soát và không biến mất khi nhà cung cấp lỗi. | `FR-INV-003`, `FR-INV-005`, `NFR-004` |

## 9. Phạm vi và câu hỏi mở

- `OQ-001` đã chốt: STT thật thuộc đích MVP; FE hiện mới giả lập.
- `FR-017`: phải chốt loại ảnh đầu tiên trong issue trước khi viết parser.
- `FR-010`/`NFR-003`: mô tả mobile Phone/Email, Google/Zalo và admin mock là snapshot FE trước đây, không phải nghiệm thu mới. Core nhận Firebase ID token và ánh xạ UID; chưa có bằng chứng nghiệm thu provider/UI với Firebase thật trong lượt này.
- MVP chỉ có hai vai trò `OWNER` và `ADMIN`; quản lý nhân viên/thành viên (`FR-012`) đã bị loại khỏi phạm vi.
- Toàn bộ `FR-INV-*` bị hoãn cho đến khi `OQ-INV-001`–`OQ-INV-005` trong BRD được giải quyết.
- Máy in và gói dịch vụ ngoài PRD MVP.
- `OQ-002` đã chốt hủy toàn bộ có dấu vết theo BRD. Hoàn tiền/trả hàng từng phần và điều chỉnh kho độc lập chưa triển khai.
- `FR-028`/`FR-029`, `AC-033`–`AC-039` là phạm vi audit Core thành công và lịch sử chỉ đọc của OWNER; không bao gồm màn hình FE, audit lỗi/bảo mật hoặc audit khi ADMIN xem dữ liệu theo `NFR-009`/`AC-017`. Kiểm thử API/DB không tự nghiệm thu các phần ngoài phạm vi đó.
- [Thiết kế kỹ thuật](../architecture/technical-design.md) ghi phạm vi Core đã kiểm chứng; API AI/dashboard, audit khi ADMIN xem dữ liệu, bán chạy/series/lợi nhuận vẫn cần tích hợp; audit_logs cho thao tác ghi đã có trong Core (V10). AC ở trên là điều kiện nghiệm thu sản phẩm, không tự đánh dấu FE/staging/production đã đạt.
