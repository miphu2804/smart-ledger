# ADR-0002: Tool SQL của Agent dùng chung kết nối PostgreSQL và hạ quyền bằng `SET LOCAL ROLE`

- **Trạng thái:** Proposed — chờ team duyệt
- **Ngày:** 2026-10-05
- **Owner:** chưa chỉ định

## Bối cảnh

- Tool `query_shop_data` chạy câu `SELECT` do model sinh ra trên dữ liệu của tiệm đang chọn ([API contract](../../contracts/api-contracts.md)).
- Trước đây tool dùng một login riêng (`AI_SQL_READER_URL`, thuộc role `ai_sql_reader`) và mở kết nối mới cho mỗi câu truy vấn. Cấu hình này phải tạo thêm login, giữ thêm một secret cho mỗi môi trường, và tách khỏi `PostgreDBClient` mà phần lịch sử chat đã dùng.
- Ranh giới an toàn có năm lớp: role, view `ai_read`, `SqlGuard`, executor, output ([README của AI](../../../backend/ai/README.md#shop-data-tool-read-only-sql)). Role là lớp duy nhất nằm ở tầng DB, nên là lớp chặn cuối khi guard sót.
- `PostgreDBClient` giữ một connection duy nhất, khoá bằng `RLock`, kết nối bằng user có quyền ghi (`POSTGRES_URL`).

## Quyết định

Tool SQL dùng lại connection của `PostgreDBClient`. Mỗi lần chạy là một transaction `READ ONLY` thực hiện `SET LOCAL ROLE ai_sql_reader`, gắn `smartledger.shop_id`, rồi luôn rollback.

- Bỏ `AI_SQL_READER_URL`. User của `POSTGRES_URL` phải là member của `ai_sql_reader` (`GRANT ai_sql_reader TO <user> WITH SET TRUE`, PostgreSQL 16+).
- Thêm cờ `SQL_TOOL_ENABLED` (mặc định `false`) để triển khai code trước, bật tool sau khi môi trường đã cấp quyền. Tắt cờ thì agent vẫn chat, không có tool.
- Không đổi migration `004`, view `ai_read`, `SqlGuard` hay hợp đồng của `/internal/v1/agent/chat`.

## Lý do

| Tiêu chí | Login riêng (trước) | Dùng chung + `SET LOCAL ROLE` |
|---|---|---|
| Quyền khi chạy SQL của model | Chỉ `ai_sql_reader` | Chỉ `ai_sql_reader`, trong từng transaction |
| Secret và login mỗi môi trường | Thêm một login và một URL | Không thêm |
| Kết nối | Mở mới mỗi lần chạy | Dùng lại connection có sẵn |
| Cấu hình | `AI_SQL_READER_URL` | Cờ `SQL_TOOL_ENABLED` và một lệnh `GRANT` |

Phương án đã loại: bỏ hẳn role và chỉ dựa vào view cùng `SqlGuard`. Một câu SQL lọt guard khi đó chạy với quyền đọc ghi của app, nên mất lớp chặn ở tầng DB.

## Hệ quả

- `SET LOCAL ROLE` chỉ có hiệu lực trong transaction và hết khi rollback, nên connection dùng chung không giữ role thấp hay phạm vi tiệm sau mỗi lần chạy (có integration test).
- `SET LOCAL ROLE` không áp dụng cài đặt riêng theo role (`ALTER ROLE ... SET`). Executor đặt `READ ONLY`, `statement_timeout` và `search_path` trong từng transaction, không dựa vào cài đặt của login.
- Truy vấn dài tới `SQL_TIMEOUT_MS` (mặc định 3 giây) giữ khoá của connection duy nhất và chặn các truy vấn DB khác trong lúc chạy. Chat vốn đã tuần tự trên connection này.
- Xem xét lại khi đo được độ trễ chat do SQL, hoặc khi `PostgreDBClient` chuyển sang connection pool. Khi đó chỉ cần đổi cách lấy connection trong executor, ranh giới quyền không đổi.
- Điều kiện kiểm tra khi bật ở môi trường mới: user của `POSTGRES_URL` là member của `ai_sql_reader` có quyền `SET` (`pg_has_role(current_user, 'ai_sql_reader', 'SET')`; `'member'` vẫn trả `true` khi thiếu `SET`). Đã xác minh trên staging ngày 2026-10-05.
