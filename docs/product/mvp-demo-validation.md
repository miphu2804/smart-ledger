---
type: Plan
title: "Demo và kiểm chứng MVP EXE201"
description: "Fixture demo, các bước đầu-cuối, cách thu phản hồi người dùng và mẫu ghi kết quả cho MVP môn EXE201."
owner: Nhóm Sổ Nghe Lời
status: draft
author: TranTho918
stale_after: 2027-01-05T04:32:37+07:00
---
# Demo và kiểm chứng MVP EXE201

Tài liệu này là kế hoạch ưu tiên và mẫu ghi kết quả; buổi demo và kiểm chứng chưa được thực hiện.

## 1. Mục tiêu hoàn thành

Chứng minh một người bán có thể dùng sản phẩm để ghi một đơn, thu tiền hoặc ghi nợ, ghi chi và xem lại số liệu đúng; thử nhập bằng giọng nói và hỏi Bobi trên dữ liệu của tiệm. Ưu tiên một luồng chạy thật qua mobile → Core → dữ liệu, và Core → AI cho chat. Phạm vi bám [BRD §3](business-requirements.md#3-phạm-vi-kinh-doanh) và [PRD §1.1](product-requirements.md#11-ưu-tiên-hoàn-thành-môn-exe201).

Đây là tiêu chí nội bộ của nhóm để chuẩn bị sản phẩm môn học, không tự thay rubric của giảng viên hoặc chứng minh sẵn sàng kinh doanh quy mô lớn. Một tiệm mẫu đủ cho buổi demo chính; các kiểm tra quyền giữa tài khoản/tiệm vẫn cần được giữ. Hoàn thành demo không có nghĩa toàn bộ FR/AC trong lịch sử dự án đã được nghiệm thu.

## 2. Chuẩn bị buổi demo

- Ghi commit/bản build, nền tảng và cấu hình mock hay thật. Luồng nào chỉ chạy mock phải ghi rõ, không dùng video/mock để báo đã tích hợp thật.
- Chọn nền tảng nhóm có thể chạy ổn định; kiểm đăng nhập bằng provider đã cấu hình. Không yêu cầu thêm mọi provider hoặc đồng thời hoàn thiện Android, iOS và web trước buổi demo.
- Dùng tiệm/tài khoản thử, không có dữ liệu nhạy cảm. Chuẩn bị hai mặt hàng A/B: giá bán 20.000đ/10.000đ, giá vốn 12.000đ/6.000đ, tồn ban đầu 10 mỗi mặt hàng; ngưỡng cảnh báo không cần cho kịch bản chính.
- Kiểm mạng, Core và model cho Bobi bằng một câu hỏi thử; đọc [API contracts](../contracts/api-contracts.md) và [hiện trạng kỹ thuật](../architecture/technical-design.md#1-scope) khi gặp đường tích hợp chưa có. Không mở migration/feature flag mới chỉ để thêm phần trình diễn.
- Chụp số liệu đầu kỳ hoặc dùng tiệm thử trống để đối chiếu chênh lệch. Chỉ so các giao dịch trong cùng kỳ; không lấy dữ liệu từ một trang list làm tổng sổ.

## 3. Kịch bản đầu-cuối ưu tiên

| Bước | Người dùng làm gì | Kết quả phải kiểm | Truy vết |
|---|---|---|---|
| 1 | Đăng nhập, tạo hoặc chọn tiệm thử | Đúng tài khoản/tiệm, không lộ dữ liệu tiệm khác; tài khoản chưa có tiệm được hướng dẫn tạo | `BR-009` → `FR-010`, `FR-011` → `AC-079`, `AC-093` |
| 2 | Tạo A/B và chọn lên giỏ bằng POS | Hiện đúng tên, lượng, giá; sửa được trước chốt | `BR-007`, `BR-003` → `FR-009`, `FR-013`, `FR-003` → `AC-002`, `AC-005` |
| 3 | Đọc “hai A, một B” bằng tên thật của mặt hàng, rồi thử nhập tay | Transcript/giỏ để kiểm tra; sửa món nghe sai; nếu nền tảng chưa hỗ trợ mic thì ghi giới hạn đó và dùng nhập tay để hoàn tất luồng bán | `BR-002` → `FR-001`, `FR-008`, `FR-021` → `AC-001`, `AC-008`, `AC-011`, `AC-074` |
| 4 | Chốt giỏ 2 A + 1 B, thu đủ 50.000đ tiền mặt | Chỉ một sale, tiền thực thu 50.000đ, tồn A/B còn 8/9; mở lại lịch sử thấy đúng đơn | `BR-003`, `BR-010`, `BR-016` → `FR-004`, `FR-014` → `AC-002`, `AC-024` |
| 5 | Bán 1 A, thu trước 5.000đ, ghi nợ khách thử; sau đó thu thêm 15.000đ | Đơn 20.000đ, nợ từ 15.000đ về 0; khoản thu gắn đúng debtId, không tạo sale mới; tồn A còn 7 | `BO-005`, `BR-008` → `FR-016` → `AC-006`, `AC-075` |
| 6 | Ghi khoản chi 10.000đ rồi mở báo cáo cùng kỳ | Chênh lệch: doanh thu 70.000đ, thu 70.000đ, chi 10.000đ, giá vốn 42.000đ, lãi gộp 28.000đ và lãi sau chi phí 18.000đ nếu chỉ có các đơn trên và đủ giá vốn | `BO-002`, `BR-004`, `BR-005` → `FR-006`, `FR-015` → `AC-004`, `AC-007`, `AC-078` |
| 7 | Hỏi Bobi doanh thu hoặc công nợ kỳ này, rồi hỏi tiếp | Chat qua AI thật, đúng tiệm/kỳ hoặc nói rõ thiếu dữ liệu; không tự ghi giao dịch. Khi model/tool lỗi, báo lỗi rõ và vẫn dùng POS/nhập tay | `BO-003`, `BR-011`, `BR-012` → `FR-020`, `FR-021`, `FR-027` → `AC-014`, `AC-020`, `AC-076`, `AC-077` |
| 8 | Thử một lần retry sau lỗi mạng và một lỗi dữ liệu/nhận diện | Không nhân đôi đơn/thu nợ/tồn trong thao tác có chống trùng; người bán hiểu cách sửa/tiếp tục. Không áp quy tắc idempotency sale cho retry chat | `BR-016` → `FR-004`, `FR-016`, `FR-021` → `AC-003`, `AC-011`, `AC-024` |

Số tiền/tồn trên là **kết quả kỳ vọng cho fixture**, không phải kết quả đã chạy. Nếu mic hoặc Bobi thật chưa chạy, ghi phần đó chưa đạt; POS/nhập tay chứng minh được luồng còn lại nhưng không thay bằng chứng về giá trị giọng nói/AI. Chỉ công bố demo đầu-cuối cho các bước có bằng chứng thực tế.

Nếu còn thời gian, kiểm thêm hủy toàn bộ một đơn ở fixture riêng (`AC-026`–`AC-030`), đổi tiệm (`AC-109`), ảnh Product, thông báo và tra cứu ADMIN. Giữ các chức năng đang có; không cần bổ sung màn giảm tồn, chart growth hoặc UI provider mới để kéo dài demo.

## 4. Kiểm chứng với người dùng

Mời người thuộc nhóm mục tiêu dùng thử, ưu tiên người bán nhỏ mà nhóm tiếp cận được. Quan sát họ tự tạo/chọn hàng, ghi đơn, ghi nợ và tìm lại số liệu; tránh hướng dẫn từng nút ngay từ đầu. Nếu chỉ có bạn học dùng thử thì ghi đúng đối tượng và giới hạn, không gọi đó là bằng chứng đại diện cho chủ tiệm.

| Nội dung | Ghi nhận đơn giản |
|---|---|
| Hoàn thành tác vụ | Làm được, cần trợ giúp hay bỏ dở; thời gian quan sát và số lần sửa giỏ/nhập lại |
| Hiểu số liệu | Phân biệt được doanh thu, tiền đã thu, còn nợ và lãi ước tính không; câu nào gây hiểu nhầm |
| Giá trị voice/Bobi | Có giúp nhanh/dễ hơn nhập tay không; câu nghe sai/câu trả lời không có căn cứ và cách người dùng xử lý |
| Phản hồi | Điểm hữu ích nhất, khó chịu nhất và một thay đổi họ muốn trước lần thử sau |

Không cần dashboard analytics mới hoặc nghiên cứu thị trường quy mô lớn để có vòng phản hồi đầu. Ghi số người tham gia, đối tượng và dữ liệu quan sát thật; không tự đặt tỷ lệ thành công hoặc tuyên bố đạt BO nếu chưa đo.

## 5. Ghi kết quả và chọn việc còn lại

| Ngày / build / nền tảng / mock-thật | Bước hoặc tác vụ | Kỳ vọng / thực tế | Đạt / chưa đạt / chưa thử | Vấn đề, người sửa và lần kiểm lại |
|---|---|---|---|---|
| Chưa thực hiện | Điền sau buổi chạy | Không điền kết quả giả | Chưa thử | Nhóm trưởng phân công |

Sửa trước lỗi chặn đăng nhập/chốt đơn, sai tiền/nợ/tồn, sai phạm vi dữ liệu hoặc làm mất input; tiếp theo là chỗ người dùng không hiểu và lỗi mic/chat trong kịch bản. Các cải tiến khác ghi backlog, chọn việc nhỏ nhất giúp luồng chính tốt hơn. Không mở rộng kiến trúc, tính năng hoặc tiêu chuẩn vận hành chỉ để tăng số mục hoàn thành.
