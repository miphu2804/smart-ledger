# Mô tả sản phẩm

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | tạm thời — Core theo FE; AI theo kiến trúc MVP đã chốt |
| Chủ sở hữu | Chủ sản phẩm |
| Cập nhật lần cuối | 2026-09-15 |
| Tên tiếng Anh | So Nghe Loi — AI Voice POS |

## Tài liệu liên quan

- Nguồn ý tưởng: brief `songheloi` trên Drive EXE101.
- Nguồn luồng Core/FE: [orei1i/EXE201/frontend](https://github.com/orei1i/EXE201/tree/main/frontend) (đã đọc trên `main`).
- [Yêu cầu kinh doanh](business-requirements.md): mục tiêu, phạm vi, quy tắc kinh doanh, rủi ro và quyết định cần phê duyệt.
- [Yêu cầu sản phẩm](product-requirements.md): hành vi sản phẩm có thể quan sát và nghiệm thu.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): cách hệ thống hiện thực yêu cầu sản phẩm đã duyệt.
- [Sơ đồ kiến trúc MVP](../architecture/diagrams/src/architecture.mmd): Mobile, Core, Data, AI và AI infrastructure.

## 0. Tra nhanh shorthand

| Viết tắt | Nghĩa |
|---|---|
| `AI` | Artificial Intelligence — trí tuệ nhân tạo. |
| `API` | Application Programming Interface — giao diện để các hệ thống trao đổi dữ liệu. |
| `MVP` | Minimum Viable Product — phiên bản tối thiểu để kiểm chứng giá trị sản phẩm. |
| `POS` | Point of Sale — hệ thống ghi nhận và quản lý bán hàng tại điểm bán. |
| `STT` | Speech-to-Text — chuyển giọng nói thành văn bản. |

## 1. Mô tả ngắn

Sổ Nghe Lời có hai giao diện theo vai trò. `OWNER` dùng ứng dụng mobile để vận hành tiệm: danh mục, bán hàng, thu/chi/nợ, báo cáo và gợi ý. `ADMIN` dùng web dashboard để tìm và xem cơ sở khách hàng, theo dõi tình trạng hỗ trợ và số liệu nền tảng; không trực tiếp sửa sổ bán hàng của chủ tiệm.

FE hiện mới có đường mic giả lập và parser cục bộ. Đích MVP bổ sung AI service cho voice/text, ảnh, gợi ý và hỏi đáp; mọi kết quả AI là bản nháp hoặc gợi ý, không tự ghi sổ.

## 2. Vấn đề

Nhiều cửa hàng rất nhỏ ghi nhớ giao dịch, ghi sổ tay hoặc chỉ tính tổng tiền cuối ngày. Cách làm này khiến họ khó trả lời:

- Hôm nay thực sự bán được bao nhiêu?
- Mặt hàng nào đang bán tốt?
- Khách nào còn nợ, cửa hàng đã chi bao nhiêu?
- Nên nhập thêm mặt hàng nào?

Các hệ thống POS/kế toán hiện có thường rộng và nặng hơn nhu cầu ghi nhận bán hàng hằng ngày của nhóm này.

## 3. Người dùng mục tiêu

**Chính:** hộ/cá nhân kinh doanh và cửa hàng nhỏ chưa có quy trình order hoặc POS rõ ràng, ví dụ quán nước, quán ăn gia đình, xe trái cây, tiệm bánh mì, tạp hóa nhỏ và người bán ngoài chợ.

**Hỗ trợ vận hành:** quản trị viên nội bộ dùng web dashboard để hỗ trợ nhiều cơ sở khách hàng.

## 4. Giá trị khác biệt

- Ghi nhận nhanh bằng câu tiếng Việt, giọng nói, ảnh hoặc POS chọn hàng.
- Danh mục hàng/giá/tồn là cơ sở khớp tên và lên đơn, không bắt người bán gõ lại giá mỗi lần.
- Người bán luôn kiểm tra giỏ và chốt thanh toán trước khi bản ghi trở thành sổ.
- Báo cáo, gợi ý nhập hàng và hỏi đáp có căn cứ từ dữ liệu của đúng cửa hàng.
- Web dashboard cho ADMIN: đăng nhập có role guard, danh sách/tìm kiếm chủ tiệm và cơ sở, trang hỗ trợ và tổng quan nền tảng.

## 5. Luồng giá trị cốt lõi

`Đăng nhập → tạo tiệm / danh mục → nói-gõ-chụp hoặc chọn POS → kiểm tra bản nháp → chốt thu → lịch sử · chi phí · nợ · báo cáo · gợi ý`

## 6. Phạm vi MVP đã chấp nhận

- Hai role MVP: `OWNER` dùng mobile; `ADMIN` dùng web dashboard.
- Thiết lập tiệm (tên, ngành) và danh mục mặt hàng, giá, tồn kho đơn giản.
- Lên đơn/ghi chi bằng text hoặc voice; lấy đề xuất từ ảnh; POS chọn hàng; thêm món lẻ.
- Màn thanh toán: tiền mặt, chuyển khoản (ghi nhận, không cổng thanh toán), ghi nợ / trả một phần.
- Lịch sử bản ghi bán hàng, sửa, xóa trên UI; sổ chi phí; sổ nợ và thu nợ.
- Báo cáo theo kỳ: doanh thu, số đơn, bán chạy, chi, lãi ước tính, nợ còn.
- Gợi ý nhập hàng và hỏi đáp insight có giải thích/căn cứ; không tự sửa dữ liệu.

Không thuộc MVP: máy in, gói dịch vụ, kế toán/thuế và hóa đơn điện tử.

## 7. Ranh giới sản phẩm

MVP không phải phần mềm kế toán, không tính hay kê khai thuế, không xử lý thanh toán thật, không quản lý tồn kho đầy đủ theo lô/kho. Con số chi phí, lợi nhuận trên báo cáo là ước tính vận hành. Bản ghi bán hàng trên UI không phải hóa đơn điện tử; không được mô tả như chứng từ theo nghị định cho đến khi initiative hóa đơn được phê duyệt.

ADMIN không được giả danh OWNER hoặc sửa invoice, expense, debt và tồn kho trong MVP. Truy cập dữ liệu hỗ trợ phải có audit.

## 8. Mở rộng hóa đơn điện tử — chưa cam kết vào MVP

Hóa đơn điện tử là miền tuân thủ riêng, không chỉ thêm một API. Nó làm phát sinh đối tượng áp dụng, thời điểm lập, thông tin người mua, loại hóa đơn, xử lý sai sót, truyền dữ liệu, đối soát, nhà cung cấp và trách nhiệm pháp lý.

Hai khái niệm phải tách:

1. **Lập hóa đơn:** tạo hóa đơn hợp lệ cho nghiệp vụ bán hàng tại thời điểm luật yêu cầu.
2. **Truyền dữ liệu:** gửi dữ liệu hóa đơn đã lập đến cơ quan thuế theo phương thức và thời hạn áp dụng.

Không coi “bảng tổng hợp cuối ngày” là cách thay thế việc lập hóa đơn cho từng giao dịch cho đến khi chuyên gia thuế xác nhận bằng căn cứ pháp lý hiện hành.

## 9. Nguồn và giới hạn

- Nguồn Core/FE: FE EXE201, kiểm tra 2026-09-15. README FE còn ghi “mock, chưa gọi API”; code đang gọi Core `/api/v1` — lấy code làm nguồn.
- Nguồn phạm vi AI: sơ đồ kiến trúc MVP do nhóm chốt. FE chưa chứng minh tích hợp AI chạy thật; PRD và issue là nguồn nghiệm thu.
- Nguồn pháp lý tham chiếu tại 2026-09-14: [Nghị định 254/2026/NĐ-CP](https://vanban.chinhphu.vn/?docid=218689&pageid=27160), hiệu lực từ 2026-07-01.
- Đây là mô tả sản phẩm, không phải tư vấn pháp lý. Business rules về hóa đơn phải có người chịu trách nhiệm pháp lý/thuế phê duyệt trước khi productize.
