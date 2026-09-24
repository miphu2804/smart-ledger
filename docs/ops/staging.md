# Runbook staging — SmartLedger

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đề xuất |
| Chủ sở hữu | Chủ kỹ thuật |
| Cập nhật lần cuối | 2026-09-24 |

Tài liệu liên quan: [technical-design §6](../architecture/technical-design.md) (Supabase staging, secret qua GitHub Environment), issue #8 (OPS-001).

## Topology

```text
Dev (máy dev)              Staging                      Production (kế hoạch)
docker compose             Oracle Free VM (ARM)         AWS
--profile infra            ├── core (Java :8080)        ├── app service
├── postgres (container)   ├── ai (FastAPI :8001)        ├── RDS/Aurora PostgreSQL
├── redis (container)      Supabase Postgres (riêng)     └── ElastiCache Redis
└── ai                     Redis Cloud
```

Nguyên tắc: cùng engine ở mọi môi trường (PostgreSQL, Redis), chỉ đổi host qua
`POSTGRES_URL`/`REDIS_URL`. Compose không start database trên staging — các
service `postgres`/`redis` thuộc profile `infra` chỉ dành cho dev.

## Chuẩn bị tài nguyên

1. **Supabase**: tạo project riêng cho staging, region Singapore. Lấy connection
   string (session pooler cho runtime; direct connection cho migration/dump).
   Project staging không chứa dữ liệu production.
2. **Redis Cloud**: tạo database free, bật TLS. Lấy endpoint dạng `rediss://`.
3. **Oracle VM**: `VM.Standard.A1.Flex` ARM, tối đa free 2 OCPU/12 GB,
   Ubuntu 24.04 aarch64. Security list chỉ mở `22`, `80`, `443` — không mở
   `5432`/`6379`/`8001`/`8080` ra internet (Core và AI bind `127.0.0.1`, đi qua Caddy).

## Cài VM (một lần)

```bash
ssh ubuntu@<PUBLIC_IP>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/miphu2804/smart-ledger.git && cd smart-ledger
git switch staging
```

Tạo `.env` trên VM (không commit, giới hạn quyền đọc):

```dotenv
AI_PORT=8001
AI_IMAGE_TAG=staging
CORE_PORT=8080
CORE_IMAGE_TAG=staging
POSTGRES_URL=postgresql://<user>:<password>@<supabase-host>:5432/postgres?sslmode=require
REDIS_URL=rediss://default:<password>@<redis-cloud-host>:<port>
DATABASE_URL=jdbc:postgresql://<supabase-host>:5432/postgres?sslmode=require
DATABASE_USERNAME=<core-runtime-role>
DATABASE_PASSWORD=<core-runtime-password>
FIREBASE_PROJECT_ID=<firebase-project-id>
FLYWAY_URL=jdbc:postgresql://<supabase-host>:5432/postgres?sslmode=require
FLYWAY_USER=<user>
FLYWAY_PASSWORD=<password>
```

```bash
chmod 600 .env
```

Tạo role runtime riêng cho Core và role migration riêng cho Flyway. Workflow
chép Firebase service account vào `.secrets` trước khi deploy. Thư mục có quyền
`700`, file credential `644` để UID không đặc quyền trong container đọc được;
thư mục này được Git bỏ qua.

Đăng nhập GHCR trên VM để pull image private (một lần, dùng PAT scope
`read:packages`):

```bash
echo <GITHUB_PAT> | docker login ghcr.io -u <github-username> --password-stdin
```

Chạy backend images (không start postgres/redis container):

```bash
docker compose --profile backend pull core ai
docker compose --profile backend up -d core ai
docker compose logs core ai
curl -fsS localhost:8080/v3/api-docs >/dev/null
curl -fsS localhost:8001/health
```

## TLS qua Caddy

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
staging.<PUBLIC_IP>.sslip.io {
    reverse_proxy localhost:8001
}
api.staging.<PUBLIC_IP>.sslip.io {
    reverse_proxy localhost:8080
}
EOF
sudo systemctl reload caddy
```

Kiểm tra `https://staging.<PUBLIC_IP>.sslip.io/health` trả `{"status":"ok"}`.
Core được mở qua `https://api.staging.<PUBLIC_IP>.sslip.io`; firewall vẫn chỉ
cần mở `22`, `80`, `443`.

## Giữ free tier không ngủ

- Supabase free pause sau ~7 ngày ít query; Oracle free reclaim VM idle.
- Cron trên VM giữ activity tối thiểu:

```cron
*/10 * * * * curl -s localhost:8001/health > /dev/null
```

## Deploy tự động

`.github/workflows/deploy-staging.yml` theo pipeline build-once-deploy-same:

```text
push vào staging → CI (AI + Core + mobile-web + container images) và kiểm tra secrets →
build Core + AI multi-arch (amd64 + arm64) → push GHCR :staging + :<sha> →
SSH vào VM → Core Flyway migration → AI chat migration → pull/up Core + AI → health checks
```

CI thất bại hoặc thiếu secret thì không build. Migrations phải qua trước khi
Core/AI được khởi động lại. VM pull image theo commit SHA; `:staging` là tag
tiện tra cứu.

Tạo GitHub Environment `staging` và thêm các secrets sau. Workflow kiểm tra đủ
secrets trước khi build/push image:

| Secret | Giá trị |
|---|---|
| `STAGING_HOST` | Public IP hoặc domain của VM |
| `STAGING_USER` | `ubuntu` |
| `STAGING_SSH_KEY` | Private key SSH vào VM |
| `STAGING_KNOWN_HOSTS` | Host key đã xác minh ngoài CI, dùng để xác thực SSH server |
| `STAGING_FIREBASE_PROJECT_ID` | Firebase project dùng riêng cho staging |
| `STAGING_FIREBASE_SERVICE_ACCOUNT_JSON` | JSON service account Firebase staging, workflow chép vào thư mục VM chỉ owner đọc được |

Giữ SSH secrets trong GitHub Environment và các URL managed database trong
`.env` chỉ có trên VM. Service account được truyền riêng qua SSH và không được
đưa vào Docker build. Không commit giá trị thật hoặc credential.
Xác minh fingerprint host key qua console của nhà cung cấp VM trước khi đưa
known-hosts entry vào environment.

Lưu ý GHCR: repo private trên Free plan giới hạn 500MB storage và 1GB
egress/tháng — định kỳ xóa tag cũ, giữ `:staging` và vài tag `:<sha>` gần nhất.

## Rollback

Image tag `:<sha>` là immutable — Core và AI dùng chung commit SHA. Rollback
bằng cách trỏ cả `CORE_IMAGE_TAG` và `AI_IMAGE_TAG` trong `.env` về SHA trước,
rồi pull và khởi động lại:

```bash
sed -i 's/^AI_IMAGE_TAG=.*/AI_IMAGE_TAG=<sha-trước>/; s/^CORE_IMAGE_TAG=.*/CORE_IMAGE_TAG=<sha-trước>/' .env
docker compose --profile backend pull core ai && docker compose --profile backend up -d core ai
```

## Backup và restore

Backup/restore chưa được cấu hình hoặc smoke-tested cho staging. Trước khi
coi OPS #8 hoàn tất hoặc dùng dữ liệu quan trọng, chọn cơ chế backup cho managed
database, phục hồi vào database cô lập, rồi xác nhận ứng dụng đọc được dữ liệu.
Không thử restore trên database đang chạy.

## Core runtime

Compose có profile `backend` để chạy Java Core cùng AI. Core dùng role DB runtime;
Flyway tắt trong app vì migration chạy trước deploy. Firebase Admin đọc credential
từ file chỉ đọc. Workflow health-check `/v3/api-docs` của Core và `/health` của AI
trước khi lưu tag SHA hiện tại vào `.env`.

Vercel Preview của mobile vẫn dùng mock mode. Core chưa bật CORS nên trình duyệt
không thể gọi Core trực tiếp từ domain Vercel; thiết bị native có thể dùng API
HTTPS của Core sau khi Firebase staging được cấu hình.
