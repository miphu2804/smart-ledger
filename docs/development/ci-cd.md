# CI/CD backend lên Railway

Tài liệu này mô tả đường đi của một thay đổi từ nhánh feature tới Railway cho `backend/core` và `backend/ai`. Workflow nằm ở job `deploy` trong [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml); quy tắc nhánh và review nằm ở [CONTRIBUTING](../../CONTRIBUTING.md). Mobile web deploy qua Vercel, không đi qua luồng này.

## Luồng tổng quát

![Luồng CI/CD backend](../architecture/diagrams/images/ci-cd.svg)

Nguồn sơ đồ: [`ci-cd.drawio`](../architecture/diagrams/src/ci-cd.drawio); sửa bằng draw.io rồi export lại SVG (`drawio -x -f svg -e --embed-svg-images --svg-theme light -b ffffff -o docs/architecture/diagrams/images/ci-cd.svg docs/architecture/diagrams/src/ci-cd.drawio`). Số màu xanh là pipeline deploy, số màu cam là luồng request lúc chạy.

## Từng bước

1. **PR vào `staging`:** CI chạy test, kiểm migration trên PostgreSQL tạm và build image. Job `deploy` bị bỏ qua vì sự kiện là `pull_request`.
2. **Merge vào `staging`:** CI chạy lại trên commit đã merge. Khi `ai`, `core`, `container-images` pass, job `deploy` dùng environment `railway-staging` và deploy lên Railway staging. Không cần duyệt.
3. **PR `staging` → `main`:** chỉ mở sau khi đã kiểm tra trên staging (xem [Target branch](../../CONTRIBUTING.md#target-branch)).
4. **Merge vào `main`:** CI chạy lại; job `deploy` dừng ở trạng thái *Waiting*. Người duyệt mở run trên tab Actions → **Review deployments** → Approve. Chỉ sau khi duyệt, job mới nhận `RAILWAY_TOKEN` của production và deploy.

`mobile-web` lỗi không chặn deploy backend; nó vẫn chặn merge qua required checks.

## Cấu hình liên quan

### GitHub Environments

| Environment | Nhánh được phép | Duyệt | Secret |
|---|---|---|---|
| `railway-staging` | `staging` | Không | `RAILWAY_TOKEN`: project token của Railway environment staging |
| `railway-production` | `main` | Có | `RAILWAY_TOKEN`: project token của Railway environment production |

`Preview` và `Production` là environment do Vercel tự tạo cho mobile web; không đặt secret backend ở đó.

Mỗi Railway project token chỉ deploy được vào đúng một Railway environment, nên job chạy với `railway-staging` không thể deploy lên production.

### Railway

- Một project, hai environment `staging` và `production`, mỗi environment có service `core` và `ai`. Tên service phải khớp với `--service` trong workflow.
- Workflow gửi code bằng `railway up backend/<service> --path-as-root`, nên **Root Directory** của service để trống và **không** bật auto-deploy từ GitHub (tránh deploy hai lần).
- Biến môi trường của service (database, Firebase, `INTERNAL_API_TOKEN`, model key…) cấu hình trên Railway theo từng environment; GitHub chỉ giữ token để deploy.

## Những gì luồng này chưa làm

- Không chạy migration database. Flyway vẫn tắt mặc định; người phụ trách migration chạy tay theo [Database migrations](../../README.md#database-migrations), trên staging trước production.
- Không lọc theo thư mục: mỗi lần push vào `staging` hoặc `main` đều deploy lại cả `ai` và `core`, kể cả khi chỉ sửa mobile.
- Rollback: chọn bản deploy trước trên Railway dashboard → **Redeploy**; chưa có bước tự động.
