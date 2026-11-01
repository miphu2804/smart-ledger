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
| Thông tin cá nhân | Tên | Bắt buộc | Chức năng, Quản lý tài khoản | Tên chủ tiệm; tên khách trong sổ nợ |
| Thông tin cá nhân | Địa chỉ email | Bắt buộc | Chức năng, Quản lý tài khoản | Đăng nhập, xác minh email |
| Thông tin cá nhân | ID người dùng | Bắt buộc | Chức năng, Quản lý tài khoản, Chống gian lận và bảo mật | Firebase UID, ID tài khoản Core |
| Thông tin cá nhân | Địa chỉ | Tuỳ chọn | Chức năng | Địa chỉ cửa hàng |
| Thông tin cá nhân | Số điện thoại | Tuỳ chọn | Chức năng | Số của tiệm và của khách |
| Tài chính | Lịch sử mua hàng | Bắt buộc | Chức năng | Đơn bán và thanh toán của cửa hàng |
| Tài chính | Thông tin tài chính khác | Bắt buộc | Chức năng | Doanh thu, chi phí, công nợ |
| Tin nhắn | Tin nhắn khác trong ứng dụng | Tuỳ chọn | Chức năng | Hội thoại với trợ lý Bobi |
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
| Firebase, Supabase, Redis Cloud, Cloudinary, VPS, Vercel, Cloudflare R2 | Tuỳ dịch vụ | Bên xử lý cho hệ thống của nhóm |
| OpenCode Go, OpenAI | Câu hỏi và dữ liệu cửa hàng liên quan, khi người dùng hỏi Bobi | Bên xử lý, và do người dùng chủ động hỏi. Agent không đọc tên, số điện thoại khách (`AC-077`) |
| Google, Zalo | Thông tin đăng nhập | Người dùng chủ động chọn cách đăng nhập |

## Việc người đứng tên cần xác nhận

1. **OpenCode Go và OpenAI:** điều khoản của họ có đúng là chỉ xử lý theo chỉ dẫn, không dùng dữ liệu cho mục đích riêng không. Chưa đọc điều khoản của hai bên này. Nếu không đúng, đổi "Tin nhắn khác trong ứng dụng" và "Thông tin tài chính khác" sang **có chia sẻ**, mục đích Chức năng.
2. **Facebook SDK:** chưa xác nhận được bản production có kèm SDK không, vì giá trị `FACEBOOK_APP_ID` nằm trong secret. Trong code, SDK đã tắt tự ghi sự kiện và mã quảng cáo, nên bảng trên không khai thêm gì. Kiểm tra lại trên file AAB trước khi nộp.
3. **Bản Android phân phối:** chưa kiểm tra trên AAB production thật, phần bằng chứng ở trên đọc từ code và cấu hình.
