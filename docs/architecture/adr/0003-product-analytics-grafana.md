# ADR-0003: Product analytics trong Grafana đọc từ dữ liệu Core và AI

- **Trạng thái:** Proposed. Datasource, dashboard và playbook của P1 đã có trong repo (`deploy/monitoring/`), nhưng chưa bật trên môi trường nào: còn chờ owner cơ sở dữ liệu tạo role `grafana_reader` và nạp `GRAFANA_PG_*` vào Dopbase. Không có migration hay code Core/AI; không phải hành vi sản phẩm cho tới khi chủ sở hữu sản phẩm và chủ vận hành duyệt.
- **Ngày:** 2026-10-29
- **Owner:** chưa chỉ định; cần một owner sản phẩm cho định nghĩa chỉ số và một owner cơ sở dữ liệu cho vai trò đọc.
- Liên quan: [OPS-004 #269](https://github.com/miphu2804/smart-ledger/issues/269) (monitoring), [CORE-018 #409](https://github.com/miphu2804/smart-ledger/issues/409) (DAU/MAU), ba dashboard hạ tầng của PR #422.

## 1. Bối cảnh

- Hạ tầng monitoring đã có ba lớp Infra trong Grafana 12.1.1: overview, service và resources ([CI/CD](../../development/ci-cd.md#monitoring), [`deploy/monitoring/`](../../../deploy/monitoring/)). Chúng trả lời "hệ thống có sao không", không trả lời "chủ tiệm dùng tính năng nào".
- Core chỉ phơi `/actuator/health`; không có `/actuator/prometheus` và không ghi access log có đường dẫn ([`application.yml`](../../../backend/core/src/main/resources/application.yml)). Vì vậy không có metric request theo route của Core.
- Caddy chỉ cho metric theo host, không theo route ([`Caddyfile`](../../../deploy/edge/Caddyfile)); recording rule gộp còn `env` và `service` ([`service-red.yml`](../../../deploy/monitoring/prometheus/rules/service-red.yml)).
- AI phơi `/metrics` qua prometheus-fastapi-instrumentator với nhãn `handler`, `method`, `status`, độ trễ tính tới byte cuối của stream ([`main.py`](../../../backend/ai/src/main.py), [AI README](../../../backend/ai/README.md)).
- Core đã ghi sẵn một dòng sự kiện append-only cho mỗi thao tác nghiệp vụ thành công: `audit_logs` có `actor_user_id`, `actor_role`, `shop_id`, `action`, `entity_type`, `entity_id`, `request_id`, `metadata`, `created_at`, cấm UPDATE/DELETE ([ERD](../../architecture/erd-description.md)).
- `user_daily_activity` (V19, CORE-018) cho DAU/MAU nhưng runtime mặc định tắt và chưa migrate/rollout trên shared database ([hướng dẫn rollout](../../../backend/core/docs/user-daily-activity.md)).
- Lịch sử chat nằm trong `chat_conversations`/`chat_messages` do AI baseline tạo; `ai_requests` chỉ là thiết kế đích, chưa có bảng.

## 2. Ràng buộc

- Core bị đóng băng trừ phạm vi PR #368 ([AGENTS.md](../../../AGENTS.md)); thiết kế P1 không được sửa Core, không thêm migration, không thêm endpoint.
- VPS 4 GB, monitoring giới hạn khoảng 1 GB RAM; Grafana đã 256 MB.
- Supabase session pooler chỉ cho 15 client; Core giữ tới 10 (Hikari mặc định), AI giữ tới 4 ([AI README](../../../backend/ai/README.md#routes-and-database-access)).
- Supabase direct host là IPv6-only; VPS không có IPv6 dùng session pooler ([CI/CD](../../development/ci-cd.md#vps)).
- Không lưu hay đọc PII qua Grafana: không tên/số điện thoại khách, không nội dung chat, không mô tả chi phí, không email (trừ cột đã duyệt cho DAU/MAU).

## 3. Câu hỏi sản phẩm cần trả lời

| Câu hỏi | Chỉ số | Nguồn |
|---|---|---|
| Bao nhiêu người dùng thật sự quay lại? | DAU, WAU, MAU, stickiness DAU/MAU | `user_daily_activity` |
| Người dùng mới có ở lại không? | Retention theo cohort tuần đăng ký | `users`, `user_daily_activity` |
| Bao nhiêu cửa hàng đang hoạt động? | Cửa hàng có sự kiện OWNER trong tuần | `audit_logs` |
| Cửa hàng mới có đi tới đơn đầu tiên không? | Funnel tạo tiệm → có hàng hoá → bán trong 7 ngày | `shops`, `products`, `sales` |
| Tính năng nào được dùng, bởi bao nhiêu cửa hàng? | Số cửa hàng distinct theo nhóm action | `audit_logs` |
| Trợ lý AI có được dùng và nhanh không? | Hội thoại/ngày, cửa hàng distinct, p95 theo route | `chat_conversations`, Prometheus AI |
| Đọc đơn bằng AI có hiệu quả không? | Tỉ lệ draft `AI_VOICE` và tỉ lệ draft AI được chốt | `sale_drafts` |
| Chất lượng bán hàng ra sao? | Đơn/ngày, doanh thu/ngày, tỉ lệ huỷ | `sales` |
| Dữ liệu analytics còn tươi không? | Tuổi bản ghi mới nhất theo bảng | tất cả |
| Người dùng đăng nhập bằng cách nào, có phải đăng nhập lại nhiều không? | Lượt đăng nhập theo phương thức | Chưa có nguồn; P2 (mục 6.4) |

## 4. Quyết định

Dựng lớp **Product** trong Grafana từ dữ liệu đã có, không sửa Core:

1. Một PostgreSQL datasource **chỉ đọc cho mỗi môi trường** (staging, production) trỏ vào Supabase bằng session pooler và role `grafana_reader`.
2. Một dashboard provision từ repo, **SmartLedger product**, tag `smart-ledger`, folder `Product`. Việc tra sự kiện nằm ở hàng `Events` thu gọn cuối dashboard thay vì một dashboard thứ hai, vì nó dùng cùng bộ lọc thời gian và môi trường.
3. Mọi chỉ số định nghĩa trên sự kiện đã ghi: `user_daily_activity` cho người dùng và retention, `audit_logs` cho cửa hàng và tính năng, bảng nghiệp vụ là kết quả, bảng chat là mức dùng AI, Prometheus AI là độ trễ/lỗi.
4. Phần thiếu (đăng nhập, phiên dùng app, screen view, thất bại) để P2/P3 và cần owner Core duyệt trước; mục 6.4 giải thích vì sao không đo logout.

## 5. Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Đếm sự kiện bằng Prometheus counter trong Core | Cần sửa Core, không có nhãn theo shop vì cardinality, và reset khi restart; để P2 sau khi owner duyệt |
| Tempo/OpenTelemetry cho trace phân tán | Cần OTel agent trong Core (đóng băng) và thêm container 200–400 MB trên VPS 4 GB; AI chỉ có Logfire tuỳ chọn; không trả lời được câu hỏi product như dữ liệu nghiệp vụ |
| PostHog/Umami/analytics SaaS | Cần SDK trong app, quyết định quyền riêng tư mới, chi phí và dữ liệu ra ngoài; team đã hoãn hạ tầng phụ trợ |
| Bảng `product_events` mới do client ghi | Cần endpoint Core mới và migration; mạnh hơn P1 nhưng chặn bởi phạm vi Core; để P3 nếu PO cần phễu theo intent |
| Đọc thẳng DB production bằng role owner | Vượt quyền tối thiểu, rủi ro ghi nhầm và lộ PII |

## 6. Mô hình sự kiện có sẵn

### 6.1 `audit_logs` là event log sản phẩm

Mỗi dòng là một hành động nghiệp vụ thành công, bất biến, có `request_id` để trace ngược. Nhóm theo tính năng:

| Tính năng | Action |
|---|---|
| Bán hàng | `SALE_CONFIRMED`, `SALE_VOIDED`, `SALE_REFUND_RECORDED` |
| Công nợ | `DEBT_REPAYMENT_RECORDED`, `DEBT_VOIDED` |
| Hàng hoá và tồn kho | `PRODUCT_CREATED`, `PRODUCT_UPDATED`, `PRODUCT_ARCHIVED`, `STOCK_ADJUSTED`, `STOCK_RESTORED_ON_VOID` |
| Danh mục | `CATEGORY_CREATED`, `CATEGORY_UPDATED`, `CATEGORY_ARCHIVED` |
| Chi phí | `EXPENSE_CREATED`, `EXPENSE_UPDATED`, `EXPENSE_ARCHIVED` |
| Tiệm | `SHOP_CREATED`, `SHOP_UPDATED`, `SHOP_ARCHIVED`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED` |
| Hồ sơ | `USER_AVATAR_UPDATED` |
| ADMIN | `ADMIN_*`, `SHOP_INACTIVATED`, `SHOP_REACTIVATED` với `actor_role=ADMIN` |

Giới hạn phải nêu trên dashboard: chỉ ghi thành công, chỉ các action trong whitelist, không có screen view, không có lần thất bại, không có thao tác đọc của OWNER. Vì vậy adoption là "đã làm" chứ không phải "đã mở".

### 6.2 Bảng nghiệp vụ và AI

| Nguồn | Cột dùng được | Chỉ số |
|---|---|---|
| `shops` | `id`, `owner_id`, `created_at` | Cửa hàng mới, funnel |
| `products` | `id`, `shop_id`, `status`, `barcode`, `created_at` | Có hàng hoá, độ phủ mã vạch |
| `sale_drafts` | `id`, `shop_id`, `source_type`, `confirmed_sale_id`, `created_at` | Tỉ lệ AI đọc đơn và tỉ lệ chốt |
| `sales` | `id`, `shop_id`, `total_vnd`, `sale_status`, `payment_status`, `sold_at`, `voided_at` | Doanh thu, tỉ lệ huỷ |
| `expenses` | `id`, `shop_id`, `amount_vnd`, `category`, `expense_at`, `source_ai_request_id` | Mức dùng chi phí |
| `debts`, `payments` | `id`, `sale_id`, `customer_id`, `amount_vnd`, `status`, `created_at`, `received_at` | Mức dùng công nợ |
| `chat_conversations` | `id`, `user_id`, `shop_id`, `started_at`, `last_message_at` | Mức dùng trợ lý |
| `chat_messages` | `conversation_id`, `role`, `created_at` | Cấu trúc lượt chat, không đọc nội dung |
| `notification_recipients` | `user_id`, `read_at`, `created_at` | Tỉ lệ đọc thông báo |
| Prometheus AI | `http_requests_total`, `http_request_duration_seconds_bucket` với `handler` | Lượt gọi theo route, p95, lỗi |

### 6.3 Phần thiếu, để P2/P3

- Lần quét mã vạch, mở màn, bắt đầu giọng nói, số lần thử và thất bại của AI: không có sự kiện.
- Thời gian xử lý một đơn trên UI: không có.
- Trace theo `request_id` trong log Core: Core không ghi request id ra log, nên chưa nối được sự kiện sang Loki.

### 6.4 Đăng nhập, đăng xuất và phiên dùng

- App mobile đăng nhập bằng Firebase (Google, Facebook, email, custom token cho Zalo) rồi gọi `POST /auth/session`; khi mở lại app, `AppStore` chỉ khôi phục phiên Firebase và gọi `GET /me` ([`AppStore.tsx`](../../../frontend/mobile/src/store/AppStore.tsx)). Vì vậy mỗi lần gọi `/auth/session` là một lần đăng nhập thật: tài khoản mới, cài lại app, đổi máy hoặc bị đăng xuất.
- Core không ghi lần gọi này: `audit_logs` không có action đăng nhập, Caddy chỉ đo theo host. Hôm nay không có nguồn cho số lượt đăng nhập.
- Đăng xuất chỉ là `signOut()` của Firebase trên máy, Core không nhận request nào. Firebase tự gia hạn token, nên phần lớn chủ tiệm không bao giờ bấm đăng xuất; đóng hay gỡ app không tạo sự kiện. Số lượt logout vì vậy nhỏ và lệch, không dùng làm chỉ số.
- "Người dùng có quay lại không" đã được trả lời bằng `user_daily_activity` và retention theo cohort, không cần login/logout.
- P2 đề xuất: Core ghi audit `USER_SIGNED_IN` trong `/auth/session` với `isNewAccount` và phương thức lấy từ claim `firebase.sign_in_provider` của ID token (chưa kiểm trên token thật). Nó cho tỉ lệ dùng từng cách đăng nhập, số lần đăng nhập lại mỗi user (cao là tín hiệu app mất phiên) và cho phép tách cohort theo phương thức. Cần owner Core duyệt; nếu `audit_logs` có CHECK constraint trên action thì cần thêm migration và phê duyệt riêng.
- P3: phiên dùng app (`app_open`, phiên kết thúc sau 30 phút ở background), đăng nhập thất bại theo phương thức (không bao giờ tới Core), và lý do bị đăng xuất (người dùng bấm, 401, 403, sai vai trò) từ `forceSignOut`; tất cả là sự kiện client.

## 7. Kiến trúc

### 7.1 Vai trò đọc

Một login `grafana_reader` cho mỗi môi trường, không superuser, không BYPASSRLS, chỉ SELECT theo cột. SQL bàn giao cho owner cơ sở dữ liệu; ADR này không chạy nó:

```sql
CREATE ROLE grafana_reader LOGIN PASSWORD '...' NOSUPERUSER NOBYPASSRLS NOINHERIT;
ALTER ROLE grafana_reader SET default_transaction_read_only = on;
ALTER ROLE grafana_reader SET statement_timeout = '10s';
ALTER ROLE grafana_reader SET idle_in_transaction_session_timeout = '30s';
GRANT USAGE ON SCHEMA public TO grafana_reader;

-- CORE-018 đã quy định cột này và policy RLS tương ứng.
GRANT SELECT (id, system_role, email, created_at) ON public.users TO grafana_reader;
GRANT SELECT (user_id, activity_date) ON public.user_daily_activity TO grafana_reader;
CREATE POLICY grafana_daily_activity_read ON public.user_daily_activity
    FOR SELECT TO grafana_reader USING (true);

GRANT SELECT (id, owner_id, created_at) ON public.shops TO grafana_reader;
GRANT SELECT (id, shop_id, status, barcode, created_at) ON public.products TO grafana_reader;
GRANT SELECT (id, shop_id, source_type, confirmed_sale_id, created_at) ON public.sale_drafts TO grafana_reader;
GRANT SELECT (id, shop_id, total_vnd, sale_status, payment_status, sold_at, voided_at) ON public.sales TO grafana_reader;
GRANT SELECT (id, shop_id, amount_vnd, category, expense_at, source_ai_request_id) ON public.expenses TO grafana_reader;
GRANT SELECT (id, sale_id, customer_id, status, original_vnd, created_at) ON public.debts TO grafana_reader;
GRANT SELECT (id, sale_id, amount_vnd, payment_method, received_at) ON public.payments TO grafana_reader;
GRANT SELECT (id, shop_id, created_at) ON public.customers TO grafana_reader;
GRANT SELECT (id, actor_user_id, actor_role, shop_id, action, entity_type, entity_id, outcome, request_id, metadata, created_at) ON public.audit_logs TO grafana_reader;
GRANT SELECT (id, user_id, shop_id, started_at, last_message_at) ON public.chat_conversations TO grafana_reader;
GRANT SELECT (id, conversation_id, role, created_at) ON public.chat_messages TO grafana_reader;
GRANT SELECT (id, notification_event_id, user_id, read_at, created_at) ON public.notification_recipients TO grafana_reader;
```

Không cấp cột tên, số điện thoại, mô tả, `content`, `metadata` của chat hay `new_data`/`old_data`. Supabase cho phép role tuỳ biến qua shared pooler; username lấy nguyên chuỗi ở Dashboard → Connect → Session pooler (dạng `<role>.<project-ref>`), không tự ghép từ tên role và region. Sau khi tạo, kiểm `SELECT current_user` qua đúng datasource để chắc pooler ánh xạ đúng role.

Chỉ ba bảng trong danh sách có RLS hôm nay: `user_daily_activity` (policy ở trên), `agent_memories` và `agent_memory_settings` (không cấp quyền). Khi roll out, chạy `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND rowsecurity` trên từng môi trường; bảng nào bật RLS mà không có policy cho `grafana_reader` sẽ trả rỗng, và policy chỉ được thêm sau khi rà quyền kế thừa.

### 7.2 Datasource

Hai datasource trong [`datasources.yaml`](../../../deploy/monitoring/grafana/provisioning/datasources/datasources.yaml), uid `smartledger-staging-pg` và `smartledger-production-pg`, kiểu `grafana-postgresql-datasource`, `sslmode: require`, `maxOpenConns: 1`, `maxIdleConns: 0`. Host, database, user và mật khẩu lấy từ biến `SMARTLEDGER_<ENV>_PG_*` của container Grafana; môi trường thiếu biến vẫn có datasource nhưng panel báo lỗi kết nối.

`maxIdleConns: 0` để Grafana đóng connection ngay sau truy vấn, không giữ slot pooler giữa các lần refresh. Với tổng 15 slot, đặt Core còn 8 và AI còn 4 bằng biến môi trường: `SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE=8` (Core, không sửa code, đã có trong mẫu `.env.core`) và `POSTGRES_POOL_MAX_SIZE=2`, `SQL_POOL_MAX_SIZE=2` (AI đã mặc định 2). Như vậy 8 + 4 + 1 = 13, còn 2 slot dự phòng.

### 7.3 Provisioning, playbook và secrets

- Dashboard nằm ở [`deploy/monitoring/grafana/product/product.json`](../../../deploy/monitoring/grafana/product/product.json), ngoài thư mục provisioning của Infra vì provider đọc cả thư mục con; provider thứ hai đưa nó vào folder `Product`.
- Login đọc nằm trong nhóm `monitor` của Dopbase với các khoá đã có trong mẫu [`.env.monitor`](../../../secrets/templates/.env.monitor): `GRAFANA_PG_HOST`, `GRAFANA_PG_PORT` (mặc định 5432), `GRAFANA_PG_DATABASE` (mặc định `postgres`), `GRAFANA_PG_USER`, `GRAFANA_PG_PASSWORD`. [`vps-playbook.sh`](../../../scripts/secrets/vps-playbook.sh) nạp file này cùng `.env.vps`.
- Playbook ghi `postgres-<environment>.env` (0600, `no_log`) cạnh `.env` của monitoring; Compose đọc cả hai file như `env_file` tuỳ chọn. Mỗi môi trường chỉ ghi file của mình, nên lần chạy staging không xoá datasource production như khi dùng chung `.env`.
- Host rỗng thì playbook bỏ qua bước này; dashboard vẫn provision nhưng panel SQL báo lỗi kết nối.

## 8. Đặc tả dashboard

Dashboard `smart-ledger-product`: tag `smart-ledger` để vào thanh liên kết chung, `editable: false`, refresh 5 phút, mặc định 7 ngày, timezone `Asia/Ho_Chi_Minh`. Biến `env` (staging, production) chọn cả datasource `smartledger-${env}-pg` lẫn nhãn `env` của Prometheus. SQL nằm trong JSON; mọi chỉ số người dùng và cửa hàng loại tài khoản có email `loadtest+` (với cửa hàng: theo owner).

| Hàng | Panel | Nguồn |
|---|---|---|
| Users | DAU, WAU, MAU của OWNER; stickiness (DAU trung bình 30 ngày / MAU); owner và shop mới trong khoảng thời gian | `user_daily_activity`, `users`, `shops` |
| Users | DAU theo role mỗi ngày; owner và shop mới mỗi ngày | như trên |
| Retention | Bảng cohort theo tuần đăng ký (thứ Hai, giờ Việt Nam), 12 cohort gần nhất, cột W0–W8 là % owner còn hoạt động ở tuần thứ n; ô của tuần chưa tới để trống | `users`, `user_daily_activity` |
| Shops and activation | Cửa hàng hoạt động mỗi tuần; funnel tạo shop → có hàng hoá → đơn `CONFIRMED` trong 7 ngày → dùng AI | `audit_logs`, `shops`, `products`, `sales`, `chat_conversations` |
| Feature adoption | Shop distinct mỗi tuần theo nhóm `SALE_*`, `PRODUCT_*`, `CATEGORY_*`, `STOCK_ADJUSTED`, `EXPENSE_*`, `DEBT_*` | `audit_logs` |
| AI | Hội thoại và shop dùng trợ lý mỗi ngày; draft `AI_VOICE`/`MANUAL` và số draft AI được chốt mỗi tuần | `chat_conversations`, `sale_drafts` |
| AI | Lượt gọi và p95 theo `handler` | Prometheus `http_requests_total`, `http_request_duration_seconds_bucket` của AI (recording rule đã bỏ nhãn `handler`) |
| Business | Đơn chốt và huỷ mỗi ngày theo `sold_at`; doanh thu đơn chốt | `sales` |
| Data freshness | Tuổi bản ghi mới nhất của `audit_logs`, `sales`, `user_daily_activity` | như tên |
| Events (thu gọn) | 500 sự kiện mới nhất, lọc theo biến `action` và `shop` | `audit_logs` |

Retention chỉ tính được khoảng 12 tuần vì `user_daily_activity` giữ 90 ngày; muốn xem xa hơn cần một bảng tổng hợp theo tuần, là thay đổi Core. Cohort nhỏ dao động mạnh, nên đọc W1 và W4 qua nhiều hàng.

## 9. Định nghĩa chỉ số

- **DAU:** số user distinct có ít nhất một request API nghiệp vụ thành công trong ngày Việt Nam, theo CORE-018; loại email `loadtest+`.
- **MAU:** user distinct trong 30 ngày lịch gồm hôm nay; không phải tháng lịch. WAU tương tự với 7 ngày.
- **Stickiness:** DAU trung bình của 30 ngày chia MAU.
- **Retention tuần n:** trong owner đăng ký cùng tuần, tỉ lệ có ít nhất một ngày hoạt động ở tuần thứ n sau tuần đăng ký. "Hoạt động" là một request API thành công (CORE-018); PO có thể chốt định nghĩa chặt hơn, ví dụ có chốt đơn trong tuần.
- **Cửa hàng hoạt động:** shop distinct có ít nhất một sự kiện `actor_role=OWNER` trong cửa sổ.
- **Kích hoạt:** shop tạo trong cửa sổ có đơn `CONFIRMED` đầu tiên trong 7 ngày kể từ `shops.created_at`; cửa sổ 7 ngày là giả định, cần PO chốt.
- **Adoption tính năng:** shop distinct có ít nhất một action thuộc nhóm trong cửa sổ, chia cho số cửa hàng hoạt động cùng cửa sổ; hiển thị cả tử số và mẫu số để tránh đọc nhầm tỉ lệ nhỏ.
- **Tỉ lệ huỷ:** đơn `VOIDED` chia cho tổng `CONFIRMED` cộng `VOIDED` theo `sold_at`; đơn huỷ hiện tại làm thay đổi kỳ bán cũ. FR-006 tính theo thời điểm huỷ; dashboard đếm theo `sold_at` để đơn chốt và đơn huỷ cùng một trục, cần PO chốt cách nào.
- **Mức dùng AI:** hội thoại bắt đầu trong cửa sổ; độ trễ và lỗi lấy từ Prometheus AI theo `handler`.
- Mọi phép chia ngày dùng `Asia/Ho_Chi_Minh`; dashboard đặt timezone cố định để không phụ thuộc trình duyệt.

## 10. Quyền riêng tư và bảo mật

- Không cấp cột PII và nội dung cho `grafana_reader`; kiểm bằng `has_column_privilege` như trong [hướng dẫn CORE-018](../../../backend/core/docs/user-daily-activity.md#staging-evidence-required-before-closing-409).
- Role chỉ đọc, `default_transaction_read_only`, timeout 10 giây; không dùng credential của Core hay service role.
- Mật khẩu chỉ ở Dopbase và `.env` 0600 trên VPS; playbook dùng `no_log`. Không đưa chuỗi kết nối vào dashboard JSON, alert hay log.
- Dashboard `editable: false`, sign-up và anonymous đã tắt; chỉ ADMIN Grafana xem được.
- Dữ liệu production chỉ hiển thị chỉ số tổng hợp và các cột đã liệt kê, không xuất CSV ra ngoài.

## 11. Vận hành

- Refresh 5 phút, mỗi lần khoảng 10 truy vấn tuần tự trên một connection; đủ cho dữ liệu nhỏ hiện tại.
- Giới hạn thời gian mặc định 7 ngày, tối đa 90 ngày; mọi panel lọc theo thời gian và `LIMIT` cho bảng.
- Datasource lỗi (sai mật khẩu, quá slot) hiện lỗi kết nối trên từng panel SQL; hàng Data freshness không có giá trị khi bảng rỗng hoặc role mất quyền đọc.
- Rollback: xóa hai datasource và dashboard product khỏi repo rồi chạy lại playbook; thu hồi grant hoặc drop role khi owner quyết định. Không có dữ liệu nào bị thay đổi.

## 12. Lộ trình

| Giai đoạn | Nội dung | Điều kiện |
|---|---|---|
| P1 | Role đọc, hai datasource, dashboard product với retention theo cohort | Đã có trong repo; còn chờ ADR được duyệt, owner DB tạo role, `GRAFANA_PG_*` trong Dopbase và rollout CORE-018 cho panel người dùng |
| P2 | Audit `USER_SIGNED_IN` trong `/auth/session` (mục 6.4); counter sự kiện intent trong Core tại `/actuator/prometheus` với nhãn hữu hạn (`feature`, `outcome`), Alloy scrape trong app network như AI | Owner Core duyệt phạm vi sửa Core; migration nếu constraint của `audit_logs` đòi |
| P3 | Sự kiện client: phiên dùng app, đăng nhập thất bại, lý do bị đăng xuất, phễu theo bước UI; bảng `product_events` append-only hoặc SDK client nếu chấp nhận dữ liệu ra ngoài | Migration và phê duyệt riêng; ADR mới |

## 13. Kiểm chứng

P1 phải qua các bước sau trước khi coi là xong:

| Kiểm tra | Cách làm | Trạng thái |
|---|---|---|
| SQL chạy đúng | PostgreSQL dùng một lần (như CORE-018) nạp dữ liệu mẫu cho mọi bảng được cấp quyền; chạy từng truy vấn panel qua Grafana cục bộ | Đã chạy 2026-10-30: PostgreSQL 16 với mọi migration Core và bảng chat của AI baseline, role tạo bằng SQL ở mục 7.1, 44 owner (4 loadtest) và khoảng 500 đơn mẫu; Grafana 12.1.1 provision từ repo, mọi truy vấn SQL của dashboard chạy qua `/api/ds/query` bằng `grafana_reader` và hiển thị đúng. Chưa có dữ liệu thật |
| Quyền tối thiểu đủ cho dashboard | Cùng lần chạy trên | Đã chạy: không truy vấn nào cần cột ngoài mục 7.1 |
| Role tối thiểu | `has_column_privilege`, `has_table_privilege`, `rolsuper`, `rolbypassrls` trên staging; xác nhận không đọc được cột PII | Chưa làm |
| Kết nối pooler | Datasource staging dùng `grafana_reader.<project-ref>`, TLS bắt buộc, mở đúng một connection | Chưa làm |
| Ngân sách slot | Đo `pg_stat_activity` hoặc dashboard Supabase khi Grafana refresh 5 phút, Core chạy tải nhẹ; không vượt 13 slot | Chưa làm |
| Playbook | Chạy playbook staging rồi production; datasource của cả hai môi trường vẫn cấu hình sau mỗi lần | Chưa làm |
| Loại trừ loadtest | So DAU/MAU với count thủ công loại `loadtest+` | Chưa làm |
| Chỉ số mẫu | Tạo một shop, một product, một sale trên staging; kiểm funnel và adoption tăng đúng một | Chưa làm |

## 14. Rủi ro

| Rủi ro | Ảnh hưởng | Giảm thiểu |
|---|---|---|
| Hết slot pooler khi thêm Grafana | Core không lấy được connection, request lỗi | Hạ Hikari xuống 8 và AI giữ 4 bằng biến môi trường; `maxIdleConns: 0`; đo trước khi bật production |
| `.env` monitoring bị ghi đè theo môi trường | Mất datasource của môi trường còn lại | Mỗi môi trường ghi `postgres-<environment>.env` riêng, Compose đọc cả hai |
| Bảng bật RLS không có policy | Panel trả rỗng, dễ hiểu nhầm là không có người dùng | Rà `pg_tables.rowsecurity` trên từng môi trường trước khi nghiệm thu |
| Truy vấn nặng trên Supabase nhỏ | Chậm hoặc tốn egress | `statement_timeout` 10 giây, lọc thời gian, `LIMIT`, refresh 5 phút |
| `audit_logs` chỉ ghi thành công và action whitelist | Đọc nhầm adoption là "đã dùng" thay vì "đã thử" | Ghi chú trên dashboard; bổ sung intent ở P2/P3 |
| Schema chat do AI baseline quản lý | Đổi cột AI làm hỏng panel | Panel chỉ dùng cột ổn định trong ERD; thêm bước kiểm tra khi migration AI đổi bảng chat |
| CORE-018 chưa rollout | Không có DAU/MAU | Panel ghi rõ "chưa có dữ liệu cho tới khi bật `USER_ACTIVITY_ENABLED`"; các panel khác vẫn chạy |

## 15. Câu hỏi mở

- Chỉ số Bắc đẩu là DAU hay cửa hàng hoạt động theo tuần? ADR chọn hiển thị cả hai, cần PO chốt cái nào dẫn dắt.
- Cửa sổ kích hoạt 7 ngày có đúng với thực tế bán hàng không?
- Có tính mức dùng của ADMIN vào adoption không, hay chỉ OWNER?
- Ai sở hữu role `grafana_reader` ở production, và ai xoay mật khẩu?
- P2 có nằm trong MVP không, hay chờ sau phản hồi từ chủ tiệm?
