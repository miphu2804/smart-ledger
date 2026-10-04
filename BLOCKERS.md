### [2026-10-05 00:55 UTC+07:00] — [AI] Tool SQL báo "permission denied to set role" với POSTGRES_URL của .env.staging

**Status:** Resolved (2026-10-05 09:41 UTC+07:00) — sau khi cấp `SET` option và chạy migration 004 trên staging, chat trên simulator trả đúng 5 sản phẩm đắt nhất.

**Blocked by:** Với `POSTGRES_URL` lấy từ `.env.staging` (user `postgres` qua pooler Supabase), `SET LOCAL ROLE ai_sql_reader` bị từ chối. `pg_has_role(..., 'member')` trả `true` nhưng `SET` bị từ chối; nguyên nhân dự đoán là membership thiếu `SET` option (PostgreSQL 16+), chưa xác minh vì truy vấn kiểm tra trên staging bị chặn. `POSTGRES_URL` trong `backend/ai/.env` (user `smartledger`) chạy được.

**Impact:** Chạy AI service với biến từ `.env.staging` thì agent trả "chưa lấy được dữ liệu" cho câu hỏi về tiệm; chat thường vẫn chạy.

**Next action:** Người có quyền DB kiểm tra `pg_auth_members` cho `ai_sql_reader` rồi chạy `GRANT ai_sql_reader TO <user> WITH SET TRUE;` cho user dùng trong `.env.staging`, hoặc dùng `POSTGRES_URL` của `smartledger`.

### [2026-09-15 21:46 UTC+07:00] — [Planning] Chưa gán được issue dashboard cho Hiep

**Status:** Open

**Blocked by:** Chưa có GitHub username của Hiep và Hiep chưa xuất hiện trong danh sách collaborator của repository.

**Impact:** #17–#19 đã ghi Hiep là người phụ trách dự kiến nhưng GitHub assignee đang để trống.

**Next action:** Cung cấp đúng GitHub username hoặc thêm Hiep làm collaborator, sau đó gán #17–#19.
