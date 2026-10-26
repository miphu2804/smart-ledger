# Ảnh sản phẩm cho marketing

| Trường | Giá trị |
|---|---|
| Trạng thái | Bản đầu, dùng làm tài nguyên nội bộ; chưa duyệt để đăng công khai |
| Chủ sở hữu | Chưa gán |
| Cập nhật lần cuối | 2026-10-12 |

Ảnh chụp màn hình app Sổ Nghe Lời theo tỉ lệ điện thoại, xếp theo luồng sản phẩm để nhóm marketing lấy làm tài nguyên. Thư mục này không định nghĩa hành vi sản phẩm; hành vi nằm ở [PRD](../product/product-requirements.md).

## Thông số ảnh

- Kích thước: 1170 × 2532 px (khung 390 × 844 pt ở mật độ 3x, tỉ lệ 9:19,5, bằng độ phân giải màn hình của iPhone 12 đến 14), định dạng PNG.
- Không có thanh trạng thái và không có viền máy, để lồng vào khung điện thoại khi dàn trang.
- Nguồn: bản web của app mobile chạy ở chế độ xem trước (`EXPO_PUBLIC_USE_MOCK=true`), chụp bằng Chrome chạy ẩn. Giao diện dùng chung mã với app trên điện thoại, nhưng chưa đối chiếu từng ảnh với máy thật.
- Phiên bản: nhánh `staging` tại `33d2da4`, cộng hai thay đổi đang chờ merge lúc chụp: [#168](https://github.com/miphu2804/smart-ledger/pull/168) (thẻ sản phẩm ở Bán hàng và bộ quét trên web) và [#169](https://github.com/miphu2804/smart-ledger/pull/169) (ô số lượng trong hộp thoại thêm món của Đọc đơn).

## Danh sách ảnh

### `dashboard/` — Tổng quan, bán hàng và quản lý

| Ảnh | Nội dung |
|---|---|
| [01-tong-quan.png](dashboard/01-tong-quan.png) | Màn Tổng quan: doanh thu hôm nay, số đơn, công nợ và bốn lối vào tạo đơn |
| [02-tong-quan-uu-tien-va-ban-chay.png](dashboard/02-tong-quan-uu-tien-va-ban-chay.png) | Tổng quan khi cuộn xuống: việc ưu tiên, gợi ý từ dữ liệu đã chốt, hàng bán chạy |
| [03-bao-cao-doanh-thu.png](dashboard/03-bao-cao-doanh-thu.png) | Báo cáo: doanh thu theo giờ, thu chi và lãi gộp ước tính |
| [04-don-hang.png](dashboard/04-don-hang.png) | Đơn hàng: thanh tìm kiếm, lọc theo kỳ, đơn nhóm theo ngày |
| [05-ban-hang.png](dashboard/05-ban-hang.png) | Bán hàng: lưới sản phẩm hai cột, tìm kiếm và nhóm hàng |
| [06-ban-hang-co-gio-hang.png](dashboard/06-ban-hang-co-gio-hang.png) | Bán hàng khi đã chọn món: nút tăng giảm trên thẻ và thanh giỏ hàng |
| [07-quan-ly.png](dashboard/07-quan-ly.png) | Quản lý: báo cáo, hàng hoá, chi phí, công nợ |
| [08-hang-hoa.png](dashboard/08-hang-hoa.png) | Hàng hoá: giá bán, tồn kho và số món sắp hết |
| [09-cong-no.png](dashboard/09-cong-no.png) | Công nợ: tổng còn nợ và từng khách |

### `chat/` — Trợ lý AI

| Ảnh | Nội dung |
|---|---|
| [01-tro-ly-ai.png](chat/01-tro-ly-ai.png) | Màn trợ lý lúc mở, có câu hỏi gợi ý |
| [02-dat-cau-hoi.png](chat/02-dat-cau-hoi.png) | Đang gõ câu hỏi "Món nào sắp hết hàng?" |
| [03-tra-loi.png](chat/03-tra-loi.png) | Trợ lý trả lời danh sách món sắp hết |

### `barcode/` — Quét mã vạch

| Ảnh | Nội dung |
|---|---|
| [01-quet-ma-vach.png](barcode/01-quet-ma-vach.png) | Màn quét: khung ngắm và hàng nút điều khiển |
| [02-nhan-dien-mon.png](barcode/02-nhan-dien-mon.png) | Quét trúng món có trong danh mục: thẻ món, số lượng và thành tiền |
| [03-don-tam-trong-man-quet.png](barcode/03-don-tam-trong-man-quet.png) | Đơn tạm ngay trong màn quét, sẵn nút thanh toán |
| [04-ma-chua-co-trong-danh-muc.png](barcode/04-ma-chua-co-trong-danh-muc.png) | Quét mã chưa có: lời mời thêm mặt hàng |
| [05-them-mat-hang-moi.png](barcode/05-them-mat-hang-moi.png) | Thêm mặt hàng mới từ mã vừa quét |

### `voice/` — Đọc đơn bằng giọng nói

| Ảnh | Nội dung |
|---|---|
| [01-doc-don.png](voice/01-doc-don.png) | Màn Đọc đơn lúc mở |
| [02-nghe-va-ghi-don.png](voice/02-nghe-va-ghi-don.png) | Đơn được ghi sau câu "2 cà phê sữa đá 1 bánh mì thịt 3 mì gói" |
| [03-mon-moi-nhap-so-luong.png](voice/03-mon-moi-nhap-so-luong.png) | Gọi món chưa có trong danh mục: nhập giá, số lượng và đơn vị |
| [04-don-da-ghi.png](voice/04-don-da-ghi.png) | Đơn hoàn chỉnh với tổng tiền, sẵn nút thanh toán |

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
- **Tên nhãn hiệu và ảnh món.** Dữ liệu mẫu có tên nhãn hiệu của bên thứ ba (ví dụ CocaCola, Sting, Vinamilk) và ảnh món tải từ Unsplash theo đường dẫn trong `frontend/mobile/src/lib/productImages.ts`. Trước khi đăng công khai cần người phụ trách xem lại việc dùng các tên và ảnh này.
- Một số ảnh có linh vật nổi ở góc phải che một phần nội dung; đó là vị trí mặc định của nó trong app.

## Cách chụp lại

1. Chạy bản web của app mobile ở chế độ xem trước (xem [README mobile](../../frontend/mobile/README.md)).
2. Mở bằng trình duyệt ở khung 390 × 844 với mật độ điểm ảnh 3, bấm "Vào app" rồi đi lần lượt các màn như bảng trên.
3. Với `barcode/`, cấp cho trang một luồng camera dọc 720 × 1280 có mã vạch EAN-13 nằm ở giữa khung hình; mã `8935049500544` có trong danh mục mẫu.

Bộ ảnh hiện tại được chụp tự động bằng một kịch bản điều khiển Chrome chạy ẩn; kịch bản chưa nằm trong repo.
