# CI/CD

`backend/core` and `backend/ai` deploy to a VPS; the mobile web and the landing page (with the admin dashboard at `/admin`) deploy to Vercel. The Android app has its own manual workflow, see [Android build](#android-build). Branch and review rules are in [CONTRIBUTING](../../CONTRIBUTING.md).

| Workflow | Does |
|---|---|
| [`ci.yml`](../../.github/workflows/ci.yml) | Finds the changed areas, tests them, builds images; on a push to `staging` or `main`, job `cd` starts CD |
| [`cd.yml`](../../.github/workflows/cd.yml) | Job `gate` re-checks the commit and its CI result, then calls the deploy workflows below |
| [`deploy-backend.yml`](../../.github/workflows/deploy-backend.yml) | Builds, pushes to GHCR and deploys `ai` and `core` to the VPS |
| [`deploy-web.yml`](../../.github/workflows/deploy-web.yml) | Builds and deploys `frontend/mobile` to Vercel |
| [`deploy-landing.yml`](../../.github/workflows/deploy-landing.yml) | Builds and deploys `frontend/web` to Vercel |
| [`select-runner.yml`](../../.github/workflows/select-runner.yml) | Picks the runner for CI, CD and the Android build |
| [`mobile-release.yml`](../../.github/workflows/mobile-release.yml) | Builds the Android app, started by hand |

![CI/CD flow](../architecture/diagrams/images/ci-cd.svg)

Green numbers are the deploy, purple the one-time VPS setup, orange the runtime requests. The diagram shows the target setup: pgvector, the Bifrost gateway, Langfuse and the Grafana stack are not built yet; today AI calls OpenCode Go directly and traces to Logfire. Edit [`ci-cd.drawio`](../architecture/diagrams/src/ci-cd.drawio) and re-export:

```bash
drawio -x -f svg -e --embed-svg-images --svg-theme light -b ffffff -o docs/architecture/diagrams/images/ci-cd.svg docs/architecture/diagrams/src/ci-cd.drawio
```

## Steps

1. **PR into `staging`:** CI tests, checks migrations on a throwaway PostgreSQL and builds images. Nothing deploys.
2. **Merge into `staging`:** CI runs again and CD deploys the changed areas to staging, with no approval.
3. **PR `staging` → `main`:** open it after checking staging ([Target branch](../../CONTRIBUTING.md#target-branch)).
4. **Merge into `main`:** use a merge commit, never a squash; on conflicts, release from a `release/staging-to-main-<date>` branch. The production deploy jobs wait until a reviewer opens the CD run → **Review deployments** → approves each one.
5. **Check production, then tag:** the web smoke test against `https://smart-ledger-prod.vercel.app` must pass; open the app and sign in. Then tag by hand: `gh release create vX.Y.Z --target <merge commit> --generate-notes`.

<a id="path-filtering"></a>

### Path filtering

Job `changes` compares a PR with its base branch, or a push with the commit before it. Jobs outside the changed areas show as *Skipped*, which counts as passed.

| Area | Paths | Jobs |
|---|---|---|
| `ai` | `backend/ai/**`, `supabase/**`, `deploy-backend.yml` | `ai`, `container-images`, `deploy-backend` |
| `core` | `backend/core/**`, `deploy-backend.yml` | `core`, `container-images`, `deploy-backend` |
| `mobile` | `frontend/mobile/**`, `deploy-web.yml` | `mobile-web`, `deploy-web` |
| `landing` | `frontend/web/**`, `deploy-landing.yml` | `landing`, `deploy-landing` |
| `containers` | `compose.yaml` | `container-images` |

- A change to `ci.yml`, `cd.yml` or `select-runner.yml` runs everything; a docs-only change deploys nothing.
- Each area deploys on its own checks: a red `landing` does not hold back the backend, and a red `core` does not hold back the web.
- Re-running CI on a push hands every passing area to CD.
- To redeploy without testing (say, after changing a variable), start CD by hand: Actions → **CD** → **Run workflow**, with the branch, the full commit SHA and the areas. Leave `ci-run-id` empty to use the latest CI push run of that commit.
- A failed or cancelled deploy: re-run its CD run.

<a id="ci-runners"></a>

### Runners

CI reads input `runner`, else repository variable `CI_RUNNER`. CD reads input `runner`, else `CD_RUNNER`, else `CI_RUNNER`. Unset means `github-hosted`.

| Value | Runs on |
|---|---|
| `github-hosted` | `ubuntu-24.04` |
| `self-hosted` | Any machine labelled `self-hosted`; needs Docker with buildx, Node 22, Python 3 and a JDK |
| `auto` | A free self-hosted machine, else `ubuntu-24.04`; needs secret `RUNNERS_READ_TOKEN` ([Android runners](#android-runners)) |

- If GitHub-hosted runners are blocked (billing), set `CI_RUNNER=self-hosted` and clear `CD_RUNNER`. `auto` cannot help: its own pick runs on GitHub-hosted.
- PRs from forks always run on `ubuntu-24.04`, so a fork never runs code on a teammate's machine.
- Tests start PostgreSQL with `docker run` on a free port, so jobs on one machine do not collide.

## GitHub environments

| Environment | Branch | Approval | Secrets | Variables |
|---|---|---|---|---|
| `backend-staging` | `staging` | No | `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`, `OPENAI_API_KEY`, `LOGFIRE_TOKEN` (optional) | `VPS_HOST`, `VPS_USER`, `VPS_APP_DIR`, `CORS_ALLOWED_ORIGINS`, [AI model settings](#ai-model-settings) |
| `backend-production` | `main` | Yes | Same | Same, with `VPS_APP_DIR=/opt/smartledger-production` |
| `vercel-staging` | `staging` | No | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `EXPO_PUBLIC_*`, `VERCEL_STAGING_ALIAS` |
| `vercel-production` | `main` | Yes | Same | `EXPO_PUBLIC_*` |
| `landing-staging` | `staging` | No | Same, for Vercel project `landing` | `VITE_LEGAL_DRAFT`, `LANDING_URL`, admin variables |
| `landing-production` | `main` | Yes | Same | Same, plus `VITE_ANDROID_APK_URL` |
| `android-dev` | Other branches (checked by `gate`) | No | `ANDROID_GOOGLE_SERVICES_JSON` | `EXPO_PUBLIC_*` |
| `android-staging` | `staging` | No | `ANDROID_GOOGLE_SERVICES_JSON` | `EXPO_PUBLIC_*` |
| `android-production` | `main` | Yes | `ANDROID_GOOGLE_SERVICES_JSON`, `ANDROID_KEYSTORE_*`, `R2_*` | `EXPO_PUBLIC_*`, `R2_BUCKET`, `R2_PUBLIC_URL` |

- Keep backend secrets out of `vercel-*` and `landing-*`.
- `vercel-preview` and `landing-preview` exist but are unused while PR previews are off.
- `railway-staging` and `railway-production` only keep `RAILWAY_TOKEN` for a rollback to Railway; delete them when Railway shuts down.
- Both backend environments use the same VPS and deploy key, so a `backend-staging` job can reach production containers. The approval guards only the `main` deploy. The project owner accepted this.

<a id="vps"></a>

## VPS

One VPS (`103.162.31.93`, Ubuntu 24.04, 4 GB RAM plus swap) runs both environments as separate Compose projects from [`deploy/vps/`](../../deploy/vps/). A shared Caddy from [`deploy/edge/`](../../deploy/edge/) owns ports 80 and 443, gets Let's Encrypt certificates and routes each name to its Core over Docker network `edge`. `ai` is reachable only from its own `core`.

| Environment | Public name | Caddy routes to | App directory |
|---|---|---|---|
| staging | `staging.103-162-31-93.sslip.io` | `core-staging:8080` | `/opt/smartledger` |
| production | `production.103-162-31-93.sslip.io` | `core-production:8080` | `/opt/smartledger-production` |

- The bare `103-162-31-93.sslip.io` still reaches staging until every client has moved.
- With a real domain, point `api.<domain>` and `api-staging.<domain>` at the VPS and change `CADDY_DOMAIN`; nothing else changes.
- The firewall opens only 22, 80 and 443. Supabase, Redis Cloud, Cloudinary and Firebase stay external.
- One VPS is one point of failure: a staging service that runs out of memory takes production down too.

### How a backend deploy works

1. Maven builds Core's jar on the runner; [`Dockerfile.prebuilt`](../../backend/core/Dockerfile.prebuilt) wraps it in a JRE.
2. Images are pushed for `linux/amd64` as `ghcr.io/<owner>/<repo>-<service>-<environment>:<sha>`, using the job's `GITHUB_TOKEN`.
3. The job uploads the settings GitHub owns, then runs [`deploy/vps/deploy.sh`](../../deploy/vps/deploy.sh) over SSH.
4. `deploy.sh` writes the new image names to `.env`, pulls, starts `ai` then `core` with `docker compose up --wait` (fails if a container is unhealthy) and prunes unused images.
5. GHCR keeps the latest 10 staging and 20 production images per service; that is the rollback window.

The run page shows a summary table and uploads a `deploy-summary-<branch>` artifact.

### One-time setup

[`deploy/ansible/playbook.yml`](../../deploy/ansible/playbook.yml) does steps 1, 5 and 6, and can be re-run to restore a VPS or upload changed env files. Copy [`inventory.example.ini`](../../deploy/ansible/inventory.example.ini) to `inventory.ini`, then for each environment:

```bash
set -a; . secrets/staging/env/.env.vps; set +a
ansible-playbook -i deploy/ansible/inventory.ini deploy/ansible/playbook.yml --limit staging
```

Add `GHCR_USERNAME` and `GHCR_READ_TOKEN` to the shell if the packages are private.

1. Create user `deploy` in group `docker`, key-only SSH, `ufw` allowing port 22.
2. Generate a CI-only key with `ssh-keygen -t ed25519 -f deploy_key -N "" -C github-actions-deploy`. In `secrets/<environment>/env/.env.vps`, set `VPS_SSH_KEY` to `base64 < deploy_key | tr -d '\n'` and `VPS_SSH_PUBLIC_KEY` to `deploy_key.pub`, then delete both files and run `scripts/secrets/github.sh <environment> --apply`.
3. Set `VPS_KNOWN_HOSTS` to `ssh-keyscan -t ed25519 <VPS_HOST>` (check the fingerprint in the provider console) and `VPS_HOST` in both `.env.vps` and the GitHub environment variables.
4. Set `CADDY_DOMAIN`; production copies the `VPS_*` values from staging, because `deploy` has one key. Run `scripts/secrets/push.sh <environment>`.
5. Create network `edge`. In the app directory, put `compose.yaml` from `deploy/vps/`, and with mode `600` `core.env`, `ai.env` (from [secrets](secrets-and-env.md)) and `.env` with `CORE_ALIAS=core-<environment>`. In `/opt/smartledger-edge`, put `deploy/edge/` and `sites/<environment>.caddy`, then reload Caddy.
6. After the first deploy, make the two GHCR packages public, or `docker login ghcr.io` once as `deploy` with a `read:packages` token.
7. Check database access: Supabase's direct host is IPv6-only, so a VPS without IPv6 uses the session pooler URL. Allowlist the VPS in Supabase and Redis Cloud if restrictions are on.

The first deploy must include both services (start CD by hand with `backend-ai` and `backend-core`).

### Service variables

`core.env` and `ai.env` hold the variables below. Every deploy rewrites `github.core.env` and `github.ai.env` with the values GitHub owns, which override them; do not edit those by hand. Write `$` as `$$`. After editing on the VPS, run `docker compose up -d <service>` and send one chat through Core: a missing variable can still leave a healthy container.

**`core`**

| Variable | Value |
|---|---|
| `INTERNAL_API_TOKEN` | Random; same as in `ai.env`; different per environment |
| `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD` | Supabase JDBC URL of the environment |
| `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase project of the environment; empty key falls back to `GOOGLE_APPLICATION_CREDENTIALS` |
| `JAVA_TOOL_OPTIONS` | Heap limit, e.g. `-Xmx256m` |
| `CORS_ALLOWED_ORIGINS` | From GitHub, see [Core CORS origins](#core-cors-origins) |
| `CLOUDINARY_ENABLED` | `true` only after V13 is migrated in that environment |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Only in `core.env`, never in Vercel, GitHub variables or client code |
| `CLOUDINARY_PUBLIC_ID_PREFIX` | Required when enabled, e.g. `smartledger/staging`; no leading or trailing slash, no `..` |
| `MEDIA_UPLOAD_LEASE_SECONDS`, `CLOUDINARY_CLEANUP_FIXED_DELAY_MS` | Optional; keep the defaults `300` and `60000` |

Compose sets `AI_BASE_URL`, `SERVER_PORT` and `FLYWAY_ENABLED=false` itself. Before enabling Cloudinary, migrate V13, set the variables and smoke-test an upload, replace and delete.

**`ai`**

| Variable | Value |
|---|---|
| `INTERNAL_API_TOKEN` | Same as in `core.env` |
| `POSTGRES_URL` | Supabase `postgresql://` URL of the environment |
| `AI_SQL_READER_URL` | Read-only `ai_sql_reader` login as a `postgresql://` URL; empty means the agent cannot read shop data |
| `REDIS_URL` | Redis Cloud of the environment |
| `POSTGRES_POOL_MAX_SIZE`, `SQL_POOL_MAX_SIZE` | Optional, default `2`; they share the Supabase pooler limit with Core ([AI README](../../backend/ai/README.md#routes-and-database-access)) |
| Model and Logfire variables | From GitHub, see below |
| `AGENT_MEMORY_*`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Optional, `ai.env` only; memory is off until the PO approves it ([ADR-0002](../architecture/adr/0002-agent-long-term-memory.md), [AI README](../../backend/ai/README.md#long-term-memory-off-by-default)) |

### AI model settings

Step `Upload ai settings` copies these from the `backend-*` environment into `github.ai.env` before deploying `ai`.

| Name | Kind | Value |
|---|---|---|
| `OPENAI_API_KEY` | Secret | Gateway key shared by every model |
| `OPENAI_BASE_URL` | Variable | `https://opencode.ai/inference/go/v1` (OpenCode Go) or `https://api.openai.com/v1`; required for `anthropic` models |
| `MODEL_PROVIDER`, `MODEL_NAME` | Variable | e.g. `anthropic` and `claude-haiku-5-5`; see [AI README](../../backend/ai/README.md) |
| `MODEL_REASONING_EFFORT` | Variable | `none`, `low`, `medium` or `high` |
| `MODEL_FALLBACKS` | Variable | Optional JSON list, e.g. `["openai-chat:deepseek-v4.1-flash"]` |

An empty GitHub value is skipped, not cleared: to remove a setting, delete it from `ai.env` too.

### AI tracing settings

| Name | Source | Value |
|---|---|---|
| `LOGFIRE_TOKEN` | Secret of `backend-*` | Write token, one per environment; unset means no tracing unless `ai.env` has one |
| `LOGFIRE_ENVIRONMENT` | Branch | `staging` or `production` |
| `LOGFIRE_SERVICE_VERSION` | Commit | `github.sha` |

Traces carry no message content ([AI README](../../backend/ai/README.md#tracing-logfire)). To turn tracing off, delete `LOGFIRE_TOKEN` on GitHub and in `ai.env`.

### Core CORS origins

![Sign-in and API request flow](../architecture/diagrams/images/auth-request-flow.svg)

A browser request must pass Firebase Authorized domains and Core CORS, and Core accepts only tokens from its own Firebase project. Source: [`auth-request-flow.drawio`](../architecture/diagrams/src/auth-request-flow.drawio).

`CORS_ALLOWED_ORIGINS` is a comma-separated list of exact `http(s)` origins: no wildcard, path or trailing `/`. Core **refuses to start** on an invalid entry, so set it in the GitHub environment variables, not on the VPS; step `Upload core settings` rejects whitespace and wildcards. It applies on the next deploy.

Staging:

```text
https://smart-ledger-staging.vercel.app,https://smart-ledger-preview-00.vercel.app,…,https://smart-ledger-preview-09.vercel.app
```

The `preview-0N` origins are kept for when PR previews return; Firebase Authorized domains must list them too.

## Production checklist

A deploy can succeed while production still does not work. Check these first:

| Check | Symptom when missing |
|---|---|
| `VPS_*` set in `backend-production` and the [one-time setup](#one-time-setup) done | `Permission denied` or `Host key verification failed` |
| Domain resolves to the VPS, route in `sites/production.caddy` | TLS errors in the app |
| Firebase Email/Password enabled, web domain in Authorized domains | Sign-in returns 400 `signInWithPassword` |
| AI baseline and all Core migrations applied ([Database migrations](local-development.md#database-migrations)) | Chat returns 503 `ai_unavailable`, or Core fails its schema check |
| `CORS_ALLOWED_ORIGINS=https://smart-ledger-prod.vercel.app` | Smoke test fails with `Core CORS does not allow <URL>` |
| Supabase Data API off | `public` tables readable through the anon key |

A new Firebase project sends at most 10 SMS a day until billing is attached.

## Not automated

- **Migrations.** Flyway is off and `supabase db push` is not in CI. The migration owner runs them by hand, staging first ([Database migrations](local-development.md#database-migrations)).
- **Rollback.** Start CD by hand with an earlier SHA, or run `deploy.sh` on the VPS with that commit's `AI_IMAGE` and `CORE_IMAGE`.
- **Tags.** A person creates them after checking production.

## Mobile web on Vercel

`deploy-web` runs `vercel build` on the runner and uploads with `vercel deploy --prebuilt`. Vercel's Git deployments are off (`frontend/mobile/vercel.json`), so GitHub holds all web configuration.

| Event | Environment | Result |
|---|---|---|
| PR | — | No deploy |
| Push `staging` | `vercel-staging` | Deploy aliased to `https://smart-ledger-staging.vercel.app` |
| Push `main` | `vercel-production` | Deploy after approval to `https://smart-ledger-prod.vercel.app` |

- `EXPO_PUBLIC_*` are baked in at build time, so they are **variables**, not secrets: `EXPO_PUBLIC_USE_MOCK`, `EXPO_PUBLIC_MOCK_CORE`, `EXPO_PUBLIC_MOCK_SHOPS`, `EXPO_PUBLIC_API_ENDPOINT`, `EXPO_PUBLIC_FIREBASE_API_KEY`, `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN`, `EXPO_PUBLIC_FIREBASE_PROJECT_ID`, `EXPO_PUBLIC_FIREBASE_APP_ID`. Re-run the deploy after changing one.
- The app stops at launch if the API endpoint or a mock flag is missing ([`config.ts`](../../frontend/mobile/src/config.ts)).
- `EXPO_PUBLIC_ZALO_LOGIN=true` only once that Core has `ZALO_ENABLED=true` and lists the web origin in `ZALO_CLIENT_ORIGINS`.
- The smoke test fails if the page is not 200, the bundle has no API endpoint, or Core rejects the CORS preflight. Mock builds skip the Core checks.
- PR previews are off: they used up Vercel Hobby's 100 deployments a day and broke `staging` and `main` deploys. To restore them, call `deploy-web.yml` and `deploy-landing.yml` from `ci.yml` for same-repository PRs with `sha` set to the PR head.
- If a domain changes in Vercel, update the `url` in `deploy-web.yml`.
- `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` are in Project Settings → General; create `VERCEL_TOKEN` under Account Settings → Tokens.

## Landing page on Vercel

Job `landing` lints and builds `frontend/web`. `deploy-landing` deploys it to Vercel project `landing` (Root Directory `frontend/web`) like `deploy-web`, only when the landing changed.

| Event | Environment | Result |
|---|---|---|
| PR | — | No deploy |
| Push `staging` | `landing-staging` | Deploy aliased to `LANDING_URL`, then smoke test |
| Push `main` | `landing-production` | Deploy after approval, then smoke test |

- `LANDING_URL` is the fixed `https://` domain of the environment.
- `VITE_LEGAL_DRAFT` stays unset or `true` until the PO approves the legal pages. The contact email and social links live in [`site.yaml`](../../frontend/web/site.yaml).
- After changing a `landing-*` variable, start CD by hand with only `landing`.
- Keep Vercel Authentication off on the `landing` project, or the smoke test gets a `302`.

**Admin dashboard (`/admin`).** Set `VITE_ADMIN_ENABLED=true`, `VITE_API_ENDPOINT` (Core root, no `/api/v1`) and `VITE_FIREBASE_API_KEY` (same as `EXPO_PUBLIC_FIREBASE_API_KEY`) as variables of the `landing-*` environment; without the flag the build contains no admin code. Add `LANDING_URL` to the matching `CORS_ALLOWED_ORIGINS`. Admins are Firebase email users whose Core profile is ACTIVE with `system_role=ADMIN`; someone with database access sets the role. Step `Check the admin in the build` fails on the mock password `admin123`, on missing admin values, or on admin code in a build with the flag off.

## Android build

[`mobile-release.yml`](../../.github/workflows/mobile-release.yml) runs only by hand. It calls [`scripts/release/android-release.sh`](../../scripts/release/android-release.sh), which also works locally (run `--help`; locally it builds for an emulator and installs it). EAS cloud builds are not used because the free queue is slow.

```bash
gh workflow run mobile-release.yml --ref <branch> -f environment=<environment> -f runner=auto
```

| Branch | Environment | Backend | Output | ABIs |
|---|---|---|---|---|
| `main` | `android-production` | Production | AAB, or APK with `publish`; needs green CI and approval | `armeabi-v7a`, `arm64-v8a` |
| `staging` | `android-staging` | Staging | APK; needs green CI | `armeabi-v7a`, `arm64-v8a` |
| Any other | `android-dev` | Staging | APK | `arm64-v8a` |

Job `gate` rejects any other branch and environment pair before a runner starts.

Each `android-*` environment needs:

- Secret `ANDROID_GOOGLE_SERVICES_JSON`: the content of `google-services.json`.
- Variables `EXPO_PUBLIC_*`, as for the [mobile web](#mobile-web-on-vercel).
- Variable `STT_MODEL_BASE_URL`: the public R2 address holding the speech model ([models README](../../frontend/mobile/assets/models/README.md#đưa-model-lên-r2)). A publish uploads missing files; a test build only warns.

Every run uploads `android-build-summary-<environment>-<run>` (runner, toolchain, timings, size and SHA-256). A successful run uploads the APK or AAB as `android-<environment>-<run>`, kept 14 days.

<a id="android-runners"></a>

### Runners

Same as [CI runners](#ci-runners), with label `android-build`. `auto` needs a fine-grained token with **Administration: read** stored as `RUNNERS_READ_TOKEN`; without it, it falls back to GitHub-hosted.

To add a machine, install Node 22, JDK 17 and the Android SDK (platform 36, build-tools 36.0.0, NDK 27.1.12297006), set `ANDROID_HOME`, and register a runner labelled `android-build`. The preflight checks these versions and never downloads anything.

- Never trigger a self-hosted job from a fork PR: it runs the branch's code on a teammate's machine.
- `android-dev` secrets must hold only dev-level values.
- Windows is untested; enable long paths if you try it.

### Release signing

Without a keystore the build uses the Expo template's public debug key. Create the release keystore once:

```bash
keytool -genkeypair -v -keystore smart-ledger-release.keystore -alias smart-ledger -keyalg RSA -keysize 2048 -validity 10000
base64 -i smart-ledger-release.keystore | pbcopy
```

Store it in `android-production` as `ANDROID_KEYSTORE_BASE64` and `ANDROID_KEYSTORE_PASSWORD`.

- Never commit the keystore, and keep a copy outside GitHub: losing it means every user must uninstall to update.
- Add its key hash to the Meta app, or Facebook sign-in fails. `keytool -list -v -keystore smart-ledger-release.keystore` prints the fingerprints.

### Publish the APK for the landing page

![Android APK release and download](../architecture/diagrams/images/apk-release.svg)

Run from `main` with `environment=android-production` and `publish=true`. The job builds a release-signed APK and uploads to Cloudflare R2:

| Key | Purpose |
|---|---|
| `android/production/latest.apk` | Fixed link for the landing page |
| `android/production/builds/<name>.apk` | One copy per publish; the in-app update downloads this |
| `android/production/version.json` | `{versionCode, versionName, apk}`, written last |

One-time setup:

1. In R2, create a bucket and enable its **Public Development URL** (`https://pub-<hash>.r2.dev`).
2. Create an R2 API token with **Object Read & Write** on that bucket.
3. In `android-production`, add secrets `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` and variables `R2_BUCKET`, `R2_PUBLIC_URL` (no trailing slash), `STT_MODEL_BASE_URL`.
4. In `landing-production`, set `VITE_ANDROID_APK_URL=https://pub-<hash>.r2.dev/android/production/latest.apk` and redeploy the landing.
5. Optional: expire `android/production/builds/` after 30 days. Never `stt-model/`.

- The app checks `version.json` on launch and offers newer builds. Only published APKs check; APKs published before this feature never ask.
- Rollback: copy a file from `builds/` over `latest.apk` and edit `version.json`. Do not re-run an old publish run; it overwrites files.
- `r2.dev` is rate-limited and meant for development; a custom domain only changes `VITE_ANDROID_APK_URL`.

### Measured and not yet verified

- `ubuntu-24.04`, `android-dev`, cold cache: about 12 minutes. A self-hosted Apple M4 Pro with a warm cache is about three times faster.
- APK size settings in [`frontend/mobile/README.md`](../../frontend/mobile/README.md#dung-lượng-apk-android) cut the `arm64-v8a` APK from 95.2 MB to 40.3 MB; a two-ABI release APK is about 58 MB.
- Not yet run: `android-staging`, `android-production`, the self-hosted and `auto` paths, a full signed build, the R2 upload and the APK on a physical device.
- iOS is built separately ([mobile-ios-device-release.md](mobile-ios-device-release.md)).
