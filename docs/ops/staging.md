# Runbook staging — SmartLedger

| Siêu dữ liệu | Giá trị |
|---|---|
| Trạng thái | đề xuất |
| Chủ sở hữu | Chủ kỹ thuật |
| Cập nhật lần cuối | 2026-09-17 |

Tài liệu liên quan: [technical-design §6](../architecture/technical-design.md) (Supabase staging, secret qua GitHub Environment), issue #8 (OPS-001).

## Topology

```text
Dev (máy dev)              Staging                      Production (kế hoạch)
docker compose             Oracle Free VM (ARM)         AWS
--profile infra            ├── ai (FastAPI :8001)        ├── app service
├── postgres (container)   └── core (khi dockerize)      ├── RDS/Aurora PostgreSQL
├── redis (container)      Supabase Postgres (riêng)     └── ElastiCache Redis
└── ai                     Redis Cloud
```

Nguyên tắc: cùng engine ở mọi môi trường (PostgreSQL, Redis), chỉ đổi host qua
`POSTGRES__URL`/`REDIS__URL`. Compose không start database trên staging — các
service `postgres`/`redis` thuộc profile `infra` chỉ dành cho dev.

## Chuẩn bị tài nguyên

1. **Supabase**: tạo project riêng cho staging, region Singapore. Lấy connection
   string (session pooler cho runtime; direct connection cho migration/dump).
   Project staging không chứa dữ liệu production.
2. **Redis Cloud**: tạo database free, bật TLS. Lấy endpoint dạng `rediss://`.
3. **Oracle VM**: `VM.Standard.A1.Flex` ARM, tối đa free 2 OCPU/12 GB,
   Ubuntu 24.04 aarch64. Security list chỉ mở `22`, `80`, `443` — không mở
   `5432`/`6379`/`8001` ra internet (AI bind `127.0.0.1`, đi qua Caddy).

## Cài VM (một lần)

```bash
ssh ubuntu@<PUBLIC_IP>
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER && newgrp docker

git clone https://github.com/miphu2804/smart-ledger.git && cd smart-ledger
git switch staging
cp .env.example .env
```

Sửa `.env` trên VM (không commit):

```bash
AI_PORT=8001
POSTGRES__URL=postgresql://<user>:<password>@<supabase-host>:5432/postgres?sslmode=require
REDIS__URL=rediss://default:<password>@<redis-cloud-host>:<port>
```

Đăng nhập GHCR trên VM để pull image private (một lần, dùng PAT scope
`read:packages`):

```bash
echo <GITHUB_PAT> | docker login ghcr.io -u <github-username> --password-stdin
```

Chạy app-only (không start postgres/redis container):

```bash
docker compose pull ai
docker compose up -d ai
docker compose logs ai   # mong đợi "postgres connected" / "redis connected"
curl -s localhost:8001/health
```

## TLS qua Caddy

```bash
sudo apt install -y caddy
sudo tee /etc/caddy/Caddyfile <<'EOF'
staging.<PUBLIC_IP>.sslip.io {
    reverse_proxy localhost:8001
}
EOF
sudo systemctl reload caddy
```

Kiểm tra `https://staging.<PUBLIC_IP>.sslip.io/health` trả `{"status":"ok"}`.

## Giữ free tier không ngủ

- Supabase free pause sau ~7 ngày ít query; Oracle free reclaim VM idle.
- Cron trên VM giữ activity tối thiểu:

```cron
*/10 * * * * curl -s localhost:8001/health > /dev/null
```

## Deploy tự động

`.github/workflows/deploy-staging.yml` theo pipeline build-once-deploy-same:

```text
push vào staging → ci (ruff + pytest) → build image multi-arch
(amd64 + arm64) → push GHCR :staging + :<sha> → ssh vào VM →
docker compose pull ai → up -d → health check
```

Test fail thì không build; build fail thì không deploy. Image dùng chung
digest cho mọi môi trường — staging pull đúng image CI đã test.

Secrets cần tạo trong GitHub Environment `staging`:

| Secret | Giá trị |
|---|---|
| `STAGING_HOST` | Public IP hoặc domain của VM |
| `STAGING_USER` | `ubuntu` |
| `STAGING_SSH_KEY` | Private key SSH vào VM |

Secret chỉ nằm trong GitHub Environment hoặc secret manager — không commit
`POSTGRES__URL`/`REDIS__URL` thật vào repo.

Lưu ý GHCR: repo private trên Free plan giới hạn 500MB storage và 1GB
egress/tháng — định kỳ xóa tag cũ, giữ `:staging` và vài tag `:<sha>` gần nhất.

## Rollback

Image tag `:<sha>` là immutable — rollback bằng cách trỏ `AI_IMAGE_TAG`
trong `.env` về sha trước rồi pull lại:

```bash
sed -i 's/^AI_IMAGE_TAG=.*/AI_IMAGE_TAG=<sha-trước>/' .env
docker compose pull ai && docker compose up -d ai
```

## Khi Core (Java) sẵn sàng

Thêm service `core` vào `compose.yaml` (không profile `infra`), trỏ
`DATABASE_URL`/`REDIS_URL` sang cùng Supabase/Redis Cloud staging, expose qua
Caddy theo path hoặc subdomain riêng.
