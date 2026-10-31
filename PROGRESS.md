### 2026-10-31 — Playwright for the mobile web build

| Area | Change |
|---|---|
| Test | • `npm run test:e2e` starts the Expo web build with mock data on port 8090 and runs `e2e/` in Chromium at a phone viewport (#438)<br>• `e2e/smoke.spec.ts` opens the sign-in screen, enters with the mock account and checks Tổng quan with no page error |
| Docs | • The mobile README says how to install and run it |

Check: the smoke test passes through `npx playwright test`; it failed first without `EXPO_PUBLIC_API_ENDPOINT`, so the config sets it; `npx tsc --noEmit` passes. Not run in CI, which the issue does not ask for. Commit: the one that adds this entry.

### 2026-10-30 — LLMFactory, provider classes and Bifrost routing

| Area | Change |
|---|---|
| AI | • `LLMFactory.create_model(alias)` replaces `build_chat_model`; `OpenAIChatProvider`, `OpenAIResponsesProvider` and `AnthropicMessagesProvider` each own one protocol, and `MODEL_ALIASES` replaces `MODEL_PROVIDER` and `MODEL_NAME`<br>• `session_settings` moves to its own module, takes the shop and sends the `x-bf-*` headers Bifrost needs for session grouping, log metadata and forwarding<br>• `MODEL_FALLBACKS` stays, in `protocol:model` form, until production runs Bifrost |
| Deploy | • `bifrost.json` splits OpenCode Go into an Anthropic and an OpenAI custom provider, adds OpenAI for the Luna fallback and routing rules, and stores logs for 14 days without message content (NFR-008) |
| Docs | • AI README, technical design, CI/CD guide, service walkthrough and ADR-0008 describe the aliases and Bifrost owning routing and fallback |

Check: `uv run pytest` passes with 442 tests and `uv run ruff check` passes. The pinned Bifrost v2.3.2 image was run against a mock upstream: Anthropic requests reach `/v1/messages` with `cache_control`, session and User-Agent are forwarded, a 429 falls back to OpenAI, and logs show the session, shop and rule without content. Not verified: real OpenCode Go and OpenAI calls, tool calls and streaming through Bifrost, and the Bifrost UI itself. Commit: the one that adds this entry.

### 2026-10-31 — Dozzle and Snoopy for VPS operators

| Area | Change |
|---|---|
| Deploy | • The monitoring stack runs Dozzle `v11.4.0` for live container logs, bound to `127.0.0.1:8081` with a 64 MiB limit and reached through an SSH tunnel<br>• The playbook installs Snoopy, accepting its `ld.so.preload` prompt, and adds the `snooplog` shortcut |
| Docs | • The CI/CD guide describes the tunnel, why Dozzle gets no Caddy site, and what Snoopy can and cannot prove |

Check: a manual Dozzle container on the VPS listed all 13 containers through the tunnel, `docker compose config` accepted the service, `ansible-playbook --syntax-check` passed and the Snoopy debconf key matches the installed package. Not verified: a real playbook run, or the preseed on a new VPS.

### 2026-10-30 — Alerts as Discord embeds and Telegram messages

| Area | Change |
|---|---|
| Deploy | • `templates.yaml` builds each alert group once for both channels: headline with state, severity, alert, environment and count, one summary per alert, then Environment, Severity, Vietnam time and Source, then Overview, Silence and Alert rules links<br>• Discord gets a coloured embed with fields and Telegram an HTML message, both through Grafana's webhook integration; the chat ID rides in the Bot API URL because Grafana turns a chat ID read alone from the environment into a number<br>• The contact point is now `smartledger`; provisioning deletes the old `discord` one, and the playbook requires and writes `MONITOR_TELEGRAM_BOT_TOKEN` and `MONITOR_TELEGRAM_CHAT_ID` |
| Docs | • The CI/CD and secrets guides describe both channels and the bot setup; the credential map lists the two keys |

Check: on Grafana 12.1.1 provisioned from the repository, an upgrade from the old `discord` contact point kept 7 rules and the policy; test alerts reached a capture server as a Discord embed and a Telegram HTML body, and the template test rendered firing, two-alert and resolved groups; a real `sendMessage` with the chat ID in the query and a JSON body was accepted. Not verified: a real alert on the VPS.

### 2026-10-30 — Product analytics dashboard with cohort retention (ADR-0003 P1)

| Area | Change |
|---|---|
| Deploy | • Grafana provisions read-only PostgreSQL datasources `smartledger-staging-pg` and `smartledger-production-pg` (one connection, closed after each query) and the **SmartLedger product** dashboard in a Product folder: DAU, WAU, MAU, stickiness, weekly cohort retention, activation funnel, feature adoption, AI use, sales and data freshness, plus an Events row; load-test accounts are left out<br>• `vps-playbook.sh` loads the `monitor` group; the playbook refuses any login other than `grafana_reader` and writes `postgres-<environment>.env`, which Compose reads as optional files so each environment keeps the other's datasource |
| Config | • `.env.example` of Core and AI and the Dopbase templates carry the pooler budget: Hikari 8, AI pools 2 and 2, so Core, AI and Grafana use 13 of 15 session pooler clients; Hikari keeps 2 connections while idle and fails a request after 5 s without a free connection instead of 30 s |
| Docs | • ADR-0003 now records one dashboard instead of two, retention and stickiness definitions, why logout is not a metric, and login tracking as a P2 Core change; the CI/CD and secrets guides describe the datasource and its login; the credential map is regenerated |

Check: on a throwaway PostgreSQL 16 with every Core migration, the AI chat table and the `grafana_reader` grants from the ADR, every SQL query of the dashboard ran through Grafana 12.1.1 provisioned from the repository and rendered in the browser; the grants alone were enough after the last-sale panel moved from `created_at` to `sold_at`; `ansible-playbook --syntax-check` and `docker compose config` with one optional file present pass. Not verified: the role on Supabase, the pooler login, real data and the AI Prometheus panels; Dopbase now holds Hikari 8, minimum idle 2 and a 5000 ms connection timeout for Core, 2 and 2 for AI's pools, and port 5432 and database `postgres` in `monitor/staging` and a new `monitor/production`; `GRAFANA_PG_HOST`, `GRAFANA_PG_USER` and `GRAFANA_PG_PASSWORD` are not set for production and were not checked for staging, because reading values needs an interactive password. Commit: the one that adds this entry.

### 2026-10-30 — Caddy reads its Caddyfile through a directory, and a scrape-down alert

| Area | Change |
|---|---|
| Deploy | • The shared Caddy mounts `conf/` instead of the single `Caddyfile`: Ansible replaces a file by rename, a single-file mount keeps the old inode, and `caddy reload` had kept serving the Caddyfile from before #422, so `:9180` never opened and the Overview showed only probes<br>• The edge handler runs `caddy validate` before `caddy reload`, and the playbook removes the old top-level `Caddyfile`<br>• Grafana alert **Metrics scrape down** fires when a target's `up` is 0 for 10 minutes<br>• Grafana opens on the Overview after sign-in, and the Resources dashboard shows every container in one view without the stack filter |
| Docs | • The CI/CD guide explains the directory mount, lists the new alert and describes the Resources and home dashboard changes |

Check: on the VPS, the container's `/etc/caddy/Caddyfile` had no `9180` while the host file did, and `up{job="caddy"}` was 0 for 24 hours; locally, Caddy started from the new layout served `:9180` and, after the Caddyfile was replaced by rename, `caddy reload` picked up the change; the playbook passes `--syntax-check`; a throwaway Grafana 12.1.1 provisions the eight alerts, opens on the Overview and loads the Resources dashboard; on the live Prometheus `1 - up > 0` returns Caddy and production AI. Not done: the playbook has not run on the VPS, and production AI still fails its scrape until a release carries `/metrics`. Commit: the one that adds this entry.

### 2026-10-29 — Credential map pages for staging and production

| Area | Change |
|---|---|
| Docs | • `docs/development/credential-map/` holds one page per environment listing every Dopbase and GitHub variable with its source, service, connection, kind, status, code references and the failure it causes, shown as a table grouped by service with a status strip, search, a service filter and a detail panel<br>• `scripts/secrets/credential_map.py` builds the pages from Dopbase key names and a scan of tracked files; connections, kinds and verified symptoms live in `scripts/secrets/credential-map.json` |

Check: both pages generated (staging 208 keys, production 179); every local env value of 12 or more characters was searched for in the pages and only the VPS IP, already public in the docs, matched; both pages were opened in the in-app browser at 1440 px and 375 px with no horizontal page scroll and no console errors, and env template files under `secrets/templates/` are skipped by the scan so they do not mark every variable as used. Commit: the one that adds this entry.

### 2026-10-29 — R2 bucket, token policy and key handling for the Dopbase backup

| Area | Change |
|---|---|
| Docs | • A new `dopbase-secrets-and-backup` diagram shows the three bands — operator and CI, the VPS, and R2 — with who writes secrets in, what the nightly cron does, and where each key lives<br>• The CI/CD guide now says how to create the backup bucket: the bucket and its location hint, a lifecycle rule for retention and incomplete uploads, an R2 API token scoped to that bucket from the R2 page rather than the account API token page, a bucket policy that denies delete because R2 has no write-only preset, and the age key pair generated off the VPS and kept in the password manager<br>• The five backup variables belong in both `vps/staging` and `vps/production`, because a playbook run for an environment without them removes the cron job the other environment's run created<br>• A hand run of `backup.sh` plus a refused `rclone delete` is the check that the bucket is set up right |

Check: a link and anchor pass over `docs/development/ci-cd.md` resolves every link and image added here; the diagram exports with the repository's own drawio flags and was read back as a PNG to check for overlapping labels and edges through nodes; `backup.sh` keeps the volume-tar approach, because `dopbase backup` reaches an administrator-only endpoint and a cron job would have to hold an admin token on the VPS. Not verified against Cloudflare: that R2 accepts `s3:PutBucketPolicy` in a bucket policy, the Asia-Pacific location hint, and the refused delete; no bucket, token or key pair exists yet. Two anchors that predate this change, `#android-runners` and `#ci-runners`, are still broken. Commit: the one that adds this entry.

### 2026-10-29 — Layered Grafana dashboards with Core and AI request metrics

| Area | Change |
|---|---|
| Deploy | • Grafana provisions three dashboards in Infra, read-only in the UI: **SmartLedger overview** (health, alerts, per-service RED), **SmartLedger service** (one service's RED, probe, container and logs) and **SmartLedger resources** (VPS and containers by stack), linked by the `smart-ledger` tag<br>• The shared Caddy serves per-host request metrics on `:9180`, unpublished; Alloy joins `edge` to scrape it and labels each probe with its `host`<br>• Prometheus loads recording rules that turn Caddy's metrics into `service:http_requests:rate5m` and `service:http_request_duration_seconds_bucket:rate5m` by `env` and `service`, so a new source adds rules and no dashboard changes<br>• AI exposes `/metrics` with request count, status class and latency per route up to 120 s, without `/health`; the playbook lists each environment's AI in `targets/services/` for Alloy to scrape on the app network |
| Docs | • The CI/CD guide describes the three layers, the metric schema and how to add a service; the API contract lists AI's `GET /metrics`; the VPS network diagram shows Caddy's `:9180` and Alloy's scrapes |

Check: on a local copy of the monitoring stack with a test Caddy over HTTPS and a fake `smart-ledger-staging-core-1`, every panel query of the three dashboards ran through Grafana without errors; with 1 in 10 requests failing the rules gave 9.99% 5xx; a local AI under uvicorn was scraped (`up=1`) and its rules gave the 4xx rate; the AI test suite passes; `caddy validate`, `promtool check rules` and `docker compose config` with the playbook's override pass. Not verified on the VPS: root disk, certificate days, AI and Bifrost probes, Caddy's host label for the real domains, and the AI scrape on the app network. Bifrost request metrics are not added. Commit: the one that adds this entry.

### 2026-10-29 — Daily Core user activity (CORE-018)

| Area | Change |
|---|---|
| Core | • Owner-approved V19 adds a private user/day table with PK, FK and date index; successful authenticated API reads and writes count once per Vietnam date for ACTIVE OWNER/ADMIN<br>• Default-off recorder has a bounded cache, independent committed writes, retry after telemetry errors and hourly 90-day retention; no client API or shared-environment activation |
| Docs | • BR-023 → FR-036 → AC-101–103, ERD and rollout/rollback guide define the scope; read-only Grafana SQL separates roles and excludes loadtest accounts |

Check: 27 CORE-018 tests passed on disposable PostgreSQL 16.15; full Maven verify passed 1449 tests with zero failures/errors/skips; PostgreSQL gate unit tests passed 13 cases. Shared-DB migration, Grafana provisioning and staging/production acceptance are not verified. Commit: the one that adds this entry.

### 2026-10-29 — Monitoring config changes take effect on a playbook run

| Area | Change |
|---|---|
| Deploy | • The playbook's monitoring handler recreates the monitoring containers, because Alloy, Loki and Grafana read their bind-mounted config only at start and Compose does not recreate a container for a changed mounted file; the first VPS run of the database, AI and Bifrost alerts left Grafana with the old five rules until its alerting was reloaded by hand |
| Docs | • The CI/CD guide says the playbook recreates the monitoring containers |

Check: on the VPS after the staging playbook run, Grafana listed five rules; `POST /api/admin/provisioning/alerting/reload` raised it to seven with Database down and Service down; `ansible-playbook --syntax-check` passes. Not verified: a playbook run with this change. Commit: the one that adds this entry.

### 2026-10-29 — Alerts for the database, AI and Bifrost

| Area | Change |
|---|---|
| Deploy | • Alloy probes each Core's readiness over HTTPS beside liveness, so **Database down** fires when Core is up but cannot reach Supabase<br>• Alloy joins every app network that exists through a `compose.override.yaml` the playbook writes before starting monitoring, and probes `smart-ledger-<env>-ai-1:8001/health` and `smart-ledger-<env>-bifrost-1:8080/health` by container name, since `ai` and `bifrost` exist in both environments; **Service down** fires when either fails for 2 minutes<br>• Alloy gets `dns_search: .` so a stopped container's name cannot resolve through the VPS wildcard DNS |
| Docs | • The CI/CD guide lists the new alerts and how Alloy reaches AI and Bifrost; the VPS network diagram shows the probes and is re-laid out with straight arrows |

Check: throwaway containers with the real Alloy config: readiness 503 with liveness up fired only Database down, Core stopped only Endpoint down; the playbook's monitoring handler under `sh` and `dash` joined Alloy to a test `smart-ledger-staging_default`, the AI probe read 1 and the missing Bifrost 0, and stopping the fake AI raised the Service down series; `ansible-playbook --syntax-check` passes. Not verified: a playbook run on the VPS, and whether production's missing Bifrost starts with it or must be dropped from the probes. Commit: the one that adds this entry.

### 2026-10-29 — VPS network and port diagram

| Area | Change |
|---|---|
| Docs | • New `vps-network.drawio` and its SVG draw the four Docker networks on the VPS as overlapping regions, with the `name:port` each container is reached at, the `edge` aliases Caddy dials, and the Caddy, Core, AI, Bifrost and monitoring flows<br>• The CI/CD guide shows it under VPS with how to read it, and the diagram guide lists it |

Check: networks and members from `docker network inspect` and `docker ps` on the VPS, ports and aliases from `deploy/*/compose.yaml` and the Caddy sites in the playbook; `validate.py` reports 0 errors and the SVG was read on a light and a dark page. Commit: the one that adds this entry.

### 2026-10-28 — Web deploys check the real domains

| Area | Change |
|---|---|
| Deploy | • `deploy-web.yml` names `app-production.songheloi.id.vn` and `app-staging.songheloi.id.vn` in the GitHub environment URL and in the smoke test, instead of the Vercel domains the project no longer lists in `CORS_ALLOWED_ORIGINS`<br>• `app-staging.songheloi.id.vn` carries the git branch `staging` in its Vercel domain settings, so a `main` deploy no longer takes the alias |
| Docs | • The CI/CD guide names the same domains in the release steps, the staging CORS list, the production checklist and the Vercel event table, and records why the staging domain needs its branch |

Check: the production CD run of 2026-10-28 12:17 failed its smoke test with `Core CORS does not allow https://smart-ledger-prod.vercel.app`, and the production deploy had taken `app-staging.songheloi.id.vn`; after the branch was set and CD staging web re-run, `app-production` serves the production bundle and `app-staging` the staging one, each allowed by its own Core. `actionlint` reports only the pre-existing `SC2034` of the smoke test step. Not verified: the next production deploy keeping its hands off the staging alias.

### 2026-10-28 — Zalo sign-in tested on a phone; clearer config error

| Area | Change |
|---|---|
| Mobile | • A Firebase custom token from another project (`auth/custom-token-mismatch`, `auth/invalid-custom-token`) now reads "Cách đăng nhập này chưa dùng được lúc này. Vui lòng chọn cách khác hoặc thử lại sau" with the code, instead of "Vui lòng thử lại", since retrying cannot fix it |
| Test | • Zalo LOGIN on Android passed against staging Core on a Samsung SM-A528B (Android 14): `POST /auth/zalo/native/exchange` 200, Firebase custom token sign-in, `POST /auth/session` 200 as OWNER<br>• The APK was hand-repacked: the JS of #399 on a dev build with Firebase `smart-ledger-c2892`, signed with the debug key. Its App Link still named the old Railway host, so the return link was passed to the app over `adb` from the browser's DevTools<br>• A first try on a production-based APK failed with `auth/custom-token-mismatch`: native Firebase reads `google-services.json`, which pointed at `smart-ledger-production` while staging Core signs for `smart-ledger-c2892`. Test Zalo only with an APK whose Firebase project matches the Core |

Check: `npx tsc --noEmit` and `npm test` (frontend/mobile); app log on the phone with `debugLog` turned on in the test bundle only. Not verified: the App Link opening the app by itself, which needs a CI APK built from `staging`, and iOS. Commit: the one that adds this entry.

### 2026-10-28 — No divider under the last row of a list

| Area | Change |
|---|---|
| Mobile | • `SettingRow` takes `last`: the last row of each card in Settings and Notification settings no longer draws a line just above the card edge (reported by Phú)<br>• Same fix for the last item at checkout, the last debt history entry, the last conversation in the assistant history, the last product in the add-item sheet and the last pending expense in voice orders |

Check: `npx tsc --noEmit` shows only the two existing errors for the missing `expo-application` and `expo-intent-launcher`; Settings, Notification settings and debt history checked on the mock web build (the last history row measures `0px` border). Not verified on screen: checkout, assistant history, the add-item sheet, voice expenses, and a real phone. Commit: the one that adds this entry.

### 2026-10-28 — Admin uses the Bobi logo and a brand login page

| Area | Change |
|---|---|
| Web | • The admin sidebar, login and 403 pages show the Bobi notebook logo from the landing instead of the grey microphone mark; the sidebar subtitle reads "Trang quản trị"<br>• The login page uses the brand purple: a purple panel with a waving Bobi (the mobile `bobi-tab-v2.png` as a 560 px webp, 36 KB), a heading and three points that hold with the real Core (search, shop status history, audited reads), and a purple button, checkbox and focus ring<br>• On phones the purple panel hides and the card shows the logo; the placeholder email no longer has a misspelled domain |

Check: `npm run typecheck` and `npm run build` pass; `npm run lint` shows only the four warnings that #381 fixes; login, the dashboard sidebar (open and collapsed), the 403 page and the phone layout checked in the browser on a mock build. Not verified: a build against the real Core. Commit: the one that adds this entry.

### 2026-10-28 — Web admin lint warnings cleared

| Area | Change |
|---|---|
| Web | • `npm run lint` in `frontend/web` reported six warnings in the admin code and now reports none<br>• `colorFor` and `initialsOf` in `components/admin/ui.tsx` are no longer exported, so the file exports only components<br>• Four `useEffect`s that set state right away follow React's pattern: the phone menu remembers the page it opened on and closes on navigation without an effect; quick search clears old results and shows "Đang tìm…" from the input handler; AI Support copies newly loaded conversations during render; the create-task dialog resets its form during render when it opens, and its effect only loads shops and members |

Check: `npm run lint` shows no warnings; `npm run typecheck` and `npm run build` pass. Mock admin at 375 px: the menu opens, closes when a page is chosen and on the backdrop; quick search shows "Đang tìm…" then results, closes at 1 letter; AI Support lists its 3 conversations; the create-task dialog opens empty with 58 shops and again after cancelling. Not verified: the admin against real Core. Commit: the one that adds this entry.

### 2026-10-28 — Zalo sign-in button works again

| Area | Change |
|---|---|
| Mobile | • The Zalo button on the sign-in screen signs in again when the build carries Zalo settings (`EXPO_PUBLIC_ZALO_NATIVE_CLIENT_ID` on Android, `EXPO_PUBLIC_ZALO_LOGIN=true` on the web); iOS and builds without them still show "Sắp có"<br>• The `android-dev` and `android-staging` builds and the `vercel-staging` web build already set these, so their button turns on; production does not<br>• The mobile README says when the button is on |

Check: `npx tsc --noEmit` shows only the two existing errors for the missing `expo-application` and `expo-intent-launcher`; `npm test` fails only the two existing cases in `parseOrder` and `quickNav`; staging Core answers `400 invalid_zalo_request` (feature on) to a malformed request on both Zalo authorize endpoints and serves `assetlinks.json` with the certificate of CI test APKs, while production answers `503 zalo_unavailable`. Not verified: a full Zalo sign-in on a phone. Commit: the one that adds this entry.

### 2026-10-28 — A deploy of one service no longer fails on the other's image

| Area | Change |
|---|---|
| Deploy | • `deploy/vps/deploy.sh` reads `AI_IMAGE` and `CORE_IMAGE` into local variables and unsets them before any Compose command, so the empty image the workflow passes for a service this deploy leaves alone no longer overrides the image already named in `.env`<br>• The service loop becomes a `deploy_service` function called once per service, which removes the indirect variable lookup |

Check: the CD staging run of 2026-10-28 02:55 failed with `required variable CORE_IMAGE is missing a value` on an AI-only deploy; reproduced against the real `deploy/vps/compose.yaml` with a stubbed `docker`, where the previous script fails and this one deploys AI only, Core only, both, and neither, leaving the other service's image in `.env` untouched. `shellcheck` and `bash -n` pass. Not verified: a real deploy against the VPS.

### 2026-10-28 — Compose projects on the VPS are named smart-ledger

| Area | Change |
|---|---|
| Deploy | • `deploy/vps/compose.yaml` and `deploy/edge/compose.yaml` set `name:`, so the projects are `smart-ledger-staging`, `smart-ledger-production` and `smart-ledger-edge` instead of being named after their directories<br>• `deploy/vps/deploy.sh` and `deploy/ansible/playbook.yml` write `ENVIRONMENT` to the project `.env`, which `compose.yaml` interpolates into the name; the app directories and `VPS_APP_DIR` are unchanged<br>• `deploy-backend.yml` forwards its `DEPLOY_ENV` to `deploy.sh` as `ENVIRONMENT` |
| Docs | • The VPS section of `docs/development/ci-cd.md` lists each environment's Compose project and records that renaming a project needs the old project taken down and the Caddy certificate volume copied first |

Check: `docker compose config` resolves `smart-ledger-staging`, `smart-ledger-production` and `smart-ledger-edge`, and fails when `ENVIRONMENT` is unset; `shellcheck` and `bash -n` pass on `deploy.sh`; `ansible-playbook --syntax-check` passes. The VPS itself is not migrated yet. Commit: the squash merge of this branch.

### 2026-10-28 — Dopbase on the VPS with a nightly off-site backup

| Area | Change |
|---|---|
| Deploy | • Dopbase, the team's secrets manager, runs as its own Compose project in `/opt/dopbase` behind the shared Caddy, built from the pinned 0.1.10 release and set up only when `DOPBASE_DOMAIN` is set<br>• `deploy/dopbase/backup.sh` stops Dopbase for the copy, tars the `dopbase_data` volume, encrypts it with age for a key the VPS never holds and uploads it to R2; the playbook installs `age` and `rclone`, writes `/opt/dopbase/.env.backup` and adds a 03:00 cron job for user `deploy`<br>• The volume is named `dopbase_data` outright so the backup can mount it by one fixed name<br>• lazydocker 0.25.2 installed from its release for container, log and stats views over SSH |
| Secrets | • `scripts/secrets/dopbase-sync.sh push\|pull <environment>` moves the env files of one environment between `secrets/<environment>/env/` and Dopbase, one project per file |
| Docs | • The CI/CD guide records the Dopbase setup, its backup inputs, the lifecycle retention and the restore steps |

Check: `shellcheck` on both scripts, playbook syntax check, `docker compose config -q`, image build and setup page, sync roundtrip against a throwaway local Dopbase, relative links of the guide resolve. Not verified: the playbook against the VPS, which needs DNS for the Dopbase domain and an operator run, and a real backup and restore. Commit: the merge of this branch.

### 2026-10-28 — CI/CD guide reads as a reference

| Area | Change |
|---|---|
| Docs | • `docs/development/ci-cd.md` is rewritten as short tables, numbered steps and command blocks, from 7,525 to 3,259 words, keeping every fact a reader needs and every anchor other files link to<br>• The stale "No path filtering" limit is removed, since CI filters by path |

Check: every relative link and linked anchor resolves; facts not re-checked against the workflow files. Commit: the squash merge of this branch.
