# Khai báo Data safety trên Google Play

Bảng trả lời cho form **Play Console → Nội dung ứng dụng → An toàn dữ liệu** của bản Android Sổ Nghe Lời. Nội dung phải khớp với [trang chính sách](../../frontend/web/src/pages/legal/PolicyPage.tsx) (`https://songheloi.id.vn/chinh-sach`).

- Người đứng tên duyệt nội dung pháp lý: Minh Thọ.
- Đối chiếu ngày 2026-11-01 với code trên `staging`, [hướng dẫn của Google](https://support.google.com/googleplay/android-developer/answer/10787469) và [khai báo của Firebase](https://firebase.google.com/docs/android/play-data-disclosure).
- Đổi SDK, nhà cung cấp hay dữ liệu thu thập thì cập nhật cả tài liệu này, trang chính sách và form.

## Câu hỏi chung

| Câu hỏi trong form | Trả lời |
|---|---|
| Ứng dụng có thu thập hoặc chia sẻ dữ liệu người dùng thuộc các loại bắt buộc khai không? | Có |
| Mọi dữ liệu thu thập có được mã hoá khi truyền đi không? | Có (HTTPS) |
| Người dùng có cách yêu cầu xoá dữ liệu không? | Có |
| Cách tạo tài khoản | Tên người dùng và mật khẩu; OAuth (Google, Zalo) |
| URL xoá tài khoản | `https://songheloi.id.vn/delete-account` |
| URL chính sách quyền riêng tư | `https://songheloi.id.vn/chinh-sach` |
| Cam kết theo chính sách Families | Không (ứng dụng không dành cho trẻ em) |
| Đánh giá bảo mật độc lập | Không |
| Huy hiệu UPI | Không |

## Loại dữ liệu cần chọn

Mọi loại dưới đây: **Thu thập: có. Chia sẻ: không. Xử lý tạm thời (ephemeral): không.** Lý do không tính là chia sẻ nằm ở mục tiếp theo.

| Nhóm | Loại dữ liệu | Bắt buộc hay tuỳ chọn | Mục đích | Trong app là gì |
|---|---|---|---|---|
| Thông tin cá nhân | Tên | Bắt buộc | Chức năng, Quản lý tài khoản, Phân tích | Tên chủ tiệm; tên khách trong sổ nợ, có thể nằm trong bản ghi HoneyHive |
| Thông tin cá nhân | Địa chỉ email | Bắt buộc | Chức năng, Quản lý tài khoản | Đăng nhập, xác minh email |
| Thông tin cá nhân | ID người dùng | Bắt buộc | Chức năng, Quản lý tài khoản, Chống gian lận và bảo mật | Firebase UID, ID tài khoản Core |
| Thông tin cá nhân | Địa chỉ | Tuỳ chọn | Chức năng | Địa chỉ cửa hàng |
| Thông tin cá nhân | Số điện thoại | Tuỳ chọn | Chức năng, Phân tích | Số của tiệm và của khách, có thể nằm trong bản ghi HoneyHive |
| Tài chính | Lịch sử mua hàng | Bắt buộc | Chức năng, Phân tích | Đơn bán và thanh toán của cửa hàng; phần trợ lý đã đọc nằm trong bản ghi HoneyHive |
| Tài chính | Thông tin tài chính khác | Bắt buộc | Chức năng, Phân tích | Doanh thu, chi phí, công nợ; phần trợ lý đã đọc nằm trong bản ghi HoneyHive |
| Tin nhắn | Tin nhắn khác trong ứng dụng | Tuỳ chọn | Chức năng, Phân tích | Hội thoại với trợ lý Bobi; câu hỏi đã che email, số thẻ, khoá truy cập được ghi trên HoneyHive |
| Ảnh và video | Ảnh | Tuỳ chọn | Chức năng | Ảnh sản phẩm tải lên |
| Hoạt động trong ứng dụng | Lượt tương tác với ứng dụng | Bắt buộc | Phân tích, Chống gian lận và bảo mật | Nhật ký thao tác, ngày hoạt động để đếm người dùng |
| Hoạt động trong ứng dụng | Lịch sử tìm kiếm trong ứng dụng | Tuỳ chọn | Chức năng | Từ khoá tìm hàng và đơn gửi lên Core, có thể nằm trong log |
| Hoạt động trong ứng dụng | Nội dung khác do người dùng tạo | Bắt buộc | Chức năng | Tên tiệm, hàng hoá, danh mục, nội dung đơn |
| Thông tin và hiệu suất | Chẩn đoán | Bắt buộc | Phân tích | Log request, mã lỗi, độ trễ trên máy chủ |

## Không chọn

| Loại dữ liệu | Lý do | Bằng chứng |
|---|---|---|
| Bản ghi âm giọng nói | Chuyển thành chữ ngay trên máy, không gửi đi; Google không yêu cầu khai dữ liệu chỉ xử lý trên thiết bị | `src/lib/speech/`, không có đường gửi audio. Phần văn bản đã khai ở các loại trên |
| Thông tin thanh toán của người dùng | Không có thanh toán trong app. Số tài khoản ngân hàng của tiệm chỉ lưu trên máy | `localProfile`, không gửi lên Core |
| Vị trí | Không xin quyền vị trí, không suy ra vị trí từ địa chỉ IP | `app.json` chỉ có `CAMERA`, `RECORD_AUDIO`; không có GeoIP trong `deploy/` và Core |
| Danh bạ | Không xin quyền danh bạ; tên khách do chủ tiệm tự nhập | `app.json` |
| ID thiết bị hoặc ID khác | Không có Firebase Analytics hay SDK quảng cáo. Firebase Auth không tạo loại ID này theo khai báo của Firebase | `package.json` |
| Nhật ký sự cố | Không có SDK báo lỗi | `package.json` |
| Hình từ camera lúc quét mã | Chỉ xử lý trên máy | Trang chính sách, mục 5 |

## Vì sao khai "không chia sẻ"

Theo Google, chuyển dữ liệu cho **bên xử lý thay mình theo chỉ dẫn của mình** hoặc **do người dùng chủ động yêu cầu** thì không tính là chia sẻ.

| Bên nhận | Dữ liệu | Căn cứ |
|---|---|---|
| Firebase, Supabase, Cloudinary, VPS, Vercel, Cloudflare R2 | Tuỳ dịch vụ | Bên xử lý cho hệ thống của nhóm |
| OpenAI, Inception | Câu hỏi và dữ liệu cửa hàng liên quan, khi người dùng hỏi Bobi | Bên xử lý, và do người dùng chủ động hỏi |
| HoneyHive | Câu hỏi đã che, dữ liệu trợ lý đã đọc, câu trả lời; có thể chứa tên và số điện thoại khách (`backend/ai/src/observability.py`). Không gồm ảnh hay âm thanh | Bên xử lý để nhóm tìm lỗi và cải thiện chất lượng |
| Google, Zalo | Thông tin đăng nhập | Người dùng chủ động chọn cách đăng nhập |

## Việc người đứng tên cần xác nhận

1. **OpenAI, Inception và HoneyHive:** điều khoản của họ có đúng là chỉ xử lý theo chỉ dẫn, không dùng dữ liệu cho mục đích riêng không. Chưa đọc điều khoản của ba bên này. Nếu không đúng, đổi các loại dữ liệu gửi cho bên đó sang **có chia sẻ**: tin nhắn, thông tin tài chính khác, lịch sử mua hàng, và tên, số điện thoại với HoneyHive.
2. **Facebook SDK:** chưa xác nhận được bản production có kèm SDK không, vì giá trị `FACEBOOK_APP_ID` nằm trong secret. Trong code, SDK đã tắt tự ghi sự kiện và mã quảng cáo, nên bảng trên không khai thêm gì. Kiểm tra lại trên file AAB trước khi nộp.
3. **Bản Android phân phối:** chưa kiểm tra trên AAB production thật, phần bằng chứng ở trên đọc từ code và cấu hình.
4. **Thời gian lưu trên HoneyHive:** chưa biết, và mục 13 của trang chính sách chưa nêu. Lịch sử hội thoại xoá trong app không kéo theo bản ghi trên HoneyHive, nên kiểm tra việc này khi xử lý yêu cầu xoá tài khoản.
