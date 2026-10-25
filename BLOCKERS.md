### [2026-10-26] — [Validation] Đã hoàn tất hồi quy PostgreSQL cho admin growth

**Status:** Resolved

**Blocked by:** Trước đó Docker Desktop báo lỗi process và CLI không kết nối được Linux engine. Người dùng đã khôi phục Docker; lượt kiểm tra lại đã hoàn tất.

**Resolution:** `mvnw.cmd -B verify` trên đúng commit `976be02` trong checkout tạm sạch, dùng PostgreSQL 16.15 riêng, đạt BUILD SUCCESS: 1.422 test, không failure/error/skip. Đối chiếu tổng Maven với các testcase XML; gồm 22 test controller và 18 test PostgreSQL của dashboard, có assertion phiên DB UTC. Log local: `backend/core/target/admin-growth-full-verify-20261026.log` (ignored). Không dùng DB nghiệp vụ local/staging/production, không tạo migration mới.

**Next action:** Chỉ push sau khi người dùng duyệt. FE integration, staging smoke/UAT và đánh giá tải thực tế vẫn là các bước nghiệm thu sau; kết quả local không thay thế các bước này.

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
