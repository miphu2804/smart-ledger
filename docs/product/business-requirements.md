# Yêu cầu kinh doanh

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | tạm thời — Core theo FE; AI theo kiến trúc MVP đã chốt |
| Chủ sở hữu | Chủ kinh doanh/sản phẩm |
| Người phê duyệt | Chủ sản phẩm; chủ thuế cho `BR-INV-*` |
| Cập nhật lần cuối | 2026-09-15 |

## Tài liệu liên quan

- [Mô tả sản phẩm](project-overview.md): định vị sản phẩm và ranh giới.
- [Yêu cầu sản phẩm](product-requirements.md): hành vi và tiêu chí nghiệm thu.
- Nguồn luồng Core/FE: [orei1i/EXE201/frontend](https://github.com/orei1i/EXE201/tree/main/frontend), kiểm tra 2026-09-15.

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

Sổ Nghe Lời giúp người bán rất nhỏ ghi nhận bán hàng, chi phí và công nợ với ít thao tác, rồi dùng sổ đó để xem báo cáo và gợi ý vận hành. Luồng Core/FE lấy từ FE hiện có; voice, ảnh, RAG, recommendation và insight chat lấy từ kiến trúc MVP đã chốt. Mở rộng hóa đơn điện tử chỉ được triển khai khi quy tắc tuân thủ đã được phê duyệt.

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
- Danh mục mặt hàng, giá và tồn kho đơn giản.
- Ghi nhận bán hàng bằng câu tiếng Việt (gõ hoặc đường mic UI) hoặc chọn hàng POS, rồi xác nhận khi thanh toán.
- Ghi nhận cách thu: tiền mặt, chuyển khoản, ghi nợ / trả một phần — là trạng thái thu, không phải cổng thanh toán.
- Lịch sử bản ghi bán hàng; sổ chi phí; sổ nợ và thu nợ.
- Báo cáo doanh thu, số đơn, bán chạy, chi phí và lãi ước tính theo kỳ.
- STT/parser AI, đề xuất từ ảnh, gợi ý nhập hàng và hỏi đáp insight có căn cứ.

### Ngoài phạm vi MVP đã chấp nhận

- Kế toán, kê khai thuế hoặc tư vấn thuế chính thức.
- Cổng thanh toán, máy in, gói dịch vụ trả phí.
- Tồn kho đầy đủ theo lô/kho; CRM.
- Phát hành hoặc truyền hóa đơn điện tử thật.

Hóa đơn điện tử là initiative kế tiếp, không mặc nhiên thuộc MVP chỉ vì UI có màn “hóa đơn”.

## 4. Yêu cầu kinh doanh cốt lõi

| ID | Yêu cầu / quy tắc kinh doanh |
|---|---|
| `BR-001` | Sản phẩm ưu tiên cửa hàng rất nhỏ có quy trình bán hàng đơn giản và không bắt người dùng học nghiệp vụ POS/kế toán phức tạp. |
| `BR-002` | Người bán phải có thể ghi nhận giao dịch bằng ngôn ngữ tự nhiên hoặc nhập/chọn tay. |
| `BR-003` | Dữ liệu do hệ thống hoặc AI đề xuất không được trở thành giao dịch chính thức trước khi người bán kiểm tra và chốt thanh toán. |
| `BR-004` | Báo cáo chỉ sử dụng bản ghi bán hàng và chi phí đã chốt, không dùng giỏ chưa thanh toán. |
| `BR-005` | Mọi ước tính về chi phí, lợi nhuận hoặc thuế phải được phân biệt rõ với số liệu kế toán/kê khai chính thức. |
| `BR-006` | Sản phẩm phải bảo vệ dữ liệu doanh thu và giảm rủi ro sửa/xóa nhầm lịch sử. |
| `BR-007` | Cửa hàng có danh mục mặt hàng và giá làm cơ sở lên đơn nhanh và khớp câu bán hàng. |
| `BR-008` | Sổ chi phí và công nợ là ghi nhận vận hành, không phải sổ kế toán. |
| `BR-009` | Dữ liệu bán hàng, chi phí và nợ gắn với cửa hàng và OWNER đã đăng nhập. |
| `BR-010` | Tiền mặt, chuyển khoản và ghi nợ là cách ghi nhận trạng thái thu; sản phẩm không thu hộ hay quyết toán ngân hàng. |
| `BR-011` | Gợi ý và câu trả lời AI phải nêu căn cứ đủ để người bán hiểu; không được trình bày như quyết định kế toán hoặc thuế. |
| `BR-012` | Input, vector, trace và output AI phải được cô lập theo cửa hàng và không làm lộ dữ liệu nhạy cảm sang nhà cung cấp ngoài cấu hình đã duyệt. |
| `BR-013` | ADMIN chỉ dùng web dashboard để hỗ trợ cơ sở khách hàng; không dùng mobile như OWNER và không trực tiếp sửa sổ bán hàng trong MVP. |
| `BR-014` | Mọi lần ADMIN xem dữ liệu hoặc thực hiện hành động hỗ trợ phải được phân quyền và lưu audit. |

`BR-003` giữ nguyên ý: người bán quyết định số liệu được ghi.

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

Tại ngày cập nhật tài liệu:

- [Nghị định 254/2026/NĐ-CP](https://vanban.chinhphu.vn/?docid=218689&pageid=27160) có hiệu lực từ 2026-07-01 và là căn cứ hiện hành cần dùng thay cho việc chỉ dựa vào Nghị định 70/2025/NĐ-CP.
- Điều 4 và Điều 9 của nghị định này được Bộ Tài chính dẫn lại: người bán phải lập hóa đơn điện tử khi bán hàng hóa/cung cấp dịch vụ; thời điểm bán hàng hóa là khi chuyển giao quyền sở hữu/quyền sử dụng, không phụ thuộc đã thu tiền hay chưa. Tham khảo [Hỏi đáp Bộ Tài chính](https://ttcg.mof.gov.vn/hoidapcstc/home/cthoidap/163784).
- Đối tượng hộ/cá nhân kinh doanh bắt buộc áp dụng còn phụ thuộc điều kiện doanh thu và quy định thuế liên quan; tham khảo thông tin Bộ Tài chính về [ngưỡng doanh thu năm 2026](https://www.mof.gov.vn/tin-tuc-tai-chinh/tin-tuc-su-kien-8/ho-ca-nhan-kinh-doanh-co-muc-doanh-thu-nam-tu-1-ty-dong-tro-xuong-khong-phai-nop-thue).

Chưa có bằng chứng pháp lý đủ trong brief để phê duyệt nhận định “khách lẻ không lấy hóa đơn thì được gom các giao dịch thành một bảng tổng hợp thay cho từng hóa đơn”. Chủ thuế phải xác nhận chính xác: loại hóa đơn, đối tượng, thời điểm lập và phương thức truyền dữ liệu.

Copy UI viện dẫn nghị định trên màn bản ghi bán hàng **không** biến thành quy tắc đã duyệt.

## 7. Rủi ro và phụ thuộc

- Quy định có thể thay đổi; phải version hóa bộ quy tắc theo ngày hiệu lực.
- Phân loại sai đối tượng/nghiệp vụ có thể dẫn đến lập thiếu, lập trễ hoặc lập sai hóa đơn.
- Sự cố mạng/nhà cung cấp không được làm mất dấu nghĩa vụ cần xử lý.
- Dữ liệu người mua, số điện thoại và doanh thu là dữ liệu nhạy cảm cần chính sách truy cập, lưu giữ và audit.
- Xóa cứng bản ghi trên MVP làm giảm khả năng truy vết so với `BR-006`; đây là đánh đổi thí điểm, không phải mức sản xuất.
- Hóa đơn điện tử phụ thuộc nhà cung cấp dịch vụ, đăng ký của người bán và quy trình vận hành ngoài ứng dụng.

## 8. Quyết định còn mở

| ID | Câu hỏi | Chủ đề xuất | Trạng thái |
|---|---|---|---|
| `OQ-001` | Voice/STT có phải điều kiện bắt buộc để MVP kiểm chứng giá trị khác biệt không? | Chủ sản phẩm | Đã chốt: có trong đích MVP; FE hiện mới giả lập nên cần nghiệm thu runtime. |
| `OQ-002` | Xóa cứng bản ghi bán hàng/chi phí có đủ cho thí điểm, hay cần hủy có dấu vết trước dữ liệu thật? | Chủ sản phẩm + chủ kỹ thuật | Mở |
| `OQ-003` | Khi nào chuyển khớp câu bán hàng từ ứng dụng sang dịch vụ AI? | Chủ kỹ thuật | Đã chốt: trong MVP; giữ parser FE làm fallback trong giai đoạn tích hợp. |
| `OQ-INV-001` | Hóa đơn điện tử thuộc MVP, thí điểm riêng hay giai đoạn sau? | Chủ sản phẩm | Mở |
| `OQ-INV-002` | Nhóm người bán đầu tiên có hồ sơ pháp lý và ngưỡng doanh thu nào? | Chủ kinh doanh + chủ thuế | Mở |
| `OQ-INV-003` | Với từng nhóm giao dịch, chứng từ nào phải lập và thời hạn truyền dữ liệu là gì? | Chủ thuế | Mở |
| `OQ-INV-004` | Chọn nhà cung cấp nào và ai mua/quản lý gói hóa đơn, chữ ký số, hợp đồng? | Chủ kinh doanh | Mở |
| `OQ-INV-005` | Xử lý bán hàng khi nhà cung cấp/cơ quan thuế gián đoạn như thế nào? | Chủ sản phẩm + chủ thuế | Mở |

## 9. Bàn giao sang PRD

| Nguồn BRD | PRD | Trạng thái |
|---|---|---|
| `BO-001`, `BR-001`, `BR-002` | `FR-001`, `FR-002`, `FR-008`, `FR-013`, `FR-014` | tạm thời — MVP đã chấp nhận |
| `BO-002`, `BR-003`, `BR-004`, `BR-006` | `FR-003`–`FR-005`, `NFR-001`, `NFR-003` | tạm thời — MVP đã chấp nhận |
| `BO-003`, `BR-004`, `BR-005`, `BR-011` | `FR-006`, `FR-007`, `FR-019`, `FR-020` | tạm thời — đích MVP |
| `BO-005`, `BR-005`, `BR-008` | `FR-015`, `FR-016`, `FR-006` | tạm thời — MVP đã chấp nhận |
| `BR-007` | `FR-009`, `FR-013` | tạm thời — MVP đã chấp nhận |
| `BR-009` | `FR-010`, `FR-011`, `NFR-003` | tạm thời — MVP đã chấp nhận; không tuyên bố sẵn sàng sản xuất |
| `BR-013`, `BR-014` | `FR-022`–`FR-024`, `NFR-009` | tạm thời — admin web dashboard trong MVP |
| `BR-010` | `FR-014` | tạm thời — MVP đã chấp nhận |
| `BR-002`, `BR-003`, `BR-011`, `BR-012` | `FR-008`, `FR-017`–`FR-021`, `NFR-006`–`NFR-008` | tạm thời — đích MVP; chưa có FE/runtime để chứng minh |
| `BO-004`, `BR-INV-001`–`BR-INV-008` | `FR-INV-001`–`FR-INV-007` | Hoãn, chờ `OQ-INV-001`–`OQ-INV-005` và phê duyệt pháp lý |
