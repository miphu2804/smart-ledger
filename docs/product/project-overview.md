---
type: Product Overview
title: "Mô tả sản phẩm"
description: "Vị trí sản phẩm, người dùng và phạm vi MVP môn EXE201 của Sổ Nghe Lời."
owner: Chủ sản phẩm
status: stable
author: miphu2804
stale_after: 2027-01-05T04:32:37+07:00
---
# Mô tả sản phẩm

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | MVP môn EXE201 — tập trung luồng cốt lõi, demo đầu-cuối và kiểm chứng người dùng |
| Tên tiếng Anh | So Nghe Loi — AI Voice POS |

## Tài liệu liên quan

- Nguồn ý tưởng: brief `songheloi` trên Drive EXE101.
- Nguồn luồng Core/FE ban đầu: [orei1i/EXE201/frontend](https://github.com/orei1i/EXE201/tree/main/frontend), kiểm tra 2026-09-15. Code hiện tại nằm trong [`frontend/mobile`](../../frontend/mobile/README.md), [`frontend/web`](../../frontend/web/README.md) và `backend/`.
- [Yêu cầu kinh doanh](business-requirements.md): mục tiêu, phạm vi, quy tắc kinh doanh, rủi ro và quyết định cần phê duyệt.
- [Yêu cầu sản phẩm](product-requirements.md): hành vi sản phẩm có thể quan sát và nghiệm thu.
- [Demo và kiểm chứng MVP](mvp-demo-validation.md): kịch bản, dữ liệu thử, phản hồi và cách chọn việc còn lại cho EXE201.
- [Thiết kế kỹ thuật](../architecture/technical-design.md): cách hệ thống hiện thực yêu cầu sản phẩm đã duyệt.
- [Sơ đồ kiến trúc đích](../architecture/diagrams/src/architecture.mmd): Mobile, Core, Data, AI và AI infrastructure.

## 0. Tra nhanh shorthand

| Viết tắt | Nghĩa |
|---|---|
| `AI` | Artificial Intelligence — trí tuệ nhân tạo. |
| `API` | Application Programming Interface — giao diện để các hệ thống trao đổi dữ liệu. |
| `MVP` | Phạm vi phát hành đầu tiên của SmartLedger, nay đang chạy production. Tên này được giữ làm nhãn phạm vi và ưu tiên (ví dụ `P0 — MVP`) để không đổi truy vết; nó không có nghĩa sản phẩm còn là bản thử nghiệm. |
| `POS` | Point of Sale — hệ thống ghi nhận và quản lý bán hàng tại điểm bán. |
| `STT` | Speech-to-Text — chuyển giọng nói thành văn bản. |

## 1. Mô tả ngắn

Sổ Nghe Lời đang chạy production và giúp người bán nhỏ ghi đơn bằng giọng nói hoặc thao tác đơn giản, theo dõi tiền/nợ/chi phí và hiểu số liệu. MVP EXE201 là nhãn phạm vi bàn giao và kiểm chứng của môn học, không mô tả hệ thống là prototype chưa deploy. Mục tiêu trong thời gian môn học là có sản phẩm dùng được, demo đầu-cuối và thu phản hồi thực tế; không xây hệ thống enterprise hoặc đặt điều kiện vận hành thương mại quy mô lớn.

Hai giao diện đã có vẫn được giữ: `OWNER` dùng mobile vận hành tiệm; `ADMIN` dùng web hỗ trợ hồ sơ/trạng thái và không sửa sổ của chủ tiệm. Nhóm ưu tiên nối và làm ổn định luồng OWNER; chọn phần hỗ trợ có ích để demo thêm, không mở rộng dashboard chỉ để đủ nhiều tính năng.

Mobile có đường nhận giọng nói theo nền tảng và parser FE; Bobi chat gọi AI qua Core. Các API parse audio/ảnh mới, RAG và memory dài hạn chưa cần hoàn thành cho demo chính. Mọi đề xuất phải được người bán kiểm tra, AI không tự ghi sổ. Phần đã triển khai và giới hạn tích hợp được ghi tại [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-scope); thay đổi ưu tiên không xóa chức năng hoặc biến phần chưa có thành đã có.

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

- Ghi nhận bằng câu tiếng Việt, giọng nói theo nền tảng hoặc POS chọn hàng; thử xem cách nào thực sự dễ hơn cho người bán.
- Danh mục hàng/giá/tồn là cơ sở khớp tên và lên đơn, không bắt người bán gõ lại giá mỗi lần.
- Người bán luôn kiểm tra giỏ và chốt thanh toán trước khi bản ghi trở thành sổ.
- Báo cáo, gợi ý nhập hàng và hỏi đáp có căn cứ từ dữ liệu của đúng cửa hàng.
- Bobi giải thích dữ liệu đúng tiệm và nói rõ khi thiếu căn cứ; đánh giá bằng câu hỏi và phản hồi thực tế, không chỉ việc gọi được model.

## 5. Luồng giá trị cốt lõi

`Đăng nhập → chọn/tạo tiệm và danh mục → nói-gõ hoặc chọn POS → kiểm tra giỏ → chốt thu/ghi nợ → lịch sử · ghi chi · thu nợ · báo cáo → hỏi Bobi`

Demo chính dùng một tiệm thử, dữ liệu có thể đối chiếu và nền tảng nhóm chạy ổn định. Luồng mock, video hoặc bước chưa tích hợp phải ghi rõ; không thay bằng chứng luồng thật hay kết quả dùng thử.

## 6. Phạm vi hoàn thành MVP EXE201

| Mức ưu tiên | Phạm vi |
|---|---|
| Hoàn thiện luồng chính | Đăng nhập/tiệm, danh mục, POS/nhập câu/voice, giỏ và chốt thu/ghi nợ, lịch sử, chi phí, thu nợ, báo cáo cơ bản và Bobi chat |
| Giữ chức năng đang có | Nhiều tiệm, barcode, tồn đơn giản, hủy đơn có dấu vết, ảnh Product, inbox/audit và ADMIN; kiểm tra phần được dùng và không gỡ bỏ để thu hẹp tài liệu |
| Hoãn mở rộng chưa cần | Nhận diện ảnh/API audio mới, RAG/memory dài hạn, chart/analytics nâng cao, UI/provider chưa cần cho kịch bản, tối ưu tải lớn và kiến trúc bổ sung |

Các hành vi và mã yêu cầu chi tiết vẫn ở [BRD](business-requirements.md) và [PRD](product-requirements.md#11-ưu-tiên-hoàn-thành-môn-exe201). Danh mục đó không buộc hoàn thành mọi hạng mục trước demo môn học; chức năng được dùng vẫn phải đúng tiền/nợ/tồn, đúng quyền và có phản hồi lỗi dễ hiểu.

Không thuộc MVP: máy in, gói dịch vụ, kế toán/thuế và hóa đơn điện tử.

## 7. Ranh giới sản phẩm

Không yêu cầu thêm microservice, nhiều vùng, mục tiêu tải lớn, SLA thương mại hoặc bộ phận vận hành riêng. Giữ kiến trúc, guardrail, kiểm thử và công cụ đã có; sửa lỗi tích hợp/UX và kiểm chứng người dùng trước. Đơn đã chốt không sửa/xóa cứng; xử lý sai bằng hủy có dấu vết theo BRD.

MVP không phải phần mềm kế toán, không tính/kê khai thuế, thu hộ hoặc quản lý kho đầy đủ theo lô/kho. Lợi nhuận là ước tính vận hành; đơn bán không phải hóa đơn điện tử. Demo dùng dữ liệu thử không nhạy cảm và công bố giới hạn auth/privacy; phạm vi môn học không làm mất yêu cầu bảo vệ dữ liệu hoặc chứng minh đủ điều kiện thương mại.

ADMIN không được giả danh OWNER hoặc sửa invoice, expense, debt và tồn kho. Truy cập dữ liệu hỗ trợ phải có audit.

## 8. Mở rộng hóa đơn điện tử — chưa cam kết vào MVP

Hoãn sau EXE201. Các mã ứng viên và câu hỏi pháp lý được giữ tại [BRD §5–6](business-requirements.md#5-sáng-kiến-hóa-đơn-điện-tử--provisional), không yêu cầu nhóm tích hợp nhà cung cấp hoặc hoàn thiện nghiệp vụ thuế để demo sổ bán hàng. Nếu tiếp tục hướng này cần kiểm tra nguồn chính thức và phê duyệt riêng trước khi triển khai.

## 9. Nguồn và giới hạn

- Nguồn lịch sử Core/FE: FE EXE201, kiểm tra 2026-09-15. Xem [thiết kế kỹ thuật §1](../architecture/technical-design.md#1-scope) để phân biệt hiện trạng với đích MVP.
- Ưu tiên EXE201 theo chỉ đạo chủ dự án ngày 2026-11-06; không thay API hoặc trạng thái triển khai chỉ bằng việc sửa docs.
- Kết quả demo và phản hồi phải được ghi sau khi thực hiện theo [mẫu kiểm chứng](mvp-demo-validation.md#5-ghi-kết-quả-và-chọn-việc-còn-lại); đợt sửa tài liệu không chạy lại ứng dụng hoặc tự xác nhận BO/AC đạt.
