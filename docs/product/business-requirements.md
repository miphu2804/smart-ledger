# Yêu cầu kinh doanh

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | Quy tắc MVP đã duyệt và sáng kiến còn chờ quyết định được tách riêng; chưa chứng nhận nghiệm thu tích hợp |
| Chủ sở hữu | Chủ kinh doanh/sản phẩm |
| Người phê duyệt | Chủ sản phẩm; chủ thuế/pháp lý cho `BR-INV-*` và nghĩa vụ tuân thủ |
| Cập nhật lần cuối | 2026-11-06 — kiểm định lại với Core, AI, mobile và web tại staging `494fa6c` |

## Tài liệu liên quan

- [Mô tả sản phẩm](project-overview.md): người dùng mục tiêu và định vị.
- [PRD](product-requirements.md): hành vi `FR-*`, chất lượng `NFR-*` và tiêu chí `AC-*`.
- [Thiết kế kỹ thuật §1](../architecture/technical-design.md#1-phạm-vi) và [API contracts](../contracts/api-contracts.md): nguồn duy nhất về trạng thái triển khai và ranh giới endpoint.
- [Phụ lục kiểm định](business-requirements-audit.md): thiếu sót phát hiện, bằng chứng code và truy vết chi tiết; không thay phê duyệt phạm vi.
- [Luồng mobile](userflow/README.md): màn hình và đường đi; ảnh chụp không tự chứng nhận AC.

## 0. Cách đọc và thuật ngữ

`BO-*` là kết quả kinh doanh, `BR-*` là quy tắc, `FR-*`/`NFR-*` là hành vi/chất lượng, `AC-*` là điều kiện nghiệm thu và `OQ-*` là quyết định còn mở. `BR-INV-*` dành cho sáng kiến hóa đơn điện tử. Mã đã cấp không được tái sử dụng; `FR-012`/`AC-009` về nhân viên đã loại khỏi MVP.

BRD quyết định **giá trị, phạm vi và nguyên tắc kinh doanh**; có code không đồng nghĩa đã duyệt yêu cầu, có endpoint không đồng nghĩa UI đã tích hợp, và có kiểm thử cục bộ không đồng nghĩa đã đạt AC trên môi trường tích hợp. Những khả năng quan sát được nhưng chưa có yêu cầu đã duyệt được ghi ở mục 8 và phụ lục, không tự đưa vào phạm vi cam kết.

“Đơn bán hàng”/sale là bản ghi vận hành của tiệm, không phải hóa đơn điện tử hợp lệ. “Ghi nhận chuyển khoản” là ghi người bán đã thu/hoàn tiền, không phải dịch vụ chuyển tiền. “Lãi ước tính” là chỉ số vận hành dựa trên dữ liệu đã ghi, không phải số liệu kế toán hoặc kê khai.

## 1. Vấn đề và kết quả kinh doanh

Sổ Nghe Lời giúp người bán rất nhỏ ghi đủ bán hàng, chi phí và công nợ với ít thao tác, rồi hiểu số liệu của tiệm. Danh mục là cơ sở lên đơn; người bán quyết định dữ liệu chính thức; AI hỗ trợ nhập và giải thích, không thay quyền quyết định hoặc tự sửa sổ.

| ID | Kết quả kinh doanh | Đo trong pilot |
|---|---|---|
| `BO-001` | Tăng tỷ lệ giao dịch được ghi nhận | Tỷ lệ giao dịch thực tế được ghi; thời gian hoàn tất giao dịch và trường hợp phải chuyển nhập tay |
| `BO-002` | Có dữ liệu bán hàng đủ tin cậy | Tỷ lệ giỏ phải sửa trước chốt, giao dịch thiếu trường bắt buộc và sai lệch khi đối chiếu tiền/nợ/tồn |
| `BO-003` | Giúp người bán hiểu và sử dụng số liệu vận hành | Tỷ lệ tiệm xem báo cáo/gợi ý; câu hỏi được trả lời có căn cứ hoặc báo thiếu dữ liệu |
| `BO-004` | Nếu sáng kiến hóa đơn được duyệt, giảm nhập lại và sai lệch tuân thủ | Giao dịch thuộc diện lập hóa đơn được xử lý đúng hạn và số sai lệch đối soát; chưa áp dụng cho MVP hiện tại |
| `BO-005` | Giảm công nợ và chi phí bị bỏ sót | Khoản nợ còn mở được theo dõi, khoản thu gắn đúng nợ và chi phí được ghi so với đối chiếu của chủ tiệm |

Chưa có baseline hoặc target định lượng được duyệt. Chủ sản phẩm chịu trách nhiệm chốt nhóm pilot, cách lấy mẫu, mẫu số và target trước khi kết luận đạt BO; số người dùng mới, DAU/MAU hoặc số request không thay các phép đo này (`OQ-007`).

## 2. Vai trò và trách nhiệm

| Vai trò | Được làm / chịu trách nhiệm | Ranh giới |
|---|---|---|
| OWNER | Tạo/chọn tiệm mình sở hữu, quản lý danh mục, xác nhận bán hàng, chi phí, thu nợ và xem số liệu | Không đọc/ghi tiệm khác, tự mở khóa tiệm hoặc cấp quyền ADMIN |
| ADMIN | Hỗ trợ hồ sơ OWNER/tiệm, tạm ngưng/kích hoạt tiệm và xem tổng quan hỗ trợ | Không giả danh OWNER, mở/sửa sổ tiền/nợ/tồn hoặc đọc lịch sử của ADMIN khác |
| Chủ sản phẩm | Chốt phạm vi, câu hỏi mở, target pilot và kết quả nghiệm thu theo PRD | Không dùng code/mock/ảnh để thay phê duyệt nghiệp vụ |
| Chủ kỹ thuật Core/AI/FE và vận hành | Chứng minh contract, quyền, tính nhất quán và điều kiện rollout | Tính năng sau cờ, migration hoặc cấu hình mẫu không tự bật môi trường dùng chung |
| Chủ thuế/pháp lý và bên vận hành dữ liệu | Xác nhận quy tắc tuân thủ, nguồn chính thức, lưu/xóa dữ liệu và trách nhiệm bên cung cấp | Minh Thọ được ghi là người duyệt nội dung chính sách công khai trong tài liệu hiện có; điều này không tự chỉ định chủ thuế hoặc chứng minh đã có người vận hành/xác nhận hoàn tất xóa dữ liệu |

MVP chỉ có hai role hệ thống OWNER và ADMIN; nhân viên/thành viên tiệm không thuộc phạm vi.

## 3. Phạm vi kinh doanh

### 3.1. Năng lực MVP đã chấp nhận

| Nhóm nghiệp vụ | Giá trị và phạm vi | Quy tắc |
|---|---|---|
| Tiếp cận và quản lý tiệm | Đăng nhập, tạo hồ sơ, nhiều tiệm và chuyển tiệm; thông tin/trạng thái hỗ trợ rõ ràng | `BR-001`, `BR-009`, `BR-015`, `BR-022` |
| Danh mục và tồn đơn giản | Nhóm hàng, mặt hàng, đơn vị/giá, barcode và ảnh; nhập tăng tồn hoặc giảm tồn có lý do | `BR-007`, `BR-018`, `BR-019`, `BR-021`, `BR-025` |
| Ghi nhận bán hàng | Text/voice, chọn POS, quét mã, món lẻ; kiểm tra giỏ, chốt thu đủ/một phần/ghi nợ | `BR-002`, `BR-003`, `BR-010` |
| Sửa sai và bảo toàn lịch sử | Draft chưa chốt được sửa/hủy khi hợp lệ; sale đã chốt chỉ hủy toàn bộ có dấu vết | `BR-006`, `BR-016`, `BR-017` |
| Chi phí, khách và công nợ | Ghi chi, theo dõi nghĩa vụ nợ và thu đúng khoản; không thay sổ kế toán hoặc CRM | `BR-005`, `BR-008`, `BR-009` |
| Báo cáo và hỗ trợ quyết định | Phân biệt doanh thu, thu/hoàn tiền, nợ hiện tại, bán chạy và lãi/lỗ ước tính; AI giải thích có căn cứ | `BR-004`, `BR-005`, `BR-011`, `BR-012` |
| Tiện ích OWNER | Hướng dẫn lần đầu/xem lại, menu chuyển nhanh, mascot Bobi, hội thoại và thông báo trong app | `BR-001`, `BR-011`, `BR-012`, `BR-020` |
| Hỗ trợ và vận hành nền tảng | ADMIN tra cứu hồ sơ/tổng quan tạo mới/audit cá nhân; đo ngày hoạt động và quota thao tác đã duyệt | `BR-013`, `BR-014`, `BR-023`, `BR-024` |

STT/parser AI, nhận diện ảnh thành bản nháp, gợi ý nhập hàng và hỏi đáp có căn cứ thuộc **đích MVP**; từng đường tích hợp có trạng thái riêng tại thiết kế kỹ thuật và API contract. Mobile hiện dùng nhận giọng nói theo nền tảng và parser FE; không coi service parse text trong AI là API audio/ảnh đã tích hợp. Zalo LOGIN khả dụng theo cấu hình web/Android; Core có LINK nhưng app chưa có UI LINK. UI chọn lại khách có sẵn, giảm tồn, logo/avatar và chart growth ADMIN không được coi đã đầy đủ chỉ vì backend có API; bằng chứng ở phụ lục.

### 3.2. Ngoài phạm vi và chưa cam kết

- Kế toán, kê khai hoặc tư vấn thuế chính thức; phát hành/truyền hóa đơn điện tử thật.
- Cổng thanh toán/thu hộ/quyết toán ngân hàng, máy in, gói trả phí và quản lý nhân viên.
- Tồn kho theo lô/nhiều kho, ledger kho/kiểm kê đầy đủ, nghĩa vụ nhà cung cấp hoặc tự đổi giá vốn khi nhập/giảm tồn.
- Trả hàng/hoàn tiền từng phần; tự gửi SMS/email/push nhắc nợ hoặc tự ghi sổ từ AI. Mở SMS soạn sẵn để người bán tự gửi không phải tự động nhắc nợ.
- Tasks/AI Support ADMIN, doanh thu nền tảng và các tác vụ chỉ có trong mock.
- Ghi nhớ dài hạn, chính sách biểu đồ/nút điều hướng/tool tính toán trong chat và cam kết cập nhật APK còn có quyết định riêng ở mục 8; có code không tự bổ sung cam kết MVP.

## 4. Quy tắc kinh doanh

### 4.1. Quyền quyết định, dữ liệu và tiền

| ID | Quy tắc |
|---|---|
| `BR-001` | Ưu tiên cửa hàng rất nhỏ và thao tác dễ hiểu; không bắt người bán học nghiệp vụ POS/kế toán phức tạp. |
| `BR-002` | Người bán ghi nhận bằng ngôn ngữ tự nhiên hoặc nhập/chọn tay; khi nhận diện không chắc chắn phải kiểm tra/sửa được và có đường tiếp tục thủ công. |
| `BR-003` | Đề xuất của hệ thống/AI không thành sổ nếu người bán chưa xác nhận: sale cần chốt thanh toán, khoản chi cần thao tác lưu khoản chi. Hủy đề xuất không sinh giao dịch. |
| `BR-004` | Draft chưa xác nhận không vào báo cáo. Tách giá trị bán, hủy và ròng; tiền thu/hoàn ghi theo thời điểm phát sinh, không bỏ khoản thu cũ vì sale bị hủy. Nợ trên tổng quan là số dư hiện tại của toàn tiệm, không tự gọi là số dư cuối kỳ. |
| `BR-005` | Phân biệt chi phí/lãi ước tính với kế toán/kê khai. Giá vốn dùng snapshot khi chốt, không viết lại lịch sử theo giá vốn Product hiện tại hoặc đoán phần thiếu; phải báo độ đầy đủ. Doanh thu đơn còn hiệu lực trên mobile không âm; lãi/lỗ và các số ròng có thể âm, không ép về 0 để che lỗ. |
| `BR-006` | Không xóa cứng/sửa trực tiếp sale đã chốt hoặc payment. Hủy toàn bộ phải có lý do, giữ lịch sử, ghi hoàn toàn bộ tiền đã thu, hủy chỉ nghĩa vụ nợ còn lại và chọn rõ có hoàn tồn. Nợ đã trả đủ giữ lịch sử SETTLED; không coi số dư nợ bị hủy là tiền hoàn. |
| `BR-007` | Danh mục và giá là cơ sở lên đơn; người bán kiểm tra giá giao dịch trước khi chốt. Giá dòng có thể khác catalog; giảm giá, làm tròn và tổng hợp tiền tuân theo contract hiện có, không tự suy ra UI giảm giá đã có. Archive danh mục không xóa snapshot giao dịch. |
| `BR-008` | Chi phí/công nợ là sổ vận hành. Khách và khoản nợ được định danh bằng ID; tên/phone không unique và không tự gộp identity. Nhóm hiển thị cùng phone trên mobile không đổi ID, khoản nợ hoặc người chịu nghĩa vụ; mỗi lần thu gắn đúng khoản được chọn. Không sửa số dư hoặc xóa nợ độc lập. |
| `BR-009` | Dữ liệu nghiệp vụ và hội thoại gắn đúng OWNER/tiệm. Một OWNER có nhiều tiệm; đổi tiệm phải đổi phạm vi dữ liệu và bỏ giỏ/draft trên thiết bị của tiệm cũ. Không coi tùy chọn/hồ sơ chỉ lưu cục bộ là đã đồng bộ tài khoản hoặc nhiều thiết bị. |
| `BR-010` | Tiền mặt, chuyển khoản và ghi nợ chỉ mô tả cách/trạng thái thu. Tiền thực thu khác tiền khách đưa trước trả thừa; không ghi tiền chưa thu như đã thu và không tự chuyển/hoàn tiền qua ngân hàng. |

Đơn 100.000đ đã thu 40.000đ khi hủy: ghi hoàn 40.000đ và hủy 60.000đ còn nợ; không ghi hoàn 100.000đ. Hoàn tồn chỉ dựa lượng thực sự đã trừ khi chốt; món tùy ý không tự sinh tồn và lịch sử thiếu snapshot không được tự suy đoán để hoàn.

Bán 100.000đ, giá vốn 120.000đ và chi 10.000đ: lãi gộp −20.000đ, lãi sau chi phí −30.000đ nếu dữ liệu đầy đủ. Việc UI giữ doanh thu không âm không cho phép che hai khoản lỗ này. Hủy đơn kỳ trước có thể làm số ròng kỳ này âm; dòng “Hủy đơn” bên chi trên mobile chỉ là cách trình bày, không tự tạo expense.

### 4.2. AI, hỗ trợ và truy vết

| ID | Quy tắc |
|---|---|
| `BR-011` | AI nêu căn cứ và kỳ/phạm vi dữ liệu, hoặc nói rõ không đủ dữ liệu; không trình bày gợi ý như quyết định kế toán/thuế và không tự nhập hàng hay ghi sổ. Lịch sử lưu để xem lại khác cửa sổ ngữ cảnh gần nhất gửi model; không hứa nhớ toàn bộ hội thoại. |
| `BR-012` | Input, truy xuất, cache/vector nếu dùng, trace và output phải đúng user/tiệm và cấu hình nhà cung cấp đã duyệt. Phân biệt dữ liệu gửi model với dữ liệu lưu trace; không khẳng định che hết tên/phone người dùng tự gõ hoặc xóa chat sẽ xóa bản sao bên thứ ba khi chưa có bằng chứng/chính sách được duyệt. |
| `BR-013` | ADMIN dùng web hỗ trợ cơ sở khách hàng, không dùng mobile như OWNER và không trực tiếp sửa sổ bán hàng. |
| `BR-014` | ADMIN chỉ đọc tối thiểu cho hỗ trợ: danh sách che liên hệ, chi tiết liên hệ khi được phân quyền, tổng số/trạng thái hiện tại, OWNER/tiệm tạo mới theo ngày và lịch sử trạng thái. Không mở sổ tiền/nợ/tồn hoặc audit nghiệp vụ OWNER. Mọi truy cập thành công và hành động hỗ trợ phải có audit; không lưu được audit thì không trả dữ liệu được bảo vệ. ADMIN chỉ đọc lịch sử truy cập của chính mình. Số tạo mới không phải mức sử dụng/doanh thu hoặc snapshot trạng thái lịch sử. |
| `BR-015` | OWNER không archive hoặc tự mở lại tiệm bị ADMIN tạm ngưng; vẫn xem được hồ sơ và lý do để liên hệ hỗ trợ. Tiệm ARCHIVED không còn hiển thị cho OWNER theo contract. |
| `BR-016` | Retry hợp lệ của cùng thao tác trả nợ, tạo chi phí, hủy sale, nhập/giảm tồn hoặc upload không được lặp tiền/tồn/audit. Giữ cùng key và nội dung theo thời hạn/quy tắc contract; xác nhận lại cùng draft trả sale cũ. Không suy ra mọi API tạo mới đều chống ghi trùng. |
| `BR-017` | Thao tác ghi nghiệp vụ Core đã chốt phải có audit cùng giao dịch: người, tiệm, hành động, đối tượng, thời điểm và context được phép; không ghi token/liên hệ khách vào metadata nghiệp vụ. Rollback/replay không tạo audit thành công mới. Audit chỉ bổ sung, không thay sổ; OWNER chỉ tra lịch sử tiệm ACTIVE mình sở hữu, tách phạm vi đọc của ADMIN. |

### 4.3. Tồn, media, thông báo và vận hành

| ID | Quy tắc |
|---|---|
| `BR-018` | OWNER nhập tăng tồn bằng lượng dương cho mặt hàng ACTIVE có theo dõi tồn trong tiệm ACTIVE mình sở hữu. Sửa hồ sơ sản phẩm không ghi đè số tồn tuyệt đối; nhập kho không tự tạo chi/nợ hoặc đổi giá vốn. Bật theo dõi khởi tạo 0 rồi nhập riêng; tồn ban đầu khi tạo mới vẫn theo contract. |
| `BR-019` | Một ảnh chính Product, logo Shop và avatar do Core quản lý; client không nhận credential/provider public ID và không tự PATCH URL. Cả ba upload chống ghi trùng; thay/xóa gắn với dọn asset cũ sau commit, không xóa asset còn dùng. Product/logo công khai, avatar authenticated và giữ fallback Firebase. Lỗi media không làm mất phiên đăng nhập; authenticated URL không tự đồng nghĩa có hạn sử dụng. |
| `BR-020` | OWNER có inbox cho tồn thấp/hết hàng, hủy sale và trạng thái tiệm. Ngưỡng theo Product; không tự đặt cho dữ liệu cũ. Event/người nhận commit/rollback cùng nghiệp vụ và không trùng do retry; readAt giữ lần đọc đầu. Chỉ OWNER hợp lệ đọc; tiệm INACTIVE chỉ lộ thông báo trạng thái, ARCHIVED bị loại. Thông báo tính/ẩn trên thiết bị khác event Core; xóa cục bộ không xóa lịch sử Core. Chưa gồm push/email/SMS tự động hoặc AI reminder. |
| `BR-021` | Barcode tùy chọn, khớp chính xác và phân biệt hoa thường; giữ chữ/dấu/số 0 đầu sau chuẩn hóa theo contract. Chỉ Product ACTIVE giữ mã trong tiệm; archive giải phóng mã, giữ tham chiếu lịch sử. Không dùng dữ liệu tiệm khác/sản phẩm giả khi không tìm thấy hoặc lỗi lookup. |
| `BR-022` | Zalo LOGIN hoặc LINK phải giữ một tài khoản chuẩn và chứng minh quyền sở hữu; LINK cần quyền với cả Zalo và tài khoản hiện có. Không gộp theo tên/email/ảnh, chuyển identity sang tài khoản khác, khôi phục tài khoản bị khóa hoặc nâng quyền. API nghiệp vụ tiếp tục dùng Firebase ID token; khả dụng theo kênh/cấu hình không thay nghiệm thu provider thật. |
| `BR-023` | Đo ngày có request nghiệp vụ đã xác thực thành công, gồm đọc, tách OWNER/ADMIN và tài khoản load test; chỉ lưu user/ngày, giữ 90 ngày theo quyết định đã duyệt. Lỗi telemetry không cản nghiệp vụ và không thay audit. DAU/MAU, số tạo mới và số request là các chỉ số khác nhau. |
| `BR-024` | Quota upload/tạo tiệm theo tài khoản dùng chung giữa instance và giữ qua restart. Chỉ thao tác commit tiêu lượt; rollback/replay hợp lệ không tiêu thêm, giữ chỗ tạm ngăn vượt khi đồng thời. Cửa sổ tạo tiệm 24 giờ từ request đầu; không phải giới hạn tổng số tiệm, gói trả phí hoặc quota chat. |
| `BR-025` | OWNER giảm tồn của Product ACTIVE được theo dõi trong tiệm ACTIVE mình sở hữu do hỏng/thất thoát/kiểm kho thiếu: lượng giảm dương, lý do bắt buộc và không âm tồn. Tồn/audit/cảnh báo/kết quả chống trùng cùng commit/rollback; không tự tạo sale/chi/payment/nợ/refund hoặc đổi giá vốn. Không mở thêm ledger kiểm kê hay trả hàng từng phần. |

Các quyết định đã duyệt về stock-in, barcode, Zalo, media, audit, ADMIN growth, hoạt động ngày và quota được giữ bằng các mã trên; tham số API, lease, migration và rollout dẫn về contract/thiết kế kỹ thuật thay vì lặp snapshot nhánh cũ tại BRD.

## 5. Sáng kiến hóa đơn điện tử — provisional

Các quy tắc sau chưa phải cam kết MVP và chỉ áp dụng sau khi chủ thuế/pháp lý xác nhận nguồn chính thức, đối tượng, quy trình và phê duyệt cụ thể.

| ID | Quy tắc cần duyệt |
|---|---|
| `BR-INV-001` | Xác định hồ sơ người bán, ngành, phương pháp thuế, doanh thu và trạng thái đăng ký trước khi bật nghiệp vụ. |
| `BR-INV-002` | Xác định nghĩa vụ lập hóa đơn cho từng giao dịch; không tự loại vì chưa thanh toán hoặc người mua không yêu cầu nhận. |
| `BR-INV-003` | Gắn thông tin người mua với đúng giao dịch và chỉ thu trường cần thiết theo quy tắc được duyệt. |
| `BR-INV-004` | Tách nghĩa vụ lập và truyền dữ liệu; không tự dùng bảng tổng hợp thay từng hóa đơn khi chưa có căn cứ áp dụng đúng nhóm người bán. |
| `BR-INV-005` | Đối soát giao dịch cần hóa đơn nhưng thiếu kết quả hợp lệ, bị từ chối hoặc truyền thất bại. |
| `BR-INV-006` | Có quy trình sai sót điều chỉnh/thay thế/hủy theo loại hóa đơn và quy định được duyệt. |
| `BR-INV-007` | Công bố chi phí, chữ ký số và trách nhiệm hợp đồng/vận hành trước khi kích hoạt. |
| `BR-INV-008` | Tên nhà cung cấp và định dạng API/XML là lựa chọn giải pháp, không khóa thành quy tắc kinh doanh. |

## 6. Căn cứ tuân thủ và dữ liệu

Các đường dẫn pháp lý được bản soạn trước tham chiếu gồm [văn bản trên Cổng Chính phủ](https://vanban.chinhphu.vn/?docid=218689&pageid=27160), [hỏi đáp Bộ Tài chính](https://ttcg.mof.gov.vn/hoidapcstc/home/cthoidap/163784) và [thông tin ngưỡng doanh thu](https://www.mof.gov.vn/tin-tuc-tai-chinh/tin-tuc-su-kien-8/ho-ca-nhan-kinh-doanh-co-muc-doanh-thu-nam-tu-1-ty-dong-tro-xuong-khong-phai-nop-thue). Đợt rà code này không xác minh lại nội dung, hiệu lực hoặc tính áp dụng của chúng; không dùng như kết luận pháp lý hiện hành. Chủ thuế/pháp lý cần ghi tên người phụ trách, ngày kiểm tra và phê duyệt trước khi kích hoạt sáng kiến.

Trang công khai về chính sách/xóa tài khoản và câu trả lời [Google Play Data safety](google-play-data-safety.md) phải khớp dữ liệu thực tế và nhà cung cấp được duyệt. [Trang xóa dữ liệu](../../frontend/web/src/pages/legal/DataDeletionPage.tsx) hiện đã công bố hoàn tất trong **30 ngày sau khi xác minh chủ tài khoản** và gửi email xác nhận; con số lấy từ [legalConfig.ts](../../frontend/web/src/pages/legal/legalConfig.ts). Đây là cam kết công khai quan sát được trong repo, không phải thời hạn pháp luật được xác nhận bởi đợt rà này hoặc bằng chứng quy trình đã vận hành thành công.

Nút xóa tài khoản dẫn tới hướng dẫn gửi yêu cầu, không phải API tự xóa toàn bộ dữ liệu. Trang công khai liệt kê Firebase, hồ sơ, tiệm/sổ nghiệp vụ và lịch sử chat là dữ liệu xóa; audit và bản sao lưu có giới hạn giữ lại được mô tả riêng. Cần chủ dữ liệu/vận hành xác nhận người xử lý, phạm vi thực tế, xác minh và bằng chứng hoàn tất, gồm media/memory/trace/provider. Xóa hội thoại, tắt/xóa ghi nhớ và xóa tài khoản/trace là các phạm vi khác nhau; phần còn thiếu theo `OQ-006`/`OQ-008`, không tuyên bố đã đáp ứng chỉ từ trang chính sách.

## 7. Điều kiện kiểm chứng và phụ thuộc

| Nhóm | Điều kiện để kết luận đạt | Người chịu trách nhiệm |
|---|---|---|
| Dữ liệu chính thức | Theo AC của PRD: chỉ ghi sau xác nhận; retry/rollback/concurrency không sai tiền, nợ, tồn, audit hoặc thông báo | Chủ Core và QA tích hợp |
| Quyền và tiệm | Chứng minh chéo OWNER/ADMIN/shop, trạng thái tiệm và đổi tài khoản/đổi tiệm; không coi email verification ở app là bảo vệ phía Core | Chủ Core/FE và QA |
| Báo cáo | Tách tiền/doanh thu/nợ/lãi, giá vốn thiếu và kỳ hủy chéo; giữ số lỗ và đối chiếu tập nhiều trang | Chủ sản phẩm/Core/FE |
| AI | Đúng nguồn/phạm vi, báo thiếu dữ liệu, không tự ghi; thử lỗi/timeout/stream và dữ liệu gửi model/trace theo cấu hình đã duyệt | Chủ AI/FE và chủ sản phẩm |
| Trải nghiệm | Thực hiện flow có thật trên nền tảng cần nghiệm thu; parser, camera, provider, media, lựa chọn khách và chart không được suy từ backend/mock | Chủ FE và QA |
| Vận hành | Migration/feature flag/secret/rollout theo quy trình; không tự bật shared DB hoặc production từ PR docs | Chủ vận hành và người duyệt release |
| Hiệu quả kinh doanh | Có baseline, mẫu số và target pilot theo `BO-*`; chưa có thì chỉ báo kết quả quan sát | Chủ sản phẩm |

Rủi ro còn lại: luồng UI/API có mức tích hợp khác nhau; xác minh email chỉ ở app; khách cùng phone có thể bị hiểu nhầm thành cùng identity; tổng một trang không đại diện toàn sổ; retention/provider và ghi nhớ chưa chốt; quy tắc thuế chưa được xác nhận. Các điều kiện này là phạm vi cần kiểm chứng, không phải tuyên bố đã chạy hoặc đã đạt.

## 8. Quyết định và câu hỏi còn mở

| ID | Quyết định / câu hỏi | Người phụ trách | Trạng thái và bước tiếp |
|---|---|---|---|
| `OQ-001` | Voice/STT có bắt buộc để kiểm chứng khác biệt MVP? | Chủ sản phẩm | Đã chốt có trong đích MVP; nghiệm thu riêng theo nền tảng và `AC-008`/`AC-074`, không nói mọi FE chỉ giả lập |
| `OQ-002` | Xóa cứng hay hủy có dấu vết? | Chủ sản phẩm + chủ Core | Đã chốt hủy toàn bộ, hoàn tiền đã thu/hủy số dư nợ; chi phí archive; hoàn từng phần ngoài MVP |
| `OQ-003` | Chuyển parser câu từ FE sang AI khi nào? | Chủ AI/Core/FE | Đích MVP đã chốt; contract draft/audio và tích hợp vẫn chưa hoàn chỉnh; giữ nhập tay/POS |
| `OQ-004` | Hoàn thiện yêu cầu cho bảng/biểu đồ, nút mở màn, tính toán/sandbox và cập nhật APK đã có code | Chủ sản phẩm + chủ AI/FE | Mở; `AC-116`/`AC-118` đã phủ hỏi nhanh/dòng chờ, phần còn thiếu cần FR/AC riêng; không duyệt lại phần đã có AC |
| `OQ-005` | Làm sao tránh hiểu nhầm hai customerId dùng chung phone là cùng người? | Chủ sản phẩm + chủ FE | Nhóm UI theo phone đã có `FR-016`/`AC-075`; chỉ còn chốt nhãn/xử lý collision nếu cần, không gộp identity hoặc chuyển nghĩa vụ |
| `OQ-006` | Có duyệt memory dài hạn, default/opt-in, retention và quyền xóa không? | Chủ sản phẩm + chủ AI + chủ dữ liệu | Proposed theo ADR-0002; khi system flag bật code hiện mặc định memory_enabled=true nếu chưa có setting; tắt chỉ ngừng đọc/ghi, không xóa fact. Phải chốt trước khi biến thành cam kết sản phẩm |
| `OQ-007` | Baseline, mẫu số, nhóm pilot và target từng BO là gì? | Chủ sản phẩm | Mở; chốt kế hoạch đo, không tự đặt số từ benchmark/test |
| `OQ-008` | Ai duyệt dữ liệu người bán tự gõ gửi model/trace, retention và vận hành xóa? | Minh Thọ (nội dung công khai) + chủ dữ liệu/vận hành cần chỉ định | Mở về phạm vi dữ liệu được phép và thực thi; che secret/email không che toàn bộ tên/phone, xóa chat không tự xóa trace. Đối chiếu cam kết công khai 30 ngày sau xác minh với quy trình Firebase/Core/chat/media/memory/provider; ghi người xử lý, cấu hình cho phép và bằng chứng hoàn tất |
| `OQ-INV-001` | Hóa đơn điện tử thuộc MVP, pilot riêng hay giai đoạn sau? | Chủ sản phẩm | Mở; hiện ngoài MVP |
| `OQ-INV-002` | Nhóm người bán đầu tiên có hồ sơ pháp lý/ngưỡng doanh thu nào? | Chủ kinh doanh + chủ thuế | Mở |
| `OQ-INV-003` | Mỗi nhóm giao dịch cần chứng từ, thời điểm lập/truyền nào? | Chủ thuế | Mở; xác minh nguồn chính thức và phê duyệt |
| `OQ-INV-004` | Chọn provider, bên mua/quản lý gói/chữ ký số/hợp đồng? | Chủ kinh doanh | Mở |
| `OQ-INV-005` | Bán hàng và đối soát khi provider/cơ quan thuế gián đoạn? | Chủ sản phẩm + chủ thuế | Mở |

## 9. Bàn giao sang PRD

| Nguồn BO/BR | Nhóm hành vi PRD | AC trọng tâm |
|---|---|---|
| `BO-001`/`BO-002`, `BR-001`–`BR-003`, `BR-007`, `BR-010` | `FR-001`–`FR-004`, `FR-008`, `FR-013`–`FR-014`, `FR-021`, `NFR-001`, `NFR-002`, `NFR-006` | `AC-001`–`AC-006`, `AC-008`, `AC-010`–`AC-011`, `AC-024`, `AC-032`, `AC-074`; NFR-002 còn cần tiêu chí pilot |
| `BO-002`/`BO-005`, `BR-006`, `BR-008`, `BR-016`, `BR-017` | `FR-005`, `FR-015`–`FR-016`, `FR-028`–`FR-029` | `AC-007`, `AC-024`, `AC-026`–`AC-030`, `AC-033`–`AC-039`, `AC-075` |
| `BO-003`/`BO-005`, `BR-004`/`BR-005`, `BR-009` | `FR-006`, `FR-033`, `NFR-005` | `AC-004`, `AC-031`, `AC-049`–`AC-052`, `AC-059`–`AC-063`, `AC-068`–`AC-073`, `AC-078` |
| `BR-007`, `BR-009`, `BR-018`–`BR-021`, `BR-025` | `FR-009`, `FR-030`–`FR-032`, `FR-034`, `FR-038`, `NFR-010` | `AC-044`–`AC-048`, `AC-053`–`AC-058`, `AC-064`–`AC-067`, `AC-111`–`AC-115` |
| `BR-009`, `BR-015`, `BR-022` | `FR-010`–`FR-011`, `NFR-003` | `AC-025`, `AC-079`–`AC-094`, `AC-109`–`AC-110`, `AC-117` |
| `BO-003`, `BR-011`/`BR-012` | `FR-007`, `FR-017`–`FR-020`, `FR-027`, `NFR-007`–`NFR-008` | `AC-010`, `AC-012`–`AC-014`, `AC-020`–`AC-023`, `AC-076`–`AC-077`, `AC-116`, `AC-118`; OQ-004/006/008 chưa tự được giải quyết |
| `BR-001`/`BR-002` | `FR-025`–`FR-026`, `FR-035` | `AC-018`–`AC-019`, `AC-096` |
| `BO-003`, `BR-013`/`BR-014` | `FR-022`–`FR-024`, `NFR-009` | `AC-015`–`AC-017`, `AC-040`–`AC-043`, `AC-097`–`AC-100` |
| `BR-023`/`BR-024` | `FR-036`–`FR-037` | `AC-101`–`AC-108` |
| `BO-004`, `BR-INV-001`–`BR-INV-008` | `FR-INV-001`–`FR-INV-007`, `NFR-004` | `AC-INV-001`–`AC-INV-002` provisional; không kích hoạt trước quyết định mục 8 |

Đây là truy vết theo nhóm nghiệp vụ, không chứng nhận AC đạt. [Phụ lục kiểm định §4](business-requirements-audit.md#4-truy-vết-chi-tiết-frnfr-và-ac) liệt kê đầy đủ từng FR/NFR và liên kết AC trực tiếp, gồm khoảng trống chưa có AC. Không lấy số lượng mã/link hợp lệ làm bằng chứng tài liệu đã đúng nghiệp vụ.
