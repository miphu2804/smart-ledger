### [2026-10-26] — [CI] PR #368 chờ runner hoặc xử lý billing của chủ repository

**Status:** Open

**Blocked by:** [CI #785](https://github.com/miphu2804/smart-ledger/actions/runs/40218136882) mất kết nối self-hosted runner trước bước build/test. [CI #786](https://github.com/miphu2804/smart-ledger/actions/runs/40277351366) trên nhánh feature vẫn chờ runner. Lượt thủ công [CI #787](https://github.com/miphu2804/smart-ledger/actions/runs/40278406256) chạy nhánh main bị GitHub chặn trước khi cấp runner vì tài khoản chủ repository bị khóa do billing; summary sau đó lỗi fromJSON vì không có runner output. Người dùng không quản lý máy M4 Pro.

**Impact:** Chưa có CI pass cho HEAD của PR #368. Kiểm thử local đã đạt không thay required checks. Quota artifact đã chặn upload summary ở #785, nhưng upload đó là optional/continue-on-error và không phải nguyên nhân hai job Core/container thất bại.

**Next action:** Chủ repository xử lý billing hoặc người quản lý M4 Pro khôi phục runner/mạng, sau đó chạy CI trên đúng `feat/admin-dashboard-growth` và kiểm tra các job thực sự thực thi. Không bỏ required checks, tự đổi biến runner, xóa artifact hay merge để né blocker.

### [2026-10-26] — [Validation] Đã hoàn tất hồi quy PostgreSQL cho admin growth

**Status:** Resolved

**Blocked by:** Trước đó Docker Desktop báo lỗi process và CLI không kết nối được Linux engine. Người dùng đã khôi phục Docker; lượt kiểm tra lại đã hoàn tất.

**Resolution:** `mvnw.cmd -B verify` trên đúng commit `976be02` trong checkout tạm sạch, dùng PostgreSQL 16.15 riêng, đạt BUILD SUCCESS: 1.422 test, không failure/error/skip. Đối chiếu tổng Maven với các testcase XML; gồm 22 test controller và 18 test PostgreSQL của dashboard, có assertion phiên DB UTC. Log local: `backend/core/target/admin-growth-full-verify-20261026.log` (ignored). Không dùng DB nghiệp vụ local/staging/production, không tạo migration mới.

**Next action:** Nhánh đã được duyệt push và công bố tại `6381054`; PR #368 đang mở vào staging. Xử lý các check CI/review, sau đó nghiệm thu FE integration, staging smoke/UAT và đánh giá tải thực tế; kết quả local không thay thế các bước này.

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
