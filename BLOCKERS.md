### [2026-10-26] — [Validation] Chưa chạy đủ hồi quy PostgreSQL cho admin growth

**Status:** Open

**Blocked by:** Docker Desktop trên máy báo lỗi process khi khởi chạy (người dùng xác nhận); CLI không kết nối được Linux engine. Không restart cưỡng bức vì có thể ảnh hưởng container khác.

**Impact:** Nhánh `feat/admin-dashboard-growth` đã build/verify không DB thành công (1.050 test thực thi, 256 bỏ qua), nhưng chưa xác nhận toàn bộ PostgreSQL và assertion phiên DB UTC mới thêm. Bộ 47 test tập trung đã đạt trên DB tạm ngày 2026-10-22 không thay cho lượt chạy lại này. Không đánh dấu sẵn sàng push/merge chỉ từ kiểm tra không DB.

**Next action:** Người dùng cung cấp nguyên văn lỗi Docker và khôi phục Engine running; sau đó chạy Core verify với PostgreSQL tạm riêng, cập nhật bằng chứng và trạng thái blocker. Không dùng DB nghiệp vụ local/staging/production; chỉ push sau khi người dùng duyệt.

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
