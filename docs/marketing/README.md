# Ảnh sản phẩm cho marketing

| Trường | Giá trị |
|---|---|
| Trạng thái | Bản đầu, dùng làm tài nguyên nội bộ; chưa duyệt để đăng công khai |
| Chủ sở hữu | Chưa gán |
| Cập nhật lần cuối | 2026-10-27 |

Ảnh chụp màn hình app Sổ Nghe Lời theo tỉ lệ điện thoại, xếp theo luồng sản phẩm để nhóm marketing lấy làm tài nguyên. Thư mục này không định nghĩa hành vi sản phẩm; hành vi nằm ở [PRD](../product/product-requirements.md).

## Thông số ảnh

- Kích thước: 1170 × 2532 px (khung 390 × 844 pt ở mật độ 3x, tỉ lệ 9:19,5, bằng độ phân giải màn hình của iPhone 12 đến 14), định dạng PNG.
- Không có thanh trạng thái và không có viền máy, để lồng vào khung điện thoại khi dàn trang.
- Nguồn: bản web của app mobile chạy ở chế độ xem trước (`EXPO_PUBLIC_USE_MOCK=true`), chụp tự động bằng Chrome chạy ẩn qua [`frontend/mobile/scripts/marketing-screenshots/`](../../frontend/mobile/scripts/marketing-screenshots/capture.mjs) (xem [Cách chụp lại](#cách-chụp-lại)). Giao diện dùng chung mã với app trên điện thoại, nhưng chưa đối chiếu từng ảnh với máy thật.
- Phiên bản: nhánh `staging` tại `7d65486`, chụp ngày 2026-10-27 (giờ Việt Nam). Bộ trước chụp ngày 2026-10-12 tại `33d2da4`; từ đó app đã đổi thanh tab (Tổng quan · Đơn hàng · Tạo đơn · Trợ lý Bobi · Quản lý), gom Đọc đơn và Quét mã vào màn Tạo đơn, và thay ảnh món bằng chữ cái đầu tên.

## Danh sách ảnh

### `dashboard/` — Tổng quan, bán hàng và quản lý

| Ảnh | Nội dung |
|---|---|
| [01-tong-quan.png](dashboard/01-tong-quan.png) | Màn Tổng quan: doanh thu hôm nay so với hôm qua, số đơn, công nợ toàn tiệm, trung bình mỗi đơn; thanh tab có nút Tạo đơn ở giữa |
| [02-tong-quan-uu-tien-va-ban-chay.png](dashboard/02-tong-quan-uu-tien-va-ban-chay.png) | Tổng quan khi cuộn xuống (đầu trang thu gọn): việc ưu tiên, gợi ý từ dữ liệu đã chốt, bán chạy hôm nay |
| [03-bao-cao-doanh-thu.png](dashboard/03-bao-cao-doanh-thu.png) | Báo cáo: doanh thu hôm nay, doanh thu theo giờ, thu chi và lãi gộp ước tính |
| [04-don-hang.png](dashboard/04-don-hang.png) | Đơn hàng: tìm kiếm, lọc theo kỳ, tổng số đơn và doanh thu, đơn nhóm theo ngày |
| [05-ban-hang.png](dashboard/05-ban-hang.png) | Tạo đơn: nút Đọc đơn và Quét mã, tìm kiếm, nhóm hàng, lưới sản phẩm hai cột |
| [06-ban-hang-co-gio-hang.png](dashboard/06-ban-hang-co-gio-hang.png) | Tạo đơn khi đã chọn món: nút tăng giảm trên thẻ và thanh giỏ hàng (3 món, 55.000đ) |
| [07-quan-ly.png](dashboard/07-quan-ly.png) | Quản lý: thông tin tiệm, báo cáo, hàng hoá, chi phí, công nợ, cài đặt, xem lại hướng dẫn |
| [08-hang-hoa.png](dashboard/08-hang-hoa.png) | Hàng hoá: số mặt hàng, giá trị tồn kho, số món sắp hết, nút nhập hàng từng món |
| [09-cong-no.png](dashboard/09-cong-no.png) | Công nợ: tổng còn nợ, số khách đang nợ và từng khách |

### `chat/` — Trợ lý AI

| Ảnh | Nội dung |
|---|---|
| [01-tro-ly-ai.png](chat/01-tro-ly-ai.png) | Màn Trợ lý Bobi lúc mở: lời chào và các câu hỏi gợi ý |
| [02-dat-cau-hoi.png](chat/02-dat-cau-hoi.png) | Đang gõ câu hỏi "Món nào sắp hết hàng?" |
| [03-tra-loi.png](chat/03-tra-loi.png) | Trợ lý trả lời danh sách món sắp hết |

### `barcode/` — Quét mã vạch

| Ảnh | Nội dung |
|---|---|
| [01-quet-ma-vach.png](barcode/01-quet-ma-vach.png) | Màn quét: khung ngắm và hàng nút điều khiển |
| [02-nhan-dien-mon.png](barcode/02-nhan-dien-mon.png) | Quét trúng món có trong danh mục (mã `8935049500544`): thẻ món, tồn kho, số lượng và thành tiền |
| [03-don-tam-trong-man-quet.png](barcode/03-don-tam-trong-man-quet.png) | Đơn tạm ngay trong màn quét, sẵn nút thanh toán |
| [04-ma-chua-co-trong-danh-muc.png](barcode/04-ma-chua-co-trong-danh-muc.png) | Quét mã chưa có (`8936079140014`): lời mời thêm mặt hàng |
| [05-them-mat-hang-moi.png](barcode/05-them-mat-hang-moi.png) | Thêm mặt hàng mới từ mã vừa quét, đã điền tên và giá, lưu vào danh mục |

### `voice/` — Đọc đơn bằng giọng nói

| Ảnh | Nội dung |
|---|---|
| [01-doc-don.png](voice/01-doc-don.png) | Màn Đọc đơn lúc mở |
| [02-nghe-va-ghi-don.png](voice/02-nghe-va-ghi-don.png) | Đơn được ghi sau câu "2 cà phê sữa đá 1 bánh mì thịt 3 mì gói" |
| [03-mon-moi-nhap-so-luong.png](voice/03-mon-moi-nhap-so-luong.png) | Gọi món chưa có trong danh mục ("1 sữa chua nếp cẩm"): nhập giá, số lượng và đơn vị để thêm vào danh mục |
| [04-don-da-ghi.png](voice/04-don-da-ghi.png) | Đơn hoàn chỉnh 4 món, tổng 98.000đ, sẵn nút thanh toán |

## Điều cần biết trước khi dùng

### Đối chiếu với Core — 2026-10-26

Các ảnh bên trên giữ nguyên snapshot/mock đã ghi ở mục nguồn, không được đổi
nhãn thành ảnh nghiệm thu backend. Năng lực Core được mô tả bởi contract:

| Nhóm ảnh | Ranh giới khi giới thiệu năng lực Core |
|---|---|
| `dashboard/` | Core có report summary, top-products, sales-series và profit-estimate; số liệu trong ảnh vẫn là mock. Sales-series Core hiện chỉ có granularity DAY, nên biểu đồ theo giờ trong ảnh không chứng minh có API chuỗi theo giờ |
| `barcode/` | Core có lookup barcode của Product ACTIVE; camera/nhận diện khung hình thuộc FE. Ảnh không chứng minh máy thật/provider đã được nghiệm thu |
| `voice/` | Core nhận draft đã có cấu trúc để kiểm tra/chốt; chưa có API Core parse giọng nói/ảnh thành draft. Nguồn ảnh đã nêu dùng Nhập tay, không phải bằng chứng STT backend |
| `chat/` | Core có proxy Agent chat/stream, nhưng câu trả lời trong bộ ảnh là mock; không thay kiểm thử FE → Core → AI/provider thật |

Chi tiết có một nguồn tại [API contract](../contracts/api-contracts.md), còn
hiện trạng code ở [thiết kế kỹ thuật](../architecture/technical-design.md#1-phạm-vi).

- **Toàn bộ là dữ liệu mẫu.** Tên tiệm, tên khách, số điện thoại, doanh thu và công nợ đến từ chế độ xem trước của app, không phải dữ liệu của tiệm thật.
- **Trợ lý AI trong ảnh là trợ lý của chế độ xem trước**, không phải mô hình AI thật. Câu trả lời có dòng "(Số liệu giả lập từ danh mục mẫu của tiệm hiện tại.)". Ảnh `chat/` phù hợp để minh hoạ giao diện; muốn giới thiệu chất lượng trả lời thì cần chụp lại từ một tài khoản thật.
- **Khung hình camera trong `barcode/` là hình minh hoạ tự vẽ** (gói hàng và mã vạch EAN-13), không phải ảnh sản phẩm thật. Việc đọc mã trong ảnh là thật: app tự đọc mã từ khung hình đó.
- **Ở `voice/`, câu đọc đơn được gõ qua nút "Nhập tay"** thay cho giọng nói; phần tách món và ghi đơn chạy như khi nói.
- **Tên nhãn hiệu.** Dữ liệu mẫu có tên nhãn hiệu của bên thứ ba (ví dụ CocaCola, Sting). Trước khi đăng công khai cần người phụ trách xem lại việc dùng các tên này.
- **Ảnh món là chữ cái đầu tên.** Từ [#193](https://github.com/miphu2804/smart-ledger/pull/193) app không còn dùng ảnh mạng cho món chưa có ảnh; thẻ món hiện chữ cái đầu trên nền màu. Bộ ảnh mới vì vậy không còn ảnh Unsplash.

## Cách chụp lại

1. Chạy bản web của app mobile ở chế độ xem trước trên cổng 8082, từ `frontend/mobile`:
   `CI=1 EXPO_PUBLIC_USE_MOCK=true EXPO_PUBLIC_MOCK_CORE=true EXPO_PUBLIC_MOCK_SHOPS=true npx expo start --web --port 8082 --clear`
   (xem [README mobile](../../frontend/mobile/README.md)). Mở `http://localhost:8082` một lần cho Metro build xong.
2. Từ thư mục gốc repo, với Chrome đã cài (Node 22 trở lên, không cần cài thêm gói):
   `node frontend/mobile/scripts/marketing-screenshots/capture.mjs docs/marketing`
   Thêm tên luồng (`dashboard`, `chat`, `barcode`, `voice`) để chỉ chụp lại luồng đó. `APP_URL` đổi địa chỉ bản web, `CHROME_PATH` đổi đường dẫn Chrome.
3. Kịch bản đặt khung 390 × 844 @3x, bấm "Vào app" rồi đi các màn theo bảng trên. Camera của trang được thay bằng một canvas dọc 720 × 1280 vẽ gói hàng có mã EAN-13 (`8935049500544` có trong danh mục mẫu, `8936079140014` thì chưa); câu đọc đơn được gõ qua "Nhập tay".
4. Xem lại từng ảnh trước khi commit: dữ liệu mẫu đổi theo ngày chụp (giờ trên đơn, "hôm nay", "hôm qua").
