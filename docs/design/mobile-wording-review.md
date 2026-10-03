# Mobile wording review

**Trạng thái:** bản đề xuất chờ Product Owner duyệt. Các thay đổi dưới đây chỉ rút gọn ngôn ngữ giao diện, không thay đổi `BO/BR → FR/NFR → AC`, dữ liệu hay logic nghiệp vụ.

**Nguồn đã kiểm chứng:** giao diện trong `frontend/mobile` tại thời điểm cập nhật. Brand name, route và API identifier được giữ nguyên.

## Mapping câu chữ

| Hiện tại | Đề xuất mới | Vị trí / chức năng | Lý do ngắn |
|---|---|---|---|
| `Xin chào!` | `Đăng nhập` | Màn đăng nhập số điện thoại | Nói đúng mục đích màn hình. |
| `Nhập số điện thoại để bắt đầu bán hàng cùng Sổ Nghe Lời` | `Dùng số điện thoại để vào sổ bán hàng.` | Mô tả đăng nhập | Ngắn và trực tiếp hơn. |
| `Đăng nhập bằng email và mật khẩu` | `Dùng email` | Liên kết đăng nhập email | Tránh lặp thông tin đã rõ ở màn tiếp theo. |
| `Cách đăng nhập khác` | `Hoặc tiếp tục với` | Phân cách đăng nhập mạng xã hội | Tự nhiên hơn trong ngữ cảnh lựa chọn. |
| Không có | `Vào app` | Nút bỏ qua đăng nhập trong development | Cho developer vào nhanh; không render production. |
| `Sổ bán hàng thông minh — chỉ cần nói` | `Bán hàng gọn hơn mỗi ngày` | Splash | Bớt claim và giọng quảng cáo. |
| `Bán hàng chỉ cần nói` | `Sổ bán hàng của bạn` | Tagline logo | Bao quát cả nhập tay, POS và giọng nói. |
| `Chọn cách lên đơn` | `Đơn hàng mới` | Tổng quan, nhóm CTA bán hàng | Ngắn và định hướng kết quả. |
| `Nói để lên đơn` / `Nói đơn` | `Đọc đơn` | Tổng quan và header thu gọn | Ngắn, tự nhiên, đi cùng icon mic. |
| `Bán hàng Giọng nói` | `Đọc đơn` | Tiêu đề màn giọng nói | Đồng bộ tên entry point. |
| `Nhấn & Giữ để nói` | `Giữ để đọc đơn` | CTA mic | Bỏ từ thừa, mô tả đúng thao tác. |
| `Đang nghe… Thả tay để chốt đơn` | `Đang nghe… Thả để xử lý` | Trạng thái mic | AI/parser tạo bản nháp, chưa chốt giao dịch. |
| `Nhập tên hàng + giá (hoặc nhấn giữ mic)` | `Nhập món, số lượng hoặc giá` | Composer Đọc đơn | Dễ quét và mô tả đủ loại dữ liệu. |
| `Chưa có đơn để thanh toán` | `Chưa có đơn` | Empty state thanh toán | Tiêu đề ngắn; hướng dẫn nằm ở dòng phụ. |
| `Hãy nói hoặc chọn hàng trước` | `Đọc đơn hoặc chọn hàng trước` | Empty state thanh toán | Đồng bộ tên chức năng mới. |
| `Quét mã vạch` | `Quét mã` | Thêm món khi thanh toán | Icon camera/barcode bổ nghĩa cho nhãn. |
| `Tạo đơn mới` | `Đơn mới` | Màn hoàn tất | CTA ngắn, vẫn rõ trong ngữ cảnh. |
| `Về trang chủ` | `Về Tổng quan` | Màn hoàn tất | Khớp tên tab đích. |
| `Khác` | `Tiện ích` | Tab thứ tư và tiêu đề tab | Có nghĩa hơn, tránh nhãn chung chung. |
| `Phân tích bán hàng` | `Báo cáo` | Menu Tiện ích và tiêu đề báo cáo | Ngắn, quen thuộc với người bán. |
| `Doanh thu, chi phí và bán chạy` | `Doanh thu, chi phí, bán chạy` | Mô tả Báo cáo | Bỏ liên từ không cần thiết. |
| `Hàng hoá & Kho hàng` | `Hàng hoá` | Menu Tiện ích | Tồn kho đã được mô tả ở dòng phụ. |
| `Quản lý nợ` | `Công nợ` | Menu và màn công nợ | Tên nghiệp vụ ngắn, nhất quán. |
| `Theo dõi khách chưa thanh toán` | `Các khoản khách chưa trả` | Mô tả Công nợ | Ngôn ngữ đời thường hơn. |
| `Diễn biến doanh thu` | `Doanh thu theo ngày` | Báo cáo | Nói rõ nội dung biểu đồ. |
| `Trợ lý AI` | `Trợ lý` | FAB và màn hỏi đáp | Chức năng quan trọng hơn công nghệ. |
| `Hỏi về doanh thu, hàng hoá và công nợ` | `Hỏi về bán hàng, kho và công nợ` | Mô tả Trợ lý | Ngắn và gần cách nói hàng ngày. |
| `Chatbot` | `Hỏi đáp` | Menu mascot | Mô tả hành động thay vì loại công nghệ. |
| `Giọng nói` | `Đọc đơn` | Menu mascot | Đồng bộ entry point bán hàng. |
| `Gợi ý` | `Báo cáo` | Menu mascot | Route hiện mở số liệu hôm nay, không tạo gợi ý mới. |
| `Gợi ý AI` | `Gợi ý` | Nhóm thông báo | Loại bỏ nhãn công nghệ không cần thiết. |
| `Giữ để nói` | `Giữ để đọc đơn` | Gợi ý cạnh mascot | Nói rõ kết quả của thao tác giữ. |
| `Mascot trợ lý AI` | `Trợ lý bán hàng` | Nhãn hỗ trợ tiếp cận của mascot | Mô tả vai trò thay vì công nghệ. |
| `Bắt đầu dùng` | `Bắt đầu` | CTA cuối hướng dẫn nhanh | Ngắn hơn, ngữ cảnh đã đủ rõ. |
| `Tab Khác gom các công cụ…` | `Tiện ích gom hàng hoá, chi phí, công nợ và báo cáo vào một chỗ.` | Hướng dẫn nhanh | Khớp tên tab mới và bỏ câu giải thích dài. |
| `Chọn một hoặc nhiều ngành — AI sẽ gợi ý danh mục phù hợp` | `Chọn một hoặc nhiều ngành để gợi ý danh mục phù hợp` | Thiết lập tiệm | Tập trung vào lợi ích, không nhấn công nghệ. |
| `AI gợi ý · hàng bán chậm` | `Hàng bán chậm` | Danh sách bán chạy | Dữ liệu đã tự giải thích nguồn; nhãn mới dễ quét hơn. |
| `sản phẩm` | `mặt hàng` | Số lượng và đối tượng trong Hàng hoá | Phân biệt khu vực `Hàng hoá` với từng đối tượng người bán quản lý. |
| `Không có sản phẩm` | `Chưa có mặt hàng` | Trạng thái trống Hàng hoá | Tự nhiên hơn và không mang nghĩa lỗi. |
| `Bấm + để thêm sản phẩm mới` | `Nhấn Thêm để tạo mặt hàng đầu tiên` | Trạng thái trống Hàng hoá | Khớp đúng nhãn nút đang hiển thị. |
| `Cấu hình sản phẩm` | `Thêm mặt hàng` | Quét mã chưa có trong danh mục | Dùng động từ quen thuộc, bỏ thuật ngữ kỹ thuật. |
| `Chụp ảnh (AI)` | `Chụp ảnh` | Cách nhập thông tin mặt hàng | Icon camera và ngữ cảnh đã đủ nghĩa. |
| `Chụp bao bì hoặc bảng giá — AI sẽ điền tên, giá giúp bạn` | `Chụp bao bì hoặc bảng giá để điền nhanh thông tin. Hãy kiểm tra trước khi lưu.` | Gợi ý nhập bằng ảnh | Ngắn, trung tính và nhắc người dùng xác nhận dữ liệu. |
| `Tạo đơn · [tổng tiền]` | `Thanh toán · [tổng tiền]` | CTA sau khi đọc đơn | Nút chỉ mở bước thanh toán; chưa tạo bản ghi chính thức. |
| `Đơn tạo bằng giọng nói` / `Đơn chọn từ POS` / `Đơn nhập tay` | `Nguồn: Đọc đơn` / `Nguồn: Bán hàng` / `Nguồn: Nhập tay` | Phụ đề Thanh toán | Cùng một cấu trúc, ngắn và nhất quán. |
| `Sản phẩm này chưa có trong danh mục…` | `Mặt hàng này chưa có trong danh mục. Hãy thêm trước khi bán.` | Cảnh báo Đọc đơn | Bỏ chi tiết triển khai `Core`, giữ hướng xử lý. |
| `Mình chưa hiểu câu hỏi này 😅…` | `Chưa hiểu câu hỏi. Hãy thử hỏi về…` | Trợ lý, trạng thái không hiểu | Bỏ emoji và giọng nhân cách hoá không cần thiết. |
| Sổ Nghe Lời đã ghi được | Đơn đang đọc | Tiêu đề danh sách món nhận diện từ giọng nói | Bỏ tên riêng và giọng nhân cách hoá. |
| Bạn đã đọc hết thông báo | Không có thông báo mới | Phụ đề danh sách thông báo | Ngắn, trung tính, dễ quét. |
| Xoá giỏ trực tiếp | Hộp thoại xác nhận Xoá giỏ hàng? | Giỏ hàng Bán hàng (POS) | Bảo vệ thao tác huỷ toàn bộ giỏ tạm, tránh bấm nhầm. |
| Thêm nhân viên mới | Thêm nhân viên | Màn hình nhân viên | Ngắn gọn, đúng chuẩn hành động. |
| Bạn sẽ cần nhập số điện thoại và mã OTP để đăng nhập lại. | Bạn sẽ cần đăng nhập lại để tiếp tục quản lý sổ. | Hộp thoại Đăng xuất | Phù hợp cả khi đăng nhập bằng email hoặc số điện thoại. |
| [số lượng] sp | [số lượng] phần | Danh sách bán chạy Tổng quan | Nhất quán với cách gọi món/mặt hàng trong bán lẻ. |

## Quy ước icon

- Dùng `Feather` cho toàn bộ icon chức năng trong app vì code hiện tại đã dùng bộ này ở hầu hết màn hình.
- Chỉ giữ `FontAwesome` cho logo nhà cung cấp đăng nhập (`Google`, `Facebook`, `Apple`), vì đây là brand mark chứ không phải icon chức năng.
- Icon đứng cạnh text phải bổ sung ngữ nghĩa: mic + `Đọc đơn`, barcode/camera + `Quét mã`, biểu đồ + `Báo cáo`.
- Không thêm icon trang trí vào tiêu đề hoặc số liệu khi icon không giúp phân biệt hành động/trạng thái.

## Quy ước motion và feedback

| Nhóm | Motion | Feedback |
|---|---|---|
| Điều hướng tab thường xuyên | Indicator spring di chuyển, nội dung fade nhanh | Không rung hoặc phát âm thanh. |
| CTA chính | Co nhẹ rõ hơn khi nhấn | Chỉ rung khi hoàn tất nghiệp vụ. |
| Nút phụ / ghost | Đổi opacity, scale rất nhẹ hoặc không scale | Không rung. |
| Quét barcode thành công | Bounding box/flash hiện có + phản hồi tức thì | Beep trên web và một nhịp rung ngắn. |
| Thêm/cập nhật sản phẩm | Toast + phản hồi thành công | Một nhịp rung thành công. |
| Hoàn tất thanh toán | Check spring + số tiền | Nhịp rung thành công hai pha. |
| Lỗi/cảnh báo | Toast hoặc trạng thái inline | Chỉ rung với lỗi chặn flow; không rung validation thường. |
